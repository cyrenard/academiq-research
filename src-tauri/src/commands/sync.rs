use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tokio::fs;

async fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

async fn read_settings(app: &AppHandle) -> Result<Value, String> {
    let path = settings_path(app).await?;
    match fs::read_to_string(path).await {
        Ok(text) => Ok(serde_json::from_str(&text).unwrap_or_else(|_| json!({}))),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(json!({})),
        Err(err) => Err(err.to_string()),
    }
}

async fn write_settings(app: &AppHandle, value: &Value) -> Result<(), String> {
    let path = settings_path(app).await?;
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(path, text).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_get_settings(app: AppHandle) -> Result<Value, String> {
    let settings = read_settings(&app).await?;
    Ok(json!({
        "ok": true,
        "syncDir": settings.get("syncDir").cloned().unwrap_or(Value::Null)
    }))
}

#[tauri::command]
pub async fn sync_set_sync_dir(app: AppHandle) -> Result<Value, String> {
    let Some(folder) = app.dialog().file().blocking_pick_folder() else {
        return Ok(json!({ "ok": false }));
    };
    let Some(path) = folder.as_path() else {
        return Ok(json!({ "ok": false }));
    };
    let mut settings = read_settings(&app).await?;
    settings["syncDir"] = json!(path.to_string_lossy().to_string());
    write_settings(&app, &settings).await?;
    Ok(json!({ "ok": true, "syncDir": path.to_string_lossy() }))
}

#[tauri::command]
pub async fn sync_clear_sync_dir(app: AppHandle) -> Result<Value, String> {
    let mut settings = read_settings(&app).await?;
    settings["syncDir"] = Value::Null;
    write_settings(&app, &settings).await?;
    Ok(json!({ "ok": true, "syncDir": Value::Null }))
}
