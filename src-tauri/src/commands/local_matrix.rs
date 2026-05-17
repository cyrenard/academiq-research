use serde_json::{json, Value};

#[tauri::command]
pub async fn local_matrix_assistant_get_status(settings: Value) -> Result<Value, String> {
    Ok(json!({
        "ok": true,
        "available": false,
        "provider": settings.get("provider").cloned().unwrap_or(Value::Null),
        "error": Value::Null
    }))
}

#[tauri::command]
pub async fn local_matrix_assistant_rank_candidates(payload: Value) -> Result<Value, String> {
    let candidates = payload
        .get("candidates")
        .cloned()
        .unwrap_or_else(|| json!([]));
    Ok(json!({ "ok": true, "candidates": candidates }))
}

#[tauri::command]
pub async fn local_matrix_assistant_compose_cells(_payload: Value) -> Result<Value, String> {
    Ok(json!({ "ok": true, "cells": [] }))
}
