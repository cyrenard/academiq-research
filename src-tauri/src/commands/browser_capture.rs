use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::capture::bridge::CaptureSidecarState;

async fn call(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    state.call(&app, method, params).await
}

#[tauri::command]
pub async fn browser_capture_get_status(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
) -> Result<Value, String> {
    call(app, state, "getStatus", json!({})).await
}

#[tauri::command]
pub async fn browser_capture_prepare_setup(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
) -> Result<Value, String> {
    call(app, state, "prepareSetup", json!({})).await
}

#[tauri::command]
pub async fn browser_capture_run_action(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    action: String,
) -> Result<Value, String> {
    call(app, state, "runAction", json!({ "action": action })).await
}

#[tauri::command]
pub async fn browser_capture_test_connection(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
) -> Result<Value, String> {
    call(app, state, "testConnection", json!({})).await
}

#[tauri::command]
pub async fn browser_capture_lookup(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    payload: Value,
) -> Result<Value, String> {
    call(app, state, "lookup", json!({ "payload": payload })).await
}

#[tauri::command]
pub async fn browser_capture_open_install_dir(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
) -> Result<Value, String> {
    call(app, state, "openInstallDir", json!({})).await
}

#[tauri::command]
pub async fn browser_capture_open_guide(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
) -> Result<Value, String> {
    call(app, state, "openGuide", json!({})).await
}

#[tauri::command]
pub async fn browser_capture_update_prefs(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    prefs: Value,
) -> Result<Value, String> {
    call(app, state, "updatePrefs", json!({ "prefs": prefs })).await
}

#[tauri::command]
pub async fn browser_capture_create_workspace(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    name: String,
) -> Result<Value, String> {
    call(app, state, "createWorkspace", json!({ "name": name })).await
}

#[tauri::command]
pub async fn browser_capture_renderer_ready(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
) -> Result<Value, String> {
    call(app, state, "rendererReady", json!({})).await
}

#[tauri::command]
pub async fn browser_capture_ack_payload(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    queue_id: String,
) -> Result<Value, String> {
    call(app, state, "ackPayload", json!({ "queueId": queue_id })).await
}
