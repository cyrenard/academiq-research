use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    panic::{self, PanicHookInfo},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        OnceLock,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

static TELEMETRY_DIR: OnceLock<PathBuf> = OnceLock::new();
static PANIC_HOOK_INSTALLED: AtomicBool = AtomicBool::new(false);

const MAX_LOG_AGE_DAYS: u64 = 30;

#[derive(Serialize)]
struct CompatibilityEvent<'a> {
    event: &'a str,
    app_version: String,
    shell: &'a str,
    os: &'a str,
    arch: &'a str,
    webview2_version: &'a str,
    timestamp_unix_secs: u64,
}

pub fn install(app: &AppHandle) -> std::io::Result<()> {
    let telemetry_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error.to_string()))?
        .join("telemetry");
    fs::create_dir_all(&telemetry_dir)?;
    let _ = TELEMETRY_DIR.set(telemetry_dir.clone());
    rotate_old_logs(&telemetry_dir)?;
    install_panic_hook();
    write_compatibility_event(&telemetry_dir, app)?;
    Ok(())
}

fn install_panic_hook() {
    if PANIC_HOOK_INSTALLED.swap(true, Ordering::SeqCst) {
        return;
    }
    let previous = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        write_panic_event(info);
        previous(info);
    }));
}

fn write_compatibility_event(dir: &Path, app: &AppHandle) -> std::io::Result<()> {
    let event = CompatibilityEvent {
        event: "app_start",
        app_version: app.package_info().version.to_string(),
        shell: "react-tauri",
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        webview2_version: "unknown-local-only",
        timestamp_unix_secs: unix_secs(),
    };
    let payload = serde_json::to_string(&event)
        .unwrap_or_else(|_| "{\"event\":\"app_start\",\"serialization\":\"failed\"}".to_string());
    append_line(&daily_file(dir, "compat", "jsonl"), &payload)
}

fn write_panic_event(info: &PanicHookInfo<'_>) {
    let Some(dir) = TELEMETRY_DIR.get() else {
        return;
    };
    let location = info
        .location()
        .map(|loc| format!("{}:{}", loc.file(), loc.line()))
        .unwrap_or_else(|| "unknown".to_string());
    let payload = if let Some(message) = info.payload().downcast_ref::<&str>() {
        *message
    } else if let Some(message) = info.payload().downcast_ref::<String>() {
        message.as_str()
    } else {
        "panic payload unavailable"
    };
    let line = format!(
        "{{\"event\":\"panic\",\"timestamp_unix_secs\":{},\"location\":{},\"message\":{}}}",
        unix_secs(),
        json_string(&location),
        json_string(payload)
    );
    let _ = append_line(&daily_file(dir, "crash", "jsonl"), &line);
}

fn append_line(path: &Path, line: &str) -> std::io::Result<()> {
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    file.write_all(line.as_bytes())?;
    file.write_all(b"\n")?;
    Ok(())
}

fn daily_file(dir: &Path, prefix: &str, ext: &str) -> PathBuf {
    dir.join(format!("{prefix}-day-{}.{}", unix_day(), ext))
}

fn rotate_old_logs(dir: &Path) -> std::io::Result<()> {
    let cutoff = SystemTime::now()
        .checked_sub(Duration::from_secs(MAX_LOG_AGE_DAYS * 24 * 60 * 60))
        .unwrap_or(UNIX_EPOCH);
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if metadata.modified().unwrap_or(SystemTime::now()) < cutoff {
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(())
}

fn unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn unix_day() -> u64 {
    unix_secs() / 86_400
}

fn json_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"serialization_failed\"".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn daily_log_names_are_stable() {
        let path = daily_file(Path::new("telemetry"), "compat", "jsonl");
        let text = path.to_string_lossy();
        assert!(text.contains("compat-day-"));
        assert!(text.ends_with(".jsonl"));
    }

    #[test]
    fn panic_event_json_escapes_payloads() {
        assert_eq!(
            json_string("a \"quoted\" panic"),
            "\"a \\\"quoted\\\" panic\""
        );
    }
}
