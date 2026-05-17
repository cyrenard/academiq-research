use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::fs;
use tokio::task;

use crate::db::migrate;

fn clean(raw: &str) -> String {
    raw.chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
        .take(320)
        .collect::<String>()
}

async fn history_dir(app: &AppHandle, doc_id: &str) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("doc-history")
        .join(clean(doc_id));
    fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub async fn doc_history_get(app: AppHandle, doc_id: String, limit: u32) -> Result<Value, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let sqlite_result = task::spawn_blocking({
        let app_dir = app_dir.clone();
        let doc_id = doc_id.clone();
        move || migrate::get_document_history(&app_dir, &doc_id, limit)
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Ok(value) = sqlite_result {
        return Ok(value);
    }

    let dir = history_dir(&app, &doc_id).await?;
    let mut entries = Vec::new();
    let mut read_dir = fs::read_dir(dir).await.map_err(|e| e.to_string())?;
    while let Some(entry) = read_dir.next_entry().await.map_err(|e| e.to_string())? {
        if entries.len() >= limit as usize {
            break;
        }
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
            entries.push(json!({
                "id": path.file_stem().and_then(|s| s.to_str()).unwrap_or(""),
                "path": path.to_string_lossy()
            }));
        }
    }
    Ok(json!({ "ok": true, "snapshots": entries }))
}

#[tauri::command]
pub async fn doc_history_restore(
    app: AppHandle,
    doc_id: String,
    snapshot_id: String,
) -> Result<Value, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let sqlite_result = task::spawn_blocking({
        let app_dir = app_dir.clone();
        let doc_id = doc_id.clone();
        let snapshot_id = snapshot_id.clone();
        move || migrate::restore_document_snapshot(&app_dir, &doc_id, &snapshot_id)
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Ok(value) = sqlite_result {
        return Ok(value);
    }

    let path = history_dir(&app, &doc_id)
        .await?
        .join(format!("{}.json", clean(&snapshot_id)));
    match fs::read_to_string(path).await {
        Ok(data) => Ok(json!({ "ok": true, "data": data })),
        Err(err) => Ok(json!({ "ok": false, "error": err.to_string() })),
    }
}
