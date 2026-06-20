use base64::{Engine as _, engine::general_purpose};
use serde_json::{Value, json};
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

#[tauri::command]
pub async fn dialog_open_word(app: AppHandle) -> Result<Value, String> {
    let Some(files) = app
        .dialog()
        .file()
        .add_filter(
            "Word documents",
            &["docx", "doc", "rtf", "html", "htm", "txt"],
        )
        .blocking_pick_files()
    else {
        return Ok(json!({ "ok": false }));
    };

    let mut out = Vec::new();
    for file in files {
        let Some(path) = file.as_path() else {
            continue;
        };
        let ext = path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(
            ext.as_str(),
            "docx" | "doc" | "rtf" | "html" | "htm" | "txt"
        ) {
            continue;
        }
        let Ok(meta) = std::fs::metadata(path) else {
            continue;
        };
        if !meta.is_file() || meta.len() > 120 * 1024 * 1024 {
            continue;
        }
        out.push(json!({
            "name": path.file_name().and_then(|s| s.to_str()).unwrap_or("document.docx"),
            "path": path.to_string_lossy(),
            "size": meta.len()
        }));
    }

    Ok(json!({ "ok": !out.is_empty(), "files": out }))
}

#[tauri::command]
pub async fn dialog_open_bibliography(app: AppHandle) -> Result<Value, String> {
    let Some(files) = app
        .dialog()
        .file()
        .add_filter("Bibliography files", &["bib", "ris", "enw", "txt", "apa"])
        .blocking_pick_files()
    else {
        return Ok(json!({ "ok": false }));
    };

    let mut out = Vec::new();
    for file in files {
        let Some(path) = file.as_path() else {
            continue;
        };
        let ext = path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(ext.as_str(), "bib" | "ris" | "enw" | "txt" | "apa") {
            continue;
        }
        let Ok(meta) = std::fs::metadata(path) else {
            continue;
        };
        if !meta.is_file() || meta.len() > 20 * 1024 * 1024 {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        out.push(json!({
            "name": path.file_name().and_then(|s| s.to_str()).unwrap_or("references.bib"),
            "path": path.to_string_lossy(),
            "size": meta.len(),
            "text": text
        }));
    }

    Ok(json!({ "ok": !out.is_empty(), "files": out }))
}
