use crate::{
    error::{AppError, AppResult},
    state::AppState,
};
use notify::{RecursiveMode, Watcher};
use std::{
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

pub fn attach(app: AppHandle, state: &AppState, source_id: String, path: &Path) -> AppResult<()> {
    if !path.is_dir() {
        return Ok(());
    }
    let emitted_at = Arc::new(Mutex::new(Instant::now() - Duration::from_secs(2)));
    let event_source = source_id.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else {
            return;
        };
        if event.paths.is_empty() {
            return;
        }
        let Ok(mut last) = emitted_at.lock() else {
            return;
        };
        if last.elapsed() < Duration::from_millis(900) {
            return;
        }
        *last = Instant::now();
        let _ = app.emit("source-dirty", &event_source);
    })
    .map_err(|error| AppError::Message(error.to_string()))?;
    watcher
        .watch(path, RecursiveMode::Recursive)
        .map_err(|error| AppError::Message(error.to_string()))?;
    state
        .watchers
        .lock()
        .map_err(|_| AppError::Message("Watcher state is unavailable".into()))?
        .insert(source_id, watcher);
    Ok(())
}

pub fn detach(state: &AppState, source_id: &str) {
    if let Ok(mut watchers) = state.watchers.lock() {
        watchers.remove(source_id);
    }
}
