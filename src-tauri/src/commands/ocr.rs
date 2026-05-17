use serde_json::{json, Value};

#[tauri::command]
pub async fn ocr_recognize(_payload: Value) -> Result<Value, String> {
    Ok(json!({
        "ok": false,
        "code": "OCR_NOT_IMPLEMENTED_PHASE_4",
        "message": "not_implemented_phase_4"
    }))
}
