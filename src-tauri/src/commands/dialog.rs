use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn dialog_open_pdf(app: AppHandle) -> Result<Value, String> {
    let Some(files) = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .blocking_pick_files()
    else {
        return Ok(json!({ "ok": false }));
    };

    let mut out = Vec::new();
    for file in files {
        let Some(path) = file.as_path() else {
            continue;
        };
        if path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            != "pdf"
        {
            continue;
        }
        let Ok(meta) = std::fs::metadata(path) else {
            continue;
        };
        if !meta.is_file() || meta.len() > 120 * 1024 * 1024 {
            continue;
        }
        let Ok(bytes) = std::fs::read(path) else {
            continue;
        };
        out.push(json!({
            "name": path.file_name().and_then(|s| s.to_str()).unwrap_or("document.pdf"),
            "path": path.to_string_lossy(),
            "size": bytes.len(),
            "data": bytes,
            "base64": general_purpose::STANDARD.encode(bytes)
        }));
    }

    Ok(json!({ "ok": !out.is_empty(), "files": out }))
}
