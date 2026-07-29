use crate::{
    error::{AppError, AppResult},
    media,
    models::{VideoPreviewCacheStatus, VideoPreviewProgress},
    state::{AppState, VideoPreviewJob},
};
use chrono::Utc;
use sqlx::{FromRow, SqlitePool};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{atomic::Ordering, Arc},
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use walkdir::WalkDir;

pub const DEFAULT_CACHE_LIMIT_BYTES: u64 = 5 * 1024 * 1024 * 1024;
const MIN_CACHE_LIMIT_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_CACHE_LIMIT_BYTES: u64 = 100 * 1024 * 1024 * 1024;
const CACHE_LIMIT_KEY: &str = "video_preview_cache_limit_bytes";

#[derive(Debug, FromRow)]
struct PreviewSource {
    path: String,
    quick_hash: String,
    preview_path: Option<String>,
    duration_ms: Option<i64>,
}

#[derive(Debug, FromRow)]
struct PreviewRow {
    id: String,
    preview_path: String,
    preview_byte_size: Option<i64>,
    preview_last_used_at: Option<String>,
}

#[derive(Debug)]
struct CacheEntry {
    path: PathBuf,
    asset_ids: Vec<String>,
    byte_size: u64,
    last_used_at: Option<String>,
}

pub async fn prepare(app: &AppHandle, state: &AppState, id: String) -> AppResult<String> {
    if let Some(path) = existing_preview(&state.db().await, &id).await? {
        return Ok(path);
    }

    let (job, owner) = {
        let mut jobs = state.video_preview_jobs.lock().await;
        if let Some(job) = jobs.get(&id) {
            (job.clone(), false)
        } else {
            let job = Arc::new(VideoPreviewJob::default());
            jobs.insert(id.clone(), job.clone());
            (job, true)
        }
    };

    if owner {
        let result = generate(app, state, &id, job.clone())
            .await
            .map_err(|error| error.to_string());
        *job.result.lock().await = Some(result.clone());
        job.notify.notify_waiters();
        let mut jobs = state.video_preview_jobs.lock().await;
        if jobs
            .get(&id)
            .is_some_and(|current| Arc::ptr_eq(current, &job))
        {
            jobs.remove(&id);
        }
        return result.map_err(AppError::Message);
    }

    loop {
        let notified = job.notify.notified();
        if let Some(result) = job.result.lock().await.clone() {
            return result.map_err(AppError::Message);
        }
        notified.await;
    }
}

async fn existing_preview(db: &SqlitePool, id: &str) -> AppResult<Option<String>> {
    let existing = sqlx::query_scalar::<_, Option<String>>(
        "SELECT preview_path FROM assets WHERE id=? AND media_kind='video'",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or("Video asset not found")?;
    let Some(path) = existing else {
        return Ok(None);
    };
    let Ok(metadata) = tokio::fs::metadata(&path).await else {
        clear_preview_record(db, id).await?;
        return Ok(None);
    };
    if !metadata.is_file() || metadata.len() == 0 {
        clear_preview_record(db, id).await?;
        return Ok(None);
    }
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE assets SET preview_byte_size=?, preview_last_used_at=? WHERE id=?")
        .bind(metadata.len() as i64)
        .bind(now)
        .bind(id)
        .execute(db)
        .await?;
    Ok(Some(path))
}

async fn generate(
    app: &AppHandle,
    state: &AppState,
    id: &str,
    job: Arc<VideoPreviewJob>,
) -> AppResult<String> {
    let db = state.db().await;
    let source = sqlx::query_as::<_, PreviewSource>(
        "SELECT path, quick_hash, preview_path, duration_ms FROM assets
         WHERE id=? AND media_kind='video' AND status='ready'",
    )
    .bind(id)
    .fetch_optional(&db)
    .await?
    .ok_or("Video asset not found")?;
    if !Path::new(&source.path).is_file() {
        return Err("Video source file is unavailable".into());
    }
    if let Some(existing) = source.preview_path {
        if Path::new(&existing).is_file() {
            return existing_preview(&db, id)
                .await?
                .ok_or_else(|| AppError::Message("Video preview is unavailable".into()));
        }
        clear_preview_record(&db, id).await?;
    }
    if job.cancelled.load(Ordering::Relaxed) {
        return Err("Video preview preparation was cancelled".into());
    }

    let hash_prefix = source
        .quick_hash
        .get(..2)
        .ok_or("Video asset hash is invalid")?;
    let directory = state.paths.previews_dir.join(hash_prefix);
    tokio::fs::create_dir_all(&directory).await?;
    let destination = directory.join(format!("{}-{id}.mp4", source.quick_hash));
    let part = directory.join(format!(
        "{}-{id}-{}.part.mp4",
        source.quick_hash,
        Uuid::new_v4()
    ));
    let generated = media::create_video_preview(
        app,
        id,
        Path::new(&source.path),
        &part,
        source.duration_ms,
        job.cancelled.clone(),
    )
    .await;
    if let Err(error) = generated {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(error);
    }
    if job.cancelled.load(Ordering::Relaxed) {
        let _ = tokio::fs::remove_file(&part).await;
        return Err("Video preview preparation was cancelled".into());
    }
    if let Err(error) = media::validate_video_preview(&part).await {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(error);
    }
    if tokio::fs::try_exists(&destination).await? {
        tokio::fs::remove_file(&destination).await?;
    }
    tokio::fs::rename(&part, &destination).await?;
    let size = tokio::fs::metadata(&destination).await?.len();
    let now = Utc::now().to_rfc3339();
    let destination_value = destination.to_string_lossy().to_string();
    sqlx::query(
        "UPDATE assets SET preview_path=?, preview_byte_size=?, preview_last_used_at=?, updated_at=? WHERE id=?",
    )
    .bind(&destination_value)
    .bind(size as i64)
    .bind(&now)
    .bind(&now)
    .bind(id)
    .execute(&db)
    .await?;
    let _ = app.emit(
        "video-preview-progress",
        VideoPreviewProgress {
            asset_id: id.to_owned(),
            phase: "finalizing".into(),
            percent: 100,
        },
    );
    let mut protected = HashSet::new();
    protected.insert(id.to_owned());
    enforce_limit(state, &protected).await?;
    Ok(destination_value)
}

pub async fn cancel(state: &AppState, id: &str) {
    if let Some(job) = state.video_preview_jobs.lock().await.get(id).cloned() {
        job.cancelled.store(true, Ordering::Relaxed);
    }
}

pub async fn cancel_and_wait(state: &AppState, id: &str) {
    let job = state.video_preview_jobs.lock().await.get(id).cloned();
    let Some(job) = job else {
        return;
    };
    job.cancelled.store(true, Ordering::Relaxed);
    loop {
        let notified = job.notify.notified();
        if job.result.lock().await.is_some() {
            return;
        }
        notified.await;
    }
}

pub async fn invalidate(state: &AppState, id: &str) -> AppResult<()> {
    cancel_and_wait(state, id).await;
    state.active_video_previews.write().await.remove(id);
    state.pending_preview_removals.write().await.remove(id);
    let db = state.db().await;
    let path =
        sqlx::query_scalar::<_, Option<String>>("SELECT preview_path FROM assets WHERE id=?")
            .bind(id)
            .fetch_optional(&db)
            .await?
            .flatten();
    clear_preview_record(&db, id).await?;
    if let Some(path) = path {
        remove_if_unreferenced(&db, Path::new(&path)).await?;
    }
    Ok(())
}

pub async fn set_active(state: &AppState, id: &str, active: bool) -> AppResult<()> {
    if active {
        state
            .active_video_previews
            .write()
            .await
            .insert(id.to_owned());
        sqlx::query(
            "UPDATE assets SET preview_last_used_at=? WHERE id=? AND preview_path IS NOT NULL",
        )
        .bind(Utc::now().to_rfc3339())
        .bind(id)
        .execute(&state.db().await)
        .await?;
    } else {
        state.active_video_previews.write().await.remove(id);
        if state.pending_preview_removals.write().await.remove(id) {
            let db = state.db().await;
            let path = sqlx::query_scalar::<_, Option<String>>(
                "SELECT preview_path FROM assets WHERE id=?",
            )
            .bind(id)
            .fetch_optional(&db)
            .await?
            .flatten();
            clear_preview_record(&db, id).await?;
            if let Some(path) = path {
                remove_if_unreferenced(&db, Path::new(&path)).await?;
            }
        }
        enforce_limit(state, &HashSet::new()).await?;
    }
    Ok(())
}

pub async fn cache_status(state: &AppState) -> AppResult<VideoPreviewCacheStatus> {
    let db = state.db().await;
    let entries = load_cache_entries(&db).await?;
    let used_bytes = entries.iter().map(|entry| entry.byte_size).sum();
    Ok(VideoPreviewCacheStatus {
        used_bytes,
        limit_bytes: cache_limit(&db).await?,
        item_count: entries.len(),
        pending_cleanup_bytes: state.pending_preview_cleanup_bytes.load(Ordering::Relaxed),
    })
}

pub async fn set_cache_limit(
    state: &AppState,
    limit_bytes: u64,
) -> AppResult<VideoPreviewCacheStatus> {
    if !(MIN_CACHE_LIMIT_BYTES..=MAX_CACHE_LIMIT_BYTES).contains(&limit_bytes) {
        return Err("Video preview cache limit must be between 1 GB and 100 GB".into());
    }
    sqlx::query(
        "INSERT INTO settings(key, value, updated_at) VALUES(?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    )
    .bind(CACHE_LIMIT_KEY)
    .bind(limit_bytes.to_string())
    .bind(Utc::now().to_rfc3339())
    .execute(&state.db().await)
    .await?;
    enforce_limit(state, &HashSet::new()).await?;
    cache_status(state).await
}

pub async fn clear_cache(state: &AppState) -> AppResult<VideoPreviewCacheStatus> {
    let mut protected = state.active_video_previews.read().await.clone();
    protected.extend(state.video_preview_jobs.lock().await.keys().cloned());
    state
        .pending_preview_removals
        .write()
        .await
        .extend(protected);
    cleanup(state, Some(0), &HashSet::new()).await?;
    cache_status(state).await
}

pub async fn coordinate_cache(state: &AppState) -> AppResult<()> {
    let db = state.db().await;
    let rows = sqlx::query_as::<_, PreviewRow>(
        "SELECT id, preview_path, preview_byte_size, preview_last_used_at
         FROM assets WHERE preview_path IS NOT NULL",
    )
    .fetch_all(&db)
    .await?;
    let mut referenced = HashSet::new();
    for row in rows {
        let path = PathBuf::from(&row.preview_path);
        if path.is_file() {
            referenced.insert(media::path_key(&path));
        } else {
            clear_preview_record(&db, &row.id).await?;
        }
    }
    let root = state.paths.previews_dir.clone();
    tokio::task::spawn_blocking(move || {
        for entry in WalkDir::new(root).into_iter().filter_map(Result::ok) {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let is_part = path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().contains(".part."));
            if is_part || !referenced.contains(&media::path_key(path)) {
                if let Err(error) = std::fs::remove_file(path) {
                    tracing::warn!(file = %path.display(), %error, "stale video preview could not be removed");
                }
            }
        }
    })
    .await
    .map_err(|error| AppError::Message(error.to_string()))?;
    enforce_limit(state, &HashSet::new()).await
}

pub async fn remove_if_unreferenced(db: &SqlitePool, path: &Path) -> AppResult<()> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM assets WHERE preview_path=?")
        .bind(path.to_string_lossy().to_string())
        .fetch_one(db)
        .await?;
    if count == 0 && path.is_file() {
        if let Err(error) = tokio::fs::remove_file(path).await {
            tracing::warn!(file = %path.display(), %error, "unused video preview could not be removed");
        }
    }
    Ok(())
}

async fn clear_preview_record(db: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query(
        "UPDATE assets SET preview_path=NULL, preview_byte_size=NULL, preview_last_used_at=NULL WHERE id=?",
    )
    .bind(id)
    .execute(db)
    .await?;
    Ok(())
}

async fn cache_limit(db: &SqlitePool) -> AppResult<u64> {
    let value = sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key=?")
        .bind(CACHE_LIMIT_KEY)
        .fetch_optional(db)
        .await?;
    Ok(value
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(DEFAULT_CACHE_LIMIT_BYTES))
}

async fn enforce_limit(state: &AppState, extra_protected: &HashSet<String>) -> AppResult<()> {
    let limit = cache_limit(&state.db().await).await?;
    cleanup(state, Some(limit), extra_protected).await
}

async fn cleanup(
    state: &AppState,
    target: Option<u64>,
    extra_protected: &HashSet<String>,
) -> AppResult<()> {
    let db = state.db().await;
    let mut entries = load_cache_entries(&db).await?;
    entries.sort_by(|left, right| left.last_used_at.cmp(&right.last_used_at));
    let mut protected = state.active_video_previews.read().await.clone();
    protected.extend(state.video_preview_jobs.lock().await.keys().cloned());
    protected.extend(extra_protected.iter().cloned());
    let target = target.unwrap_or(cache_limit(&db).await?);
    let mut used: u64 = entries.iter().map(|entry| entry.byte_size).sum();
    for entry in entries {
        if used <= target {
            break;
        }
        if entry.asset_ids.iter().any(|id| protected.contains(id)) {
            continue;
        }
        match tokio::fs::remove_file(&entry.path).await {
            Ok(()) => {
                sqlx::query(
                    "UPDATE assets SET preview_path=NULL, preview_byte_size=NULL, preview_last_used_at=NULL WHERE preview_path=?",
                )
                .bind(entry.path.to_string_lossy().to_string())
                .execute(&db)
                .await?;
                used = used.saturating_sub(entry.byte_size);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                sqlx::query(
                    "UPDATE assets SET preview_path=NULL, preview_byte_size=NULL, preview_last_used_at=NULL WHERE preview_path=?",
                )
                .bind(entry.path.to_string_lossy().to_string())
                .execute(&db)
                .await?;
                used = used.saturating_sub(entry.byte_size);
            }
            Err(error) => {
                tracing::warn!(file = %entry.path.display(), %error, "video preview cache entry could not be removed");
            }
        }
    }
    let pending_ids = state.pending_preview_removals.read().await.clone();
    let pending_bytes: u64 = load_cache_entries(&db)
        .await?
        .into_iter()
        .filter(|entry| entry.asset_ids.iter().any(|id| pending_ids.contains(id)))
        .map(|entry| entry.byte_size)
        .sum();
    state.pending_preview_cleanup_bytes.store(
        pending_bytes.max(used.saturating_sub(target)),
        Ordering::Relaxed,
    );
    Ok(())
}

async fn load_cache_entries(db: &SqlitePool) -> AppResult<Vec<CacheEntry>> {
    let rows = sqlx::query_as::<_, PreviewRow>(
        "SELECT id, preview_path, preview_byte_size, preview_last_used_at
         FROM assets WHERE preview_path IS NOT NULL",
    )
    .fetch_all(db)
    .await?;
    let mut entries: HashMap<String, CacheEntry> = HashMap::new();
    for row in rows {
        let path = PathBuf::from(&row.preview_path);
        let size = match tokio::fs::metadata(&path).await {
            Ok(metadata) if metadata.is_file() => metadata.len(),
            _ => {
                clear_preview_record(db, &row.id).await?;
                continue;
            }
        };
        if row.preview_byte_size != Some(size as i64) {
            sqlx::query("UPDATE assets SET preview_byte_size=? WHERE id=?")
                .bind(size as i64)
                .bind(&row.id)
                .execute(db)
                .await?;
        }
        let key = media::path_key(&path);
        let entry = entries.entry(key).or_insert_with(|| CacheEntry {
            path,
            asset_ids: Vec::new(),
            byte_size: size,
            last_used_at: row.preview_last_used_at.clone(),
        });
        entry.asset_ids.push(row.id);
        entry.byte_size = entry.byte_size.max(size);
        if row.preview_last_used_at > entry.last_used_at {
            entry.last_used_at = row.preview_last_used_at;
        }
    }
    Ok(entries.into_values().collect())
}

#[cfg(test)]
mod tests {
    use super::{cache_limit, DEFAULT_CACHE_LIMIT_BYTES};
    use sqlx::SqlitePool;

    #[tokio::test]
    async fn cache_limit_uses_default_when_setting_is_missing_or_invalid() {
        let db = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query(
            "CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)",
        )
        .execute(&db)
        .await
        .unwrap();
        assert_eq!(cache_limit(&db).await.unwrap(), DEFAULT_CACHE_LIMIT_BYTES);
        sqlx::query(
            "INSERT INTO settings VALUES('video_preview_cache_limit_bytes', 'invalid', '')",
        )
        .execute(&db)
        .await
        .unwrap();
        assert_eq!(cache_limit(&db).await.unwrap(), DEFAULT_CACHE_LIMIT_BYTES);
    }

    #[tokio::test]
    async fn migration_adds_video_preview_cache_metadata_and_default_limit() {
        let db = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!().run(&db).await.unwrap();
        let columns =
            sqlx::query_scalar::<_, String>("SELECT name FROM pragma_table_info('assets')")
                .fetch_all(&db)
                .await
                .unwrap();
        assert!(columns.contains(&"preview_byte_size".to_owned()));
        assert!(columns.contains(&"preview_last_used_at".to_owned()));
        assert_eq!(cache_limit(&db).await.unwrap(), DEFAULT_CACHE_LIMIT_BYTES);
    }
}
