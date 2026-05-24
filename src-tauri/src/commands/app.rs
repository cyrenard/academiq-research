use serde_json::{json, Value};
use tauri::AppHandle;

#[tauri::command]
pub async fn app_open_external_url(_app: AppHandle, url: String) -> Result<Value, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Ok(json!({ "ok": false, "error": "Gecersiz URL" }));
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn app_get_info(app: AppHandle) -> Result<Value, String> {
    let package = app.package_info();
    Ok(json!({
        "ok": true,
        "name": package.name,
        "version": package.version.to_string(),
        "platform": std::env::consts::OS
    }))
}

#[tauri::command]
pub async fn renderer_probe_error(payload: Value) -> Result<Value, String> {
    eprintln!("[renderer:probeError] {payload}");
    crate::telemetry::record_event("renderer_error", payload);
    Ok(json!({ "ok": true }))
}
