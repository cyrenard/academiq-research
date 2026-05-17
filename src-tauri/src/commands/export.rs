use serde_json::{json, Value};

use crate::pdf::export;

fn stub(name: &str) -> Value {
    json!({ "ok": false, "error": "not_implemented_phase_5", "name": name })
}

#[tauri::command]
pub async fn export_pdf(layout_json: Option<String>, options: Value) -> Result<Value, String> {
    let result = export::export_from_value(layout_json, options)?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_docx(_options: Value) -> Result<Value, String> {
    Ok(stub("export:docx"))
}

#[tauri::command]
pub async fn pdf_export_annotated(_options: Value) -> Result<Value, String> {
    Ok(stub("pdf:exportAnnotated"))
}
