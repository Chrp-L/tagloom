mod commands;
mod error;
mod media;
mod models;
mod scanner;
mod state;
mod video_preview;
mod watcher;

use commands::*;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    let state = tauri::async_runtime::block_on(AppState::new(&context.config().identifier))
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
                sqlx::query_as::<_, (String, String)>("SELECT id, path FROM source_roots")
                    .fetch_all(&db),
            )
            .unwrap_or_default();
            for (id, path) in sources {
                if let Err(error) = app
                    .asset_protocol_scope()
                    .allow_directory(std::path::Path::new(&path), true)
                {
                    tracing::warn!(error = %error, "existing source could not be authorized");
                }
                if let Err(error) =
                    watcher::attach(handle.clone(), &state, id, std::path::Path::new(&path))
                {
                    tracing::warn!(error = %error, "existing source watcher could not be started");
                }
            }
            if let Err(error) =
                tauri::async_runtime::block_on(video_preview::coordinate_cache(&state))
            {
                tracing::warn!(error = %error, "video preview cache coordination failed");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_bootstrap,
            get_home_snapshot,
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
            set_collection_cover,
            clear_collection_cover,
            list_moodboards,
            create_moodboard,
            get_moodboard,
            save_moodboard,
            rename_moodboard,
            delete_moodboard,
            set_moodboard_contexts,
            write_moodboard_export,
            record_asset_viewed,
            update_asset_note,
            prepare_video_preview,
            cancel_video_preview,
            invalidate_video_preview,
            set_video_preview_active,
            get_video_preview_cache_status,
            set_video_preview_cache_limit,
            clear_video_preview_cache,
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
        .run(context)
        .expect("error while running Tagloom");
}
