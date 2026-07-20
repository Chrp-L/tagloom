use crate::error::{AppError, AppResult};
use directories::ProjectDirs;
use notify::RecommendedWatcher;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex as StdMutex},
};
use tokio::sync::{Mutex, RwLock};

#[derive(Clone)]
pub struct AppPaths {
    pub data_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub thumbnails_dir: PathBuf,
    pub previews_dir: PathBuf,
    pub backups_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub db_path: PathBuf,
}

#[derive(Default)]
pub struct JobControl {
    pub paused: bool,
    pub cancelled: bool,
}

pub struct AppState {
    pub pool: RwLock<SqlitePool>,
    pub paths: AppPaths,
    pub jobs: Arc<Mutex<HashMap<String, Arc<Mutex<JobControl>>>>>,
    pub watchers: StdMutex<HashMap<String, RecommendedWatcher>>,
    _log_guard: tracing_appender::non_blocking::WorkerGuard,
}

impl AppState {
    pub async fn new(app_identifier: &str) -> AppResult<Self> {
        let application = project_application(app_identifier, cfg!(debug_assertions));
        let project = ProjectDirs::from("app", "tagloom", application)
            .ok_or_else(|| AppError::Message("Unable to resolve Tagloom data folders".into()))?;
        let data_dir = project.data_dir().to_path_buf();
        let cache_dir = project.cache_dir().to_path_buf();
        let paths = AppPaths {
            thumbnails_dir: cache_dir.join("thumbnails").join("v1"),
            previews_dir: cache_dir.join("previews").join("v1"),
            backups_dir: data_dir.join("backups"),
            logs_dir: cache_dir.join("logs"),
            db_path: data_dir.join("library.db"),
            data_dir,
            cache_dir,
        };

        for folder in [
            &paths.data_dir,
            &paths.cache_dir,
            &paths.thumbnails_dir,
            &paths.previews_dir,
            &paths.backups_dir,
            &paths.logs_dir,
        ] {
            tokio::fs::create_dir_all(folder).await?;
        }

        let file_appender = tracing_appender::rolling::daily(&paths.logs_dir, "tagloom.log");
        let (log_writer, log_guard) = tracing_appender::non_blocking(file_appender);
        let _ = tracing_subscriber::fmt()
            .with_writer(log_writer)
            .with_ansi(false)
            .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
            .try_init();

        let pool = Self::connect(&paths.db_path).await?;
        sqlx::migrate!()
            .run(&pool)
            .await
            .map_err(|e| AppError::Message(e.to_string()))?;

        Ok(Self {
            pool: RwLock::new(pool),
            paths,
            jobs: Arc::new(Mutex::new(HashMap::new())),
            watchers: StdMutex::new(HashMap::new()),
            _log_guard: log_guard,
        })
    }

    pub async fn connect(path: &std::path::Path) -> AppResult<SqlitePool> {
        let url = format!(
            "sqlite://{}?mode=rwc",
            path.to_string_lossy().replace('\\', "/")
        );
        let pool = SqlitePoolOptions::new()
            .max_connections(8)
            .connect(&url)
            .await?;
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await?;
        sqlx::query("PRAGMA journal_mode = WAL")
            .execute(&pool)
            .await?;
        sqlx::query("PRAGMA busy_timeout = 5000")
            .execute(&pool)
            .await?;
        Ok(pool)
    }

    pub async fn db(&self) -> SqlitePool {
        self.pool.read().await.clone()
    }
}

fn project_application(app_identifier: &str, debug_build: bool) -> &'static str {
    if debug_build || app_identifier.ends_with(".dev") {
        "TagloomDev"
    } else {
        "Tagloom"
    }
}

#[cfg(test)]
mod tests {
    use super::project_application;

    #[test]
    fn isolates_debug_and_development_config_data() {
        assert_eq!(project_application("app.tagloom.desktop", false), "Tagloom");
        assert_eq!(
            project_application("app.tagloom.desktop", true),
            "TagloomDev"
        );
        assert_eq!(
            project_application("app.tagloom.desktop.dev", false),
            "TagloomDev"
        );
    }
}
