use serde_json::{json, Value};

fn stub(name: &str) -> Value {
    json!({ "ok": false, "error": "not_implemented_phase_6", "name": name })
}

#[tauri::command]
pub async fn browser_capture_get_status() -> Result<Value, String> {
    Ok(json!({
        "ok": false,
        "installed": false,
        "setupPromptSeen": true,
        "lifecycleState": "deferred",
        "error": "not_implemented_phase_6"
    }))
}

#[tauri::command]
pub async fn browser_capture_prepare_setup() -> Result<Value, String> {
    Ok(stub("browserCapture:prepareSetup"))
}

#[tauri::command]
pub async fn browser_capture_run_action(action: String) -> Result<Value, String> {
    Ok(json!({ "ok": false, "error": "not_implemented_phase_6", "action": action }))
}

#[tauri::command]
pub async fn browser_capture_test_connection() -> Result<Value, String> {
    Ok(stub("browserCapture:testConnection"))
}

#[tauri::command]
pub async fn browser_capture_lookup(_payload: Value) -> Result<Value, String> {
    Ok(stub("browserCapture:lookup"))
}

#[tauri::command]
pub async fn browser_capture_open_install_dir() -> Result<Value, String> {
    Ok(stub("browserCapture:openInstallDir"))
}

#[tauri::command]
pub async fn browser_capture_open_guide() -> Result<Value, String> {
    Ok(stub("browserCapture:openGuide"))
}

#[tauri::command]
pub async fn browser_capture_update_prefs(_prefs: Value) -> Result<Value, String> {
    Ok(json!({
        "ok": false,
        "installed": false,
        "setupPromptSeen": true,
        "lifecycleState": "deferred",
        "error": "not_implemented_phase_6",
        "name": "browserCapture:updatePrefs"
    }))
}

#[tauri::command]
pub async fn browser_capture_create_workspace(name: String) -> Result<Value, String> {
    Ok(json!({ "ok": false, "error": "not_implemented_phase_6", "name": name }))
}

#[tauri::command]
pub async fn browser_capture_renderer_ready() -> Result<Value, String> {
    Ok(stub("browserCapture:rendererReady"))
}

#[tauri::command]
pub async fn browser_capture_ack_payload(queue_id: String) -> Result<Value, String> {
    Ok(json!({ "ok": false, "error": "not_implemented_phase_6", "queueId": queue_id }))
}
