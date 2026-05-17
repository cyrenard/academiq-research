use serde_json::{json, Value};
use tauri::WebviewWindow;

#[tauri::command]
pub async fn window_minimize(window: WebviewWindow) -> Result<Value, String> {
    window.minimize().map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn window_toggle_maximize(window: WebviewWindow) -> Result<Value, String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())?;
    } else {
        window.maximize().map_err(|e| e.to_string())?;
    }
    let maximized = window.is_maximized().unwrap_or(false);
    Ok(json!({ "ok": true, "maximized": maximized }))
}

#[tauri::command]
pub async fn window_close(window: WebviewWindow) -> Result<Value, String> {
    window.close().map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}
