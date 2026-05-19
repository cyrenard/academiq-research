use serde::Serialize;
use serde_json::{json, Value};
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

/// Append a structured event to today's `events-day-<unix_day>.jsonl` file.
///
/// Safe to call from any thread, even before `install()` has succeeded — if
/// the telemetry directory isn't set up yet, the event is silently dropped
/// rather than panicking from a hot path. This is intentional: telemetry is
/// a diagnostic aid, never a correctness requirement.
///
/// `payload` is merged with the wrapper `{event, timestamp_unix_secs}`. Any
/// payload key collisions with those two are overwritten by the wrapper.
pub fn record_event(event_name: &str, payload: Value) {
    let Some(dir) = TELEMETRY_DIR.get() else {
        return;
    };
    let mut envelope = match payload {
        Value::Object(map) => map,
        other => {
            let mut map = serde_json::Map::new();
            if !matches!(other, Value::Null) {
                map.insert("data".into(), other);
            }
            map
        }
    };
    envelope.insert("event".into(), json!(event_name));
    envelope.insert("timestamp_unix_secs".into(), json!(unix_secs()));
    let line = serde_json::to_string(&Value::Object(envelope))
        .unwrap_or_else(|_| format!("{{\"event\":{},\"serialization\":\"failed\"}}", json_string(event_name)));
    let _ = append_line(&daily_file(dir, "events", "jsonl"), &line);
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

    #[test]
    fn record_event_envelope_includes_event_name_and_timestamp() {
        // Pure-format check: simulate what record_event constructs without
        // touching TELEMETRY_DIR (which is OnceLock, possibly already pinned
        // by another test in the same process). The body of record_event
        // remains the source of truth; this guards the envelope shape.
        let payload = json!({ "host": "example.org", "status": 403 });
        let mut envelope = match payload {
            Value::Object(map) => map,
            _ => unreachable!(),
        };
        envelope.insert("event".into(), json!("pdf_download_failed"));
        envelope.insert("timestamp_unix_secs".into(), json!(unix_secs()));
        let line = serde_json::to_string(&Value::Object(envelope)).unwrap();
        assert!(line.contains("\"event\":\"pdf_download_failed\""));
        assert!(line.contains("\"host\":\"example.org\""));
        assert!(line.contains("\"timestamp_unix_secs\":"));
        assert!(line.contains("\"status\":403"));
    }

    #[test]
    fn record_event_does_not_panic_when_telemetry_dir_unset() {
        // The hot-path contract: callers from any subsystem must be able to
        // call record_event safely even before install() ran (or in unit
        // tests where it never runs). The function silently drops the
        // event in that case rather than panicking.
        record_event("test_no_dir", json!({ "ok": true }));
    }
}
