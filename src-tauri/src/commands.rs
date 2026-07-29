use crate::{
    error::{AppError, AppResult},
    media,
    models::{
        Asset, AssetPage, AssetQuery, AssetRow, Collection, CollectionHomeCard, HomeSnapshot,
        JobProgress, JobRow, LibraryBootstrap, MoodboardDocument, MoodboardEdge, MoodboardNode,
        MoodboardSummary, SaveMoodboardResult, Setting, SourceRoot, Tag, VideoPreviewCacheStatus,
    },
    scanner,
    state::AppState,
    video_preview, watcher,
};
use chrono::Utc;
use sqlx::{FromRow, QueryBuilder, Sqlite, SqlitePool};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

const MAX_MOODBOARD_NODES: usize = 500;
const MAX_MOODBOARD_EDGES: usize = 750;
const MAX_MOODBOARD_EXPORT_BYTES: usize = 256 * 1024 * 1024;

#[derive(FromRow)]
struct MoodboardRow {
    id: String,
    collection_id: String,
    name: String,
    viewport_x: f64,
    viewport_y: f64,
    viewport_zoom: f64,
    background_color: String,
    revision: i64,
}

#[derive(FromRow)]
struct MoodboardNodeRow {
    id: String,
    node_type: String,
    asset_id: Option<String>,
    position_x: f64,
    position_y: f64,
    width: f64,
    height: f64,
    z_index: i64,
    config_json: String,
}

#[derive(FromRow)]
struct MoodboardEdgeRow {
    id: String,
    source_node_id: String,
    target_node_id: String,
    color: String,
    config_json: String,
}

#[derive(FromRow)]
struct TagLink {
    asset_id: String,
    id: String,
    name: String,
    color: String,
    asset_count: i64,
}

const ASSET_ROW_SELECT: &str =
    "SELECT a.id, a.source_id, a.path, a.filename, a.extension, a.media_kind, a.byte_size,
     a.modified_at, a.captured_at, a.width, a.height, a.duration_ms, a.thumbnail_path,
     a.preview_path, a.note, a.status FROM assets a";

const BOOTSTRAP_TAGS_SQL: &str = "SELECT t.id, t.name, t.color, COUNT(a.id) asset_count FROM tags t
     LEFT JOIN asset_tags at ON at.tag_id=t.id
     LEFT JOIN assets a ON a.id=at.asset_id AND a.status='ready'
     GROUP BY t.id ORDER BY t.name COLLATE NOCASE";

const BOOTSTRAP_COLLECTIONS_SQL: &str =
    "SELECT c.id, c.name, COUNT(a.id) asset_count, c.cover_asset_id FROM collections c
     LEFT JOIN collection_items ci ON ci.collection_id=c.id
     LEFT JOIN assets a ON a.id=ci.asset_id AND a.status='ready'
     GROUP BY c.id ORDER BY c.name COLLATE NOCASE";

const HOME_COLLECTIONS_SQL: &str =
    "SELECT c.id, c.name, COUNT(a.id) asset_count, c.cover_asset_id FROM collections c
     LEFT JOIN collection_items ci ON ci.collection_id=c.id
     LEFT JOIN assets a ON a.id=ci.asset_id AND a.status='ready'
     GROUP BY c.id ORDER BY c.updated_at DESC, c.id ASC LIMIT 6";

fn normalized(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

async fn hydrate_assets(db: &SqlitePool, rows: Vec<AssetRow>) -> AppResult<Vec<Asset>> {
    let mut tag_map: HashMap<String, Vec<Tag>> = HashMap::new();
    if !rows.is_empty() {
        let mut tags_builder = QueryBuilder::<Sqlite>::new(
            "SELECT at.asset_id, t.id, t.name, t.color, 0 asset_count FROM asset_tags at JOIN tags t ON t.id=at.tag_id WHERE at.asset_id IN ("
        );
        let mut separated = tags_builder.separated(",");
        for row in &rows {
            separated.push_bind(&row.id);
        }
        separated.push_unseparated(") ORDER BY t.name COLLATE NOCASE");
        let links = tags_builder
            .build_query_as::<TagLink>()
            .fetch_all(db)
            .await?;
        for link in links {
            tag_map.entry(link.asset_id).or_default().push(Tag {
                id: link.id,
                name: link.name,
                color: link.color,
                asset_count: link.asset_count,
            });
        }
    }
    Ok(rows
        .into_iter()
        .map(|row| {
            let tags = tag_map.remove(&row.id).unwrap_or_default();
            Asset { row, tags }
        })
        .collect())
}

fn validate_moodboard_name(name: &str) -> AppResult<&str> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 80 {
        return Err("Moodboard names must contain 1 to 80 characters".into());
    }
    Ok(trimmed)
}

fn is_color(value: &str) -> bool {
    let bytes = value.as_bytes();
    (bytes.len() == 4 || bytes.len() == 7)
        && bytes.first() == Some(&b'#')
        && bytes[1..].iter().all(u8::is_ascii_hexdigit)
}

fn validate_finite(value: f64, label: &str, min: f64, max: f64) -> AppResult<()> {
    if !value.is_finite() || value < min || value > max {
        return Err(format!("Moodboard {label} is outside the supported range").into());
    }
    Ok(())
}

fn validate_moodboard_document(document: &MoodboardDocument) -> AppResult<()> {
    validate_moodboard_name(&document.name)?;
    if document.id.trim().is_empty() || document.collection_id.trim().is_empty() {
        return Err("Moodboard identifiers are required".into());
    }
    validate_finite(document.viewport.x, "viewport x", -1_000_000.0, 1_000_000.0)?;
    validate_finite(document.viewport.y, "viewport y", -1_000_000.0, 1_000_000.0)?;
    validate_finite(document.viewport.zoom, "viewport zoom", 0.05, 16.0)?;
    if !is_color(&document.background_color) {
        return Err("Moodboard background color must be a hex color".into());
    }
    if document.nodes.len() > MAX_MOODBOARD_NODES || document.edges.len() > MAX_MOODBOARD_EDGES {
        return Err("Moodboard has too many nodes or edges".into());
    }

    let mut ids = std::collections::HashSet::new();
    for node in &document.nodes {
        if node.id.trim().is_empty() || node.id.len() > 128 || !ids.insert(node.id.as_str()) {
            return Err("Moodboard node IDs must be unique and at most 128 characters".into());
        }
        if !matches!(node.node_type.as_str(), "asset" | "text" | "swatch") {
            return Err("Moodboard node type is not supported".into());
        }
        validate_finite(node.position.x, "node x", -1_000_000.0, 1_000_000.0)?;
        validate_finite(node.position.y, "node y", -1_000_000.0, 1_000_000.0)?;
        validate_finite(node.size.width, "node width", 1.0, 20_000.0)?;
        validate_finite(node.size.height, "node height", 1.0, 20_000.0)?;
        if !(-100_000..=100_000).contains(&node.z_index) || !node.data.is_object() {
            return Err("Moodboard node configuration is invalid".into());
        }
        let data = node.data.as_object().expect("object checked");
        match node.node_type.as_str() {
            "asset" => {
                if !matches!(
                    data.get("fit").and_then(|value| value.as_str()),
                    Some("cover" | "contain")
                ) {
                    return Err("Asset nodes require a cover or contain fit mode".into());
                }
                if let Some(value) = data.get("assetId") {
                    if !value.is_null()
                        && value.as_str().filter(|id| !id.trim().is_empty()).is_none()
                    {
                        return Err("Asset node assetId must be a non-empty string".into());
                    }
                }
            }
            "text" => {
                let text = data.get("text").and_then(|value| value.as_str());
                if text.is_none_or(|value| value.chars().count() > 4_000)
                    || !matches!(
                        data.get("fontSize").and_then(|value| value.as_str()),
                        Some("small" | "medium" | "large")
                    )
                    || !matches!(
                        data.get("align").and_then(|value| value.as_str()),
                        Some("left" | "center" | "right")
                    )
                    || !data
                        .get("color")
                        .and_then(|value| value.as_str())
                        .is_some_and(is_color)
                {
                    return Err("Text node configuration is invalid".into());
                }
            }
            "swatch" => {
                if !data
                    .get("color")
                    .and_then(|value| value.as_str())
                    .is_some_and(is_color)
                    || data
                        .get("name")
                        .and_then(|value| value.as_str())
                        .is_some_and(|value| value.chars().count() > 120)
                {
                    return Err("Swatch node configuration is invalid".into());
                }
            }
            _ => unreachable!(),
        }
    }

    let mut edge_ids = std::collections::HashSet::new();
    for edge in &document.edges {
        if edge.id.trim().is_empty() || edge.id.len() > 128 || !edge_ids.insert(edge.id.as_str()) {
            return Err("Moodboard edge IDs must be unique and at most 128 characters".into());
        }
        if edge.source_node_id == edge.target_node_id
            || !ids.contains(edge.source_node_id.as_str())
            || !ids.contains(edge.target_node_id.as_str())
            || !matches!(edge.color.as_str(), "neutral" | "coral" | "green" | "gold")
            || !edge.config.is_object()
        {
            return Err("Moodboard edge configuration is invalid".into());
        }
    }
    Ok(())
}

fn node_asset_id(node: &MoodboardNode) -> Option<&str> {
    (node.node_type == "asset")
        .then(|| node.data.get("assetId"))
        .flatten()
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
}

fn restore_node_data(mut data: serde_json::Value, asset_id: Option<String>) -> serde_json::Value {
    if let Some(object) = data.as_object_mut() {
        match asset_id {
            Some(asset_id) => {
                object.insert("assetId".into(), serde_json::Value::String(asset_id));
            }
            None => {
                object.remove("assetId");
            }
        }
    }
    data
}

async fn home_assets(db: &SqlitePool, suffix: &str) -> AppResult<Vec<Asset>> {
    let sql = format!("{ASSET_ROW_SELECT} WHERE a.status='ready' {suffix} LIMIT 8");
    let rows = sqlx::query_as::<_, AssetRow>(&sql).fetch_all(db).await?;
    hydrate_assets(db, rows).await
}

#[tauri::command]
pub async fn get_bootstrap(state: State<'_, AppState>) -> AppResult<LibraryBootstrap> {
    let db = state.db().await;
    let sources = sqlx::query_as::<_, SourceRoot>(
        "SELECT s.id, s.path, s.name, s.status, s.last_scanned_at, COUNT(a.id) asset_count
         FROM source_roots s LEFT JOIN assets a ON a.source_id=s.id AND a.status='ready'
         GROUP BY s.id ORDER BY s.created_at",
    )
    .fetch_all(&db)
    .await?;
    let tags = sqlx::query_as::<_, Tag>(BOOTSTRAP_TAGS_SQL)
        .fetch_all(&db)
        .await?;
    let collections = sqlx::query_as::<_, Collection>(BOOTSTRAP_COLLECTIONS_SQL)
        .fetch_all(&db)
        .await?;
    let (total_assets, image_count, video_count) = sqlx::query_as::<_, (i64, i64, i64)>(
        "SELECT COUNT(*), SUM(CASE WHEN media_kind='image' THEN 1 ELSE 0 END),
         SUM(CASE WHEN media_kind='video' THEN 1 ELSE 0 END) FROM assets WHERE status='ready'",
    )
    .fetch_one(&db)
    .await?;
    Ok(LibraryBootstrap {
        sources,
        tags,
        collections,
        total_assets,
        image_count,
        video_count,
    })
}

#[tauri::command]
pub async fn get_home_snapshot(state: State<'_, AppState>) -> AppResult<HomeSnapshot> {
    let db = state.db().await;
    let collections = sqlx::query_as::<_, Collection>(HOME_COLLECTIONS_SQL)
        .fetch_all(&db)
        .await?;
    let mut cards = Vec::with_capacity(collections.len());
    for collection in collections {
        let custom_id = if let Some(asset_id) = &collection.cover_asset_id {
            sqlx::query_scalar::<_, String>(
                "SELECT a.id FROM collection_items ci JOIN assets a ON a.id=ci.asset_id
                 WHERE ci.collection_id=? AND ci.asset_id=? AND a.status='ready' LIMIT 1",
            )
            .bind(&collection.id)
            .bind(asset_id)
            .fetch_optional(&db)
            .await?
        } else {
            None
        };
        let cover_id = match &custom_id {
            Some(id) => Some(id.clone()),
            None => {
                sqlx::query_scalar::<_, String>(
                    "SELECT a.id FROM collection_items ci JOIN assets a ON a.id=ci.asset_id
                 WHERE ci.collection_id=? AND a.status='ready'
                 ORDER BY ci.position ASC, ci.created_at ASC, ci.asset_id ASC LIMIT 1",
                )
                .bind(&collection.id)
                .fetch_optional(&db)
                .await?
            }
        };
        let cover_asset = if let Some(id) = cover_id {
            let sql = format!("{ASSET_ROW_SELECT} WHERE a.id=? AND a.status='ready'");
            let row = sqlx::query_as::<_, AssetRow>(&sql)
                .bind(id)
                .fetch_optional(&db)
                .await?;
            match row {
                Some(row) => hydrate_assets(&db, vec![row]).await?.pop(),
                None => None,
            }
        } else {
            None
        };
        cards.push(CollectionHomeCard {
            id: collection.id,
            name: collection.name,
            asset_count: collection.asset_count,
            cover_asset,
            has_custom_cover: custom_id.is_some(),
        });
    }
    let (recent_viewed, recent_imported, recent_modified) = tokio::try_join!(
        home_assets(
            &db,
            "AND a.last_viewed_at IS NOT NULL ORDER BY a.last_viewed_at DESC, a.id DESC"
        ),
        home_assets(&db, "ORDER BY a.created_at DESC, a.id DESC"),
        home_assets(&db, "ORDER BY a.modified_at DESC, a.id DESC"),
    )?;
    Ok(HomeSnapshot {
        collections: cards,
        recent_viewed,
        recent_imported,
        recent_modified,
    })
}

fn bind_filters<'a>(builder: &mut QueryBuilder<'a, Sqlite>, query: &'a AssetQuery) {
    builder.push(" WHERE a.status='ready'");
    if let Some(value) = &query.source_id {
        builder.push(" AND a.source_id=").push_bind(value);
    }
    if let Some(value) = &query.media_kind {
        builder.push(" AND a.media_kind=").push_bind(value);
    }
    if let Some(value) = &query.tag_id {
        builder
            .push(" AND EXISTS(SELECT 1 FROM asset_tags at WHERE at.asset_id=a.id AND at.tag_id=")
            .push_bind(value)
            .push(")");
    }
    if let Some(value) = &query.collection_id {
        builder.push(" AND EXISTS(SELECT 1 FROM collection_items ci WHERE ci.asset_id=a.id AND ci.collection_id=").push_bind(value).push(")");
    }
    if let Some(value) = query
        .search
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
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
    let offset = query
        .cursor
        .as_deref()
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
        .max(0);
    let mut count_builder = QueryBuilder::<Sqlite>::new("SELECT COUNT(*) FROM assets a");
    bind_filters(&mut count_builder, &query);
    let total: i64 = count_builder.build_query_scalar().fetch_one(&db).await?;

    let mut builder = QueryBuilder::<Sqlite>::new(ASSET_ROW_SELECT);
    bind_filters(&mut builder, &query);
    let order = match query.sort.as_deref() {
        Some("name") => "a.filename COLLATE NOCASE ASC, a.id ASC",
        Some("oldest") => "COALESCE(a.captured_at, a.modified_at) ASC, a.id ASC",
        Some("largest") => "a.byte_size DESC, a.id ASC",
        _ => "COALESCE(a.captured_at, a.modified_at) DESC, a.id DESC",
    };
    builder
        .push(" ORDER BY ")
        .push(order)
        .push(" LIMIT ")
        .push_bind(limit)
        .push(" OFFSET ")
        .push_bind(offset);
    let rows = builder.build_query_as::<AssetRow>().fetch_all(&db).await?;
    let items = hydrate_assets(&db, rows).await?;
    let next = (offset + limit < total).then(|| (offset + limit).to_string());
    Ok(AssetPage {
        items,
        next_cursor: next,
        total,
    })
}

#[tauri::command]
pub async fn add_source(
    path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let canonical = dunce::canonicalize(&path)?;
    if !canonical.is_dir() {
        return Err("Please choose an available folder".into());
    }
    let db = state.db().await;
    let existing: Vec<String> = sqlx::query_scalar("SELECT path FROM source_roots")
        .fetch_all(&db)
        .await?;
    let candidate = normalized(&canonical);
    if existing.iter().any(|item| {
        let current = normalized(Path::new(item));
        candidate == current
            || candidate.starts_with(&(current.clone() + "\\"))
            || current.starts_with(&(candidate.clone() + "\\"))
    }) {
        return Err("This folder overlaps an existing source".into());
    }
    let id = Uuid::new_v4().to_string();
    let name = canonical
        .file_name()
        .map(|v| v.to_string_lossy().to_string())
        .unwrap_or_else(|| canonical.display().to_string());
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO source_roots(id, path, name, status, created_at, updated_at) VALUES(?, ?, ?, 'scanning', ?, ?)")
        .bind(&id).bind(canonical.to_string_lossy().to_string()).bind(name).bind(&now).bind(&now).execute(&db).await?;
    if let Err(error) = app.asset_protocol_scope().allow_directory(&canonical, true) {
        let _ = sqlx::query("DELETE FROM source_roots WHERE id=?")
            .bind(&id)
            .execute(&db)
            .await;
        return Err(AppError::Message(format!(
            "Selected folder could not be authorized: {error}"
        )));
    }
    if let Err(error) = watcher::attach(app.clone(), &state, id.clone(), &canonical) {
        tracing::warn!(error = %error, "source watcher could not be started");
    }
    scanner::start_scan(app, &state, id.clone(), canonical).await?;
    Ok(id)
}

#[tauri::command]
pub async fn remove_source(id: String, state: State<'_, AppState>) -> AppResult<()> {
    watcher::detach(&state, &id);
    let db = state.db().await;
    let previews = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT id, preview_path FROM assets WHERE source_id=? AND media_kind='video'",
    )
    .bind(&id)
    .fetch_all(&db)
    .await?;
    for (asset_id, _) in &previews {
        video_preview::cancel_and_wait(&state, asset_id).await;
        state.active_video_previews.write().await.remove(asset_id);
        state
            .pending_preview_removals
            .write()
            .await
            .remove(asset_id);
    }
    sqlx::query("DELETE FROM source_roots WHERE id=?")
        .bind(&id)
        .execute(&db)
        .await?;
    for (_, preview) in previews {
        if let Some(preview) = preview {
            video_preview::remove_if_unreferenced(&db, Path::new(&preview)).await?;
        }
    }
    // Tauri's runtime scope is additive: a forbidden path cannot be allowed again
    // until restart. Keep the existing process-local grant so users can undo a
    // source removal by adding the same folder again; it expires with the process.
    Ok(())
}

#[tauri::command]
pub async fn prepare_video_preview(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<String> {
    video_preview::prepare(&app, &state, id).await
}

#[tauri::command]
pub async fn cancel_video_preview(id: String, state: State<'_, AppState>) -> AppResult<()> {
    video_preview::cancel(&state, &id).await;
    Ok(())
}

#[tauri::command]
pub async fn invalidate_video_preview(id: String, state: State<'_, AppState>) -> AppResult<()> {
    video_preview::invalidate(&state, &id).await
}

#[tauri::command]
pub async fn set_video_preview_active(
    id: String,
    active: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    video_preview::set_active(&state, &id, active).await
}

#[tauri::command]
pub async fn get_video_preview_cache_status(
    state: State<'_, AppState>,
) -> AppResult<VideoPreviewCacheStatus> {
    video_preview::cache_status(&state).await
}

#[tauri::command]
pub async fn set_video_preview_cache_limit(
    limit_bytes: u64,
    state: State<'_, AppState>,
) -> AppResult<VideoPreviewCacheStatus> {
    video_preview::set_cache_limit(&state, limit_bytes).await
}

#[tauri::command]
pub async fn clear_video_preview_cache(
    state: State<'_, AppState>,
) -> AppResult<VideoPreviewCacheStatus> {
    video_preview::clear_cache(&state).await
}

#[tauri::command]
pub async fn rescan_source(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let db = state.db().await;
    let path = sqlx::query_scalar::<_, String>("SELECT path FROM source_roots WHERE id=?")
        .bind(&id)
        .fetch_optional(&db)
        .await?
        .ok_or("Source folder was not found")?;
    sqlx::query("UPDATE source_roots SET status='scanning', updated_at=? WHERE id=?")
        .bind(Utc::now().to_rfc3339())
        .bind(&id)
        .execute(&db)
        .await?;
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
pub async fn create_tag(
    name: String,
    color: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 40 {
        return Err("Tag names must contain 1 to 40 characters".into());
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO tags(id, name, color, created_at, updated_at) VALUES(?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(name)
        .bind(color)
        .bind(&now)
        .bind(&now)
        .execute(&state.db().await)
        .await?;
    Ok(id)
}

#[tauri::command]
pub async fn update_tag(
    id: String,
    name: String,
    color: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    sqlx::query("UPDATE tags SET name=?, color=?, updated_at=? WHERE id=?")
        .bind(name.trim())
        .bind(color)
        .bind(Utc::now().to_rfc3339())
        .bind(id)
        .execute(&state.db().await)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_tag(id: String, state: State<'_, AppState>) -> AppResult<()> {
    sqlx::query("DELETE FROM tags WHERE id=?")
        .bind(id)
        .execute(&state.db().await)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn set_asset_tags(
    asset_ids: Vec<String>,
    tag_id: String,
    attached: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let db = state.db().await;
    let mut transaction = db.begin().await?;
    for asset_id in asset_ids {
        if attached {
            sqlx::query(
                "INSERT OR IGNORE INTO asset_tags(asset_id, tag_id, created_at) VALUES(?, ?, ?)",
            )
            .bind(asset_id)
            .bind(&tag_id)
            .bind(Utc::now().to_rfc3339())
            .execute(&mut *transaction)
            .await?;
        } else {
            sqlx::query("DELETE FROM asset_tags WHERE asset_id=? AND tag_id=?")
                .bind(asset_id)
                .bind(&tag_id)
                .execute(&mut *transaction)
                .await?;
        }
    }
    transaction.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn create_collection(name: String, state: State<'_, AppState>) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err("Collection names must contain 1 to 80 characters".into());
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO collections(id, name, created_at, updated_at) VALUES(?, ?, ?, ?)")
        .bind(&id)
        .bind(name)
        .bind(&now)
        .bind(&now)
        .execute(&state.db().await)
        .await?;
    Ok(id)
}

#[tauri::command]
pub async fn delete_collection(id: String, state: State<'_, AppState>) -> AppResult<()> {
    sqlx::query("DELETE FROM collections WHERE id=?")
        .bind(id)
        .execute(&state.db().await)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn set_collection_assets(
    collection_id: String,
    asset_ids: Vec<String>,
    attached: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let db = state.db().await;
    let mut transaction = db.begin().await?;
    let now = Utc::now().to_rfc3339();
    for asset_id in asset_ids {
        if attached {
            let position = sqlx::query_scalar::<_, i64>("SELECT COALESCE(MAX(position), -1) + 1 FROM collection_items WHERE collection_id=?")
                .bind(&collection_id).fetch_one(&mut *transaction).await?;
            sqlx::query("INSERT OR IGNORE INTO collection_items(collection_id, asset_id, position, created_at) VALUES(?, ?, ?, ?)")
                .bind(&collection_id).bind(asset_id).bind(position).bind(&now).execute(&mut *transaction).await?;
        } else {
            sqlx::query("DELETE FROM collection_items WHERE collection_id=? AND asset_id=?")
                .bind(&collection_id)
                .bind(&asset_id)
                .execute(&mut *transaction)
                .await?;
            sqlx::query(
                "UPDATE collections SET cover_asset_id=NULL WHERE id=? AND cover_asset_id=?",
            )
            .bind(&collection_id)
            .bind(asset_id)
            .execute(&mut *transaction)
            .await?;
        }
    }
    sqlx::query("UPDATE collections SET updated_at=? WHERE id=?")
        .bind(&now)
        .bind(&collection_id)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn set_collection_cover(
    collection_id: String,
    asset_id: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let db = state.db().await;
    let member = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM collection_items ci JOIN assets a ON a.id=ci.asset_id
         WHERE ci.collection_id=? AND ci.asset_id=? AND a.status='ready'",
    )
    .bind(&collection_id)
    .bind(&asset_id)
    .fetch_one(&db)
    .await?;
    if member == 0 {
        return Err("Collection covers must be selected from the collection".into());
    }
    sqlx::query("UPDATE collections SET cover_asset_id=?, updated_at=? WHERE id=?")
        .bind(asset_id)
        .bind(Utc::now().to_rfc3339())
        .bind(collection_id)
        .execute(&db)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn clear_collection_cover(
    collection_id: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    sqlx::query("UPDATE collections SET cover_asset_id=NULL, updated_at=? WHERE id=?")
        .bind(Utc::now().to_rfc3339())
        .bind(collection_id)
        .execute(&state.db().await)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn record_asset_viewed(id: String, state: State<'_, AppState>) -> AppResult<()> {
    sqlx::query("UPDATE assets SET last_viewed_at=? WHERE id=? AND status='ready'")
        .bind(Utc::now().to_rfc3339())
        .bind(id)
        .execute(&state.db().await)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn update_asset_note(
    id: String,
    note: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    sqlx::query("UPDATE assets SET note=?, updated_at=? WHERE id=?")
        .bind(note)
        .bind(Utc::now().to_rfc3339())
        .bind(id)
        .execute(&state.db().await)
        .await?;
    Ok(())
}

async fn hash_matches(left: &Path, right: &Path) -> AppResult<bool> {
    Ok(media::full_hash(left).await? == media::full_hash(right).await?)
}

#[tauri::command]
pub async fn move_asset(
    id: String,
    destination: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let db = state.db().await;
    let from = sqlx::query_scalar::<_, String>("SELECT path FROM assets WHERE id=?")
        .bind(&id)
        .fetch_optional(&db)
        .await?
        .ok_or("Asset not found")?;
    let from_path = PathBuf::from(&from);
    let to_path = PathBuf::from(&destination);
    if to_path.exists() {
        return Err("The destination already exists".into());
    }
    if media::media_kind(&to_path).is_none() {
        return Err("The destination must keep a supported extension".into());
    }
    if let Some(parent) = to_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
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
                tokio::task::spawn_blocking(move || trash::delete(source))
                    .await
                    .map_err(|e| AppError::Message(e.to_string()))?
                    .map_err(|e| AppError::Message(e.to_string()))?;
                Ok(())
            }
        }
    };
    match move_result {
        Ok(()) => {
            let filename = to_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            sqlx::query("UPDATE assets SET path=?, filename=?, updated_at=? WHERE id=?")
                .bind(&destination)
                .bind(filename)
                .bind(Utc::now().to_rfc3339())
                .bind(&id)
                .execute(&db)
                .await?;
            sqlx::query("UPDATE file_operations SET status='complete', completed_at=? WHERE id=?")
                .bind(Utc::now().to_rfc3339())
                .bind(operation_id)
                .execute(&db)
                .await?;
            Ok(())
        }
        Err(error) => {
            sqlx::query(
                "UPDATE file_operations SET status='error', error=?, completed_at=? WHERE id=?",
            )
            .bind(error.to_string())
            .bind(Utc::now().to_rfc3339())
            .bind(operation_id)
            .execute(&db)
            .await?;
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
    if Path::new(&from).exists() || !Path::new(&to).exists() {
        return Err("The file can no longer be moved back safely".into());
    }
    if let Some(parent) = Path::new(&from).parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::rename(&to, &from).await?;
    let filename = Path::new(&from)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    sqlx::query("UPDATE assets SET path=?, filename=?, updated_at=? WHERE id=?")
        .bind(&from)
        .bind(filename)
        .bind(Utc::now().to_rfc3339())
        .bind(asset_id)
        .execute(&db)
        .await?;
    sqlx::query("UPDATE file_operations SET status='undone' WHERE id=?")
        .bind(operation_id)
        .execute(&db)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn trash_assets(ids: Vec<String>, state: State<'_, AppState>) -> AppResult<()> {
    let db = state.db().await;
    for id in ids {
        let path = sqlx::query_scalar::<_, String>("SELECT path FROM assets WHERE id=?")
            .bind(&id)
            .fetch_optional(&db)
            .await?
            .ok_or("Asset not found")?;
        let owned = PathBuf::from(path);
        tokio::task::spawn_blocking(move || trash::delete(owned))
            .await
            .map_err(|e| AppError::Message(e.to_string()))?
            .map_err(|e| AppError::Message(e.to_string()))?;
        let updated_at = Utc::now().to_rfc3339();
        sqlx::query("UPDATE assets SET status='missing', updated_at=? WHERE id=?")
            .bind(&updated_at)
            .bind(&id)
            .execute(&db)
            .await?;
        sqlx::query(
            "UPDATE collections SET cover_asset_id=NULL, updated_at=? WHERE cover_asset_id=?",
        )
        .bind(updated_at)
        .bind(&id)
        .execute(&db)
        .await?;
        video_preview::invalidate(&state, &id).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn reveal_asset(id: String, state: State<'_, AppState>) -> AppResult<()> {
    let path = sqlx::query_scalar::<_, String>("SELECT path FROM assets WHERE id=?")
        .bind(id)
        .fetch_optional(&state.db().await)
        .await?
        .ok_or("Asset not found")?;
    std::process::Command::new("explorer.exe")
        .arg(format!("/select,{path}"))
        .spawn()?;
    Ok(())
}

#[tauri::command]
pub async fn open_asset(id: String, state: State<'_, AppState>) -> AppResult<()> {
    let path = sqlx::query_scalar::<_, String>("SELECT path FROM assets WHERE id=?")
        .bind(id)
        .fetch_optional(&state.db().await)
        .await?
        .ok_or("Asset not found")?;
    std::process::Command::new("cmd.exe")
        .args(["/C", "start", "", &path])
        .spawn()?;
    Ok(())
}

#[tauri::command]
pub async fn create_backup(state: State<'_, AppState>) -> AppResult<String> {
    let db = state.db().await;
    let filename = format!("tagloom-{}.db", Utc::now().format("%Y%m%d-%H%M%S"));
    let path = state.paths.backups_dir.join(filename);
    let escaped = path
        .to_string_lossy()
        .replace('\\', "/")
        .replace('\'', "''");
    sqlx::query(&format!("VACUUM INTO '{escaped}'"))
        .execute(&db)
        .await?;
    let mut backups = std::fs::read_dir(&state.paths.backups_dir)?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    backups.sort_by_key(|entry| entry.metadata().and_then(|m| m.modified()).ok());
    let excess = backups.len().saturating_sub(7);
    for entry in backups.into_iter().take(excess) {
        let _ = std::fs::remove_file(entry.path());
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn restore_backup(
    path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let backup = PathBuf::from(path);
    if !backup.is_file() {
        return Err("Backup file not found".into());
    }
    let check = AppState::connect(&backup).await?;
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&check)
        .await?;
    check.close().await;
    if integrity != "ok" {
        return Err("Backup integrity check failed".into());
    }
    let pool = state.pool.read().await.clone();
    pool.close().await;
    tokio::fs::copy(backup, &state.paths.db_path).await?;
    app.restart();
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<Vec<Setting>> {
    Ok(
        sqlx::query_as::<_, Setting>("SELECT key, value FROM settings ORDER BY key")
            .fetch_all(&state.db().await)
            .await?,
    )
}

#[tauri::command]
pub async fn set_setting(key: String, value: String, state: State<'_, AppState>) -> AppResult<()> {
    const ALLOWED: &[&str] = &["language", "theme"];
    if !ALLOWED.contains(&key.as_str()) {
        return Err("Unknown setting".into());
    }
    sqlx::query("INSERT INTO settings(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
        .bind(key).bind(value).bind(Utc::now().to_rfc3339()).execute(&state.db().await).await?;
    Ok(())
}

async fn load_moodboard_document(db: &SqlitePool, id: &str) -> AppResult<MoodboardDocument> {
    let board = sqlx::query_as::<_, MoodboardRow>(
        "SELECT id, collection_id, name, viewport_x, viewport_y, viewport_zoom, background_color, revision FROM moodboards WHERE id=?",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::Message("Moodboard was not found".into()))?;
    let node_rows = sqlx::query_as::<_, MoodboardNodeRow>(
        "SELECT id, node_type, asset_id, position_x, position_y, width, height, z_index, config_json FROM moodboard_nodes WHERE moodboard_id=? ORDER BY z_index ASC, id ASC",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let mut nodes = Vec::with_capacity(node_rows.len());
    for row in node_rows {
        let data = serde_json::from_str(&row.config_json)?;
        nodes.push(MoodboardNode {
            id: row.id,
            node_type: row.node_type,
            position: crate::models::MoodboardPosition {
                x: row.position_x,
                y: row.position_y,
            },
            size: crate::models::MoodboardSize {
                width: row.width,
                height: row.height,
            },
            z_index: row.z_index,
            data: restore_node_data(data, row.asset_id),
        });
    }
    let edge_rows = sqlx::query_as::<_, MoodboardEdgeRow>(
        "SELECT id, source_node_id, target_node_id, color, config_json FROM moodboard_edges WHERE moodboard_id=? ORDER BY id ASC",
    )
    .bind(id)
    .fetch_all(db)
    .await?;
    let mut edges = Vec::with_capacity(edge_rows.len());
    for row in edge_rows {
        edges.push(MoodboardEdge {
            id: row.id,
            source_node_id: row.source_node_id,
            target_node_id: row.target_node_id,
            color: row.color,
            config: serde_json::from_str(&row.config_json)?,
        });
    }
    Ok(MoodboardDocument {
        id: board.id,
        collection_id: board.collection_id,
        name: board.name,
        viewport: crate::models::MoodboardViewport {
            x: board.viewport_x,
            y: board.viewport_y,
            zoom: board.viewport_zoom,
        },
        background_color: board.background_color,
        nodes,
        edges,
        revision: board.revision,
    })
}

#[tauri::command]
pub async fn list_moodboards(
    collection_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<MoodboardSummary>> {
    let db = state.db().await;
    let rows = sqlx::query_as::<_, (String, String, String, i64, String)>(
        "SELECT m.id, m.collection_id, m.name, COUNT(n.id), m.updated_at
         FROM moodboards m LEFT JOIN moodboard_nodes n ON n.moodboard_id=m.id
         WHERE m.collection_id=? GROUP BY m.id ORDER BY m.updated_at DESC, m.id ASC",
    )
    .bind(collection_id)
    .fetch_all(&db)
    .await?;
    let mut boards = Vec::with_capacity(rows.len());
    for (id, collection_id, name, node_count, updated_at) in rows {
        let preview_rows = sqlx::query_as::<_, AssetRow>(&format!(
            "{ASSET_ROW_SELECT} JOIN moodboard_nodes mn ON mn.asset_id=a.id
             WHERE mn.moodboard_id=? AND a.status='ready'
             GROUP BY a.id ORDER BY MAX(mn.z_index) DESC, a.id ASC LIMIT 3"
        ))
        .bind(&id)
        .fetch_all(&db)
        .await?;
        boards.push(MoodboardSummary {
            id,
            collection_id,
            name,
            node_count,
            preview_assets: hydrate_assets(&db, preview_rows).await?,
            updated_at,
        });
    }
    Ok(boards)
}

#[tauri::command]
pub async fn create_moodboard(
    collection_id: String,
    name: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<MoodboardDocument> {
    let db = state.db().await;
    let collection_exists =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM collections WHERE id=?")
            .bind(&collection_id)
            .fetch_one(&db)
            .await?;
    if collection_exists == 0 {
        return Err("Collection was not found".into());
    }
    let name = match name {
        Some(name) => validate_moodboard_name(&name)?.to_owned(),
        None => {
            let mut sequence = 1;
            loop {
                let candidate = format!("未命名情绪板 {sequence}");
                let exists = sqlx::query_scalar::<_, i64>(
                    "SELECT COUNT(*) FROM moodboards WHERE collection_id=? AND name=? COLLATE NOCASE",
                )
                .bind(&collection_id)
                .bind(&candidate)
                .fetch_one(&db)
                .await?;
                if exists == 0 {
                    break candidate;
                }
                sequence += 1;
            }
        }
    };
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO moodboards(id, collection_id, name, viewport_x, viewport_y, viewport_zoom, background_color, revision, created_at, updated_at)
         VALUES(?, ?, ?, 0, 0, 1, '#f8f8f6', 0, ?, ?)",
    )
    .bind(&id)
    .bind(&collection_id)
    .bind(name)
    .bind(&now)
    .bind(&now)
    .execute(&db)
    .await?;
    load_moodboard_document(&db, &id).await
}

#[tauri::command]
pub async fn get_moodboard(id: String, state: State<'_, AppState>) -> AppResult<MoodboardDocument> {
    load_moodboard_document(&state.db().await, &id).await
}

#[tauri::command]
pub async fn save_moodboard(
    mut document: MoodboardDocument,
    expected_revision: i64,
    state: State<'_, AppState>,
) -> AppResult<SaveMoodboardResult> {
    validate_moodboard_document(&document)?;
    if expected_revision < 0 {
        return Err("Moodboard revision is invalid".into());
    }
    let db = state.db().await;
    let mut transaction = db.begin().await?;

    // Capture a small independent display record before persisting the asset reference.
    for node in &mut document.nodes {
        let Some(asset_id) = node_asset_id(node).map(str::to_owned) else {
            continue;
        };
        let asset = sqlx::query_as::<_, AssetRow>(&format!("{ASSET_ROW_SELECT} WHERE a.id=?"))
            .bind(&asset_id)
            .fetch_optional(&mut *transaction)
            .await?
            .ok_or_else(|| {
                AppError::Message(format!("Moodboard asset {asset_id} was not found"))
            })?;
        if let Some(data) = node.data.as_object_mut() {
            data.insert(
                "assetSnapshot".into(),
                serde_json::json!({
                    "filename": asset.filename,
                    "mediaKind": asset.media_kind,
                    "thumbnailPath": asset.thumbnail_path,
                }),
            );
        }
    }

    let now = Utc::now().to_rfc3339();
    let updated = sqlx::query(
        "UPDATE moodboards SET name=?, viewport_x=?, viewport_y=?, viewport_zoom=?, background_color=?, revision=revision+1, updated_at=?
         WHERE id=? AND collection_id=? AND revision=?",
    )
    .bind(validate_moodboard_name(&document.name)?)
    .bind(document.viewport.x)
    .bind(document.viewport.y)
    .bind(document.viewport.zoom)
    .bind(&document.background_color)
    .bind(&now)
    .bind(&document.id)
    .bind(&document.collection_id)
    .bind(expected_revision)
    .execute(&mut *transaction)
    .await?;
    if updated.rows_affected() != 1 {
        return Err("Moodboard revision conflict; reload before saving".into());
    }

    sqlx::query("DELETE FROM moodboard_edges WHERE moodboard_id=?")
        .bind(&document.id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM moodboard_nodes WHERE moodboard_id=?")
        .bind(&document.id)
        .execute(&mut *transaction)
        .await?;
    for node in &document.nodes {
        let config = serde_json::to_string(&node.data)?;
        sqlx::query(
            "INSERT INTO moodboard_nodes(moodboard_id, id, node_type, asset_id, position_x, position_y, width, height, z_index, config_json)
             VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&document.id)
        .bind(&node.id)
        .bind(&node.node_type)
        .bind(node_asset_id(node))
        .bind(node.position.x)
        .bind(node.position.y)
        .bind(node.size.width)
        .bind(node.size.height)
        .bind(node.z_index)
        .bind(config)
        .execute(&mut *transaction)
        .await?;
    }
    for edge in &document.edges {
        sqlx::query(
            "INSERT INTO moodboard_edges(moodboard_id, id, source_node_id, target_node_id, color, config_json) VALUES(?, ?, ?, ?, ?, ?)",
        )
        .bind(&document.id)
        .bind(&edge.id)
        .bind(&edge.source_node_id)
        .bind(&edge.target_node_id)
        .bind(&edge.color)
        .bind(serde_json::to_string(&edge.config)?)
        .execute(&mut *transaction)
        .await?;
    }
    transaction.commit().await?;
    Ok(SaveMoodboardResult {
        revision: expected_revision + 1,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn rename_moodboard(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let name = validate_moodboard_name(&name)?;
    let result =
        sqlx::query("UPDATE moodboards SET name=?, revision=revision+1, updated_at=? WHERE id=?")
            .bind(name)
            .bind(Utc::now().to_rfc3339())
            .bind(id)
            .execute(&state.db().await)
            .await?;
    if result.rows_affected() != 1 {
        return Err("Moodboard was not found".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_moodboard(id: String, state: State<'_, AppState>) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM moodboards WHERE id=?")
        .bind(id)
        .execute(&state.db().await)
        .await?;
    if result.rows_affected() != 1 {
        return Err("Moodboard was not found".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn write_moodboard_export(path: String, bytes: Vec<u8>) -> AppResult<()> {
    if path.trim().is_empty() || bytes.len() > MAX_MOODBOARD_EXPORT_BYTES {
        return Err("Moodboard export path or PNG data is invalid".into());
    }
    const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Err("Moodboard export must be PNG data".into());
    }
    tokio::fs::write(path, bytes).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{normalized, validate_moodboard_document, Tag, BOOTSTRAP_TAGS_SQL};
    use crate::models::{
        MoodboardDocument, MoodboardEdge, MoodboardNode, MoodboardPosition, MoodboardSize,
        MoodboardViewport,
    };
    use serde_json::json;
    use sqlx::SqlitePool;
    use std::path::Path;

    #[test]
    fn normalizes_windows_paths_for_comparison() {
        assert_eq!(
            normalized(Path::new("C:/Media/Photos/")),
            "c:\\media\\photos"
        );
    }

    #[tokio::test]
    async fn bootstrap_tag_counts_only_include_ready_assets() {
        let db = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query(
            "CREATE TABLE tags(id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL)",
        )
        .execute(&db)
        .await
        .unwrap();
        sqlx::query("CREATE TABLE assets(id TEXT PRIMARY KEY, status TEXT NOT NULL)")
            .execute(&db)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE asset_tags(asset_id TEXT NOT NULL, tag_id TEXT NOT NULL)")
            .execute(&db)
            .await
            .unwrap();
        sqlx::query("INSERT INTO tags(id, name, color) VALUES('tag', 'Reference', '#ee6859')")
            .execute(&db)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO assets(id, status) VALUES('ready', 'ready'), ('trashed', 'missing')",
        )
        .execute(&db)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO asset_tags(asset_id, tag_id) VALUES('ready', 'tag'), ('trashed', 'tag')",
        )
        .execute(&db)
        .await
        .unwrap();

        let tag = sqlx::query_as::<_, Tag>(BOOTSTRAP_TAGS_SQL)
            .fetch_one(&db)
            .await
            .unwrap();

        assert_eq!(tag.asset_count, 1);
    }

    fn valid_moodboard_document() -> MoodboardDocument {
        MoodboardDocument {
            id: "board".into(),
            collection_id: "collection".into(),
            name: "Reference".into(),
            viewport: MoodboardViewport {
                x: 0.0,
                y: 0.0,
                zoom: 1.0,
            },
            background_color: "#f8f8f6".into(),
            nodes: vec![MoodboardNode {
                id: "asset-node".into(),
                node_type: "asset".into(),
                position: MoodboardPosition { x: 0.0, y: 0.0 },
                size: MoodboardSize {
                    width: 320.0,
                    height: 240.0,
                },
                z_index: 0,
                data: json!({"fit": "cover"}),
            }],
            edges: vec![],
            revision: 0,
        }
    }

    #[test]
    fn moodboard_validation_rejects_invalid_edges_and_unbounded_coordinates() {
        let mut document = valid_moodboard_document();
        document.edges.push(MoodboardEdge {
            id: "edge".into(),
            source_node_id: "asset-node".into(),
            target_node_id: "missing".into(),
            color: "neutral".into(),
            config: json!({}),
        });
        assert!(validate_moodboard_document(&document).is_err());

        document.edges.clear();
        document.nodes[0].position.x = f64::INFINITY;
        assert!(validate_moodboard_document(&document).is_err());
    }

    #[tokio::test]
    async fn moodboard_migration_nulls_deleted_assets_and_rejects_cross_board_edges() {
        let db = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&db)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE collections(id TEXT PRIMARY KEY)")
            .execute(&db)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE assets(id TEXT PRIMARY KEY)")
            .execute(&db)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0007_moodboards.sql"))
            .execute(&db)
            .await
            .unwrap();
        sqlx::query("INSERT INTO collections(id) VALUES('collection')")
            .execute(&db)
            .await
            .unwrap();
        sqlx::query("INSERT INTO assets(id) VALUES('asset')")
            .execute(&db)
            .await
            .unwrap();
        sqlx::query("INSERT INTO moodboards(id, collection_id, name, created_at, updated_at) VALUES('one', 'collection', 'One', 'now', 'now'), ('two', 'collection', 'Two', 'now', 'now')")
            .execute(&db).await.unwrap();
        sqlx::query("INSERT INTO moodboard_nodes(moodboard_id, id, node_type, asset_id, position_x, position_y, width, height, config_json) VALUES('one', 'node-one', 'asset', 'asset', 0, 0, 10, 10, '{}'), ('two', 'node-two', 'asset', NULL, 0, 0, 10, 10, '{}')")
            .execute(&db).await.unwrap();
        let cross_board = sqlx::query("INSERT INTO moodboard_edges(moodboard_id, id, source_node_id, target_node_id, color, config_json) VALUES('one', 'bad', 'node-one', 'node-two', 'neutral', '{}')")
            .execute(&db).await;
        assert!(cross_board.is_err());
        sqlx::query("DELETE FROM assets WHERE id='asset'")
            .execute(&db)
            .await
            .unwrap();
        let asset_id: Option<String> = sqlx::query_scalar(
            "SELECT asset_id FROM moodboard_nodes WHERE moodboard_id='one' AND id='node-one'",
        )
        .fetch_one(&db)
        .await
        .unwrap();
        assert_eq!(asset_id, None);
    }
}
