use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::fs;

async fn data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    Ok(dir)
}

async fn write_text(path: std::path::PathBuf, text: String) -> Result<Value, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }
    fs::write(path, text).await.map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn data_load(app: AppHandle) -> Result<Value, String> {
    let path = data_dir(&app).await?.join("academiq-data.json");
    match fs::read_to_string(path).await {
        Ok(data) => Ok(json!({ "ok": true, "data": data })),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            Ok(json!({ "ok": true, "data": "" }))
        }
        Err(err) => Ok(json!({ "ok": false, "error": err.to_string() })),
    }
}

#[tauri::command]
pub async fn data_save(app: AppHandle, json: String) -> Result<Value, String> {
    let path = data_dir(&app).await?.join("academiq-data.json");
    write_text(path, json).await
}

#[tauri::command]
pub async fn data_save_draft(app: AppHandle, json: String) -> Result<Value, String> {
    let path = data_dir(&app).await?.join("editor-draft.json");
    write_text(path, json).await
}
