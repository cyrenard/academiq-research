use serde_json::{json, Map, Value};
use std::time::{SystemTime, UNIX_EPOCH};

const COLUMN_KEYS: [&str; 5] = ["purpose", "method", "sample", "findings", "limitations"];

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn text(value: Option<&Value>, max_len: usize) -> String {
    let raw = match value {
        Some(Value::String(item)) => item.clone(),
        Some(Value::Number(item)) => item.to_string(),
        Some(Value::Bool(item)) => item.to_string(),
        Some(item) => item.to_string(),
        None => String::new(),
    };
    let trimmed = raw.trim();
    if trimmed.chars().count() <= max_len {
        return trimmed.to_string();
    }
    trimmed
        .chars()
        .take(max_len)
        .collect::<String>()
        .trim()
        .to_string()
}

fn number(value: Option<&Value>, fallback: f64) -> f64 {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .unwrap_or(fallback)
}

fn clamp01(value: f64) -> f64 {
    value.max(0.0).min(1.0)
}

fn bool_setting(source: &Value, key: &str) -> bool {
    source.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn setting_number(source: &Value, key: &str, fallback: f64, min: f64, max: f64) -> f64 {
    number(source.get(key), fallback).max(min).min(max)
}

fn normalize_settings(value: Option<&Value>) -> Value {
    let source = value.unwrap_or(&Value::Null);
    let provider = if source.get("provider").is_some() {
        text(source.get("provider"), 80)
    } else {
        "rule-guard".to_string()
    };
    json!({
        "enabled": bool_setting(source, "enabled"),
        "provider": provider,
        "allowModelProvider": bool_setting(source, "allowModelProvider"),
        "composeCells": bool_setting(source, "composeCells"),
        "maxCandidatesPerColumn": setting_number(source, "maxCandidatesPerColumn", 4.0, 1.0, 8.0) as u64,
        "maxSnippetChars": setting_number(source, "maxSnippetChars", 1200.0, 240.0, 2000.0) as usize,
        "minConfidence": setting_number(source, "minConfidence", 0.5, 0.0, 1.0)
    })
}

fn settings_usize(settings: &Value, key: &str, fallback: usize) -> usize {
    settings
        .get(key)
        .and_then(Value::as_u64)
        .map(|item| item as usize)
        .unwrap_or(fallback)
}

fn settings_f64(settings: &Value, key: &str, fallback: f64) -> f64 {
    number(settings.get(key), fallback)
}

fn normalize_source(value: Option<&Value>, confidence: f64) -> Map<String, Value> {
    let source = value.and_then(Value::as_object);
    let mut out = Map::new();
    out.insert(
        "page".into(),
        json!(text(source.and_then(|s| s.get("page")), 64)),
    );
    out.insert(
        "snippet".into(),
        json!(text(source.and_then(|s| s.get("snippet")), 2000)),
    );
    out.insert(
        "section".into(),
        json!(text(source.and_then(|s| s.get("section")), 80)),
    );
    out.insert(
        "extractionType".into(),
        json!(text(source.and_then(|s| s.get("extractionType")), 80)),
    );
    out.insert(
        "confidence".into(),
        json!(clamp01(number(
            source.and_then(|s| s.get("confidence")),
            confidence
        ))),
    );
    out.insert(
        "updatedAt".into(),
        json!(source
            .and_then(|s| s.get("updatedAt"))
            .and_then(Value::as_u64)
            .unwrap_or_else(now_ms)),
    );
    out
}

fn normalize_candidate(candidate: &Value) -> Option<Value> {
    let column_key = text(candidate.get("columnKey"), 32);
    if !COLUMN_KEYS.contains(&column_key.as_str()) {
        return None;
    }
    let body = text(candidate.get("text"), 2000);
    if body.is_empty() {
        return None;
    }
    let confidence = clamp01(number(candidate.get("confidence"), 0.0));
    let reasons = candidate
        .get("reasons")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|item| text(Some(item), 160))
                .filter(|item| !item.is_empty())
                .take(12)
                .map(Value::String)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut out = Map::new();
    out.insert("columnKey".into(), json!(column_key));
    out.insert("text".into(), json!(body));
    out.insert("score".into(), json!(number(candidate.get("score"), 0.0)));
    out.insert("confidence".into(), json!(confidence));
    out.insert(
        "source".into(),
        Value::Object(normalize_source(candidate.get("source"), confidence)),
    );
    out.insert("reasons".into(), Value::Array(reasons));
    out.insert(
        "assistant".into(),
        candidate.get("assistant").cloned().unwrap_or(Value::Null),
    );
    Some(Value::Object(out))
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

fn looks_reference_like(raw: &str) -> bool {
    let lower = raw.to_lowercase();
    lower.contains("http://")
        || lower.contains("https://")
        || lower.contains("doi.org")
        || lower.contains("10.")
        || (raw.contains('(') && raw.contains(')') && raw.chars().any(|c| c.is_ascii_digit()))
        || (raw.contains(',') && raw.contains('.') && raw.chars().any(|c| c.is_ascii_digit()))
}

fn local_review_candidate(candidate: &Value) -> Option<Value> {
    let mut next = normalize_candidate(candidate)?;
    let object = next.as_object_mut()?;
    let column_key = object
        .get("columnKey")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let body = object
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let lower = body.to_lowercase();
    let mut delta = 0.0;
    let mut reasons = object
        .get("reasons")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let words = body.split_whitespace().count();
    if (10..=55).contains(&words) {
        delta += 0.03;
        reasons.push(json!("assistant:length-ok"));
    }
    if looks_reference_like(&body) {
        delta -= 0.18;
        reasons.push(json!("assistant:reference-like-penalty"));
    }
    if column_key == "sample"
        && (contains_any(
            &lower,
            &[
                "participant",
                "student",
                "teacher",
                "katilimci",
                "katılımcı",
                "ogrenci",
                "öğrenci",
            ],
        ) || lower.contains("n =")
            || lower.contains("n="))
        && body.chars().any(|item| item.is_ascii_digit())
    {
        delta += 0.08;
        reasons.push(json!("assistant:sample-evidence"));
    }
    if column_key == "method"
        && contains_any(
            &lower,
            &[
                "design", "analysis", "model", "desen", "analiz", "yontem", "yöntem",
            ],
        )
    {
        delta += 0.05;
        reasons.push(json!("assistant:method-signal"));
    }
    if column_key == "findings"
        && contains_any(
            &lower,
            &[
                "significant",
                "revealed",
                "showed",
                "bulgu",
                "sonuc",
                "sonuç",
                "anlamli",
                "anlamlı",
            ],
        )
    {
        delta += 0.05;
        reasons.push(json!("assistant:finding-signal"));
    }
    if column_key == "limitations"
        && contains_any(
            &lower,
            &[
                "limitation",
                "future research",
                "sinirl",
                "sınırl",
                "gelecek araştır",
                "gelecek arastir",
            ],
        )
    {
        delta += 0.06;
        reasons.push(json!("assistant:limitation-signal"));
    }
    let confidence = clamp01(number(object.get("confidence"), 0.0) + delta);
    object.insert("confidence".into(), json!(confidence));
    object.insert(
        "score".into(),
        json!(number(object.get("score"), 0.0) + (delta * 16.0).round()),
    );
    object.insert(
        "reasons".into(),
        Value::Array(reasons.into_iter().take(12).collect()),
    );
    object.insert(
        "assistant".into(),
        json!({ "provider": "rule-guard", "localOnly": true, "reviewedAt": now_ms() }),
    );
    if let Some(source) = object.get_mut("source").and_then(Value::as_object_mut) {
        if source
            .get("extractionType")
            .and_then(Value::as_str)
            .unwrap_or("")
            .is_empty()
        {
            source.insert("extractionType".into(), json!("rule-section-sentence"));
        }
        source.insert("confidence".into(), json!(confidence));
    }
    Some(next)
}

fn rank_candidates(candidates: &[Value], settings: &Value) -> Vec<Value> {
    if !settings
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return candidates.iter().filter_map(normalize_candidate).collect();
    }
    let mut list = candidates
        .iter()
        .filter_map(local_review_candidate)
        .filter(|candidate| {
            let confidence = number(candidate.get("confidence"), 0.0);
            let score = number(candidate.get("score"), 0.0);
            confidence >= settings_f64(settings, "minConfidence", 0.5) || score >= 3.0
        })
        .collect::<Vec<_>>();
    list.sort_by(|a, b| {
        let confidence_delta = number(b.get("confidence"), 0.0)
            .partial_cmp(&number(a.get("confidence"), 0.0))
            .unwrap_or(std::cmp::Ordering::Equal);
        if confidence_delta != std::cmp::Ordering::Equal {
            return confidence_delta;
        }
        number(b.get("score"), 0.0)
            .partial_cmp(&number(a.get("score"), 0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let max_per_column = settings_usize(settings, "maxCandidatesPerColumn", 4);
    let max_snippet = settings_usize(settings, "maxSnippetChars", 1200);
    let mut per_column = Map::new();
    let mut out = Vec::new();
    for mut candidate in list {
        let column_key = text(candidate.get("columnKey"), 32);
        let count = per_column
            .get(&column_key)
            .and_then(Value::as_u64)
            .unwrap_or(0) as usize;
        if count >= max_per_column {
            continue;
        }
        per_column.insert(column_key, json!(count + 1));
        if let Some(object) = candidate.as_object_mut() {
            let body = text(object.get("text"), max_snippet);
            object.insert("text".into(), json!(body));
            if let Some(source) = object.get_mut("source").and_then(Value::as_object_mut) {
                let snippet = text(source.get("snippet"), max_snippet);
                source.insert("snippet".into(), json!(snippet));
            }
        }
        out.push(candidate);
    }
    out
}

fn clean_cell_draft(value: &str, max_len: usize) -> String {
    let mut raw = value.split_whitespace().collect::<Vec<_>>().join(" ");
    for prefix in [
        "abstract:",
        "method:",
        "methods:",
        "findings:",
        "results:",
        "sample:",
        "participants:",
    ] {
        if raw.to_lowercase().starts_with(prefix) {
            raw = raw[prefix.len()..].trim().to_string();
            break;
        }
    }
    if raw.chars().count() > max_len {
        raw = raw.chars().take(max_len).collect::<String>();
        if let Some((prefix, _)) = raw.rsplit_once(' ') {
            raw = prefix.trim().to_string();
        }
    }
    raw
}

fn compose_cells(candidates: &[Value], settings: &Value) -> Vec<Value> {
    if !settings
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || !settings
            .get("composeCells")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        return Vec::new();
    }
    let ranked = rank_candidates(candidates, settings);
    let max_snippet = settings_usize(settings, "maxSnippetChars", 1200);
    let mut out = Vec::new();
    for column_key in COLUMN_KEYS {
        let primary = ranked.iter().find(|candidate| {
            candidate
                .get("columnKey")
                .and_then(Value::as_str)
                .map(|item| item == column_key)
                .unwrap_or(false)
        });
        let Some(primary) = primary else { continue };
        let draft = clean_cell_draft(
            primary.get("text").and_then(Value::as_str).unwrap_or(""),
            max_snippet,
        );
        if draft.is_empty() {
            continue;
        }
        let confidence = clamp01(number(primary.get("confidence"), 0.0).max(0.82));
        let mut source = normalize_source(primary.get("source"), confidence);
        source.insert(
            "snippet".into(),
            json!(text(
                primary
                    .get("source")
                    .and_then(|source| source.get("snippet"))
                    .or(primary.get("text")),
                max_snippet
            )),
        );
        source.insert("extractionType".into(), json!("local-assistant-compose"));
        source.insert("confidence".into(), json!(confidence));
        source.insert("updatedAt".into(), json!(now_ms()));
        let mut reasons = primary
            .get("reasons")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        reasons.push(json!("assistant:composed-cell"));
        out.push(json!({
            "columnKey": column_key,
            "text": draft,
            "score": number(primary.get("score"), 0.0) + 2.0,
            "confidence": confidence,
            "source": source,
            "reasons": reasons.into_iter().take(12).collect::<Vec<_>>(),
            "assistant": { "provider": "local-composer", "localOnly": true, "composedAt": now_ms() }
        }));
    }
    out
}

fn status(settings: &Value) -> Value {
    json!({
        "enabled": settings.get("enabled").and_then(Value::as_bool).unwrap_or(false),
        "provider": "rule-guard",
        "localOnly": true,
        "available": settings.get("enabled").and_then(Value::as_bool).unwrap_or(false),
        "modelProviderAvailable": false,
        "composeCells": settings.get("composeCells").and_then(Value::as_bool).unwrap_or(false),
        "composeProviderAvailable": false,
        "mode": "literature-matrix-only",
        "writesManuscriptText": false
    })
}

#[tauri::command]
pub async fn local_matrix_assistant_get_status(settings: Value) -> Result<Value, String> {
    let settings = normalize_settings(Some(&settings));
    Ok(json!({ "ok": true, "error": null, "status": status(&settings) }))
}

#[tauri::command]
pub async fn local_matrix_assistant_rank_candidates(payload: Value) -> Result<Value, String> {
    let settings = normalize_settings(payload.get("settings"));
    if !settings
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Ok(json!({ "ok": true, "candidates": [], "skipped": true, "reason": "disabled" }));
    }
    let candidates = payload
        .get("candidates")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(json!({
        "ok": true,
        "candidates": rank_candidates(&candidates, &settings),
        "status": status(&settings)
    }))
}

#[tauri::command]
pub async fn local_matrix_assistant_compose_cells(payload: Value) -> Result<Value, String> {
    let settings = normalize_settings(payload.get("settings"));
    if !settings
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || !settings
            .get("composeCells")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        let reason = if settings
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            "compose-disabled"
        } else {
            "disabled"
        };
        return Ok(json!({ "ok": true, "candidates": [], "skipped": true, "reason": reason }));
    }
    let candidates = payload
        .get("candidates")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(json!({
        "ok": true,
        "candidates": compose_cells(&candidates, &settings),
        "status": status(&settings)
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_matrix_ranks_sample_evidence_when_enabled() {
        let payload = json!({
            "settings": { "enabled": true },
            "candidates": [{
                "columnKey": "sample",
                "text": "The sample consisted of 412 undergraduate students recruited from three universities.",
                "score": 8,
                "confidence": 0.72,
                "reasons": []
            }]
        });
        let settings = normalize_settings(payload.get("settings"));
        let candidates = payload.get("candidates").and_then(Value::as_array).unwrap();
        let ranked = rank_candidates(candidates, &settings);
        assert_eq!(ranked.len(), 1);
        assert!(number(ranked[0].get("confidence"), 0.0) > 0.72);
        assert_eq!(
            ranked[0]
                .get("assistant")
                .and_then(|item| item.get("provider"))
                .and_then(Value::as_str),
            Some("rule-guard")
        );
    }

    #[test]
    fn local_matrix_composes_cells_when_explicitly_enabled() {
        let payload = json!({
            "settings": { "enabled": true, "composeCells": true },
            "candidates": [{
                "columnKey": "method",
                "text": "Method: The study used a cross-sectional survey design.",
                "score": 10,
                "confidence": 0.86,
                "source": { "page": "4", "snippet": "The study used a cross-sectional survey design." },
                "reasons": []
            }]
        });
        let settings = normalize_settings(payload.get("settings"));
        let candidates = payload.get("candidates").and_then(Value::as_array).unwrap();
        let composed = compose_cells(candidates, &settings);
        assert_eq!(composed.len(), 1);
        assert_eq!(
            composed[0].get("columnKey").and_then(Value::as_str),
            Some("method")
        );
        assert_eq!(
            composed[0]
                .get("source")
                .and_then(|item| item.get("extractionType"))
                .and_then(Value::as_str),
            Some("local-assistant-compose")
        );
    }
}
