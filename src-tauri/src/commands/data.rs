use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::{fs, task};

use crate::db::migrate;

async fn data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub async fn data_load(app: AppHandle) -> Result<Value, String> {
    let dir = data_dir(&app).await?;
    task::spawn_blocking(move || match migrate::load_state(&dir) {
        Ok(data) => {
            Ok(json!({ "ok": true, "data": data.unwrap_or_default(), "storage": "sqlite" }))
        }
        Err(error) => Ok(json!({ "ok": false, "error": error })),
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn data_save(app: AppHandle, json: String) -> Result<Value, String> {
    let dir = data_dir(&app).await?;
    task::spawn_blocking(move || migrate::save_state(&dir, &json, "autosave"))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn data_save_draft(app: AppHandle, json: String) -> Result<Value, String> {
    let dir = data_dir(&app).await?;
    task::spawn_blocking(move || migrate::save_draft(&dir, &json))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn library_search(app: AppHandle, query: String) -> Result<Value, String> {
    let dir = data_dir(&app).await?;
    task::spawn_blocking(move || {
        let items = migrate::library_search(&dir, &query)?;
        let out = items
            .into_iter()
            .map(|item| {
                json!({
                    "id": item.id,
                    "title": item.title,
                    "authors": item.authors,
                    "year": item.year,
                    "doi": item.doi,
                    "abstract": item.abstract_text,
                    "pdfPath": item.pdf_path,
                    "metadata": serde_json::from_str::<Value>(&item.metadata_json).unwrap_or(Value::Null)
                })
            })
            .collect::<Vec<_>>();
        Ok(json!({ "ok": true, "items": out }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn library_get(app: AppHandle, id: String) -> Result<Value, String> {
    let dir = data_dir(&app).await?;
    task::spawn_blocking(move || {
        let item = migrate::library_get(&dir, &id)?;
        Ok(json!({
            "ok": true,
            "item": item.map(|item| json!({
                "id": item.id,
                "title": item.title,
                "authors": item.authors,
                "year": item.year,
                "doi": item.doi,
                "abstract": item.abstract_text,
                "pdfPath": item.pdf_path,
                "metadata": serde_json::from_str::<Value>(&item.metadata_json).unwrap_or(Value::Null)
            }))
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn db_integrity_check(app: AppHandle) -> Result<Value, String> {
    let dir = data_dir(&app).await?;
    task::spawn_blocking(move || {
        let result = migrate::integrity_check(&dir)?;
        Ok(json!({ "ok": result == "ok", "result": result }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn db_rollback_to_legacy_json(app: AppHandle) -> Result<Value, String> {
    let dir = data_dir(&app).await?;
    task::spawn_blocking(move || migrate::rollback_to_legacy_json(&dir))
        .await
        .map_err(|e| e.to_string())?
}
