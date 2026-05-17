use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const DEFAULT_UPDATE_URL: &str =
    "https://api.github.com/repos/cyrenard/academiq-research/releases/latest";

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Value, String> {
    let current = app.package_info().version.to_string();
    let client = reqwest::Client::builder()
        .user_agent("AcademiQ Research/1.23.0")
        .build()
        .map_err(|e| e.to_string())?;
    match client.get(DEFAULT_UPDATE_URL).send().await {
        Ok(response) => match response.json::<Value>().await {
            Ok(data) => Ok(json!({
                "available": false,
                "current": current,
                "latest": data.get("tag_name").cloned().unwrap_or(Value::Null),
                "data": data
            })),
            Err(err) => {
                Ok(json!({ "available": false, "current": current, "error": err.to_string() }))
            }
        },
        Err(err) => Ok(json!({ "available": false, "current": current, "error": err.to_string() })),
    }
}

#[tauri::command]
pub async fn update_download(url: String) -> Result<Value, String> {
    let url = url.trim().to_string();
    if url.is_empty() {
        return Ok(json!({ "ok": false, "error": "No URL" }));
    }
    if !url.starts_with("https://") {
        return Ok(json!({ "ok": false, "error": "Update downloads require HTTPS", "url": url }));
    }
    let client = reqwest::Client::builder()
        .user_agent("AcademiQ Research/1.23.0")
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("update_download_failed: {e}"))?;
    if !response.status().is_success() {
        return Ok(
            json!({ "ok": false, "error": format!("HTTP {}", response.status()), "url": url }),
        );
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("update_download_read_failed: {e}"))?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path = std::env::temp_dir().join(format!("academiq-update-{ts}.bin"));
    tokio::fs::write(&path, &bytes)
        .await
        .map_err(|e| format!("update_download_write_failed: {e}"))?;
    Ok(json!({
        "ok": true,
        "path": path.to_string_lossy(),
        "size": bytes.len(),
        "url": url
    }))
}

#[tauri::command]
pub async fn update_set_url(url: String) -> Result<Value, String> {
    if !url.is_empty() && !url.starts_with("https://api.github.com/") {
        return Ok(
            json!({ "ok": false, "error": "Guncelleme URL'si https://api.github.com/ ile baslamali" }),
        );
    }
    Ok(json!({ "ok": true, "updateUrl": url }))
}

#[tauri::command]
pub async fn update_restart(app: AppHandle) -> Result<Value, String> {
    app.restart()
}
