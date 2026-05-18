use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::{fs, task};

use crate::db::migrate;
use crate::pdf::{
    annotations::{self, PdfAnnotation},
    extract, metadata, render,
    url_fallback::{fetch_pdf_with_fallback, sanitize_options},
};

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

async fn pdf_path(
    app: &AppHandle,
    ref_id: &str,
    ws: Option<WorkspaceContext>,
) -> Result<std::path::PathBuf, String> {
    let id = clean_ref_id(ref_id)?;
    Ok(pdf_root(app, ws).await?.join(format!("{id}.pdf")))
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
    let path = pdf_path(&app, &id, ws).await?;
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
    let path = pdf_path(&app, &id, ws).await?;
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
    let path = pdf_path(&app, &id, ws).await?;
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
    let path = pdf_path(&app, &id, ws).await?;
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
    let path = pdf_path(&app, &id, ws).await?;
    if fs::metadata(&path).await.is_err() {
        return Ok(json!({ "ok": false, "error": "PDF bulunamadi" }));
    }
    Ok(json!({ "ok": true, "path": path.to_string_lossy() }))
}

#[tauri::command]
pub async fn pdf_extract_metadata(
    app: AppHandle,
    ref_id: String,
    ws: Option<WorkspaceContext>,
) -> Result<Value, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = pdf_path(&app, &ref_id, ws).await?;
    task::spawn_blocking(move || {
        let meta = metadata::extract_metadata(&path)?;
        let meta_json = json!(meta);
        migrate::upsert_pdf_library_item(
            &app_dir,
            &ref_id,
            meta_json.get("title").and_then(Value::as_str).unwrap_or(""),
            meta_json
                .get("author")
                .and_then(Value::as_str)
                .unwrap_or(""),
            &path.to_string_lossy(),
            &meta_json,
        )?;
        Ok(json!({ "ok": true, "metadata": meta_json }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pdf_apply_annotations(
    app: AppHandle,
    ref_id: String,
    ws: Option<WorkspaceContext>,
    annotations: Vec<PdfAnnotation>,
) -> Result<Value, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = pdf_path(&app, &ref_id, ws).await?;
    task::spawn_blocking(move || {
        annotations::apply_annotations(&path, &annotations)?;
        let values = annotations
            .iter()
            .map(|item| serde_json::to_value(item).map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        migrate::save_pdf_annotations(&app_dir, &ref_id, &values)?;
        Ok(json!({ "ok": true, "count": annotations.len() }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pdf_read_annotations(
    app: AppHandle,
    ref_id: String,
    ws: Option<WorkspaceContext>,
) -> Result<Value, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = pdf_path(&app, &ref_id, ws).await?;
    task::spawn_blocking(move || {
        let cached = migrate::read_pdf_annotations(&app_dir, &ref_id)?;
        if !cached.is_empty() {
            return Ok(json!({ "ok": true, "annotations": cached, "source": "db" }));
        }
        let parsed = annotations::read_annotations(&path)?;
        let values = parsed
            .iter()
            .map(|item| serde_json::to_value(item).map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        if !values.is_empty() {
            migrate::save_pdf_annotations(&app_dir, &ref_id, &values)?;
        }
        Ok(json!({ "ok": true, "annotations": values, "source": "pdf" }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pdf_render_page(
    app: AppHandle,
    ref_id: String,
    ws: Option<WorkspaceContext>,
    page: u32,
    dpi: u32,
) -> Result<Value, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = pdf_path(&app, &ref_id, ws).await?;
    task::spawn_blocking(move || {
        let bytes = render::render_page_png(&app_dir, &path, page, dpi)?;
        Ok(json!({ "ok": true, "data": bytes, "mime": "image/png" }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pdf_extract_text(
    app: AppHandle,
    ref_id: String,
    ws: Option<WorkspaceContext>,
    page: u32,
) -> Result<Value, String> {
    let path = pdf_path(&app, &ref_id, ws).await?;
    task::spawn_blocking(move || {
        let text = extract::extract_text(&path, page)?;
        Ok(json!({ "ok": true, "text": text }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pdf_get_outline(
    app: AppHandle,
    ref_id: String,
    ws: Option<WorkspaceContext>,
) -> Result<Value, String> {
    let path = pdf_path(&app, &ref_id, ws).await?;
    task::spawn_blocking(move || {
        let outline = metadata::get_outline(&path)?;
        Ok(json!({ "ok": true, "outline": outline }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn library_ingest_pdf(app: AppHandle, file_path: String) -> Result<Value, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    task::spawn_blocking(move || {
        let path = std::path::PathBuf::from(&file_path);
        let meta = metadata::extract_metadata(&path)?;
        let id = format!(
            "pdf:{}",
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(file_path.as_bytes())
        );
        let meta_json = json!({
            "title": meta.title,
            "author": meta.author,
            "pageCount": meta.page_count,
            "outlineCount": meta.outline_count,
            "sourcePath": file_path
        });
        migrate::upsert_pdf_library_item(
            &app_dir,
            &id,
            meta_json.get("title").and_then(Value::as_str).unwrap_or(""),
            meta_json
                .get("author")
                .and_then(Value::as_str)
                .unwrap_or(""),
            &path.to_string_lossy(),
            &meta_json,
        )?;
        Ok(json!({ "ok": true, "item": { "id": id, "metadata": meta_json } }))
    })
    .await
    .map_err(|e| e.to_string())?
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
    let download_options = sanitize_options(&options);
    let outcome = match fetch_pdf_with_fallback(&url, &download_options).await {
        Ok(outcome) => outcome,
        Err(failure) => {
            return Ok(json!({
                "ok": false,
                "error": failure.error,
                "attemptedUrl": failure.attempted_url,
                "contentType": failure.content_type,
                "status": failure.status
            }));
        }
    };
    let ws = options
        .get("ws")
        .and_then(|value| serde_json::from_value::<WorkspaceContext>(value.clone()).ok());
    let size = outcome.bytes.len();
    let save_result = pdf_save(app, ref_id, json!(outcome.bytes), ws).await?;
    if save_result.get("ok").and_then(Value::as_bool) == Some(true) {
        Ok(json!({
            "ok": true,
            "size": size,
            "finalUrl": outcome.final_url,
            "attemptedUrl": outcome.attempted_url,
            "contentType": outcome.content_type,
            "status": outcome.status,
            "verification": Value::Null
        }))
    } else {
        Ok(save_result)
    }
}
