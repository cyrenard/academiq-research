use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};

#[tauri::command]
pub async fn word_to_html(file_path: String) -> Result<Value, String> {
    if file_path.trim().is_empty() {
        return Ok(json!({ "ok": false, "error": "No file path" }));
    }
    let bytes = tokio::fs::read(&file_path)
        .await
        .map_err(|e| format!("word_read_failed: {e}"))?;
    if bytes.len() > 120 * 1024 * 1024 {
        return Ok(
            json!({ "ok": false, "error": "DOCX file is too large", "filePath": file_path }),
        );
    }
    Ok(json!({
        "ok": true,
        "base64": general_purpose::STANDARD.encode(bytes),
        "filePath": file_path
    }))
}
