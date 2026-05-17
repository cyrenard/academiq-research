use crate::db::migrate;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

const UPDATE_CHANNEL_KEY: &str = "update_channel";

fn app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Value, String> {
    let current = app.package_info().version.to_string();
    match app
        .updater()
        .map_err(|e| format!("updater_init_failed: {e}"))?
        .check()
        .await
    {
        Ok(Some(update)) => Ok(json!({
            "ok": true,
            "available": true,
            "current": current,
            "version": update.version,
            "latest": update.version,
            "date": update.date.map(|d| d.to_string()),
            "body": update.body,
            "downloadUrl": update.download_url.to_string(),
            "target": update.target,
            "raw": update.raw_json
        })),
        Ok(None) => Ok(json!({
            "ok": true,
            "available": false,
            "current": current
        })),
        Err(err) => Ok(json!({
            "ok": false,
            "available": false,
            "current": current,
            "error": err.to_string()
        })),
    }
}

#[tauri::command]
pub async fn update_download(app: AppHandle, url: String) -> Result<Value, String> {
    let requested_url = url.trim().to_string();
    let maybe_update = app
        .updater()
        .map_err(|e| format!("updater_init_failed: {e}"))?
        .check()
        .await
        .map_err(|e| format!("update_check_failed: {e}"))?;
    let Some(update) = maybe_update else {
        return Ok(json!({
            "ok": false,
            "available": false,
            "error": "no_update_available"
        }));
    };

    if !requested_url.is_empty() && requested_url != update.download_url.as_str() {
        return Ok(json!({
            "ok": false,
            "available": true,
            "error": "download_url_mismatch",
            "requestedUrl": requested_url,
            "downloadUrl": update.download_url.to_string()
        }));
    }

    let app_for_progress = app.clone();
    let download_url = update.download_url.to_string();
    let version = update.version.clone();
    let result = update
        .download_and_install(
            move |chunk_len, content_len| {
                let _ = app_for_progress.emit(
                    "update:progress",
                    json!({
                        "chunkLength": chunk_len,
                        "contentLength": content_len,
                        "downloadUrl": download_url
                    }),
                );
            },
            {
                let app = app.clone();
                move || {
                    let _ = app.emit("update:downloaded", json!({ "version": version }));
                }
            },
        )
        .await;

    match result {
        Ok(()) => Ok(json!({ "ok": true, "installed": true })),
        Err(err) => Ok(json!({ "ok": false, "error": err.to_string() })),
    }
}

#[tauri::command]
pub async fn update_set_url(app: AppHandle, url: String) -> Result<Value, String> {
    let channel = url.trim();
    if !channel.is_empty()
        && !(channel == "stable"
            || channel == "beta"
            || channel == "nightly"
            || channel.starts_with("https://updates.academiq.research/"))
    {
        return Ok(json!({
            "ok": false,
            "error": "unsupported_update_channel",
            "message": "Tauri 2 updater endpoints are static at runtime; store stable/beta/nightly channel metadata instead."
        }));
    }
    let app_data_dir = app_data_dir(&app)?;
    migrate::kv_set(&app_data_dir, UPDATE_CHANNEL_KEY, channel)
        .map_err(|e| format!("update_channel_write_failed: {e}"))?;
    Ok(json!({
        "ok": true,
        "updateChannel": channel,
        "runtimeEndpointMutable": false,
        "endpointStrategy": "static endpoint with channel metadata in kv"
    }))
}

#[tauri::command]
pub async fn update_restart(app: AppHandle) -> Result<Value, String> {
    app.restart()
}
