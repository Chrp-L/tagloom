mod commands;
mod error;
mod media;
mod models;
mod scanner;
mod state;
mod watcher;

use commands::*;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = tauri::async_runtime::block_on(AppState::new())
        .expect("Tagloom database could not be initialized");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .setup(|app| {
            use tauri::Manager;
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            let db = tauri::async_runtime::block_on(state.db());
            let sources = tauri::async_runtime::block_on(
                sqlx::query_as::<_, (String, String)>("SELECT id, path FROM source_roots").fetch_all(&db)
            ).unwrap_or_default();
            for (id, path) in sources {
                if let Err(error) = watcher::attach(handle.clone(), &state, id, std::path::Path::new(&path)) {
                    tracing::warn!(error = %error, "existing source watcher could not be started");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_bootstrap,
            list_assets,
            add_source,
            remove_source,
            rescan_source,
            control_job,
            get_recent_jobs,
            report_frontend_error,
            create_tag,
            update_tag,
            delete_tag,
            set_asset_tags,
            create_collection,
            delete_collection,
            set_collection_assets,
            update_asset_note,
            prepare_video_preview,
            move_asset,
            undo_last_file_operation,
            trash_assets,
            reveal_asset,
            open_asset,
            create_backup,
            restore_backup,
            get_settings,
            set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tagloom");
}
