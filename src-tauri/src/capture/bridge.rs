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
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, Command},
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
    child: Mutex<Child>,
}

impl CaptureSidecarState {
    pub async fn call(
        &self,
        app: &AppHandle,
        method: &str,
        params: Value,
    ) -> Result<Value, String> {
        let sidecar = self.get_or_spawn(app).await?;
        sidecar.call(method, params).await
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

    pub async fn shutdown(&self) {
        let sidecar = {
            let mut guard = self.inner.lock().await;
            guard.take()
        };
        if let Some(sidecar) = sidecar {
            let _ = sidecar.call("shutdown", json!({})).await;
            let _ = sidecar.child.lock().await.kill().await;
        }
    }
}

impl CaptureSidecar {
    pub async fn spawn(app: AppHandle) -> Result<Self, String> {
        let command = sidecar_command()?;
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("capture-sidecar");

        let mut cmd = if command.is_binary {
            Command::new(&command.program)
        } else {
            let mut cmd = Command::new("node");
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
            .map_err(|e| format!("capture_sidecar_spawn_failed: {e}"))?;

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
            child: Mutex::new(child),
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

struct SidecarCommand {
    program: PathBuf,
    cwd: PathBuf,
    is_binary: bool,
}

fn sidecar_command() -> Result<SidecarCommand, String> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dir = manifest
        .join("..")
        .join("src-sidecar")
        .join("capture-agent");
    let index = dir.join("index.js");

    #[cfg(debug_assertions)]
    if index.exists() {
        return Ok(SidecarCommand {
            program: index,
            cwd: dir,
            is_binary: false,
        });
    }

    let binary = manifest
        .join("binaries")
        .join("capture-agent-x86_64-pc-windows-msvc.exe");
    if binary.exists() {
        return Ok(SidecarCommand {
            program: binary,
            cwd: manifest.clone(),
            is_binary: true,
        });
    }

    #[cfg(not(debug_assertions))]
    if index.exists() {
        return Ok(SidecarCommand {
            program: index,
            cwd: dir,
            is_binary: false,
        });
    }
    Err(format!("capture_sidecar_not_found: {}", dir.display()))
}
