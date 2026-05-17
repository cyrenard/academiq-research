use serde_json::{json, Value};

fn stub(name: &str) -> Value {
    json!({ "ok": false, "error": "not_implemented_phase_5", "name": name })
}

#[tauri::command]
pub async fn export_pdf(_options: Value) -> Result<Value, String> {
    Ok(stub("export:pdf"))
}

#[tauri::command]
pub async fn export_docx(_options: Value) -> Result<Value, String> {
    Ok(stub("export:docx"))
}

#[tauri::command]
pub async fn pdf_export_annotated(_options: Value) -> Result<Value, String> {
    Ok(stub("pdf:exportAnnotated"))
}
