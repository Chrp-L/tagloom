use crate::{
    error::{AppError, AppResult},
    media,
    models::{Asset, AssetPage, AssetQuery, AssetRow, Collection, JobProgress, JobRow, LibraryBootstrap, Setting, SourceRoot, Tag},
    scanner,
    state::AppState,
    watcher,
};
use chrono::Utc;
use sqlx::{FromRow, QueryBuilder, Sqlite};
use std::{collections::HashMap, path::{Path, PathBuf}};
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(FromRow)]
struct TagLink {
    asset_id: String,
    id: String,
    name: String,
    color: String,
    asset_count: i64,
}

fn normalized(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\").trim_end_matches('\\').to_ascii_lowercase()
}

#[tauri::command]
pub async fn get_bootstrap(state: State<'_, AppState>) -> AppResult<LibraryBootstrap> {
    let db = state.db().await;
    let sources = sqlx::query_as::<_, SourceRoot>(
        "SELECT s.id, s.path, s.name, s.status, s.last_scanned_at, COUNT(a.id) asset_count
         FROM source_roots s LEFT JOIN assets a ON a.source_id=s.id AND a.status='ready'
         GROUP BY s.id ORDER BY s.created_at"
    ).fetch_all(&db).await?;
    let tags = sqlx::query_as::<_, Tag>(
        "SELECT t.id, t.name, t.color, COUNT(at.asset_id) asset_count FROM tags t
         LEFT JOIN asset_tags at ON at.tag_id=t.id GROUP BY t.id ORDER BY t.name COLLATE NOCASE"
    ).fetch_all(&db).await?;
    let collections = sqlx::query_as::<_, Collection>(
        "SELECT c.id, c.name, COUNT(ci.asset_id) asset_count FROM collections c
         LEFT JOIN collection_items ci ON ci.collection_id=c.id GROUP BY c.id ORDER BY c.name COLLATE NOCASE"
    ).fetch_all(&db).await?;
    let (total_assets, image_count, video_count) = sqlx::query_as::<_, (i64, i64, i64)>(
        "SELECT COUNT(*), SUM(CASE WHEN media_kind='image' THEN 1 ELSE 0 END),
         SUM(CASE WHEN media_kind='video' THEN 1 ELSE 0 END) FROM assets WHERE status='ready'"
    ).fetch_one(&db).await?;
    Ok(LibraryBootstrap { sources, tags, collections, total_assets, image_count, video_count })
}

fn bind_filters<'a>(builder: &mut QueryBuilder<'a, Sqlite>, query: &'a AssetQuery) {
    builder.push(" WHERE a.status='ready'");
    if let Some(value) = &query.source_id { builder.push(" AND a.source_id=").push_bind(value); }
    if let Some(value) = &query.media_kind { builder.push(" AND a.media_kind=").push_bind(value); }
    if let Some(value) = &query.tag_id {
        builder.push(" AND EXISTS(SELECT 1 FROM asset_tags at WHERE at.asset_id=a.id AND at.tag_id=").push_bind(value).push(")");
    }
    if let Some(value) = &query.collection_id {
        builder.push(" AND EXISTS(SELECT 1 FROM collection_items ci WHERE ci.asset_id=a.id AND ci.collection_id=").push_bind(value).push(")");
    }
    if let Some(value) = query.search.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if value.chars().count() >= 3 {
            let fts = format!("\"{}\"", value.replace('"', "\"\""));
            builder.push(" AND EXISTS(SELECT 1 FROM assets_fts f WHERE f.asset_id=a.id AND assets_fts MATCH ").push_bind(fts).push(")");
        } else {
            builder.push(" AND (instr(lower(a.filename), lower(").push_bind(value).push(")) > 0")
                .push(" OR instr(lower(a.path), lower(").push_bind(value).push(")) > 0")
                .push(" OR instr(lower(a.note), lower(").push_bind(value).push(")) > 0")
                .push(" OR EXISTS(SELECT 1 FROM asset_tags sat JOIN tags st ON st.id=sat.tag_id WHERE sat.asset_id=a.id AND instr(lower(st.name), lower(")
                .push_bind(value).push(")) > 0))");
        }
    }
}

#[tauri::command]
pub async fn list_assets(query: AssetQuery, state: State<'_, AppState>) -> AppResult<AssetPage> {
    let db = state.db().await;
    let limit = query.limit.unwrap_or(120).clamp(1, 240) as i64;
    let offset = query.cursor.as_deref().and_then(|value| value.parse::<i64>().ok()).unwrap_or(0).max(0);
    let mut count_builder = QueryBuilder::<Sqlite>::new("SELECT COUNT(*) FROM assets a");
    bind_filters(&mut count_builder, &query);
    let total: i64 = count_builder.build_query_scalar().fetch_one(&db).await?;

    let mut builder = QueryBuilder::<Sqlite>::new(
        "SELECT a.id, a.source_id, a.path, a.filename, a.extension, a.media_kind, a.byte_size,
         a.modified_at, a.captured_at, a.width, a.height, a.duration_ms, a.thumbnail_path,
         a.preview_path, a.note, a.status FROM assets a"
    );
    bind_filters(&mut builder, &query);
    let order = match query.sort.as_deref() {
        Some("name") => "a.filename COLLATE NOCASE ASC, a.id ASC",
        Some("oldest") => "COALESCE(a.captured_at, a.modified_at) ASC, a.id ASC",
        Some("largest") => "a.byte_size DESC, a.id ASC",
        _ => "COALESCE(a.captured_at, a.modified_at) DESC, a.id DESC",
    };
    builder.push(" ORDER BY ").push(order).push(" LIMIT ").push_bind(limit).push(" OFFSET ").push_bind(offset);
    let rows = builder.build_query_as::<AssetRow>().fetch_all(&db).await?;
    let mut tag_map: HashMap<String, Vec<Tag>> = HashMap::new();
    if !rows.is_empty() {
        let mut tags_builder = QueryBuilder::<Sqlite>::new(
            "SELECT at.asset_id, t.id, t.name, t.color, 0 asset_count FROM asset_tags at JOIN tags t ON t.id=at.tag_id WHERE at.asset_id IN ("
        );
        let mut separated = tags_builder.separated(",");
        for row in &rows { separated.push_bind(&row.id); }
        separated.push_unseparated(") ORDER BY t.name COLLATE NOCASE");
        let links = tags_builder.build_query_as::<TagLink>().fetch_all(&db).await?;
        for link in links {
            tag_map.entry(link.asset_id).or_default().push(Tag { id: link.id, name: link.name, color: link.color, asset_count: link.asset_count });
        }
    }
    let items = rows.into_iter().map(|row| {
        let tags = tag_map.remove(&row.id).unwrap_or_default();
        Asset { row, tags }
    }).collect();
    let next = (offset + limit < total).then(|| (offset + limit).to_string());
    Ok(AssetPage { items, next_cursor: next, total })
}

#[tauri::command]
pub async fn add_source(path: String, app: AppHandle, state: State<'_, AppState>) -> AppResult<String> {
    let canonical = dunce::canonicalize(&path)?;
    if !canonical.is_dir() { return Err("Please choose an available folder".into()); }
    let db = state.db().await;
    let existing: Vec<String> = sqlx::query_scalar("SELECT path FROM source_roots").fetch_all(&db).await?;
    let candidate = normalized(&canonical);
    if existing.iter().any(|item| {
        let current = normalized(Path::new(item));
        candidate == current || candidate.starts_with(&(current.clone() + "\\")) || current.starts_with(&(candidate.clone() + "\\"))
    }) { return Err("This folder overlaps an existing source".into()); }
    let id = Uuid::new_v4().to_string();
    let name = canonical.file_name().map(|v| v.to_string_lossy().to_string()).unwrap_or_else(|| canonical.display().to_string());
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO source_roots(id, path, name, status, created_at, updated_at) VALUES(?, ?, ?, 'scanning', ?, ?)")
        .bind(&id).bind(canonical.to_string_lossy().to_string()).bind(name).bind(&now).bind(&now).execute(&db).await?;
    if let Err(error) = watcher::attach(app.clone(), &state, id.clone(), &canonical) { tracing::warn!(error = %error, "source watcher could not be started"); }
    scanner::start_scan(app, &state, id.clone(), canonical).await?;
    Ok(id)
}

#[tauri::command]
pub async fn remove_source(id: String, state: State<'_, AppState>) -> AppResult<()> {
    watcher::detach(&state, &id);
    sqlx::query("DELETE FROM source_roots WHERE id=?").bind(id).execute(&state.db().await).await?;
    Ok(())
}

#[tauri::command]
pub async fn prepare_video_preview(id: String, state: State<'_, AppState>) -> AppResult<String> {
    let db = state.db().await;
    let (source, quick_hash, existing) = sqlx::query_as::<_, (String, String, Option<String>)>(
        "SELECT path, quick_hash, preview_path FROM assets WHERE id=? AND media_kind='video'"
    ).bind(&id).fetch_optional(&db).await?.ok_or("Video asset not found")?;
    if let Some(path) = existing.filter(|path| Path::new(path).is_file()) { return Ok(path); }
    let destination = state.paths.previews_dir.join(&quick_hash[..2]).join(format!("{quick_hash}.mp4"));
    media::create_video_preview(Path::new(&source), &destination).await?;
    let destination = destination.to_string_lossy().to_string();
    sqlx::query("UPDATE assets SET preview_path=?, updated_at=? WHERE id=?")
        .bind(&destination).bind(Utc::now().to_rfc3339()).bind(id).execute(&db).await?;
    Ok(destination)
}

#[tauri::command]
pub async fn rescan_source(id: String, app: AppHandle, state: State<'_, AppState>) -> AppResult<String> {
    let db = state.db().await;
    let path = sqlx::query_scalar::<_, String>("SELECT path FROM source_roots WHERE id=?").bind(&id).fetch_optional(&db).await?
        .ok_or("Source folder was not found")?;
    sqlx::query("UPDATE source_roots SET status='scanning', updated_at=? WHERE id=?").bind(Utc::now().to_rfc3339()).bind(&id).execute(&db).await?;
    scanner::start_scan(app, &state, id, PathBuf::from(path)).await
}

#[tauri::command]
pub async fn control_job(id: String, action: String, state: State<'_, AppState>) -> AppResult<()> {
    let jobs = state.jobs.lock().await;
    let control = jobs.get(&id).ok_or("Job is no longer active")?.clone();
    let mut control = control.lock().await;
    match action.as_str() {
        "pause" => control.paused = true,
        "resume" => control.paused = false,
        "cancel" => control.cancelled = true,
        _ => return Err("Unknown job action".into()),
    }
    Ok(())
}

#[tauri::command]
pub async fn get_recent_jobs(state: State<'_, AppState>) -> AppResult<Vec<JobProgress>> {
    let rows = sqlx::query_as::<_, JobRow>(
        "SELECT id, kind, status, total, completed, message FROM jobs ORDER BY created_at DESC LIMIT 10"
    ).fetch_all(&state.db().await).await?;
    Ok(rows.into_iter().map(JobProgress::from).collect())
}

#[tauri::command]
pub fn report_frontend_error(message: String) {
    tracing::error!(message = %message.chars().take(1000).collect::<String>(), "frontend error");
}

#[tauri::command]
pub async fn create_tag(name: String, color: String, state: State<'_, AppState>) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 40 { return Err("Tag names must contain 1 to 40 characters".into()); }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO tags(id, name, color, created_at, updated_at) VALUES(?, ?, ?, ?, ?)")
        .bind(&id).bind(name).bind(color).bind(&now).bind(&now).execute(&state.db().await).await?;
    Ok(id)
}

#[tauri::command]
pub async fn update_tag(id: String, name: String, color: String, state: State<'_, AppState>) -> AppResult<()> {
    sqlx::query("UPDATE tags SET name=?, color=?, updated_at=? WHERE id=?")
        .bind(name.trim()).bind(color).bind(Utc::now().to_rfc3339()).bind(id).execute(&state.db().await).await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_tag(id: String, state: State<'_, AppState>) -> AppResult<()> {
    sqlx::query("DELETE FROM tags WHERE id=?").bind(id).execute(&state.db().await).await?;
    Ok(())
}

#[tauri::command]
pub async fn set_asset_tags(asset_ids: Vec<String>, tag_id: String, attached: bool, state: State<'_, AppState>) -> AppResult<()> {
    let db = state.db().await;
    let mut transaction = db.begin().await?;
    for asset_id in asset_ids {
        if attached {
            sqlx::query("INSERT OR IGNORE INTO asset_tags(asset_id, tag_id, created_at) VALUES(?, ?, ?)")
                .bind(asset_id).bind(&tag_id).bind(Utc::now().to_rfc3339()).execute(&mut *transaction).await?;
        } else {
            sqlx::query("DELETE FROM asset_tags WHERE asset_id=? AND tag_id=?").bind(asset_id).bind(&tag_id).execute(&mut *transaction).await?;
        }
    }
    transaction.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn create_collection(name: String, state: State<'_, AppState>) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 { return Err("Collection names must contain 1 to 80 characters".into()); }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO collections(id, name, created_at, updated_at) VALUES(?, ?, ?, ?)")
        .bind(&id).bind(name).bind(&now).bind(&now).execute(&state.db().await).await?;
    Ok(id)
}

#[tauri::command]
pub async fn delete_collection(id: String, state: State<'_, AppState>) -> AppResult<()> {
    sqlx::query("DELETE FROM collections WHERE id=?").bind(id).execute(&state.db().await).await?;
    Ok(())
}

#[tauri::command]
pub async fn set_collection_assets(collection_id: String, asset_ids: Vec<String>, attached: bool, state: State<'_, AppState>) -> AppResult<()> {
    let db = state.db().await;
    let mut transaction = db.begin().await?;
    for asset_id in asset_ids {
        if attached {
            sqlx::query("INSERT OR IGNORE INTO collection_items(collection_id, asset_id, created_at) VALUES(?, ?, ?)")
                .bind(&collection_id).bind(asset_id).bind(Utc::now().to_rfc3339()).execute(&mut *transaction).await?;
        } else {
            sqlx::query("DELETE FROM collection_items WHERE collection_id=? AND asset_id=?")
                .bind(&collection_id).bind(asset_id).execute(&mut *transaction).await?;
        }
    }
    transaction.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn update_asset_note(id: String, note: String, state: State<'_, AppState>) -> AppResult<()> {
    sqlx::query("UPDATE assets SET note=?, updated_at=? WHERE id=?")
        .bind(note).bind(Utc::now().to_rfc3339()).bind(id).execute(&state.db().await).await?;
    Ok(())
}

async fn hash_matches(left: &Path, right: &Path) -> AppResult<bool> {
    Ok(media::full_hash(left).await? == media::full_hash(right).await?)
}

#[tauri::command]
pub async fn move_asset(id: String, destination: String, state: State<'_, AppState>) -> AppResult<()> {
    let db = state.db().await;
    let from = sqlx::query_scalar::<_, String>("SELECT path FROM assets WHERE id=?").bind(&id).fetch_optional(&db).await?.ok_or("Asset not found")?;
    let from_path = PathBuf::from(&from);
    let to_path = PathBuf::from(&destination);
    if to_path.exists() { return Err("The destination already exists".into()); }
    if media::media_kind(&to_path).is_none() { return Err("The destination must keep a supported extension".into()); }
    if let Some(parent) = to_path.parent() { tokio::fs::create_dir_all(parent).await?; }
    let operation_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO file_operations(id, kind, asset_id, from_path, to_path, status, created_at) VALUES(?, 'move', ?, ?, ?, 'pending', ?)")
        .bind(&operation_id).bind(&id).bind(&from).bind(&destination).bind(&now).execute(&db).await?;
    let move_result = match tokio::fs::rename(&from_path, &to_path).await {
        Ok(()) => Ok(()),
        Err(_) => {
            tokio::fs::copy(&from_path, &to_path).await?;
            if !hash_matches(&from_path, &to_path).await? {
                let _ = tokio::fs::remove_file(&to_path).await;
                Err(AppError::Message("Copied file verification failed".into()))
            } else {
                let source = from_path.clone();
                tokio::task::spawn_blocking(move || trash::delete(source)).await.map_err(|e| AppError::Message(e.to_string()))?
                    .map_err(|e| AppError::Message(e.to_string()))?;
                Ok(())
            }
        }
    };
    match move_result {
        Ok(()) => {
            let filename = to_path.file_name().unwrap_or_default().to_string_lossy().to_string();
            sqlx::query("UPDATE assets SET path=?, filename=?, updated_at=? WHERE id=?")
                .bind(&destination).bind(filename).bind(Utc::now().to_rfc3339()).bind(&id).execute(&db).await?;
            sqlx::query("UPDATE file_operations SET status='complete', completed_at=? WHERE id=?")
                .bind(Utc::now().to_rfc3339()).bind(operation_id).execute(&db).await?;
            Ok(())
        }
        Err(error) => {
            sqlx::query("UPDATE file_operations SET status='error', error=?, completed_at=? WHERE id=?")
                .bind(error.to_string()).bind(Utc::now().to_rfc3339()).bind(operation_id).execute(&db).await?;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn undo_last_file_operation(state: State<'_, AppState>) -> AppResult<()> {
    let db = state.db().await;
    let row = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT id, asset_id, from_path, to_path FROM file_operations
         WHERE status='complete' AND kind='move' AND to_path IS NOT NULL ORDER BY completed_at DESC LIMIT 1"
    ).fetch_optional(&db).await?.ok_or("There is no file operation to undo")?;
    let (operation_id, asset_id, from, to) = row;
    if Path::new(&from).exists() || !Path::new(&to).exists() { return Err("The file can no longer be moved back safely".into()); }
    if let Some(parent) = Path::new(&from).parent() { tokio::fs::create_dir_all(parent).await?; }
    tokio::fs::rename(&to, &from).await?;
    let filename = Path::new(&from).file_name().unwrap_or_default().to_string_lossy().to_string();
    sqlx::query("UPDATE assets SET path=?, filename=?, updated_at=? WHERE id=?")
        .bind(&from).bind(filename).bind(Utc::now().to_rfc3339()).bind(asset_id).execute(&db).await?;
    sqlx::query("UPDATE file_operations SET status='undone' WHERE id=?").bind(operation_id).execute(&db).await?;
    Ok(())
}

#[tauri::command]
pub async fn trash_assets(ids: Vec<String>, state: State<'_, AppState>) -> AppResult<()> {
    let db = state.db().await;
    for id in ids {
        let path = sqlx::query_scalar::<_, String>("SELECT path FROM assets WHERE id=?").bind(&id).fetch_optional(&db).await?.ok_or("Asset not found")?;
        let owned = PathBuf::from(path);
        tokio::task::spawn_blocking(move || trash::delete(owned)).await.map_err(|e| AppError::Message(e.to_string()))?
            .map_err(|e| AppError::Message(e.to_string()))?;
        sqlx::query("UPDATE assets SET status='missing', updated_at=? WHERE id=?")
            .bind(Utc::now().to_rfc3339()).bind(id).execute(&db).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn reveal_asset(id: String, state: State<'_, AppState>) -> AppResult<()> {
    let path = sqlx::query_scalar::<_, String>("SELECT path FROM assets WHERE id=?").bind(id).fetch_optional(&state.db().await).await?.ok_or("Asset not found")?;
    std::process::Command::new("explorer.exe").arg(format!("/select,{path}")).spawn()?;
    Ok(())
}

#[tauri::command]
pub async fn open_asset(id: String, state: State<'_, AppState>) -> AppResult<()> {
    let path = sqlx::query_scalar::<_, String>("SELECT path FROM assets WHERE id=?").bind(id).fetch_optional(&state.db().await).await?.ok_or("Asset not found")?;
    std::process::Command::new("cmd.exe").args(["/C", "start", "", &path]).spawn()?;
    Ok(())
}

#[tauri::command]
pub async fn create_backup(state: State<'_, AppState>) -> AppResult<String> {
    let db = state.db().await;
    let filename = format!("tagloom-{}.db", Utc::now().format("%Y%m%d-%H%M%S"));
    let path = state.paths.backups_dir.join(filename);
    let escaped = path.to_string_lossy().replace('\\', "/").replace('\'', "''");
    sqlx::query(&format!("VACUUM INTO '{escaped}'")).execute(&db).await?;
    let mut backups = std::fs::read_dir(&state.paths.backups_dir)?.filter_map(Result::ok).collect::<Vec<_>>();
    backups.sort_by_key(|entry| entry.metadata().and_then(|m| m.modified()).ok());
    let excess = backups.len().saturating_sub(7);
    for entry in backups.into_iter().take(excess) { let _ = std::fs::remove_file(entry.path()); }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn restore_backup(path: String, app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let backup = PathBuf::from(path);
    if !backup.is_file() { return Err("Backup file not found".into()); }
    let check = AppState::connect(&backup).await?;
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check").fetch_one(&check).await?;
    check.close().await;
    if integrity != "ok" { return Err("Backup integrity check failed".into()); }
    let pool = state.pool.read().await.clone();
    pool.close().await;
    tokio::fs::copy(backup, &state.paths.db_path).await?;
    app.restart();
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<Vec<Setting>> {
    Ok(sqlx::query_as::<_, Setting>("SELECT key, value FROM settings ORDER BY key").fetch_all(&state.db().await).await?)
}

#[tauri::command]
pub async fn set_setting(key: String, value: String, state: State<'_, AppState>) -> AppResult<()> {
    const ALLOWED: &[&str] = &["language", "theme"];
    if !ALLOWED.contains(&key.as_str()) { return Err("Unknown setting".into()); }
    sqlx::query("INSERT INTO settings(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
        .bind(key).bind(value).bind(Utc::now().to_rfc3339()).execute(&state.db().await).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::normalized;
    use std::path::Path;

    #[test]
    fn normalizes_windows_paths_for_comparison() {
        assert_eq!(normalized(Path::new("C:/Media/Photos/")), "c:\\media\\photos");
    }
}
