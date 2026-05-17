mod commands;

#[tauri::command]
fn not_implemented(name: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "ok": false,
        "notImplemented": true,
        "name": name
    }))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            not_implemented,
            commands::app::app_get_info,
            commands::app::app_open_external_url,
            commands::app::renderer_probe_error,
            commands::backup::backup_create,
            commands::backup::backup_restore,
            commands::browser_capture::browser_capture_ack_payload,
            commands::browser_capture::browser_capture_create_workspace,
            commands::browser_capture::browser_capture_get_status,
            commands::browser_capture::browser_capture_lookup,
            commands::browser_capture::browser_capture_open_guide,
            commands::browser_capture::browser_capture_open_install_dir,
            commands::browser_capture::browser_capture_prepare_setup,
            commands::browser_capture::browser_capture_renderer_ready,
            commands::browser_capture::browser_capture_run_action,
            commands::browser_capture::browser_capture_test_connection,
            commands::browser_capture::browser_capture_update_prefs,
            commands::data::data_load,
            commands::data::data_save,
            commands::data::data_save_draft,
            commands::dialog::dialog_open_pdf,
            commands::doc_history::doc_history_get,
            commands::doc_history::doc_history_restore,
            commands::export::export_docx,
            commands::export::export_pdf,
            commands::export::pdf_export_annotated,
            commands::local_matrix::local_matrix_assistant_compose_cells,
            commands::local_matrix::local_matrix_assistant_get_status,
            commands::local_matrix::local_matrix_assistant_rank_candidates,
            commands::net::net_fetch_json,
            commands::net::net_fetch_text,
            commands::ocr::ocr_recognize,
            commands::pdf::pdf_delete,
            commands::pdf::pdf_delete_workspace_folder,
            commands::pdf::pdf_download,
            commands::pdf::pdf_exists,
            commands::pdf::pdf_load,
            commands::pdf::pdf_save,
            commands::pdf::pdf_show_in_explorer,
            commands::pdf::pdf_sync_all,
            commands::sync::sync_clear_sync_dir,
            commands::sync::sync_get_settings,
            commands::sync::sync_set_sync_dir,
            commands::update::update_check,
            commands::update::update_download,
            commands::update::update_restart,
            commands::update::update_set_url,
            commands::window::window_close,
            commands::window::window_minimize,
            commands::window::window_toggle_maximize,
            commands::word::word_to_html
        ])
        .run(tauri::generate_context!())
        .expect("error while running AcademiQ Research Tauri shell");
}
