use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
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
    #[serde(default)]
    pub reference_ids: Vec<String>,
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

fn sha1_short(raw: &str, len: usize) -> String {
    let mut hasher = Sha1::new();
    hasher.update(raw.as_bytes());
    let hex = format!("{:x}", hasher.finalize());
    hex.chars().take(len).collect()
}

fn sanitize_pdf_name_part(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut last_space = false;
    for ch in value.chars() {
        let replacement = matches!(
            ch,
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\u{0000}'..='\u{001F}'
        );
        let next = if replacement { ' ' } else { ch };
        if next.is_whitespace() {
            if !last_space {
                out.push(' ');
                last_space = true;
            }
        } else {
            out.push(next);
            last_space = false;
        }
    }
    while out.contains("..") {
        out = out.replace("..", " ");
    }
    out.trim().to_string()
}

fn build_pdf_title_prefix(title: &str) -> String {
    sanitize_pdf_name_part(title)
        .split_whitespace()
        .take(2)
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(64)
        .collect::<String>()
        .trim()
        .to_string()
}

fn build_pdf_file_name(ref_id: &str, title: Option<&str>) -> Result<String, String> {
    let raw = ref_id.trim();
    if raw.is_empty() || raw.len() > 320 {
        return Err("Gecersiz PDF referansi".into());
    }
    let title_prefix = title.map(build_pdf_title_prefix).unwrap_or_default();
    let base = if title_prefix.is_empty() {
        let fallback = sanitize_pdf_name_part(raw);
        if fallback.is_empty() {
            "ref".to_string()
        } else {
            fallback
        }
    } else {
        title_prefix
    };
    let trimmed: String = base.chars().take(80).collect();
    Ok(format!("{}__{}.pdf", trimmed, sha1_short(raw, 10)))
}

fn sanitize_workspace_name_part(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut last_space = false;
    for ch in name.trim().chars() {
        let invalid = matches!(
            ch,
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\u{0000}'..='\u{001F}'
        );
        let next = if invalid { '_' } else { ch };
        if next.is_whitespace() {
            if !last_space {
                out.push(' ');
                last_space = true;
            }
        } else {
            out.push(next);
            last_space = false;
        }
    }
    let trimmed = out.trim_end_matches([' ', '.']).trim();
    if trimmed.is_empty() {
        "workspace".to_string()
    } else {
        trimmed.chars().take(40).collect()
    }
}

fn build_workspace_folder_name(ws: &WorkspaceContext) -> Option<String> {
    let id = ws.id.as_deref()?.trim();
    if id.is_empty() {
        return None;
    }
    let name_part = sanitize_workspace_name_part(ws.name.as_deref().unwrap_or(""));
    Some(format!("AcademiQ-{}-{}", name_part, sha1_short(id, 6)))
}

fn title_hint_from_workspace(ws: Option<&WorkspaceContext>) -> Option<String> {
    ws.and_then(|ctx| ctx.title.as_deref())
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(str::to_string)
}

fn resolve_ref_title_from_state(
    app: &AppHandle,
    ref_id: &str,
    ws: Option<&WorkspaceContext>,
) -> Option<String> {
    let explicit = ws
        .and_then(|ctx| ctx.title.as_deref())
        .map(str::trim)
        .filter(|title| !title.is_empty());
    if let Some(title) = explicit {
        return Some(title.to_string());
    }
    let app_dir = app_data_dir(app).ok()?;
    let raw = migrate::kv_get(&app_dir, "state_blob").ok().flatten()?;
    let state = serde_json::from_str::<Value>(&raw).ok()?;
    let workspaces = state.get("wss").and_then(Value::as_array)?;
    let target_ws = ws
        .and_then(|ctx| ctx.id.as_deref())
        .map(str::trim)
        .filter(|id| !id.is_empty());

    for workspace in workspaces {
        if let Some(expected_ws) = target_ws {
            let workspace_id = workspace
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if workspace_id != expected_ws {
                continue;
            }
        }
        let Some(lib) = workspace.get("lib").and_then(Value::as_array) else {
            continue;
        };
        for reference in lib {
            let current_id = reference
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if current_id != ref_id.trim() {
                continue;
            }
            let title = reference
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if !title.is_empty() {
                return Some(title.to_string());
            }
        }
    }
    None
}

fn clean_ref_id(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > 320 {
        return Err("Gecersiz PDF referansi".into());
    }
    Ok(clean_segment(trimmed, "pdf", 320))
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn legacy_pdf_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("pdfs"))
}

fn workspaces_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("workspaces"))
}

fn workspace_pdf_dir(app: &AppHandle, ws: &WorkspaceContext) -> Result<Option<PathBuf>, String> {
    let Some(folder) = build_workspace_folder_name(ws) else {
        return Ok(None);
    };
    Ok(Some(workspaces_root(app)?.join(folder).join("pdfs")))
}

fn legacy_workspace_pdf_dir(
    app: &AppHandle,
    ws: &WorkspaceContext,
) -> Result<Option<PathBuf>, String> {
    let Some(id) = ws.id.as_deref().map(str::trim).filter(|id| !id.is_empty()) else {
        return Ok(None);
    };
    Ok(Some(legacy_pdf_dir(app)?.join(clean_segment(
        id,
        "workspace",
        128,
    ))))
}

async fn ensure_dir(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).await.map_err(|e| e.to_string())
}

async fn pdf_path(
    app: &AppHandle,
    ref_id: &str,
    ws: Option<WorkspaceContext>,
) -> Result<PathBuf, String> {
    let title = resolve_ref_title_from_state(app, ref_id, ws.as_ref());
    let file_name = build_pdf_file_name(ref_id, title.as_deref())?;
    if let Some(ctx) = ws.as_ref() {
        if let Some(dir) = workspace_pdf_dir(app, ctx)? {
            ensure_dir(&dir).await?;
            return Ok(dir.join(file_name));
        }
    }
    let dir = legacy_pdf_dir(app)?;
    ensure_dir(&dir).await?;
    Ok(dir.join(file_name))
}

fn find_pdf_by_hash(dir: &Path, ref_id: &str) -> Option<PathBuf> {
    let suffix = format!("__{}.pdf", sha1_short(ref_id.trim(), 10)).to_lowercase();
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name.ends_with(&suffix) {
            return Some(entry.path());
        }
    }
    None
}

fn pdf_candidate_dirs(
    app: &AppHandle,
    ws: Option<&WorkspaceContext>,
) -> Result<Vec<PathBuf>, String> {
    let mut dirs = Vec::new();
    if let Some(ctx) = ws {
        if let Some(dir) = workspace_pdf_dir(app, ctx)? {
            dirs.push(dir);
        }
        if let Some(dir) = legacy_workspace_pdf_dir(app, ctx)? {
            dirs.push(dir);
        }
    }
    dirs.push(legacy_pdf_dir(app)?);
    Ok(dirs)
}

async fn resolve_existing_pdf_path(
    app: &AppHandle,
    ref_id: &str,
    ws: Option<WorkspaceContext>,
) -> Result<Option<PathBuf>, String> {
    let id = clean_ref_id(ref_id)?;
    let dirs = pdf_candidate_dirs(app, ws.as_ref())?;
    let title_hint = title_hint_from_workspace(ws.as_ref());
    let mut direct_names = vec![
        build_pdf_file_name(ref_id, title_hint.as_deref())?,
        format!("{id}.pdf"),
    ];
    let hash_fallback = build_pdf_file_name(ref_id, None)?;
    if !direct_names.contains(&hash_fallback) {
        direct_names.push(hash_fallback);
    }
    for dir in &dirs {
        for name in &direct_names {
            let candidate = dir.join(name);
            if fs::metadata(&candidate)
                .await
                .map(|m| m.is_file())
                .unwrap_or(false)
            {
                return Ok(Some(candidate));
            }
        }
    }
    if title_hint.is_none() {
        if let Some(title) = resolve_ref_title_from_state(app, ref_id, ws.as_ref()) {
            let safe_name = build_pdf_file_name(ref_id, Some(&title))?;
            for dir in &dirs {
                let candidate = dir.join(&safe_name);
                if fs::metadata(&candidate)
                    .await
                    .map(|m| m.is_file())
                    .unwrap_or(false)
                {
                    return Ok(Some(candidate));
                }
            }
        }
    }
    for dir in &dirs {
        if let Some(hashed) = find_pdf_by_hash(dir, ref_id) {
            if fs::metadata(&hashed)
                .await
                .map(|m| m.is_file())
                .unwrap_or(false)
            {
                return Ok(Some(hashed));
            }
        }
    }
    Ok(None)
}

async fn cleanup_legacy_pdf_copies(
    app: &AppHandle,
    ref_id: &str,
    ws: Option<&WorkspaceContext>,
    keep_path: &Path,
) -> Result<usize, String> {
    let Some(ctx) = ws else {
        return Ok(0);
    };
    if workspace_pdf_dir(app, ctx)?.is_none() {
        return Ok(0);
    }
    let id = clean_ref_id(ref_id)?;
    let title = resolve_ref_title_from_state(app, ref_id, Some(ctx));
    let safe_name = build_pdf_file_name(ref_id, title.as_deref())?;
    let mut removed = 0usize;
    let mut seen = HashSet::new();
    for dir in pdf_candidate_dirs(app, Some(ctx))? {
        let mut candidates = vec![dir.join(&safe_name), dir.join(format!("{id}.pdf"))];
        if let Some(hashed) = find_pdf_by_hash(&dir, ref_id) {
            candidates.push(hashed);
        }
        for candidate in candidates {
            if candidate == keep_path || !seen.insert(candidate.clone()) {
                continue;
            }
            match fs::remove_file(&candidate).await {
                Ok(_) => removed += 1,
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
                Err(err) => return Err(err.to_string()),
            }
        }
    }
    Ok(removed)
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

fn normalize_pdf_signal(raw: &str) -> String {
    raw.chars()
        .flat_map(char::to_lowercase)
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
}

fn normalize_doi(raw: &str) -> String {
    String::from(raw)
        .trim()
        .trim_start_matches("https://doi.org/")
        .trim_start_matches("http://doi.org/")
        .trim_start_matches("doi:")
        .trim_matches(|ch: char| matches!(ch, '.' | ',' | ';' | ')' | ']'))
        .to_ascii_lowercase()
}

fn title_tokens(raw: &str, limit: usize) -> Vec<String> {
    let stop = [
        "the", "and", "for", "with", "from", "into", "that", "this", "bir", "ve", "ile", "icin",
        "için", "olan", "olarak", "study", "analysis",
    ]
    .into_iter()
    .collect::<HashSet<_>>();
    normalize_pdf_signal(raw)
        .split_whitespace()
        .filter(|token| token.len() >= 4 && !stop.contains(*token))
        .take(limit)
        .map(str::to_string)
        .collect()
}

fn author_tokens(value: &Value) -> Vec<String> {
    let Some(list) = value.as_array() else {
        return Vec::new();
    };
    list.iter()
        .filter_map(Value::as_str)
        .filter_map(|author| {
            normalize_pdf_signal(author)
                .split_whitespace()
                .find(|part| part.len() >= 4)
                .map(str::to_string)
        })
        .take(6)
        .collect()
}

fn build_pdf_verification(
    options: &Value,
    outcome: &crate::pdf::url_fallback::DownloadOutcome,
) -> Value {
    let expected_doi = normalize_doi(
        options
            .get("expectedDoi")
            .and_then(Value::as_str)
            .unwrap_or(""),
    );
    let expected_title = options
        .get("expectedTitle")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let expected_year = options
        .get("expectedYear")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let require_doi = options
        .get("requireDoiEvidence")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let final_url = outcome.final_url.to_ascii_lowercase();
    let attempted_url = outcome.attempted_url.to_ascii_lowercase();
    let doi_in_url = !expected_doi.is_empty()
        && (final_url.contains(&expected_doi) || attempted_url.contains(&expected_doi));
    let text = String::from_utf8_lossy(&outcome.bytes[..outcome.bytes.len().min(2 * 1024 * 1024)])
        .to_string();
    let normalized_text = normalize_pdf_signal(&text);
    let compact_text = normalized_text.replace(' ', "");
    let compact_doi = expected_doi
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>();
    let doi_in_body = !expected_doi.is_empty() && compact_text.contains(&compact_doi);
    let different_doi_found = !expected_doi.is_empty()
        && text.split_whitespace().any(|part| {
            part.to_ascii_lowercase().starts_with("10.")
                && !part.to_ascii_lowercase().contains(&expected_doi)
        });
    let title = title_tokens(expected_title, 12);
    let title_hits = title
        .iter()
        .filter(|token| normalized_text.contains(token.as_str()))
        .count();
    let authors = author_tokens(options.get("expectedAuthors").unwrap_or(&Value::Null));
    let author_hits = authors
        .iter()
        .filter(|token| normalized_text.contains(token.as_str()))
        .count();
    let year_match = !expected_year.is_empty() && normalized_text.contains(expected_year);
    let mut score = 0;
    if doi_in_body {
        score += 62;
    } else if doi_in_url {
        score += 16;
    }
    if !title.is_empty() {
        let ratio = title_hits as f64 / title.len().max(1) as f64;
        if ratio >= 0.75 || title_hits >= 4 {
            score += 18;
        } else if ratio >= 0.45 || title_hits >= 2 {
            score += 10;
        }
    }
    if !authors.is_empty() && author_hits >= authors.len().min(2) {
        score += 8;
    }
    if year_match {
        score += 4;
    }
    let mut warnings = Vec::new();
    let mut reasons = Vec::new();
    if different_doi_found {
        warnings.push("PDF icinde farkli DOI bulundu");
    }
    if doi_in_body {
        reasons.push("DOI PDF icinde dogrulandi");
    } else if doi_in_url {
        reasons.push("Indirme baglantisi DOI ile uyumlu");
    } else if !expected_doi.is_empty() {
        warnings.push("DOI kaniti bulunamadi");
    }
    if !title.is_empty() && title_hits < 2 {
        warnings.push("Baslik eslesmesi zayif");
    }
    let status = if different_doi_found || (require_doi && !doi_in_body && !doi_in_url) {
        "suspicious"
    } else if doi_in_body || score >= 70 {
        "verified"
    } else if doi_in_url || score >= 28 || (title_hits >= 2 && (author_hits >= 1 || year_match)) {
        "likely"
    } else {
        "suspicious"
    };
    let summary = match status {
        "verified" => "PDF yuksek guvenle dogrulandi",
        "likely" => "PDF makul guvenle eslesti",
        _ => "PDF eslesmesi supheli",
    };
    json!({
        "status": status,
        "confidence": if status == "verified" { "high" } else if status == "likely" { "medium" } else { "low" },
        "score": score.min(100),
        "summary": summary,
        "reasons": reasons,
        "warnings": warnings,
        "expectedDoi": expected_doi,
        "finalUrl": outcome.final_url,
        "sourceUrl": outcome.attempted_url,
        "matchedSignals": {
            "doiInBody": doi_in_body,
            "doiInUrl": doi_in_url,
            "titleTokenHits": title_hits,
            "titleTokenTotal": title.len(),
            "authorTokenHits": author_hits,
            "authorTokenTotal": authors.len(),
            "yearMatch": year_match
        }
    })
}

#[tauri::command]
pub async fn pdf_save(
    app: AppHandle,
    ref_id: String,
    buffer: Value,
    ws: Option<WorkspaceContext>,
) -> Result<Value, String> {
    clean_ref_id(&ref_id)?;
    let bytes = bytes_from_value(buffer)?;
    if bytes.len() > 150 * 1024 * 1024 {
        return Ok(json!({ "ok": false, "error": "PDF dosyasi cok buyuk" }));
    }
    let ws_for_cleanup = ws.clone();
    let path = pdf_path(&app, &ref_id, ws).await?;
    fs::write(&path, bytes).await.map_err(|e| e.to_string())?;
    let removed_legacy_copies =
        cleanup_legacy_pdf_copies(&app, &ref_id, ws_for_cleanup.as_ref(), &path)
            .await
            .unwrap_or(0);
    Ok(
        json!({ "ok": true, "path": path.to_string_lossy(), "removedLegacyCopies": removed_legacy_copies }),
    )
}

#[tauri::command]
pub async fn pdf_load(
    app: AppHandle,
    ref_id: String,
    ws: Option<WorkspaceContext>,
) -> Result<Value, String> {
    let path = match resolve_existing_pdf_path(&app, &ref_id, ws).await? {
        Some(path) => path,
        None => return Ok(json!({ "ok": false, "error": "not found" })),
    };
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
    Ok(resolve_existing_pdf_path(&app, &ref_id, ws)
        .await?
        .is_some())
}

#[tauri::command]
pub async fn pdf_delete(
    app: AppHandle,
    ref_id: String,
    ws: Option<WorkspaceContext>,
) -> Result<Value, String> {
    let mut removed = 0usize;
    let id = clean_ref_id(&ref_id)?;
    let title = resolve_ref_title_from_state(&app, &ref_id, ws.as_ref());
    let safe_name = build_pdf_file_name(&ref_id, title.as_deref())?;
    for dir in pdf_candidate_dirs(&app, ws.as_ref())? {
        let mut candidates = vec![dir.join(&safe_name), dir.join(format!("{id}.pdf"))];
        if let Some(hashed) = find_pdf_by_hash(&dir, &ref_id) {
            candidates.push(hashed);
        }
        for candidate in candidates {
            match fs::remove_file(&candidate).await {
                Ok(_) => removed += 1,
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
                Err(err) => return Ok(json!({ "ok": false, "error": err.to_string() })),
            }
        }
    }
    Ok(json!({ "ok": true, "removed": removed }))
}

#[tauri::command]
pub async fn pdf_show_in_explorer(
    app: AppHandle,
    ref_id: String,
    ws: Option<WorkspaceContext>,
) -> Result<Value, String> {
    let ws_for_cleanup = ws.clone();
    let path = match resolve_existing_pdf_path(&app, &ref_id, ws).await? {
        Some(path) => path,
        None => return Ok(json!({ "ok": false, "error": "PDF bulunamadi" })),
    };
    let _ = cleanup_legacy_pdf_copies(&app, &ref_id, ws_for_cleanup.as_ref(), &path).await;
    let folder = path.parent().unwrap_or(path.as_path()).to_path_buf();
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(&folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        tauri_plugin_opener::open_path(folder.to_string_lossy().to_string(), None::<&str>)
            .map_err(|e| e.to_string())?;
    }
    Ok(json!({ "ok": true, "path": folder.to_string_lossy(), "file": path.to_string_lossy() }))
}

async fn remove_dir_if_exists(dir: PathBuf, removed: &mut Vec<String>) -> Result<(), String> {
    if fs::metadata(&dir).await.is_err() {
        return Ok(());
    }
    match fs::remove_dir_all(&dir).await {
        Ok(_) => {
            removed.push(dir.to_string_lossy().to_string());
            Ok(())
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

async fn remove_workspace_roots_by_id(
    app: &AppHandle,
    ws: &WorkspaceContext,
    removed: &mut Vec<String>,
) -> Result<(), String> {
    let Some(id) = ws.id.as_deref().map(str::trim).filter(|id| !id.is_empty()) else {
        return Ok(());
    };
    let root = workspaces_root(app)?;
    let suffix = format!("-{}", sha1_short(id, 6));
    let mut entries = match fs::read_dir(&root).await {
        Ok(entries) => entries,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(err.to_string()),
    };
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let file_type = entry.file_type().await.map_err(|e| e.to_string())?;
        if !file_type.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("AcademiQ-") && name.ends_with(&suffix) {
            remove_dir_if_exists(entry.path(), removed).await?;
        }
    }
    Ok(())
}

#[allow(dead_code)]
fn workspace_folder_name_for_tests(ws: &WorkspaceContext) -> Option<String> {
    build_workspace_folder_name(ws)
}

#[allow(dead_code)]
fn pdf_file_name_for_tests(ref_id: &str, title: Option<&str>) -> Result<String, String> {
    build_pdf_file_name(ref_id, title)
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
    let Some(ctx) = ws else {
        return Ok(json!({ "ok": false, "error": "invalid workspace" }));
    };
    let mut removed = Vec::new();
    remove_workspace_roots_by_id(&app, &ctx, &mut removed).await?;
    if let Some(dir) = legacy_workspace_pdf_dir(&app, &ctx)? {
        remove_dir_if_exists(dir, &mut removed).await?;
    }
    let mut removed_refs = Vec::new();
    for ref_id in ctx
        .reference_ids
        .iter()
        .map(|id| id.trim())
        .filter(|id| !id.is_empty())
    {
        let result = pdf_delete(app.clone(), ref_id.to_string(), Some(ctx.clone())).await?;
        let count = result.get("removed").and_then(Value::as_u64).unwrap_or(0);
        if count > 0 {
            removed_refs.push(ref_id.to_string());
        }
    }
    Ok(json!({ "ok": true, "removed": removed, "removedRefs": removed_refs }))
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
    let verification = build_pdf_verification(&options, &outcome);
    let save_result = pdf_save(app, ref_id, json!(outcome.bytes), ws).await?;
    if save_result.get("ok").and_then(Value::as_bool) == Some(true) {
        Ok(json!({
            "ok": true,
            "size": size,
            "finalUrl": outcome.final_url,
            "attemptedUrl": outcome.attempted_url,
            "contentType": outcome.content_type,
            "status": outcome.status,
            "verification": verification
        }))
    } else {
        Ok(save_result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pdf::url_fallback::DownloadOutcome;

    #[test]
    fn workspace_folder_matches_legacy_shape() {
        let ws = WorkspaceContext {
            id: Some("ws-calisma-1".to_string()),
            name: Some("Çalışma Alanı.".to_string()),
            title: None,
            reference_ids: Vec::new(),
        };
        let folder = workspace_folder_name_for_tests(&ws).expect("folder");
        assert!(folder.starts_with("AcademiQ-Çalışma Alanı-"));
        assert_eq!(folder.rsplit('-').next().unwrap().len(), 6);
    }

    #[test]
    fn pdf_file_name_uses_first_two_title_words_and_ref_hash() {
        let name = pdf_file_name_for_tests(
            "ref_abc123",
            Some("Understanding the influence of digital technology"),
        )
        .expect("file name");
        assert!(name.starts_with("Understanding the__"));
        assert!(name.ends_with(".pdf"));
        let hash = name.trim_end_matches(".pdf").rsplit("__").next().unwrap();
        assert_eq!(hash.len(), 10);
    }

    #[test]
    fn pdf_file_name_sanitizes_for_windows() {
        let name = pdf_file_name_for_tests("ref/with/slash", Some("Bad: Title / With * Marks"))
            .expect("file name");
        assert!(name.starts_with("Bad Title__"));
        assert!(!name.contains(':'));
        assert!(!name.contains('/'));
        assert!(!name.contains('*'));
    }

    #[test]
    fn pdf_download_verification_uses_doi_title_author_and_year_signals() {
        let outcome = DownloadOutcome {
            bytes:
                b"%PDF-1.7 Structured Note Taking Academic Writing Selwyn 2024 doi 10.1000/abc.123"
                    .to_vec(),
            final_url: "https://example.org/paper.pdf".to_string(),
            attempted_url: "https://doi.org/10.1000/abc.123".to_string(),
            content_type: "application/pdf".to_string(),
            status: 200,
        };
        let report = build_pdf_verification(
            &json!({
                "expectedDoi": "10.1000/abc.123",
                "expectedTitle": "Structured Note Taking for Academic Writing",
                "expectedAuthors": ["Selwyn, Neil"],
                "expectedYear": "2024",
                "requireDoiEvidence": true
            }),
            &outcome,
        );
        assert_eq!(
            report.get("status").and_then(Value::as_str),
            Some("verified")
        );
        assert_eq!(
            report
                .pointer("/matchedSignals/doiInBody")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert!(
            report
                .pointer("/matchedSignals/titleTokenHits")
                .and_then(Value::as_u64)
                .unwrap_or(0)
                >= 3
        );
    }

    #[test]
    fn pdf_download_verification_marks_required_doi_absence_suspicious() {
        let outcome = DownloadOutcome {
            bytes: b"%PDF-1.7 unrelated classroom article".to_vec(),
            final_url: "https://example.org/other.pdf".to_string(),
            attempted_url: "https://example.org/other.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            status: 200,
        };
        let report = build_pdf_verification(
            &json!({
                "expectedDoi": "10.1000/abc.123",
                "expectedTitle": "Structured Note Taking for Academic Writing",
                "requireDoiEvidence": true
            }),
            &outcome,
        );
        assert_eq!(
            report.get("status").and_then(Value::as_str),
            Some("suspicious")
        );
        assert!(report
            .get("warnings")
            .and_then(Value::as_array)
            .unwrap()
            .iter()
            .any(|warning| warning.as_str().unwrap_or("").contains("DOI")));
    }
}
