use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn backup_create(app: AppHandle) -> Result<Value, String> {
    let Some(target) = app
        .dialog()
        .file()
        .add_filter("AcademiQ Backup", &["aqbackup"])
        .blocking_save_file()
    else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let Some(path) = target.as_path() else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let snapshot = json!({
        "version": app.package_info().version.to_string(),
        "source": data_dir.to_string_lossy(),
        "createdAt": chrono_like_now()
    });
    std::fs::write(
        path,
        serde_json::to_vec_pretty(&snapshot).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "filePath": path.to_string_lossy() }))
}

#[tauri::command]
pub async fn backup_restore(app: AppHandle) -> Result<Value, String> {
    let Some(source) = app
        .dialog()
        .file()
        .add_filter("AcademiQ Backup", &["aqbackup"])
        .blocking_pick_file()
    else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let Some(path) = source.as_path() else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    Ok(json!({ "ok": true, "filePath": path.to_string_lossy(), "size": size, "restored": false }))
}

fn chrono_like_now() -> String {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => duration.as_secs().to_string(),
        Err(_) => "0".into(),
    }
}
