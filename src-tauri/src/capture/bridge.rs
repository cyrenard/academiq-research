use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

use crate::telemetry;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child as TokioChild, Command as TokioCommand},
    sync::{mpsc, oneshot, Mutex},
    time::{timeout, Duration},
};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
pub struct CaptureSidecarState {
    inner: Mutex<Option<Arc<CaptureSidecar>>>,
}

pub struct CaptureSidecar {
    writer: mpsc::Sender<String>,
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>,
    child: Arc<Mutex<SidecarChild>>,
}

enum SidecarChild {
    Plugin(Option<CommandChild>),
    Tokio(TokioChild),
}

impl SidecarChild {
    async fn kill(&mut self) {
        match self {
            SidecarChild::Plugin(child) => {
                if let Some(child) = child.take() {
                    let _ = child.kill();
                }
            }
            SidecarChild::Tokio(child) => {
                let _ = child.kill().await;
            }
        }
    }
}

impl CaptureSidecarState {
    pub async fn call(
        &self,
        app: &AppHandle,
        method: &str,
        params: Value,
    ) -> Result<Value, String> {
        // The sidecar is a Node child process. If it crashes or wedges, the
        // first call after the crash sees a closed stdin/stdout pair and
        // returns a transport-shaped error. Treat that as recoverable: drop
        // the stale handle, respawn once, and retry the same request. Real
        // protocol errors from the sidecar itself (e.g. "not_implemented")
        // do not match `is_transport_failure` and are surfaced immediately.
        for attempt in 0..2 {
            let sidecar = self.get_or_spawn(app).await?;
            match sidecar.call(method, params.clone()).await {
                Ok(value) => return Ok(value),
                Err(err) if attempt == 0 && is_transport_failure(&err) => {
                    telemetry::record_event(
                        "sidecar_respawn",
                        json!({
                            "reason": err,
                            "method": method,
                        }),
                    );
                    self.drop_stale().await;
                    continue;
                }
                Err(err) => return Err(err),
            }
        }
        Err("capture_sidecar_unrecoverable".into())
    }

    async fn get_or_spawn(&self, app: &AppHandle) -> Result<Arc<CaptureSidecar>, String> {
        let mut guard = self.inner.lock().await;
        if let Some(sidecar) = guard.as_ref() {
            return Ok(sidecar.clone());
        }
        let sidecar = Arc::new(CaptureSidecar::spawn(app.clone()).await?);
        *guard = Some(sidecar.clone());
        Ok(sidecar)
    }

    /// Drop the cached sidecar handle and kill its child process, if any.
    /// The next call to `get_or_spawn` will start a fresh sidecar.
    async fn drop_stale(&self) {
        let stale = {
            let mut guard = self.inner.lock().await;
            guard.take()
        };
        if let Some(stale) = stale {
            // Best-effort kill: the child may already be dead, in which case
            // tokio returns Err and we ignore it.
            stale.child.lock().await.kill().await;
        }
    }

    pub async fn shutdown(&self) {
        let sidecar = {
            let mut guard = self.inner.lock().await;
            guard.take()
        };
        if let Some(sidecar) = sidecar {
            let _ = sidecar.call("shutdown", json!({})).await;
            sidecar.child.lock().await.kill().await;
        }
    }
}

impl CaptureSidecar {
    pub async fn spawn(app: AppHandle) -> Result<Self, String> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("capture-sidecar");
        let resource_dir = app.path().resource_dir().ok();

        #[cfg(debug_assertions)]
        if let Some(command) = dev_sidecar_command() {
            return Self::spawn_tokio(app, command, app_data_dir).await;
        }

        match Self::spawn_tauri_sidecar(app.clone(), app_data_dir.clone(), resource_dir).await {
            Ok(sidecar) => Ok(sidecar),
            Err(sidecar_error) => {
                #[cfg(debug_assertions)]
                {
                    if let Some(command) = dev_sidecar_command() {
                        return Self::spawn_tokio(app, command, app_data_dir).await;
                    }
                }
                Err(sidecar_error)
            }
        }
    }

    async fn spawn_tauri_sidecar(
        app: AppHandle,
        app_data_dir: PathBuf,
        resource_dir: Option<PathBuf>,
    ) -> Result<Self, String> {
        let mut command = app
            .shell()
            .sidecar("binaries/capture-agent")
            .map_err(|e| format!("capture_sidecar_not_found: bundled sidecar unavailable: {e}"))?
            .env("AQ_CAPTURE_DATA_DIR", &app_data_dir);
        if let Some(resource_dir) = resource_dir {
            command = command.current_dir(resource_dir);
        }
        let (mut rx, child) = command
            .spawn()
            .map_err(|e| format!("capture_sidecar_spawn_failed: {e}"))?;
        let child = Arc::new(Mutex::new(SidecarChild::Plugin(Some(child))));
        let (writer, mut writer_rx) = mpsc::channel::<String>(64);
        let writer_child = child.clone();
        tokio::spawn(async move {
            while let Some(line) = writer_rx.recv().await {
                let mut guard = writer_child.lock().await;
                let SidecarChild::Plugin(Some(child)) = &mut *guard else {
                    break;
                };
                if child.write(line.as_bytes()).is_err() {
                    break;
                }
                if child.write(b"\n").is_err() {
                    break;
                }
            }
        });

        let pending: Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let pending_reader = pending.clone();
        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        handle_sidecar_stdout_line(&app, &pending_reader, &line).await;
                    }
                    CommandEvent::Error(error) => {
                        telemetry::record_event("sidecar_event_error", json!({ "error": error }));
                    }
                    CommandEvent::Terminated(payload) => {
                        telemetry::record_event(
                            "sidecar_terminated",
                            json!({ "code": payload.code, "signal": payload.signal }),
                        );
                        break;
                    }
                    CommandEvent::Stderr(_) => {}
                    _ => {}
                }
            }
        });

        Ok(Self {
            writer,
            pending,
            child,
        })
    }

    async fn spawn_tokio(
        app: AppHandle,
        command: SidecarCommand,
        app_data_dir: PathBuf,
    ) -> Result<Self, String> {
        let mut cmd = if command.is_binary {
            TokioCommand::new(&command.program)
        } else {
            let mut cmd = TokioCommand::new("node");
            cmd.arg(&command.program);
            cmd
        };
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd
            .current_dir(&command.cwd)
            .env("AQ_CAPTURE_DATA_DIR", app_data_dir)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| {
                telemetry::record_event(
                    "sidecar_spawn_failed",
                    json!({ "error": e.to_string(), "is_binary": command.is_binary }),
                );
                format!("capture_sidecar_spawn_failed: {e}")
            })?;

        let stdin = child
            .stdin
            .take()
            .ok_or("capture_sidecar_stdin_unavailable")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("capture_sidecar_stdout_unavailable")?;

        let (writer, mut rx) = mpsc::channel::<String>(64);
        tokio::spawn(async move {
            let mut stdin = stdin;
            while let Some(line) = rx.recv().await {
                if stdin.write_all(line.as_bytes()).await.is_err() {
                    break;
                }
                if stdin.write_all(b"\n").await.is_err() {
                    break;
                }
                let _ = stdin.flush().await;
            }
        });

        let pending: Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let pending_reader = pending.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Ok(message) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if let Some(id) = message.get("id").and_then(Value::as_str) {
                    if let Some(tx) = pending_reader.lock().await.remove(id) {
                        let result = if let Some(error) = message.get("error") {
                            Err(error
                                .as_str()
                                .unwrap_or("capture_sidecar_error")
                                .to_string())
                        } else {
                            Ok(message.get("result").cloned().unwrap_or(Value::Null))
                        };
                        let _ = tx.send(result);
                    }
                    continue;
                }
                if let Some(method) = message.get("method").and_then(Value::as_str) {
                    let params = message.get("params").cloned().unwrap_or_else(|| json!({}));
                    let event_name = match method {
                        "browserCapture:incoming" => "browserCapture:incoming",
                        "browserCapture:workspaceCreated" => "browserCapture:workspaceCreated",
                        "browserCapture:stateChanged" => "browserCapture:stateChanged",
                        _ => "browser_capture:event",
                    };
                    let _ = app.emit(event_name, params.clone());
                    let _ = app.emit(
                        "browser_capture:event",
                        json!({ "method": method, "params": params }),
                    );
                }
            }
        });

        Ok(Self {
            writer,
            pending,
            child: Arc::new(Mutex::new(SidecarChild::Tokio(child))),
        })
    }

    pub async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed).to_string();
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id.clone(), tx);
        let line = json!({ "id": id, "method": method, "params": params }).to_string();
        if let Err(_e) = self.writer.send(line).await {
            self.pending.lock().await.remove(&id);
            return Err("capture_sidecar_write_failed".into());
        }
        match timeout(Duration::from_secs(10), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("capture_sidecar_response_closed".into()),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err("capture_sidecar_timeout".into())
            }
        }
    }
}

async fn handle_sidecar_stdout_line(
    app: &AppHandle,
    pending: &Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>,
    line: &[u8],
) {
    let Ok(line) = std::str::from_utf8(line) else {
        return;
    };
    let Ok(message) = serde_json::from_str::<Value>(line) else {
        return;
    };
    if let Some(id) = message.get("id").and_then(Value::as_str) {
        if let Some(tx) = pending.lock().await.remove(id) {
            let result = if let Some(error) = message.get("error") {
                Err(error
                    .as_str()
                    .unwrap_or("capture_sidecar_error")
                    .to_string())
            } else {
                Ok(message.get("result").cloned().unwrap_or(Value::Null))
            };
            let _ = tx.send(result);
        }
        return;
    }
    if let Some(method) = message.get("method").and_then(Value::as_str) {
        let params = message.get("params").cloned().unwrap_or_else(|| json!({}));
        let event_name = match method {
            "browserCapture:incoming" => "browserCapture:incoming",
            "browserCapture:workspaceCreated" => "browserCapture:workspaceCreated",
            "browserCapture:stateChanged" => "browserCapture:stateChanged",
            _ => "browser_capture:event",
        };
        let _ = app.emit(event_name, params.clone());
        let _ = app.emit(
            "browser_capture:event",
            json!({ "method": method, "params": params }),
        );
    }
}

/// Categorises the transport-shaped failure strings emitted by
/// `CaptureSidecar::call`. Any of these mean the sidecar process or its
/// stdio is no longer reachable; the caller should respawn before retrying.
/// New variants here should match new error strings emitted in `call()`.
fn is_transport_failure(err: &str) -> bool {
    matches!(
        err,
        "capture_sidecar_write_failed"
            | "capture_sidecar_response_closed"
            | "capture_sidecar_timeout"
    )
}

struct SidecarCommand {
    program: PathBuf,
    cwd: PathBuf,
    is_binary: bool,
}

#[cfg(target_os = "windows")]
fn sidecar_binary_name() -> &'static str {
    "capture-agent-x86_64-pc-windows-msvc.exe"
}

#[cfg(target_os = "linux")]
fn sidecar_binary_name() -> &'static str {
    "capture-agent-x86_64-unknown-linux-gnu"
}

#[cfg(target_os = "macos")]
fn sidecar_binary_name() -> &'static str {
    "capture-agent-x86_64-apple-darwin"
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
fn sidecar_binary_name() -> &'static str {
    "capture-agent"
}

#[cfg(debug_assertions)]
fn dev_sidecar_command() -> Option<SidecarCommand> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dir = manifest
        .join("..")
        .join("src-sidecar")
        .join("capture-agent");
    let index = dir.join("index.js");

    if index.exists() {
        return Some(SidecarCommand {
            program: index,
            cwd: dir,
            is_binary: false,
        });
    }

    let binary = manifest.join("binaries").join(sidecar_binary_name());
    if binary.exists() {
        return Some(SidecarCommand {
            program: binary,
            cwd: manifest.clone(),
            is_binary: true,
        });
    }

    None
}

#[cfg(test)]
mod tests {
    use super::sidecar_binary_name;

    #[test]
    fn sidecar_binary_name_matches_current_target() {
        #[cfg(target_os = "windows")]
        assert_eq!(
            sidecar_binary_name(),
            "capture-agent-x86_64-pc-windows-msvc.exe"
        );

        #[cfg(target_os = "linux")]
        assert_eq!(
            sidecar_binary_name(),
            "capture-agent-x86_64-unknown-linux-gnu"
        );

        #[cfg(target_os = "macos")]
        assert_eq!(sidecar_binary_name(), "capture-agent-x86_64-apple-darwin");
    }
}
