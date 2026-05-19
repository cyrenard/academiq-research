use reqwest::header::{ETAG, IF_NONE_MATCH, USER_AGENT};
use reqwest::{Client, StatusCode};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use crate::db::migrate;

const USER_AGENT_VALUE: &str = "AcademiQ-Research/1.23.0";

static CLIENT: OnceLock<Client> = OnceLock::new();
static RATE_STATE: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();

fn timeout(options: &Value) -> Duration {
    let ms = options
        .get("timeoutMs")
        .and_then(Value::as_u64)
        .unwrap_or(30000)
        .clamp(2500, 30000);
    Duration::from_millis(ms)
}

fn client() -> Result<&'static Client, String> {
    if let Some(client) = CLIENT.get() {
        return Ok(client);
    }
    let built = Client::builder()
        .http2_adaptive_window(true)
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(16)
        .user_agent(USER_AGENT_VALUE)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = CLIENT.set(built);
    CLIENT
        .get()
        .ok_or_else(|| "net_client_init_failed".to_string())
}

#[tauri::command]
pub async fn net_fetch_json(app: AppHandle, url: String, options: Value) -> Result<Value, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;
    match cached_get(&dir, &url, timeout(&options)).await {
        Ok(response) => match serde_json::from_str::<Value>(&response.body) {
            Ok(data) => Ok(json!({
                "ok": true,
                "data": data,
                "cached": response.cached,
                "etag": response.etag
            })),
            Err(err) => Ok(json!({ "ok": false, "error": err.to_string() })),
        },
        Err(err) => Ok(json!({ "ok": false, "error": err })),
    }
}

#[tauri::command]
pub async fn net_fetch_text(app: AppHandle, url: String, options: Value) -> Result<Value, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;
    match cached_get(&dir, &url, timeout(&options)).await {
        Ok(response) => Ok(json!({
            "ok": true,
            "text": response.body,
            "finalUrl": response.final_url,
            "cached": response.cached,
            "etag": response.etag
        })),
        Err(err) => Ok(json!({ "ok": false, "error": err })),
    }
}

struct CachedResponse {
    body: String,
    final_url: String,
    etag: Option<String>,
    cached: bool,
}

async fn cached_get(
    app_data_dir: &Path,
    url: &str,
    request_timeout: Duration,
) -> Result<CachedResponse, String> {
    let cached = read_etag_cache(app_data_dir, url)?;
    rate_limited_wait(url).await?;
    let mut request = client()?
        .get(url)
        .timeout(request_timeout)
        .header(USER_AGENT, USER_AGENT_VALUE);
    if let Some(entry) = &cached {
        if let Some(etag) = entry.etag.as_deref() {
            request = request.header(IF_NONE_MATCH, etag);
        }
    }
    let response = request.send().await.map_err(|e| e.to_string())?;
    if response.status() == StatusCode::NOT_MODIFIED {
        if let Some(entry) = cached {
            return Ok(CachedResponse {
                body: entry.body,
                final_url: url.to_string(),
                etag: entry.etag,
                cached: true,
            });
        }
    }
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    let final_url = response.url().to_string();
    let etag = response
        .headers()
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let body = response.text().await.map_err(|e| e.to_string())?;
    if etag.is_some() {
        write_etag_cache(app_data_dir, url, etag.clone(), &body)?;
    }
    Ok(CachedResponse {
        body,
        final_url,
        etag,
        cached: false,
    })
}

async fn rate_limited_wait(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| e.to_string())?;
    let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
    let delay = host_delay(&host);
    if delay.is_zero() {
        return Ok(());
    }
    let sleep_for = {
        let state = RATE_STATE.get_or_init(|| Mutex::new(HashMap::new()));
        let mut guard = state
            .lock()
            .map_err(|_| "net_rate_limiter_poisoned".to_string())?;
        let now = Instant::now();
        let next = guard.get(&host).copied().unwrap_or(now);
        let wait = next.saturating_duration_since(now);
        guard.insert(host, now + wait + delay);
        wait
    };
    if !sleep_for.is_zero() {
        tokio::time::sleep(sleep_for).await;
    }
    Ok(())
}

fn host_delay(host: &str) -> Duration {
    if host.contains("pubmed") || host.contains("ncbi.nlm.nih.gov") {
        Duration::from_millis(334)
    } else if host.contains("crossref.org") || host.contains("doi.org") {
        Duration::from_millis(20)
    } else {
        Duration::ZERO
    }
}

#[derive(Default)]
struct CacheEntry {
    etag: Option<String>,
    body: String,
}

fn read_etag_cache(app_data_dir: &Path, url: &str) -> Result<Option<CacheEntry>, String> {
    let Some(raw) = migrate::kv_get(app_data_dir, &etag_key(url))? else {
        return Ok(None);
    };
    let value = serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null);
    Ok(Some(CacheEntry {
        etag: value
            .get("etag")
            .and_then(Value::as_str)
            .map(str::to_string),
        body: value
            .get("body")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    }))
}

fn write_etag_cache(
    app_data_dir: &Path,
    url: &str,
    etag: Option<String>,
    body: &str,
) -> Result<(), String> {
    let raw = json!({
        "etag": etag,
        "body": body,
        "fetched_at": unix_secs()
    })
    .to_string();
    migrate::kv_set(app_data_dir, &etag_key(url), &raw)
}

fn etag_key(url: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    url.hash(&mut hasher);
    format!("etag_cache_{:016x}", hasher.finish())
}

fn unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("academiq-net-test-{name}-{}", unix_secs()));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn phase4_network_host_rate_limits_are_scoped() {
        assert!(host_delay("api.crossref.org") >= Duration::from_millis(20));
        assert!(host_delay("pubmed.ncbi.nlm.nih.gov") >= Duration::from_millis(334));
        assert_eq!(host_delay("example.test"), Duration::ZERO);
    }

    #[test]
    fn phase4_network_etag_cache_returns_body_on_304() {
        let dir = temp_dir("etag");
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            for idx in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buf = [0u8; 2048];
                let n = stream.read(&mut buf).unwrap();
                let req = String::from_utf8_lossy(&buf[..n]);
                if idx == 0 {
                    let body = "{\"ok\":true}";
                    write!(
                        stream,
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nETag: \"abc\"\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    )
                    .unwrap();
                } else {
                    assert!(req.to_ascii_lowercase().contains("if-none-match: \"abc\""));
                    write!(
                        stream,
                        "HTTP/1.1 304 Not Modified\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    )
                    .unwrap();
                }
            }
        });
        let url = format!("http://{addr}/data");
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let first = rt
            .block_on(cached_get(&dir, &url, Duration::from_secs(5)))
            .unwrap();
        let second = rt
            .block_on(cached_get(&dir, &url, Duration::from_secs(5)))
            .unwrap();
        handle.join().unwrap();
        assert!(!first.cached);
        assert!(second.cached);
        assert_eq!(second.body, "{\"ok\":true}");
    }

    #[test]
    fn phase4_network_timeout_defaults_to_30s() {
        assert_eq!(timeout(&json!({})), Duration::from_millis(30000));
        assert_eq!(
            timeout(&json!({ "timeoutMs": 60_000 })),
            Duration::from_millis(30000)
        );
        assert_eq!(
            timeout(&json!({ "timeoutMs": 1_000 })),
            Duration::from_millis(2500)
        );
    }
}
