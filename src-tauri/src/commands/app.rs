use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn app_open_external_url(app: AppHandle, url: String) -> Result<Value, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Ok(json!({ "ok": false, "error": "Gecersiz URL" }));
    }
    app.shell().open(url, None).map_err(|e| e.to_string())?;
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
    Ok(json!({ "ok": true }))
}
