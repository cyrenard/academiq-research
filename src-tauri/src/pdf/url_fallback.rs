use reqwest::header::{ACCEPT, CONTENT_LENGTH, CONTENT_TYPE, USER_AGENT};
use reqwest::{Client, Url};
use serde_json::Value;
use std::collections::VecDeque;
use std::sync::OnceLock;
use std::time::Duration;

const USER_AGENT_VALUE: &str = "AcademiQ-Research/1.24.0";
const ACCEPT_VALUE: &str = "application/pdf,text/html;q=0.9,*/*;q=0.5";
const DEFAULT_MAX_BYTES: u64 = 50 * 1024 * 1024;
const MAX_MAX_BYTES: u64 = 150 * 1024 * 1024;

static CLIENT: OnceLock<Client> = OnceLock::new();

#[derive(Debug, Clone)]
pub struct DownloadOptions {
    pub timeout: Duration,
    pub max_bytes: u64,
    pub allow_localhost_for_tests: bool,
}

#[derive(Debug, Clone)]
pub struct DownloadOutcome {
    pub bytes: Vec<u8>,
    pub final_url: String,
    pub attempted_url: String,
    pub content_type: String,
    pub status: u16,
}

#[derive(Debug, Clone)]
pub struct DownloadFailure {
    pub error: String,
    pub attempted_url: String,
    pub content_type: String,
    pub status: Option<u16>,
}

pub fn sanitize_options(opts: &Value) -> DownloadOptions {
    let timeout_ms = opts
        .get("timeoutMs")
        .or_else(|| opts.get("timeout"))
        .and_then(Value::as_u64)
        .unwrap_or(60_000)
        .clamp(2_500, 120_000);
    let max_bytes = opts
        .get("maxBytes")
        .and_then(Value::as_u64)
        .unwrap_or(DEFAULT_MAX_BYTES)
        .clamp(1, MAX_MAX_BYTES);
    DownloadOptions {
        timeout: Duration::from_millis(timeout_ms),
        max_bytes,
        allow_localhost_for_tests: false,
    }
}

pub fn is_safe_http_url(url: &str) -> bool {
    let Ok(parsed) = Url::parse(url) else {
        return false;
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return false;
    }
    let Some(host) = parsed.host_str().map(|value| value.to_ascii_lowercase()) else {
        return false;
    };
    !(host == "localhost" || host == "127.0.0.1" || host == "::1")
}

pub async fn fetch_pdf_with_fallback(
    url: &str,
    opts: &DownloadOptions,
) -> Result<DownloadOutcome, DownloadFailure> {
    fetch_pdf_inner(url, opts).await
}

async fn fetch_pdf_inner(
    url: &str,
    opts: &DownloadOptions,
) -> Result<DownloadOutcome, DownloadFailure> {
    let mut queue = VecDeque::from([(url.to_string(), 0usize)]);
    let mut last_failure: Option<DownloadFailure> = None;
    while let Some((candidate, depth)) = queue.pop_front() {
        if depth > 2 {
            continue;
        }
        match fetch_single(&candidate, opts).await {
            Ok(SingleFetch::Pdf(outcome)) => return Ok(outcome),
            Ok(SingleFetch::Html { html, final_url, status, content_type }) => {
                if depth < 2 {
                    for next in extract_pdf_candidates_from_html(&html, &final_url) {
                        if opts.allow_localhost_for_tests || is_safe_http_url(&next) {
                            queue.push_back((next, depth + 1));
                        }
                    }
                }
                last_failure = Some(DownloadFailure {
                    error: "not_pdf".to_string(),
                    attempted_url: final_url,
                    content_type,
                    status: Some(status),
                });
            }
            Err(failure) => {
                last_failure = Some(failure);
            }
        }
    }
    Err(last_failure.unwrap_or_else(|| DownloadFailure {
        error: "not_pdf".to_string(),
        attempted_url: url.to_string(),
        content_type: String::new(),
        status: None,
    }))
}

enum SingleFetch {
    Pdf(DownloadOutcome),
    Html {
        html: String,
        final_url: String,
        status: u16,
        content_type: String,
    },
}

async fn fetch_single(url: &str, opts: &DownloadOptions) -> Result<SingleFetch, DownloadFailure> {
    if !opts.allow_localhost_for_tests && !is_safe_http_url(url) {
        return Err(DownloadFailure {
            error: "unsafe_url".to_string(),
            attempted_url: url.to_string(),
            content_type: String::new(),
            status: None,
        });
    }
    let response = client()?
        .get(url)
        .timeout(opts.timeout)
        .header(USER_AGENT, USER_AGENT_VALUE)
        .header(ACCEPT, ACCEPT_VALUE)
        .send()
        .await
        .map_err(|e| DownloadFailure {
            error: e.to_string(),
            attempted_url: url.to_string(),
            content_type: String::new(),
            status: None,
        })?;
    let status = response.status();
    let final_url = response.url().to_string();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !status.is_success() {
        return Err(DownloadFailure {
            error: format!("HTTP {}", status.as_u16()),
            attempted_url: final_url,
            content_type,
            status: Some(status.as_u16()),
        });
    }
    if let Some(len) = response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
    {
        if len > opts.max_bytes {
            return Err(DownloadFailure {
                error: format!("max_bytes_exceeded:{len}>{}", opts.max_bytes),
                attempted_url: final_url,
                content_type,
                status: Some(status.as_u16()),
            });
        }
    }
    let bytes = read_limited(response, opts.max_bytes).await.map_err(|error| DownloadFailure {
        error,
        attempted_url: final_url.clone(),
        content_type: content_type.clone(),
        status: Some(status.as_u16()),
    })?;
    if looks_like_pdf(&content_type, &bytes) {
        return Ok(SingleFetch::Pdf(DownloadOutcome {
            bytes,
            final_url,
            attempted_url: url.to_string(),
            content_type,
            status: status.as_u16(),
        }));
    }
    if content_type.to_ascii_lowercase().contains("text/html") || looks_like_html(&bytes) {
        let html = String::from_utf8_lossy(&bytes);
        return Ok(SingleFetch::Html {
            html: html.to_string(),
            final_url,
            status: status.as_u16(),
            content_type,
        });
    }
    Err(DownloadFailure {
        error: "not_pdf".to_string(),
        attempted_url: final_url,
        content_type,
        status: Some(status.as_u16()),
    })
}

pub fn extract_pdf_candidates_from_html(html: &str, base: &str) -> Vec<String> {
    let mut out = Vec::new();
    for tag in html.split('<') {
        let lower = tag.to_ascii_lowercase();
        if lower.contains("citation_pdf_url")
            || lower.contains("dc.identifier")
            || lower.contains("eprints.document_url")
            || lower.contains("bepress_citation_pdf_url")
            || lower.contains("og:url")
        {
            if let Some(content) = attr_value(tag, "content") {
                if looks_like_pdf_candidate(&content) {
                    push_resolved(&mut out, base, &content);
                }
            }
        }
        if lower.contains("href") && looks_like_pdf_candidate(&lower) {
            if let Some(href) = attr_value(tag, "href") {
                push_resolved(&mut out, base, &href);
            }
        }
        if lower.contains("data-pdf-url") {
            if let Some(value) = attr_value(tag, "data-pdf-url") {
                push_resolved(&mut out, base, &value);
            }
        }
    }
    out
}

fn attr_value(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let idx = lower.find(&format!("{name}="))? + name.len() + 1;
    let rest = tag.get(idx..)?.trim_start();
    let quote = rest.chars().next()?;
    if quote == '"' || quote == '\'' {
        let value = rest.get(1..)?;
        let end = value.find(quote)?;
        Some(value[..end].trim().to_string())
    } else {
        Some(
            rest.split_whitespace()
                .next()
                .unwrap_or("")
                .trim_matches(['"', '\'', '>'])
                .to_string(),
        )
    }
}

fn push_resolved(out: &mut Vec<String>, base: &str, candidate: &str) {
    if candidate.trim().is_empty() {
        return;
    }
    let resolved = Url::parse(base)
        .and_then(|base_url| base_url.join(candidate))
        .map(|url| url.to_string())
        .unwrap_or_else(|_| candidate.to_string());
    if !out.iter().any(|item| item == &resolved) {
        out.push(resolved);
    }
}

async fn read_limited(mut response: reqwest::Response, max_bytes: u64) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if out.len() as u64 + chunk.len() as u64 > max_bytes {
            return Err(format!(
                "max_bytes_exceeded:{}>{max_bytes}",
                out.len() + chunk.len()
            ));
        }
        out.extend_from_slice(&chunk);
    }
    Ok(out)
}

fn looks_like_pdf(content_type: &str, bytes: &[u8]) -> bool {
    content_type.to_ascii_lowercase().contains("application/pdf") || bytes.starts_with(b"%PDF")
}

fn looks_like_html(bytes: &[u8]) -> bool {
    let prefix = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]).to_ascii_lowercase();
    prefix.contains("<html") || prefix.contains("<!doctype html") || prefix.contains("<meta") || prefix.contains("<a ")
}

fn looks_like_pdf_candidate(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains(".pdf")
        || lower.contains("/pdf/")
        || lower.contains("pdfdirect")
        || lower.contains("epdf")
        || lower.contains("download")
        || lower.contains("fulltext")
}

fn client() -> Result<&'static Client, DownloadFailure> {
    if let Some(client) = CLIENT.get() {
        return Ok(client);
    }
    let built = Client::builder()
        .redirect(reqwest::redirect::Policy::limited(20))
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(16)
        .user_agent(USER_AGENT_VALUE)
        .build()
        .map_err(|e| DownloadFailure {
            error: e.to_string(),
            attempted_url: String::new(),
            content_type: String::new(),
            status: None,
        })?;
    let _ = CLIENT.set(built);
    CLIENT.get().ok_or_else(|| DownloadFailure {
        error: "pdf_download_client_init_failed".to_string(),
        attempted_url: String::new(),
        content_type: String::new(),
        status: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pdf_url_fallback_rejects_localhost_and_extracts_candidates() {
        assert!(!is_safe_http_url("http://127.0.0.1/file.pdf"));
        assert!(!is_safe_http_url("http://localhost/file.pdf"));
        assert!(is_safe_http_url("https://example.com/file.pdf"));
        let html = r#"
          <meta name="citation_pdf_url" content="/paper.pdf">
          <a href="/download/pdf/article">PDF</a>
          <a href="https://cdn.example.org/file.pdf">Mirror</a>
        "#;
        let candidates = extract_pdf_candidates_from_html(html, "https://example.com/article");
        assert_eq!(candidates[0], "https://example.com/paper.pdf");
        assert!(candidates.iter().any(|url| url.ends_with("/download/pdf/article")));
        assert!(candidates.iter().any(|url| url == "https://cdn.example.org/file.pdf"));
    }

    #[test]
    fn pdf_download_node_mock_server_probe() {
        let Ok(base) = std::env::var("AQ_TEST_PDF_DOWNLOAD_BASE") else {
            return;
        };
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let mut opts = sanitize_options(&serde_json::json!({ "timeoutMs": 5000, "maxBytes": 128 }));
        opts.allow_localhost_for_tests = true;

        let direct = rt
            .block_on(fetch_pdf_with_fallback(&format!("{base}/direct.pdf"), &opts))
            .unwrap();
        assert!(direct.bytes.starts_with(b"%PDF"));

        let html = rt
            .block_on(fetch_pdf_with_fallback(&format!("{base}/article"), &opts))
            .unwrap();
        assert!(html.bytes.starts_with(b"%PDF"));
        assert!(html.final_url.ends_with("/oa.pdf"));

        let nested = rt
            .block_on(fetch_pdf_with_fallback(&format!("{base}/article-link"), &opts))
            .unwrap();
        assert!(nested.bytes.starts_with(b"%PDF"));
        assert!(nested.final_url.contains("/nested.pdf"));

        let missing = rt
            .block_on(fetch_pdf_with_fallback(&format!("{base}/missing"), &opts))
            .unwrap_err();
        assert_eq!(missing.status, Some(404));
        assert!(!missing.error.is_empty());

        let large = rt
            .block_on(fetch_pdf_with_fallback(&format!("{base}/large.pdf"), &opts))
            .unwrap_err();
        assert!(large.error.contains("max_bytes_exceeded"));
    }
}
