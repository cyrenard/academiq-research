use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::fs;

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceContext {
    pub id: Option<String>,
    pub name: Option<String>,
    pub title: Option<String>,
}

fn clean_segment(raw: &str, fallback: &str, max: usize) -> String {
    let cleaned: String = raw
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
        .take(max)
        .collect();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

fn clean_ref_id(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > 320 {
        return Err("Gecersiz PDF referansi".into());
    }
    Ok(clean_segment(trimmed, "pdf", 320))
}

async fn pdf_root(
    app: &AppHandle,
    ws: Option<WorkspaceContext>,
) -> Result<std::path::PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("pdfs");
    if let Some(ctx) = ws {
        if let Some(id) = ctx.id {
            if !id.trim().is_empty() {
                dir = dir.join(clean_segment(&id, "workspace", 128));
            }
        }
    }
    fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    Ok(dir)
}

fn bytes_from_value(value: Value) -> Result<Vec<u8>, String> {
    if let Some(s) = value.as_str() {
        return general_purpose::STANDARD
            .decode(s)
            .or_else(|_| Ok::<Vec<u8>, base64::DecodeError>(s.as_bytes().to_vec()))
            .map_err(|e| e.to_string());
    }
    if let Some(arr) = value.as_array() {
        let mut out = Vec::with_capacity(arr.len());
        for item in arr {
            let n = item.as_u64().ok_or("Gecersiz PDF byte dizisi")?;
            if n > 255 {
                return Err("Gecersiz PDF byte degeri".into());
            }
            out.push(n as u8);
        }
        return Ok(out);
    }
    if let Some(obj) = value.as_object() {
        if let Some(data) = obj.get("data") {
            return bytes_from_value(data.clone());
        }
    }
    Err("PDF verisi okunamadi".into())
}

#[tauri::command]
pub async fn pdf_save(
    app: AppHandle,
    ref_id: String,
    buffer: Value,
    ws: Option<WorkspaceContext>,
) -> Result<Value, String> {
    let id = clean_ref_id(&ref_id)?;
    let bytes = bytes_from_value(buffer)?;
    if bytes.len() > 150 * 1024 * 1024 {
        return Ok(json!({ "ok": false, "error": "PDF dosyasi cok buyuk" }));
    }
    let path = pdf_root(&app, ws).await?.join(format!("{id}.pdf"));
    fs::write(&path, bytes).await.map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "path": path.to_string_lossy() }))
}

#[tauri::command]
pub async fn pdf_load(
    app: AppHandle,
    ref_id: String,
    ws: Option<WorkspaceContext>,
) -> Result<Value, String> {
    let id = clean_ref_id(&ref_id)?;
    let path = pdf_root(&app, ws).await?.join(format!("{id}.pdf"));
    match fs::read(path).await {
        Ok(data) => Ok(json!({ "ok": true, "data": data })),
        Err(err) => Ok(json!({ "ok": false, "error": err.to_string() })),
    }
}

#[tauri::command]
pub async fn pdf_exists(
    app: AppHandle,
    ref_id: String,
    ws: Option<WorkspaceContext>,
) -> Result<bool, String> {
    let id = clean_ref_id(&ref_id)?;
    let path = pdf_root(&app, ws).await?.join(format!("{id}.pdf"));
    Ok(fs::metadata(path)
        .await
        .map(|m| m.is_file())
        .unwrap_or(false))
}

#[tauri::command]
pub async fn pdf_delete(
    app: AppHandle,
    ref_id: String,
    ws: Option<WorkspaceContext>,
) -> Result<Value, String> {
    let id = clean_ref_id(&ref_id)?;
    let path = pdf_root(&app, ws).await?.join(format!("{id}.pdf"));
    match fs::remove_file(path).await {
        Ok(_) => Ok(json!({ "ok": true })),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(json!({ "ok": true })),
        Err(err) => Ok(json!({ "ok": false, "error": err.to_string() })),
    }
}

#[tauri::command]
pub async fn pdf_show_in_explorer(
    app: AppHandle,
    ref_id: String,
    ws: Option<WorkspaceContext>,
) -> Result<Value, String> {
    let id = clean_ref_id(&ref_id)?;
    let path = pdf_root(&app, ws).await?.join(format!("{id}.pdf"));
    if fs::metadata(&path).await.is_err() {
        return Ok(json!({ "ok": false, "error": "PDF bulunamadi" }));
    }
    Ok(json!({ "ok": true, "path": path.to_string_lossy() }))
}

#[tauri::command]
pub async fn pdf_delete_workspace_folder(
    app: AppHandle,
    ws: Option<WorkspaceContext>,
) -> Result<Value, String> {
    let dir = pdf_root(&app, ws).await?;
    match fs::remove_dir_all(dir).await {
        Ok(_) => Ok(json!({ "ok": true })),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(json!({ "ok": true })),
        Err(err) => Ok(json!({ "ok": false, "error": err.to_string() })),
    }
}

#[tauri::command]
pub async fn pdf_sync_all() -> Result<Value, String> {
    Ok(json!({ "ok": true, "synced": 0 }))
}

#[tauri::command]
pub async fn pdf_download(
    app: AppHandle,
    url: String,
    ref_id: String,
    options: Value,
) -> Result<Value, String> {
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Ok(json!({ "ok": false, "error": format!("HTTP {}", response.status()) }));
    }
    let final_url = response.url().to_string();
    let bytes = response.bytes().await.map_err(|e| e.to_string())?.to_vec();
    let ws = options
        .get("ws")
        .and_then(|value| serde_json::from_value::<WorkspaceContext>(value.clone()).ok());
    let size = bytes.len();
    let save_result = pdf_save(app, ref_id, json!(bytes), ws).await?;
    if save_result.get("ok").and_then(Value::as_bool) == Some(true) {
        Ok(json!({ "ok": true, "size": size, "finalUrl": final_url, "verification": Value::Null }))
    } else {
        Ok(save_result)
    }
}
