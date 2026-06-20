use serde_json::{Value, json};
use tauri::{AppHandle, State};

use crate::capture::bridge::CaptureSidecarState;

async fn call(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    state.call(&app, method, params).await
}

fn open_path_best_effort(path: &str) -> Result<(), String> {
    match tauri_plugin_opener::open_path(path, None::<&str>) {
        Ok(()) => Ok(()),
        Err(first_error) => {
            #[cfg(target_os = "linux")]
            {
                std::process::Command::new("xdg-open")
                    .arg(path)
                    .spawn()
                    .map(|_| ())
                    .map_err(|fallback_error| {
                        format!(
                            "open_path failed: {}; xdg-open failed: {}",
                            first_error, fallback_error
                        )
                    })
            }
            #[cfg(not(target_os = "linux"))]
            {
                Err(first_error.to_string())
            }
        }
    }
}

fn open_url_best_effort(url: &str) -> Result<(), String> {
    match tauri_plugin_opener::open_url(url, None::<&str>) {
        Ok(()) => Ok(()),
        Err(first_error) => {
            #[cfg(target_os = "linux")]
            {
                std::process::Command::new("xdg-open")
                    .arg(url)
                    .spawn()
                    .map(|_| ())
                    .map_err(|fallback_error| {
                        format!(
                            "open_url failed: {}; xdg-open failed: {}",
                            first_error, fallback_error
                        )
                    })
            }
            #[cfg(not(target_os = "linux"))]
            {
                Err(first_error.to_string())
            }
        }
    }
}

#[tauri::command]
pub async fn browser_capture_get_status(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
) -> Result<Value, String> {
    call(app, state, "getStatus", json!({})).await
}

#[tauri::command]
pub async fn browser_capture_prepare_setup(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    browser_family: Option<String>,
) -> Result<Value, String> {
    call(
        app,
        state,
        "prepareSetup",
        json!({ "browserFamily": browser_family }),
    )
    .await
}

#[tauri::command]
pub async fn browser_capture_run_action(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    action: String,
    browser_family: Option<String>,
) -> Result<Value, String> {
    let normalized = action.trim().to_ascii_lowercase();
    let mut result = call(
        app.clone(),
        state,
        "runAction",
        json!({ "action": action, "browserFamily": browser_family }),
    )
    .await?;
    let mut open_errors: Vec<String> = Vec::new();
    if matches!(normalized.as_str(), "install" | "repair" | "update") {
        if let Some(path) = result
            .get("installDir")
            .and_then(Value::as_str)
            .filter(|path| !path.is_empty())
        {
            if let Err(error) = open_path_best_effort(path) {
                open_errors.push(error);
            }
        }
        if let Some(url) = result
            .get("managerUrl")
            .and_then(Value::as_str)
            .filter(|url| !url.is_empty())
        {
            if let Err(error) = open_url_best_effort(url) {
                open_errors.push(error);
            }
        }
    }
    if !open_errors.is_empty() {
        if let Some(map) = result.as_object_mut() {
            map.insert("openErrors".to_string(), json!(open_errors));
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn browser_capture_test_connection(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
) -> Result<Value, String> {
    call(app, state, "testConnection", json!({})).await
}

#[tauri::command]
pub async fn browser_capture_lookup(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    payload: Value,
) -> Result<Value, String> {
    call(app, state, "lookup", json!({ "payload": payload })).await
}

#[tauri::command]
pub async fn browser_capture_open_install_dir(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    browser_family: Option<String>,
) -> Result<Value, String> {
    let result = call(
        app,
        state,
        "openInstallDir",
        json!({ "browserFamily": browser_family }),
    )
    .await?;
    if let Some(path) = result
        .get("installDir")
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty())
    {
        open_path_best_effort(path)?;
    }
    Ok(result)
}

#[tauri::command]
pub async fn browser_capture_open_guide(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    browser_family: Option<String>,
) -> Result<Value, String> {
    let result = call(
        app,
        state,
        "openGuide",
        json!({ "browserFamily": browser_family }),
    )
    .await?;
    if let Some(path) = result
        .get("guidePath")
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty())
    {
        open_path_best_effort(path)?;
    }
    Ok(result)
}

#[tauri::command]
pub async fn browser_capture_update_prefs(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    prefs: Value,
) -> Result<Value, String> {
    call(app, state, "updatePrefs", json!({ "prefs": prefs })).await
}

#[tauri::command]
pub async fn browser_capture_create_workspace(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    name: String,
) -> Result<Value, String> {
    call(app, state, "createWorkspace", json!({ "name": name })).await
}

#[tauri::command]
pub async fn browser_capture_renderer_ready(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
) -> Result<Value, String> {
    call(app, state, "rendererReady", json!({})).await
}

#[tauri::command]
pub async fn browser_capture_ack_payload(
    app: AppHandle,
    state: State<'_, CaptureSidecarState>,
    queue_id: String,
) -> Result<Value, String> {
    call(app, state, "ackPayload", json!({ "queueId": queue_id })).await
}
