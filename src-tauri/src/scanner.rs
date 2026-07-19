use crate::{
    error::{AppError, AppResult},
    media,
    models::JobProgress,
    state::{AppState, JobControl},
};
use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use std::{collections::HashSet, path::{Path, PathBuf}, sync::Arc, time::SystemTime};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use uuid::Uuid;
use walkdir::WalkDir;

fn iso_time(time: SystemTime) -> String {
    DateTime::<Utc>::from(time).to_rfc3339()
}

pub async fn start_scan(app: AppHandle, state: &AppState, source_id: String, root: PathBuf) -> AppResult<String> {
    let job_id = Uuid::new_v4().to_string();
    let control = Arc::new(Mutex::new(JobControl::default()));
    state.jobs.lock().await.insert(job_id.clone(), control.clone());
    let pool = state.db().await;
    let paths = state.paths.clone();
    let id = job_id.clone();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO jobs(id, kind, status, created_at, updated_at) VALUES(?, 'scan', 'running', ?, ?)")
        .bind(&id).bind(&now).bind(&now).execute(&pool).await?;

    tauri::async_runtime::spawn(async move {
        let result = scan_source(&app, &pool, &paths, &id, &source_id, &root, control).await;
        if let Err(error) = result {
            let _ = sqlx::query("UPDATE jobs SET status='error', message=?, updated_at=? WHERE id=?")
                .bind(error.to_string()).bind(Utc::now().to_rfc3339()).bind(&id).execute(&pool).await;
            let _ = app.emit("job-progress", JobProgress { id, kind: "scan".into(), status: "error".into(), total: 0, completed: 0, message: Some(error.to_string()) });
        }
    });
    Ok(job_id)
}

async fn scan_source(
    app: &AppHandle,
    pool: &SqlitePool,
    paths: &crate::state::AppPaths,
    job_id: &str,
    source_id: &str,
    root: &Path,
    control: Arc<Mutex<JobControl>>,
) -> AppResult<()> {
    if !root.is_dir() {
        sqlx::query("UPDATE source_roots SET status='offline', updated_at=? WHERE id=?")
            .bind(Utc::now().to_rfc3339()).bind(source_id).execute(pool).await?;
        return Err("Source folder is not available".into());
    }
    let root_owned = root.to_path_buf();
    let files = tokio::task::spawn_blocking(move || {
        WalkDir::new(root_owned).follow_links(false).into_iter()
            .filter_entry(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file() && media::media_kind(entry.path()).is_some())
            .map(|entry| entry.into_path())
            .collect::<Vec<_>>()
    }).await.map_err(|e| AppError::Message(e.to_string()))?;

    let total = files.len();
    sqlx::query("UPDATE jobs SET total=?, updated_at=? WHERE id=?")
        .bind(total as i64).bind(Utc::now().to_rfc3339()).bind(job_id).execute(pool).await?;
    let mut seen = HashSet::with_capacity(total);

    let mut completed = 0_usize;
    for chunk in files.chunks(120) {
        let captured_dates = media::captured_dates(chunk).await;
        for file in chunk {
            loop {
                let guard = control.lock().await;
                if guard.cancelled {
                    sqlx::query("UPDATE jobs SET status='cancelled', completed=?, updated_at=? WHERE id=?")
                        .bind(completed as i64).bind(Utc::now().to_rfc3339()).bind(job_id).execute(pool).await?;
                    return Ok(());
                }
                if !guard.paused { break; }
                drop(guard);
                tokio::time::sleep(std::time::Duration::from_millis(180)).await;
            }

            let captured_at = captured_dates.get(&media::path_key(file)).cloned();
            if let Err(error) = index_file(pool, paths, source_id, file, captured_at).await {
                tracing::warn!(file = %file.file_name().unwrap_or_default().to_string_lossy(), error = %error, "failed to index asset");
            }
            seen.insert(file.to_string_lossy().to_string());
            completed += 1;
            if completed % 8 == 0 || completed == total {
                sqlx::query("UPDATE jobs SET completed=?, updated_at=? WHERE id=?")
                    .bind(completed as i64).bind(Utc::now().to_rfc3339()).bind(job_id).execute(pool).await?;
                let _ = app.emit("job-progress", JobProgress {
                    id: job_id.into(), kind: "scan".into(), status: "running".into(), total, completed,
                    message: file.file_name().map(|s| s.to_string_lossy().to_string()),
                });
            }
        }
    }

    let existing = sqlx::query_scalar::<_, String>("SELECT path FROM assets WHERE source_id=? AND status != 'missing'")
        .bind(source_id).fetch_all(pool).await?;
    for path in existing {
        if !seen.contains(&path) {
            let updated_at = Utc::now().to_rfc3339();
            sqlx::query("UPDATE assets SET status='missing', updated_at=? WHERE path=?")
                .bind(&updated_at).bind(&path).execute(pool).await?;
            sqlx::query(
                "UPDATE collections SET cover_asset_id=NULL, updated_at=?
                 WHERE cover_asset_id IN (SELECT id FROM assets WHERE path=?)"
            ).bind(updated_at).bind(path).execute(pool).await?;
        }
    }
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE source_roots SET status='ready', last_scanned_at=?, updated_at=? WHERE id=?")
        .bind(&now).bind(&now).bind(source_id).execute(pool).await?;
    sqlx::query("UPDATE jobs SET status='complete', completed=total, updated_at=? WHERE id=?")
        .bind(&now).bind(job_id).execute(pool).await?;
    let _ = app.emit("job-progress", JobProgress { id: job_id.into(), kind: "scan".into(), status: "complete".into(), total, completed: total, message: None });
    let _ = app.emit("library-changed", source_id);
    Ok(())
}

async fn index_file(pool: &SqlitePool, paths: &crate::state::AppPaths, source_id: &str, file: &Path, captured_at: Option<String>) -> AppResult<()> {
    let metadata = tokio::fs::metadata(file).await?;
    let modified = iso_time(metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH));
    let size = metadata.len();
    let hash = media::quick_hash(file, size, &modified).await?;
    let kind = media::media_kind(file).ok_or("Unsupported media type")?;
    let thumb = media::thumbnail_path(paths, &hash, kind == "video");
    let (width, height, duration) = if kind == "image" {
        match media::create_image_thumbnail(file.to_path_buf(), thumb.clone()).await {
            Ok((w, h)) => (Some(w as i64), Some(h as i64), None),
            Err(_) => (None, None, None),
        }
    } else {
        let (w, h, d) = media::probe_video(file).await;
        let _ = media::create_video_thumbnail(file, &thumb).await;
        (w.map(i64::from), h.map(i64::from), d)
    };
    let id = sqlx::query_scalar::<_, String>("SELECT id FROM assets WHERE path=?")
        .bind(file.to_string_lossy().to_string()).fetch_optional(pool).await?
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let filename = file.file_name().unwrap_or_default().to_string_lossy().to_string();
    let ext = file.extension().unwrap_or_default().to_string_lossy().to_ascii_lowercase();
    let now = Utc::now().to_rfc3339();
    let thumb_value = thumb.exists().then(|| thumb.to_string_lossy().to_string());
    sqlx::query(
        "INSERT INTO assets(id, source_id, path, filename, extension, media_kind, byte_size, modified_at, captured_at, width, height, duration_ms, quick_hash, thumbnail_path, status, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)
         ON CONFLICT(path) DO UPDATE SET source_id=excluded.source_id, filename=excluded.filename, extension=excluded.extension,
         media_kind=excluded.media_kind, byte_size=excluded.byte_size, modified_at=excluded.modified_at, captured_at=COALESCE(excluded.captured_at, assets.captured_at), width=excluded.width,
         height=excluded.height, duration_ms=excluded.duration_ms, quick_hash=excluded.quick_hash,
         thumbnail_path=COALESCE(excluded.thumbnail_path, assets.thumbnail_path), status='ready', updated_at=excluded.updated_at"
    ).bind(id).bind(source_id).bind(file.to_string_lossy().to_string()).bind(filename).bind(ext).bind(kind)
     .bind(size as i64).bind(modified).bind(captured_at).bind(width).bind(height).bind(duration).bind(hash).bind(thumb_value)
     .bind(&now).bind(&now).execute(pool).await?;
    Ok(())
}
