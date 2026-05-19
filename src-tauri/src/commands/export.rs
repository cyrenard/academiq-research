use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::pdf::export;

fn stub(name: &str) -> Value {
    json!({ "ok": false, "error": "not_implemented_phase_5", "name": name })
}

#[tauri::command]
pub async fn export_pdf(
    app: AppHandle,
    layout_json: Option<String>,
    options: Value,
) -> Result<Value, String> {
    if options.get("pdfBase64").and_then(Value::as_str).is_some() {
        return save_base64_file(
            &app,
            &options,
            "pdfBase64",
            "academiq-document.pdf",
            "PDF Document",
            &["pdf"],
        );
    }
    let result = export::export_from_value(layout_json, options)?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_docx(app: AppHandle, options: Value) -> Result<Value, String> {
    save_base64_file(
        &app,
        &options,
        "base64",
        "academiq-document.docx",
        "Word Document",
        &["docx"],
    )
}

fn save_base64_file(
    app: &AppHandle,
    options: &Value,
    base64_field: &str,
    fallback_name: &str,
    filter_name: &str,
    extensions: &[&str],
) -> Result<Value, String> {
    let default_path = options
        .get("defaultPath")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(fallback_name);
    let Some(target) = app
        .dialog()
        .file()
        .set_file_name(default_path)
        .add_filter(filter_name, extensions)
        .blocking_save_file()
    else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let Some(path) = target.as_path() else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let mut path = PathBuf::from(path);
    if let Some(extension) = extensions.first() {
        if path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case(extension))
            != Some(true)
        {
            path.set_extension(extension);
        }
    }
    let base64 = options
        .get(base64_field)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{} verisi eksik", filter_name))?;
    let bytes = general_purpose::STANDARD
        .decode(base64)
        .map_err(|e| format!("{} verisi okunamadi: {e}", filter_name))?;
    fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(json!({
        "ok": true,
        "path": path.to_string_lossy(),
        "bytes": bytes.len()
    }))
}

#[tauri::command]
pub async fn pdf_export_annotated(_options: Value) -> Result<Value, String> {
    Ok(stub("pdf:exportAnnotated"))
}
