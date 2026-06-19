use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn open_conn<P: AsRef<Path>>(path: P) -> Result<Connection, rusqlite::Error> {
    let open_fn = rusqlite::Connection::open;
    let conn = open_fn(path)?;
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");
    let _ = conn.pragma_update(None, "foreign_keys", "ON");
    Ok(conn)
}

use crate::telemetry;

const INIT_SQL: &str = include_str!("../../migrations/0001_init.sql");
const DB_FILE: &str = "academiq.sqlite";
const LEGACY_FILE: &str = "academiq-data.json";
const LEGACY_ALT_FILE: &str = "data.json";
const LEGACY_ELECTRON_DIR: &str = "AcademiQ";
const STATE_BLOB_KEY: &str = "state_blob";
const DRAFT_BLOB_KEY: &str = "editor_draft_blob";
const MAX_DATA_JSON_BYTES: usize = 50 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct DbPaths {
    pub db_path: PathBuf,
    pub legacy_json_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct LibraryItem {
    pub id: String,
    pub title: String,
    pub authors: String,
    pub year: Option<i64>,
    pub doi: String,
    pub abstract_text: String,
    pub pdf_path: String,
    pub metadata_json: String,
}

pub fn get_db_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(DB_FILE)
}

pub fn get_legacy_json_path(app_data_dir: &Path) -> PathBuf {
    let primary = app_data_dir.join(LEGACY_FILE);
    if primary.exists() {
        primary
    } else {
        app_data_dir.join(LEGACY_ALT_FILE)
    }
}

pub fn paths(app_data_dir: &Path) -> DbPaths {
    DbPaths {
        db_path: get_db_path(app_data_dir),
        legacy_json_path: get_legacy_json_path(app_data_dir),
    }
}

pub fn init_or_migrate(app_data_dir: &Path) -> Result<DbPaths, String> {
    fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    let db_paths = paths(app_data_dir);
    if db_paths.db_path.exists() {
        let conn = open_conn(&db_paths.db_path).map_err(|e| e.to_string())?;
        ensure_schema(&conn)?;
        auto_retry_empty_history(app_data_dir, &db_paths.db_path)?;
        return Ok(db_paths);
    }

    if let Some(legacy_dir) = get_legacy_electron_dir() {
        let legacy_state = legacy_dir.join(LEGACY_FILE);
        if legacy_state.exists() {
            migrate_legacy_electron_dir(app_data_dir, &db_paths.db_path, &legacy_dir)?;
            return Ok(db_paths);
        }
    }

    let mut conn = open_conn(&db_paths.db_path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    let legacy_exists = db_paths.legacy_json_path.exists();
    let legacy_json = if legacy_exists {
        let raw = fs::read_to_string(&db_paths.legacy_json_path).map_err(|e| e.to_string())?;
        let backup_path = backup_legacy_json(&db_paths.legacy_json_path)?;
        Some((raw, backup_path))
    } else {
        None
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute_batch(INIT_SQL).map_err(|e| e.to_string())?;
    if let Some((raw, backup_path)) = legacy_json {
        save_state_blob_tx(&tx, &raw, "migration")?;
        tx.execute(
            "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
            params!["migration_completed_at", utc_stamp()],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
            params![
                "migration_backup_path",
                backup_path.to_string_lossy().to_string()
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(db_paths)
}

pub fn load_state(app_data_dir: &Path) -> Result<Option<String>, String> {
    let db_paths = init_or_migrate(app_data_dir)?;
    let conn = open_conn(&db_paths.db_path).map_err(|e| e.to_string())?;
    let value = conn
        .query_row(
            "SELECT value FROM kv WHERE key = ?1",
            params![STATE_BLOB_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    drop(conn);
    if let Some(recovered) =
        recover_state_blob_from_legacy_if_richer(app_data_dir, &db_paths.db_path, value.as_deref())?
    {
        return Ok(Some(recovered));
    }
    Ok(value)
}

fn recover_state_blob_from_legacy_if_richer(
    app_data_dir: &Path,
    db_path: &Path,
    current_raw: Option<&str>,
) -> Result<Option<String>, String> {
    let current_source = kv_get_from_db(db_path, "state_source")?;
    let can_recover_from_legacy = current_raw.is_none()
        || matches!(
            current_source.as_deref(),
            Some("bad-overwrite" | "legacy-empty-overwrite")
        );
    if !can_recover_from_legacy {
        return Ok(None);
    }
    let current_ref_count = current_raw.map(count_state_references).unwrap_or(0);
    if current_ref_count > 0 {
        return Ok(None);
    }
    let Some(legacy_dir) = legacy_dir_from_kv(db_path)?.or_else(get_legacy_electron_dir) else {
        return Ok(None);
    };
    let legacy_path = if legacy_dir.join(LEGACY_FILE).exists() {
        legacy_dir.join(LEGACY_FILE)
    } else {
        legacy_dir.join(LEGACY_ALT_FILE)
    };
    if !legacy_path.exists() {
        return Ok(None);
    }
    let legacy_raw = fs::read_to_string(&legacy_path).map_err(|e| {
        format!(
            "legacy_state_recovery_read_failed:{}:{e}",
            legacy_path.to_string_lossy()
        )
    })?;
    let legacy_ref_count = count_state_references(&legacy_raw);
    if legacy_ref_count == 0 || legacy_ref_count <= current_ref_count {
        return Ok(None);
    }

    let legacy_state = parse_json(&legacy_raw)?;
    let mut conn = open_conn(db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    save_state_blob_tx(&tx, &legacy_raw, "legacy-recovery")?;
    migrate_legacy_state_kv(&tx, &legacy_dir, &legacy_state)?;
    upsert_kv_tx(&tx, "legacy_recovery_completed_at", &utc_stamp())?;
    upsert_kv_tx(
        &tx,
        "legacy_recovery_reference_count",
        &legacy_ref_count.to_string(),
    )?;
    tx.commit().map_err(|e| e.to_string())?;
    copy_legacy_assets(app_data_dir, &legacy_dir)?;
    Ok(Some(legacy_raw))
}

fn kv_get_from_db(db_path: &Path, key: &str) -> Result<Option<String>, String> {
    if !db_path.exists() {
        return Ok(None);
    }
    let conn = open_conn(db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn)?;
    conn.query_row("SELECT value FROM kv WHERE key = ?1", params![key], |row| {
        row.get::<_, String>(0)
    })
    .optional()
    .map_err(|e| e.to_string())
}

fn count_state_references_val(value: &Value) -> usize {
    value
        .get("wss")
        .and_then(Value::as_array)
        .map(|workspaces| {
            workspaces
                .iter()
                .map(|workspace| {
                    workspace
                        .get("lib")
                        .and_then(Value::as_array)
                        .map(Vec::len)
                        .unwrap_or(0)
                })
                .sum()
        })
        .unwrap_or(0)
}

fn count_state_references(raw: &str) -> usize {
    parse_json(raw)
        .ok()
        .map(|value| count_state_references_val(&value))
        .unwrap_or(0)
}

fn count_state_array_val(value: &Value, key: &str) -> usize {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0)
}

fn clean_reference_field(reference: &Value, key: &str) -> String {
    reference
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}

fn reference_merge_keys(reference: &Value) -> Vec<String> {
    let id = clean_reference_field(reference, "id");
    let doi = clean_reference_field(reference, "doi").to_lowercase();
    let isbn = clean_reference_field(reference, "isbn")
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>()
        .to_uppercase();
    let url = clean_reference_field(reference, "url").to_lowercase();
    let title = clean_reference_field(reference, "title").to_lowercase();
    let year = clean_reference_field(reference, "year");
    let author = reference
        .get("authors")
        .and_then(Value::as_array)
        .and_then(|authors| authors.first())
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_lowercase();
    [
        (!id.is_empty()).then(|| format!("id:{id}")),
        (!doi.is_empty()).then(|| format!("doi:{doi}")),
        (!isbn.is_empty()).then(|| format!("isbn:{isbn}")),
        (!url.is_empty()).then(|| format!("url:{url}")),
        (!title.is_empty()).then(|| format!("title:{title}|{year}|{author}")),
    ]
    .into_iter()
    .flatten()
    .collect()
}

pub fn save_state(app_data_dir: &Path, raw: &str, source: &str) -> Result<Value, String> {
    if raw.as_bytes().len() > MAX_DATA_JSON_BYTES {
        telemetry::record_event(
            "state_save_rejected",
            json!({ "reason": "size_limit", "size_bytes": raw.len(), "source": source }),
        );
        return Err("Veri boyutu sınırı aşıldı".to_string());
    }
    let parsed_val = parse_json(raw)?;
    let db_paths = init_or_migrate(app_data_dir)?;
    let guarded_raw =
        preserve_reference_libraries_on_save(&parsed_val, raw, &db_paths.db_path, source)?;
    let mut conn = open_conn(&db_paths.db_path).map_err(|e| {
        telemetry::record_event(
            "state_save_failed",
            json!({ "stage": "open", "error": e.to_string(), "source": source }),
        );
        e.to_string()
    })?;
    let tx = conn.transaction().map_err(|e| {
        telemetry::record_event(
            "state_save_failed",
            json!({ "stage": "begin_tx", "error": e.to_string(), "source": source }),
        );
        e.to_string()
    })?;
    if let Err(e) = save_state_blob_tx(&tx, &guarded_raw, source) {
        telemetry::record_event(
            "state_save_failed",
            json!({ "stage": "write_blob", "error": &e, "source": source }),
        );
        return Err(e);
    }
    tx.commit().map_err(|e| {
        telemetry::record_event(
            "state_save_failed",
            json!({ "stage": "commit", "error": e.to_string(), "source": source }),
        );
        e.to_string()
    })?;
    Ok(json!({ "ok": true, "savedAt": now_millis(), "storage": "sqlite" }))
}

fn preserve_reference_libraries_on_save(
    parsed: &Value,
    raw: &str,
    db_path: &Path,
    source: &str,
) -> Result<String, String> {
    if !db_path.exists() {
        return Ok(raw.to_string());
    }
    let conn = open_conn(db_path).map_err(|e| e.to_string())?;
    let current_raw = conn
        .query_row(
            "SELECT value FROM kv WHERE key = ?1",
            params![STATE_BLOB_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    drop(conn);
    let Some(current_raw) = current_raw else {
        return Ok(raw.to_string());
    };
    let current_parsed = parse_json(&current_raw)?;
    let current_workspace_count = count_state_array_val(&current_parsed, "wss");
    let next_workspace_count = count_state_array_val(parsed, "wss");
    let current_doc_count = count_state_array_val(&current_parsed, "docs");
    let next_doc_count = count_state_array_val(parsed, "docs");
    let collection_shrank = (current_workspace_count > next_workspace_count
        && current_workspace_count > 1)
        || (current_doc_count > next_doc_count && current_doc_count > 1);
    if collection_shrank {
        if is_partial_editor_save_source(source) {
            return merge_missing_state_collections_val(parsed, &current_parsed);
        }
        if source != "persistState" {
            return Ok(current_raw);
        }
    }
    let current_reference_count = count_state_references_val(&current_parsed);
    let next_reference_count = count_state_references_val(parsed);
    let can_merge_reference_shrink = matches!(
        source,
        "editor-autosave"
            | "flush-editor"
            | "word-import-commit"
            | "legacy-empty-overwrite"
            | "bad-overwrite"
    );
    if current_reference_count > next_reference_count && !can_merge_reference_shrink {
        return Ok(raw.to_string());
    }
    if next_reference_count > 0
        && !(can_merge_reference_shrink && current_reference_count > next_reference_count)
    {
        return Ok(raw.to_string());
    }
    if current_reference_count == 0 {
        return Ok(raw.to_string());
    }

    let current_workspaces = current_parsed
        .get("wss")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let current_libs = current_workspaces
        .iter()
        .filter_map(|workspace| {
            let id = workspace.get("id").and_then(Value::as_str)?;
            let lib = workspace.get("lib").and_then(Value::as_array)?;
            if lib.is_empty() {
                None
            } else {
                Some((id.to_string(), Value::Array(lib.clone())))
            }
        })
        .collect::<HashMap<_, _>>();

    let mut next = parsed.clone();
    let Some(workspaces) = next.get_mut("wss").and_then(Value::as_array_mut) else {
        return Ok(current_raw);
    };
    let mut changed = false;
    for workspace in workspaces {
        let Some(id) = workspace
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
        else {
            continue;
        };
        let Some(current_lib) = current_libs.get(&id).and_then(Value::as_array) else {
            continue;
        };
        let next_lib = workspace
            .get("lib")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if next_lib.len() >= current_lib.len() {
            continue;
        }
        let mut merged = next_lib;
        let mut seen = merged
            .iter()
            .flat_map(reference_merge_keys)
            .collect::<HashSet<_>>();
        let mut workspace_changed = false;
        for reference in current_lib {
            let keys = reference_merge_keys(reference);
            if keys.is_empty() || keys.iter().any(|key| seen.contains(key)) {
                continue;
            }
            for key in keys {
                seen.insert(key);
            }
            merged.push(reference.clone());
            workspace_changed = true;
        }
        if workspace_changed {
            if let Some(obj) = workspace.as_object_mut() {
                obj.insert("lib".to_string(), Value::Array(merged));
            }
            changed = true;
        }
    }

    if changed {
        stable_json(&next)
    } else {
        Ok(raw.to_string())
    }
}

fn merge_missing_state_collections_val(
    next_val: &Value,
    current_val: &Value,
) -> Result<String, String> {
    let mut next = next_val.clone();
    merge_array_by_id(&mut next, current_val, "docs")?;
    merge_array_by_id(&mut next, current_val, "wss")?;
    merge_optional_array_by_id(&mut next, current_val, "notes")?;
    merge_optional_array_by_id(&mut next, current_val, "notebooks")?;
    stable_json(&next)
}

fn is_partial_editor_save_source(source: &str) -> bool {
    matches!(
        source,
        "editor-autosave"
            | "flush-editor"
            | "beforeunload"
            | "pagehide"
            | "visibility-hidden"
            | "word-import-commit"
            | "draft-promote"
    )
}

fn merge_array_by_id(next: &mut Value, current: &Value, key: &str) -> Result<(), String> {
    let Some(next_items) = next.get_mut(key).and_then(Value::as_array_mut) else {
        return Err(format!("state_missing_{key}"));
    };
    let current_items = current
        .get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut seen = next_items
        .iter()
        .filter_map(|item| item.get("id").and_then(Value::as_str))
        .map(str::to_string)
        .collect::<HashSet<_>>();
    for item in current_items {
        let Some(id) = item.get("id").and_then(Value::as_str) else {
            continue;
        };
        if seen.insert(id.to_string()) {
            next_items.push(item);
        }
    }
    Ok(())
}

fn merge_optional_array_by_id(next: &mut Value, current: &Value, key: &str) -> Result<(), String> {
    if next.get(key).is_none() && current.get(key).is_none() {
        return Ok(());
    }
    merge_array_by_id(next, current, key)
}

pub fn save_draft(app_data_dir: &Path, raw: &str) -> Result<Value, String> {
    if raw.as_bytes().len() > MAX_DATA_JSON_BYTES {
        return Err("Draft boyutu sınırı aşıldı".to_string());
    }
    parse_json(raw)?;
    let db_paths = init_or_migrate(app_data_dir)?;
    let conn = open_conn(db_paths.db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
        params![DRAFT_BLOB_KEY, raw],
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "savedAt": now_millis(), "storage": "sqlite" }))
}

pub fn get_document_history(
    app_data_dir: &Path,
    doc_id: &str,
    limit: u32,
) -> Result<Value, String> {
    let db_paths = init_or_migrate(app_data_dir)?;
    let conn = open_conn(db_paths.db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, snapshot_json, created_at FROM revisions
             WHERE doc_id = ?1 ORDER BY id DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![doc_id, i64::from(limit.max(1))], |row| {
            let id: i64 = row.get(0)?;
            let raw: String = row.get(1)?;
            let created_at: String = row.get(2)?;
            Ok((id, raw, created_at))
        })
        .map_err(|e| e.to_string())?;
    let mut snapshots = Vec::new();
    for row in rows {
        let (id, raw, created_at) = row.map_err(|e| e.to_string())?;
        let mut value = serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| json!({}));
        if let Some(obj) = value.as_object_mut() {
            obj.entry("id".to_string())
                .or_insert_with(|| Value::String(id.to_string()));
            obj.entry("createdAt".to_string())
                .or_insert_with(|| Value::String(created_at));
        }
        snapshots.push(value);
    }
    Ok(json!({ "ok": true, "docId": doc_id, "snapshots": snapshots }))
}

pub fn restore_document_snapshot(
    app_data_dir: &Path,
    doc_id: &str,
    snapshot_id: &str,
) -> Result<Value, String> {
    let db_paths = init_or_migrate(app_data_dir)?;
    let mut conn = open_conn(db_paths.db_path).map_err(|e| e.to_string())?;
    let snapshot_like = format!("%\"id\":\"{}\"%", snapshot_id.replace('"', "\\\""));
    let snapshot_json = conn
        .query_row(
            "SELECT snapshot_json FROM revisions
             WHERE doc_id = ?1
               AND (CAST(id AS TEXT) = ?2 OR snapshot_json LIKE ?3)
             ORDER BY id DESC LIMIT 1",
            params![doc_id, snapshot_id, snapshot_like],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(snapshot_raw) = snapshot_json else {
        return Ok(json!({ "ok": false, "error": "Belge surumu bulunamadi" }));
    };
    let snapshot = parse_json(&snapshot_raw)?;
    let content = snapshot
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let current_raw = load_state(app_data_dir)?.unwrap_or_default();
    let mut current = parse_json(if current_raw.trim().is_empty() {
        "{}"
    } else {
        &current_raw
    })?;
    if let Some(docs) = current.get_mut("docs").and_then(Value::as_array_mut) {
        if let Some(doc) = docs
            .iter_mut()
            .find(|doc| doc.get("id").and_then(Value::as_str) == Some(doc_id))
        {
            if let Some(obj) = doc.as_object_mut() {
                obj.insert("content".to_string(), Value::String(content.clone()));
            }
        }
    }
    if current.get("curDoc").and_then(Value::as_str) == Some(doc_id) {
        if let Some(obj) = current.as_object_mut() {
            obj.insert("doc".to_string(), Value::String(content));
        }
    }
    let next = serde_json::to_string(&current).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    save_state_blob_tx(&tx, &next, "restore")?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(
        json!({ "ok": true, "docId": doc_id, "snapshotId": snapshot_id, "restoredAt": now_millis() }),
    )
}

pub fn library_search(app_data_dir: &Path, query: &str) -> Result<Vec<LibraryItem>, String> {
    let db_paths = init_or_migrate(app_data_dir)?;
    let conn = open_conn(db_paths.db_path).map_err(|e| e.to_string())?;
    let trimmed = query.trim();
    let sql = if trimmed.is_empty() {
        "SELECT id, title, authors, year, doi, abstract, pdf_path, metadata_json
         FROM library_items ORDER BY updated_at DESC LIMIT 50"
    } else {
        "SELECT li.id, li.title, li.authors, li.year, li.doi, li.abstract, li.pdf_path, li.metadata_json
         FROM library_fts f
         JOIN library_items li ON li.rowid = f.rowid
         WHERE library_fts MATCH ?1
         ORDER BY bm25(library_fts) LIMIT 50"
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let terms = fts_query(trimmed);
    let mapper = |row: &rusqlite::Row<'_>| {
        Ok(LibraryItem {
            id: row.get(0)?,
            title: row.get(1)?,
            authors: row.get(2)?,
            year: row.get(3)?,
            doi: row.get(4)?,
            abstract_text: row.get(5)?,
            pdf_path: row.get(6)?,
            metadata_json: row.get(7)?,
        })
    };
    let rows = if trimmed.is_empty() {
        stmt.query_map([], mapper).map_err(|e| e.to_string())?
    } else {
        stmt.query_map(params![terms], mapper)
            .map_err(|e| e.to_string())?
    };
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn library_get(app_data_dir: &Path, id: &str) -> Result<Option<LibraryItem>, String> {
    let db_paths = init_or_migrate(app_data_dir)?;
    let conn = open_conn(db_paths.db_path).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, title, authors, year, doi, abstract, pdf_path, metadata_json
         FROM library_items WHERE id = ?1",
        params![id],
        |row| {
            Ok(LibraryItem {
                id: row.get(0)?,
                title: row.get(1)?,
                authors: row.get(2)?,
                year: row.get(3)?,
                doi: row.get(4)?,
                abstract_text: row.get(5)?,
                pdf_path: row.get(6)?,
                metadata_json: row.get(7)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn upsert_pdf_library_item(
    app_data_dir: &Path,
    id: &str,
    title: &str,
    authors: &str,
    pdf_path: &str,
    metadata: &Value,
) -> Result<(), String> {
    let db_paths = init_or_migrate(app_data_dir)?;
    let conn = open_conn(db_paths.db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO library_items
         (id, title, authors, year, doi, abstract, pdf_path, metadata_json, created_at, updated_at)
         VALUES (
           ?1,
           ?2,
           ?3,
           COALESCE((SELECT year FROM library_items WHERE id = ?1), NULL),
           COALESCE((SELECT doi FROM library_items WHERE id = ?1), ''),
           COALESCE((SELECT abstract FROM library_items WHERE id = ?1), ''),
           ?4,
           ?5,
           COALESCE((SELECT created_at FROM library_items WHERE id = ?1), datetime('now')),
           datetime('now')
         )",
        params![id, title, authors, pdf_path, stable_json(metadata)?],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn save_pdf_annotations(
    app_data_dir: &Path,
    ref_id: &str,
    annotations: &[Value],
) -> Result<(), String> {
    let db_paths = init_or_migrate(app_data_dir)?;
    let mut conn = open_conn(db_paths.db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for annotation in annotations {
        let id = annotation
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("{ref_id}:{}", now_millis()));
        let page = annotation.get("page").and_then(Value::as_i64).unwrap_or(1);
        let kind = annotation
            .get("kind")
            .and_then(Value::as_str)
            .unwrap_or("note")
            .to_string();
        tx.execute(
            "INSERT OR REPLACE INTO annotations(id, ref_id, page, type, data_json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, ref_id, page, kind, stable_json(annotation)?],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_pdf_annotations(app_data_dir: &Path, ref_id: &str) -> Result<Vec<Value>, String> {
    let db_paths = init_or_migrate(app_data_dir)?;
    let conn = open_conn(db_paths.db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT data_json FROM annotations WHERE ref_id = ?1 ORDER BY page, id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![ref_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let raw = row.map_err(|e| e.to_string())?;
        out.push(serde_json::from_str::<Value>(&raw).map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn kv_get(app_data_dir: &Path, key: &str) -> Result<Option<String>, String> {
    let db_paths = init_or_migrate(app_data_dir)?;
    let conn = open_conn(db_paths.db_path).map_err(|e| e.to_string())?;
    conn.query_row("SELECT value FROM kv WHERE key = ?1", params![key], |row| {
        row.get::<_, String>(0)
    })
    .optional()
    .map_err(|e| e.to_string())
}

pub fn kv_set(app_data_dir: &Path, key: &str, value: &str) -> Result<(), String> {
    let db_paths = init_or_migrate(app_data_dir)?;
    let conn = open_conn(db_paths.db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn integrity_check(app_data_dir: &Path) -> Result<String, String> {
    let db_paths = init_or_migrate(app_data_dir)?;
    let conn = open_conn(db_paths.db_path).map_err(|e| e.to_string())?;
    conn.query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())
}

pub fn rollback_to_legacy_json(app_data_dir: &Path) -> Result<Value, String> {
    let db_paths = paths(app_data_dir);
    let backup = latest_backup(app_data_dir)
        .ok_or_else(|| "No legacy backup found for rollback".to_string())?;
    fs::copy(&backup, &db_paths.legacy_json_path).map_err(|e| e.to_string())?;
    if db_paths.db_path.exists() {
        fs::remove_file(&db_paths.db_path).map_err(|e| e.to_string())?;
    }
    Ok(json!({
        "ok": true,
        "restoredFrom": backup.to_string_lossy(),
        "legacyPath": db_paths.legacy_json_path.to_string_lossy()
    }))
}

pub fn get_legacy_electron_dir() -> Option<PathBuf> {
    #[cfg(test)]
    let local_app_data = env::var_os("AQ_TEST_LOCALAPPDATA")?;
    #[cfg(not(test))]
    let local_app_data =
        env::var_os("AQ_TEST_LOCALAPPDATA").or_else(|| env::var_os("LOCALAPPDATA"))?;
    Some(PathBuf::from(local_app_data).join(LEGACY_ELECTRON_DIR))
}

pub fn force_remigrate_history(app_data_dir: &Path) -> Result<Value, String> {
    let db_paths = init_or_migrate(app_data_dir)?;
    let legacy_dir = legacy_dir_from_kv(&db_paths.db_path)?
        .or_else(get_legacy_electron_dir)
        .ok_or_else(|| "legacy_source_path_not_found".to_string())?;
    let (doc_count, snapshot_count) =
        force_remigrate_history_from_legacy_dir(&db_paths.db_path, &legacy_dir)?;
    Ok(json!({
        "ok": true,
        "docCount": doc_count,
        "snapshotCount": snapshot_count,
        "legacySourcePath": legacy_dir.to_string_lossy()
    }))
}

fn auto_retry_empty_history(app_data_dir: &Path, db_path: &Path) -> Result<(), String> {
    let conn = open_conn(db_path).map_err(|e| e.to_string())?;
    let documents = count_table(&conn, "documents");
    let revisions = count_table(&conn, "revisions");
    if documents <= 0 || revisions > 0 {
        return Ok(());
    }
    let Some(legacy_dir) = legacy_dir_from_kv(db_path)?.or_else(get_legacy_electron_dir) else {
        return Ok(());
    };
    if let Err(error) = force_remigrate_history_from_legacy_dir(db_path, &legacy_dir) {
        let conn = open_conn(db_path).map_err(|e| e.to_string())?;
        record_migration_error(&conn, Some(app_data_dir), &error);
    }
    Ok(())
}

fn force_remigrate_history_from_legacy_dir(
    db_path: &Path,
    legacy_dir: &Path,
) -> Result<(usize, usize), String> {
    let mut conn = open_conn(db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM revisions", [])
        .map_err(|e| e.to_string())?;
    let report = migrate_legacy_document_history(&tx, legacy_dir)?;
    upsert_kv_tx(&tx, "history_migration_completed_at", &utc_stamp())?;
    upsert_kv_tx(&tx, "history_migration_doc_count", &report.0.to_string())?;
    upsert_kv_tx(
        &tx,
        "history_migration_snapshot_count",
        &report.1.to_string(),
    )?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(report)
}

fn legacy_dir_from_kv(db_path: &Path) -> Result<Option<PathBuf>, String> {
    if !db_path.exists() {
        return Ok(None);
    }
    let conn = open_conn(db_path).map_err(|e| e.to_string())?;
    let value = conn
        .query_row(
            "SELECT value FROM kv WHERE key = 'legacy_source_path'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(value.map(PathBuf::from).filter(|path| path.exists()))
}

fn count_table(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
        row.get::<_, i64>(0)
    })
    .unwrap_or(0)
}

fn record_migration_error(conn: &Connection, app_data_dir: Option<&Path>, error: &str) {
    let current = conn
        .query_row(
            "SELECT value FROM kv WHERE key = 'migration_errors'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten()
        .unwrap_or_else(|| "[]".to_string());
    let mut errors = serde_json::from_str::<Value>(&current).unwrap_or_else(|_| json!([]));
    if let Some(list) = errors.as_array_mut() {
        list.push(json!({ "at": utc_stamp(), "error": error }));
    } else {
        errors = json!([{ "at": utc_stamp(), "error": error }]);
    }
    let _ = conn.execute(
        "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
        params![
            "migration_errors",
            serde_json::to_string(&errors).unwrap_or_else(|_| "[]".to_string())
        ],
    );
    if let Some(dir) = app_data_dir {
        let telemetry_dir = dir.join("telemetry");
        let _ = fs::create_dir_all(&telemetry_dir);
        let _ = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(telemetry_dir.join("migration-errors.jsonl"))
            .and_then(|mut file| {
                use std::io::Write;
                writeln!(file, "{}", json!({ "at": utc_stamp(), "error": error }))
            });
    }
}

fn migrate_legacy_electron_dir(
    app_data_dir: &Path,
    db_path: &Path,
    legacy_dir: &Path,
) -> Result<(), String> {
    fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    let state_path = legacy_dir.join(LEGACY_FILE);
    let state_raw = fs::read_to_string(&state_path).map_err(|e| {
        format!(
            "legacy_state_read_failed:{}:{e}",
            state_path.to_string_lossy()
        )
    })?;
    let state = parse_json(&state_raw)?;

    let mut conn = open_conn(db_path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute_batch(INIT_SQL).map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
        params![STATE_BLOB_KEY, state_raw],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
        params!["state_updated_at", utc_stamp()],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
        params!["state_source", "legacy-electron-localappdata"],
    )
    .map_err(|e| e.to_string())?;
    rebuild_projection(&tx, &state, false)?;
    migrate_legacy_state_kv(&tx, legacy_dir, &state)?;
    tx.commit().map_err(|e| e.to_string())?;

    if let Err(error) = force_remigrate_history_from_legacy_dir(db_path, legacy_dir) {
        let conn = open_conn(db_path).map_err(|e| e.to_string())?;
        record_migration_error(&conn, Some(app_data_dir), &error);
    }

    copy_legacy_assets(app_data_dir, legacy_dir)?;
    let conn = open_conn(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
        params![
            "legacy_source_path",
            legacy_dir.to_string_lossy().to_string()
        ],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
        params!["migration_completed_at", utc_stamp()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn migrate_legacy_state_kv(
    tx: &rusqlite::Transaction<'_>,
    legacy_dir: &Path,
    state: &Value,
) -> Result<(), String> {
    upsert_kv_tx(
        tx,
        "active_workspace",
        state.get("cur").and_then(Value::as_str).unwrap_or(""),
    )?;
    upsert_kv_tx(
        tx,
        "active_doc",
        state.get("curDoc").and_then(Value::as_str).unwrap_or(""),
    )?;
    if let Some(workspaces) = state.get("wss") {
        upsert_kv_tx(tx, "workspaces", &stable_json(workspaces)?)?;
    }
    if let Some(matrix) = state.get("literatureMatrix") {
        upsert_kv_tx(tx, "literature_matrix", &stable_json(matrix)?)?;
    }

    let settings_path = legacy_dir.join("settings.json");
    let mut settings = if settings_path.exists() {
        parse_json(&fs::read_to_string(&settings_path).map_err(|e| e.to_string())?)?
    } else {
        json!({})
    };
    if let Some(obj) = settings.as_object_mut() {
        for key in ["cm", "showPageNumbers", "customLabels"] {
            if let Some(value) = state.get(key) {
                obj.insert(key.to_string(), value.clone());
            }
        }
    }
    upsert_kv_tx(tx, "settings", &stable_json(&settings)?)?;

    let session_path = legacy_dir.join("session-state.json");
    if session_path.exists() {
        let session_raw = fs::read_to_string(&session_path).map_err(|e| e.to_string())?;
        parse_json(&session_raw)?;
        upsert_kv_tx(tx, "session_state", &session_raw)?;
    }
    Ok(())
}

fn migrate_legacy_document_history(
    tx: &rusqlite::Transaction<'_>,
    legacy_dir: &Path,
) -> Result<(usize, usize), String> {
    let history_path = legacy_dir.join("document-history.json");
    if !history_path.exists() {
        return Ok((0, 0));
    }
    let history_raw = fs::read_to_string(&history_path).map_err(|e| e.to_string())?;
    let history = parse_json(&history_raw)?;
    let docs = history
        .get("docs")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut doc_count = 0usize;
    let mut snapshot_count = 0usize;
    for (doc_id, doc_history) in docs {
        doc_count += 1;
        ensure_document_row(tx, &doc_id)?;
        let snapshots = doc_history
            .get("snapshots")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for snapshot in snapshots {
            snapshot_count += 1;
            let created_at = snapshot
                .get("createdAt")
                .or_else(|| snapshot.get("created_at"))
                .map(|v| {
                    v.as_str()
                        .map(str::to_string)
                        .unwrap_or_else(|| v.to_string())
                })
                .unwrap_or_else(utc_stamp);
            tx.execute(
                "INSERT INTO revisions(doc_id, snapshot_json, created_at) VALUES (?1, ?2, ?3)",
                params![doc_id, stable_json(&snapshot)?, created_at],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok((doc_count, snapshot_count))
}

fn ensure_document_row(tx: &rusqlite::Transaction<'_>, doc_id: &str) -> Result<(), String> {
    tx.execute(
        "INSERT OR IGNORE INTO documents(id, title, body_json, created_at, updated_at)
         VALUES (?1, '', '{}', datetime('now'), datetime('now'))",
        params![doc_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn copy_legacy_assets(app_data_dir: &Path, legacy_dir: &Path) -> Result<(), String> {
    copy_dir_if_exists(&legacy_dir.join("pdfs"), &app_data_dir.join("pdfs"))?;
    copy_dir_if_exists(
        &legacy_dir.join("workspaces"),
        &app_data_dir.join("workspaces"),
    )?;

    let sidecar_dir = app_data_dir.join("capture-sidecar");
    fs::create_dir_all(&sidecar_dir).map_err(|e| e.to_string())?;
    copy_file_if_exists(
        &legacy_dir.join("capture-agent-state.json"),
        &sidecar_dir.join("agent-state.json"),
    )?;
    copy_file_if_exists(
        &legacy_dir.join("capture-queue.json"),
        &sidecar_dir.join("queue.json"),
    )?;
    copy_file_if_exists(
        &legacy_dir.join("capture-targets.json"),
        &sidecar_dir.join("targets.json"),
    )?;
    Ok(())
}

fn copy_dir_if_exists(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    copy_dir_all(src, dst)
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let target = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else if ty.is_file() {
            fs::copy(entry.path(), target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn copy_file_if_exists(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(src, dst).map_err(|e| e.to_string())?;
    Ok(())
}

fn upsert_kv_tx(tx: &rusqlite::Transaction<'_>, key: &str, value: &str) -> Result<(), String> {
    tx.execute(
        "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(INIT_SQL).map_err(|e| e.to_string())?;
    let version = conn
        .query_row("SELECT max(version) FROM schema_version", [], |row| {
            row.get::<_, Option<i64>>(0)
        })
        .optional()
        .map_err(|e| e.to_string())?
        .flatten()
        .unwrap_or(0);
    if version < 1 {
        return Err("Unsupported SQLite schema version".to_string());
    }
    Ok(())
}

fn save_state_blob_tx(
    tx: &rusqlite::Transaction<'_>,
    raw: &str,
    source: &str,
) -> Result<(), String> {
    let parsed = parse_json(raw)?;
    tx.execute(
        "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
        params![STATE_BLOB_KEY, raw],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
        params!["state_updated_at", utc_stamp()],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
        params!["state_source", source],
    )
    .map_err(|e| e.to_string())?;
    rebuild_projection(tx, &parsed, true)
}

fn rebuild_projection(
    tx: &rusqlite::Transaction<'_>,
    state: &Value,
    write_initial_revisions: bool,
) -> Result<(), String> {
    for table in [
        "tabs",
        "citations",
        "bibliography_entries",
        "annotations",
        "highlights",
        "library_items",
    ] {
        tx.execute(&format!("DELETE FROM {table}"), [])
            .map_err(|e| e.to_string())?;
    }
    delete_removed_document_projection(tx, state)?;
    insert_documents(tx, state, write_initial_revisions)?;
    insert_library_items(tx, state)?;
    Ok(())
}

fn delete_removed_document_projection(
    tx: &rusqlite::Transaction<'_>,
    state: &Value,
) -> Result<(), String> {
    let docs = state
        .get("docs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let ids = docs
        .iter()
        .filter_map(|doc| doc.get("id").and_then(Value::as_str))
        .filter(|id| !id.is_empty())
        .map(|id| format!("'{}'", id.replace('\'', "''")))
        .collect::<Vec<_>>();
    if ids.is_empty() {
        return Ok(());
    }
    tx.execute(
        &format!("DELETE FROM documents WHERE id NOT IN ({})", ids.join(",")),
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn insert_documents(
    tx: &rusqlite::Transaction<'_>,
    state: &Value,
    write_initial_revisions: bool,
) -> Result<(), String> {
    let docs = state
        .get("docs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let cur_doc = state.get("curDoc").and_then(Value::as_str).unwrap_or("");
    for (idx, doc) in docs.iter().enumerate() {
        let id = doc
            .get("id")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| format!("doc-{}", idx + 1));
        let title = doc
            .get("name")
            .or_else(|| doc.get("title"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        tx.execute(
            "INSERT INTO documents(id, title, body_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, COALESCE(?4, datetime('now')), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               body_json = excluded.body_json,
               updated_at = datetime('now')",
            params![
                id,
                title,
                stable_json(doc)?,
                doc.get("createdAt").and_then(Value::as_str)
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO tabs(doc_id, position, active) VALUES (?1, ?2, ?3)",
            params![id, idx as i64, if id == cur_doc { 1 } else { 0 }],
        )
        .map_err(|e| e.to_string())?;
        if write_initial_revisions {
            insert_revision_if_changed(tx, &id, doc)?;
        }
    }
    Ok(())
}

fn insert_revision_if_changed(
    tx: &rusqlite::Transaction<'_>,
    doc_id: &str,
    doc: &Value,
) -> Result<(), String> {
    let content = doc
        .get("content")
        .or_else(|| doc.get("html"))
        .or_else(|| doc.get("body"))
        .or_else(|| doc.get("doc"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let plain = strip_html(content);
    let snapshot = json!({
        "docId": doc_id,
        "docName": doc.get("name").and_then(Value::as_str).unwrap_or(""),
        "content": content,
        "charCount": plain.chars().count(),
        "wordCount": plain.split_whitespace().filter(|part| !part.trim().is_empty()).count(),
        "excerpt": plain.chars().take(280).collect::<String>(),
        "createdAt": now_millis(),
        "source": "sqlite-save"
    });
    let raw = stable_json(&snapshot)?;
    let previous = tx
        .query_row(
            "SELECT snapshot_json FROM revisions WHERE doc_id = ?1 ORDER BY id DESC LIMIT 1",
            params![doc_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if previous.as_deref() == Some(raw.as_str()) {
        return Ok(());
    }
    tx.execute(
        "INSERT INTO revisions(doc_id, snapshot_json, created_at) VALUES (?1, ?2, datetime('now'))",
        params![doc_id, raw],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn strip_html(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut in_tag = false;
    let mut entity = String::new();
    let mut in_entity = false;
    for ch in raw.chars() {
        if in_tag {
            if ch == '>' {
                in_tag = false;
                out.push(' ');
            }
            continue;
        }
        if ch == '<' {
            in_tag = true;
            continue;
        }
        if in_entity {
            if ch == ';' {
                match entity.as_str() {
                    "nbsp" => out.push(' '),
                    "amp" => out.push('&'),
                    "lt" => out.push('<'),
                    "gt" => out.push('>'),
                    "quot" => out.push('"'),
                    "#39" | "apos" => out.push('\''),
                    _ => {}
                }
                entity.clear();
                in_entity = false;
            } else if entity.len() < 12 {
                entity.push(ch);
            } else {
                entity.clear();
                in_entity = false;
            }
            continue;
        }
        if ch == '&' {
            in_entity = true;
            entity.clear();
            continue;
        }
        out.push(ch);
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn insert_library_items(tx: &rusqlite::Transaction<'_>, state: &Value) -> Result<(), String> {
    let workspaces = state
        .get("wss")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for ws in workspaces {
        let ws_id = ws.get("id").and_then(Value::as_str).unwrap_or("");
        let items = ws
            .get("lib")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for (idx, item) in items.iter().enumerate() {
            let id = item
                .get("id")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("{ws_id}:ref-{}", idx + 1));
            let title = text_field(item, &["title", "name"]);
            let authors = authors_text(item);
            let year = year_value(item);
            let doi = text_field(item, &["doi", "DOI"]);
            let abstract_text = text_field(item, &["abstract", "summary", "description"]);
            let pdf_path = text_field(item, &["pdfPath", "pdf_path", "filePath"]);
            let mut metadata = item.clone();
            if let Some(obj) = metadata.as_object_mut() {
                obj.entry("wsId".to_string())
                    .or_insert_with(|| Value::String(ws_id.to_string()));
            }
            tx.execute(
                "INSERT OR REPLACE INTO library_items
                 (id, title, authors, year, doi, abstract, pdf_path, metadata_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), datetime('now'))",
                params![id, title, authors, year, doi, abstract_text, pdf_path, stable_json(&metadata)?],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn backup_legacy_json(path: &Path) -> Result<PathBuf, String> {
    let backup_path = path.with_file_name(format!(
        "{}.bak.{}",
        path.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(LEGACY_FILE),
        utc_stamp()
    ));
    fs::copy(path, &backup_path).map_err(|e| e.to_string())?;
    Ok(backup_path)
}

fn latest_backup(app_data_dir: &Path) -> Option<PathBuf> {
    let mut backups = fs::read_dir(app_data_dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|s| s.to_str())
                .map(|name| {
                    name.starts_with(&format!("{LEGACY_FILE}.bak."))
                        || name.starts_with("data.json.bak.")
                })
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    backups.sort();
    backups.pop()
}

fn parse_json(raw: &str) -> Result<Value, String> {
    if raw.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(raw).map_err(|e| format!("invalid_json: {e}"))
}

fn stable_json(value: &Value) -> Result<String, String> {
    serde_json::to_string(value).map_err(|e| e.to_string())
}

fn text_field(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(text) = value.get(*key).and_then(Value::as_str) {
            return text.to_string();
        }
    }
    String::new()
}

fn authors_text(value: &Value) -> String {
    if let Some(text) = value.get("authors").and_then(Value::as_str) {
        return text.to_string();
    }
    if let Some(text) = value.get("author").and_then(Value::as_str) {
        return text.to_string();
    }
    if let Some(list) = value.get("authors").and_then(Value::as_array) {
        return list
            .iter()
            .map(|item| {
                item.as_str()
                    .map(str::to_string)
                    .or_else(|| {
                        let family = item.get("family").and_then(Value::as_str).unwrap_or("");
                        let given = item.get("given").and_then(Value::as_str).unwrap_or("");
                        Some(format!("{given} {family}").trim().to_string())
                    })
                    .unwrap_or_default()
            })
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>()
            .join("; ");
    }
    String::new()
}

fn year_value(value: &Value) -> Option<i64> {
    value
        .get("year")
        .and_then(Value::as_i64)
        .or_else(|| value.get("year").and_then(Value::as_str)?.parse().ok())
        .or_else(|| value.get("issuedYear").and_then(Value::as_i64))
}

fn fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .map(|term| {
            let escaped = term.replace('"', "");
            format!("\"{escaped}\"*")
        })
        .collect::<Vec<_>>()
        .join(" AND ")
}

fn utc_stamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("academiq-sqlite-test-{name}-{}", now_millis()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn sample_state() -> String {
        json!({
            "schemaVersion": 3,
            "cur": "ws1",
            "curDoc": "doc1",
            "doc": "<p>Merhaba</p>",
            "docs": [{ "id": "doc1", "name": "Makale", "content": "<p>Merhaba</p>" }],
            "wss": [{
                "id": "ws1",
                "name": "Workspace",
                "lib": [{
                    "id": "ref1",
                    "title": "Türkçe öğrenme çalışması",
                    "authors": "İpek Şahin",
                    "year": 2025,
                    "abstract": "ğ ş ı ö akademik kelime"
                }]
            }]
        })
        .to_string()
    }

    fn large_state(count: usize) -> String {
        let refs = (0..count)
            .map(|idx| {
                json!({
                    "id": format!("ref-{idx}"),
                    "title": format!("Türkçe veri katmanı {idx}"),
                    "authors": format!("Yazar {idx}; İpek Şahin"),
                    "year": 2000 + (idx % 25) as i64,
                    "abstract": format!("FTS5 arama kelime akademik özet {idx}")
                })
            })
            .collect::<Vec<_>>();
        json!({
            "schemaVersion": 3,
            "cur": "ws1",
            "curDoc": "doc1",
            "doc": "<p>Büyük fixture</p>",
            "docs": [{ "id": "doc1", "name": "Büyük", "content": "<p>Büyük fixture</p>" }],
            "wss": [{ "id": "ws1", "name": "Workspace", "lib": refs }]
        })
        .to_string()
    }

    fn fixture_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("tests")
            .join("fixtures")
            .join("legacy-electron-data")
    }

    fn file_count_and_bytes(path: &Path) -> (usize, u64) {
        let mut count = 0;
        let mut bytes = 0;
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_dir() {
                    let nested = file_count_and_bytes(&entry_path);
                    count += nested.0;
                    bytes += nested.1;
                } else if entry_path.is_file() {
                    count += 1;
                    bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
                }
            }
        }
        (count, bytes)
    }

    #[test]
    fn clean_init_without_legacy_json_creates_schema() {
        let dir = temp_dir("empty");
        init_or_migrate(&dir).unwrap();
        assert!(dir.join(DB_FILE).exists());
        assert_eq!(load_state(&dir).unwrap(), None);
        assert_eq!(integrity_check(&dir).unwrap(), "ok");
    }

    #[test]
    fn migrates_legacy_json_and_preserves_backup() {
        let dir = temp_dir("legacy");
        fs::write(dir.join(LEGACY_FILE), sample_state()).unwrap();
        init_or_migrate(&dir).unwrap();
        assert!(dir.join(DB_FILE).exists());
        assert!(latest_backup(&dir).is_some());
        let loaded = load_state(&dir).unwrap().unwrap();
        assert_eq!(
            parse_json(&loaded).unwrap(),
            parse_json(&sample_state()).unwrap()
        );
    }

    #[test]
    fn migration_is_idempotent() {
        let dir = temp_dir("idempotent");
        fs::write(dir.join(LEGACY_FILE), sample_state()).unwrap();
        init_or_migrate(&dir).unwrap();
        let first = load_state(&dir).unwrap();
        init_or_migrate(&dir).unwrap();
        assert_eq!(first, load_state(&dir).unwrap());
    }

    #[test]
    fn interrupted_invalid_migration_preserves_backup() {
        let dir = temp_dir("interrupted");
        fs::write(dir.join(LEGACY_FILE), "{ bad json").unwrap();
        assert!(init_or_migrate(&dir).is_err());
        assert!(latest_backup(&dir).is_some());
    }

    #[test]
    fn large_fixture_roundtrips_semantically() {
        let dir = temp_dir("large");
        let state = large_state(1200);
        save_state(&dir, &state, "large-test").unwrap();
        let loaded = load_state(&dir).unwrap().unwrap();
        assert_eq!(parse_json(&loaded).unwrap(), parse_json(&state).unwrap());
        assert_eq!(library_search(&dir, "akademik").unwrap().len(), 50);
    }

    #[test]
    fn fts_finds_turkish_library_terms() {
        let dir = temp_dir("fts");
        save_state(&dir, &sample_state(), "test").unwrap();
        let hits = library_search(&dir, "Türkçe").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "ref1");
    }

    #[test]
    fn fts_searches_1000_entries_under_budget() {
        let dir = temp_dir("fts-budget");
        save_state(&dir, &large_state(1000), "perf-test").unwrap();
        let warmup = library_search(&dir, "Türkçe akademik").unwrap();
        assert!(!warmup.is_empty());
        let start = std::time::Instant::now();
        let hits = library_search(&dir, "Türkçe akademik").unwrap();
        let elapsed = start.elapsed();
        assert!(!hits.is_empty());
        assert!(
            elapsed.as_millis() < 500,
            "FTS query should stay under 500ms, got {:?}",
            elapsed
        );
    }

    #[test]
    fn rollback_restores_latest_backup_and_removes_sqlite() {
        let dir = temp_dir("rollback");
        fs::write(dir.join(LEGACY_FILE), sample_state()).unwrap();
        init_or_migrate(&dir).unwrap();
        assert!(dir.join(DB_FILE).exists());
        rollback_to_legacy_json(&dir).unwrap();
        assert!(!dir.join(DB_FILE).exists());
        assert!(dir.join(LEGACY_FILE).exists());
    }

    #[test]
    fn migration_path_hotfix_migrates_localappdata_academiq_fixture() {
        let local_root = temp_dir("localappdata");
        let legacy_dir = local_root.join(LEGACY_ELECTRON_DIR);
        copy_dir_all(&fixture_dir(), &legacy_dir).unwrap();
        let source_before = file_count_and_bytes(&legacy_dir);

        let app_dir = temp_dir("tauri-appdata");
        migrate_legacy_electron_dir(&app_dir, &app_dir.join(DB_FILE), &legacy_dir).unwrap();

        let source_after = file_count_and_bytes(&legacy_dir);
        assert_eq!(
            source_before, source_after,
            "legacy source must stay read-only"
        );
        assert!(app_dir.join("pdfs").join("ref-fixt.pdf").exists());
        assert!(app_dir
            .join("workspaces")
            .join("AcademiQ-EĞT. ARŞ-fixt")
            .join("workspace.json")
            .exists());
        assert!(app_dir
            .join("capture-sidecar")
            .join("agent-state.json")
            .exists());
        assert!(app_dir.join("capture-sidecar").join("queue.json").exists());
        assert!(app_dir
            .join("capture-sidecar")
            .join("targets.json")
            .exists());

        let conn = open_conn(app_dir.join(DB_FILE)).unwrap();
        let documents: i64 = conn
            .query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))
            .unwrap();
        let revisions: i64 = conn
            .query_row("SELECT COUNT(*) FROM revisions", [], |row| row.get(0))
            .unwrap();
        assert!(documents >= 1);
        assert_eq!(revisions, 5);

        for key in [
            STATE_BLOB_KEY,
            "settings",
            "session_state",
            "active_workspace",
            "active_doc",
            "legacy_source_path",
            "migration_completed_at",
        ] {
            let value: String = conn
                .query_row("SELECT value FROM kv WHERE key = ?1", params![key], |row| {
                    row.get(0)
                })
                .unwrap();
            assert!(!value.is_empty(), "kv.{key} must be non-empty");
        }
        let state_blob: String = conn
            .query_row(
                "SELECT value FROM kv WHERE key = ?1",
                params![STATE_BLOB_KEY],
                |row| row.get(0),
            )
            .unwrap();
        parse_json(&state_blob).unwrap();
        let source_path: String = conn
            .query_row(
                "SELECT value FROM kv WHERE key = 'legacy_source_path'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(source_path, legacy_dir.to_string_lossy().to_string());
    }

    #[test]
    fn existing_db_with_empty_revisions_auto_recovers_history() {
        let local_root = temp_dir("localappdata-history-retry");
        let legacy_dir = local_root.join(LEGACY_ELECTRON_DIR);
        copy_dir_all(&fixture_dir(), &legacy_dir).unwrap();

        let app_dir = temp_dir("tauri-history-retry");
        migrate_legacy_electron_dir(&app_dir, &app_dir.join(DB_FILE), &legacy_dir).unwrap();
        let conn = open_conn(app_dir.join(DB_FILE)).unwrap();
        conn.execute("DELETE FROM revisions", []).unwrap();
        drop(conn);

        init_or_migrate(&app_dir).unwrap();
        let conn = open_conn(app_dir.join(DB_FILE)).unwrap();
        let revisions: i64 = conn
            .query_row("SELECT COUNT(*) FROM revisions", [], |row| row.get(0))
            .unwrap();
        let doc_count: i64 = conn
            .query_row("SELECT COUNT(DISTINCT doc_id) FROM revisions", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(revisions, 5);
        assert_eq!(doc_count, 1);
    }

    #[test]
    fn force_remigrate_history_and_restore_accept_legacy_snapshot_id() {
        let local_root = temp_dir("localappdata-force-history");
        let legacy_dir = local_root.join(LEGACY_ELECTRON_DIR);
        copy_dir_all(&fixture_dir(), &legacy_dir).unwrap();

        let app_dir = temp_dir("tauri-force-history");
        migrate_legacy_electron_dir(&app_dir, &app_dir.join(DB_FILE), &legacy_dir).unwrap();
        let conn = open_conn(app_dir.join(DB_FILE)).unwrap();
        conn.execute("DELETE FROM revisions", []).unwrap();
        drop(conn);

        let report = force_remigrate_history(&app_dir).unwrap();
        assert_eq!(report.get("snapshotCount").and_then(Value::as_i64), Some(5));

        restore_document_snapshot(&app_dir, "doc-fixt", "s5").unwrap();
        let loaded = parse_json(&load_state(&app_dir).unwrap().unwrap()).unwrap();
        assert_eq!(loaded.get("doc").and_then(Value::as_str), Some("<p>v5</p>"));
        let doc_content = loaded
            .get("docs")
            .and_then(Value::as_array)
            .unwrap()
            .iter()
            .find(|doc| doc.get("id").and_then(Value::as_str) == Some("doc-fixt"))
            .and_then(|doc| doc.get("content"))
            .and_then(Value::as_str);
        assert_eq!(doc_content, Some("<p>v5</p>"));
    }

    #[test]
    fn state_blob_is_ground_truth_for_reference_persistence() {
        let dir = temp_dir("state-blob-reference");
        let state = sample_state();
        save_state(&dir, &state, "reference-test").unwrap();
        let loaded = parse_json(&load_state(&dir).unwrap().unwrap()).unwrap();
        let lib = loaded
            .get("wss")
            .and_then(Value::as_array)
            .and_then(|workspaces| workspaces.first())
            .and_then(|workspace| workspace.get("lib"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        assert_eq!(lib.len(), 1);
        assert_eq!(lib[0].get("id").and_then(Value::as_str), Some("ref1"));
    }

    #[test]
    fn load_state_recovers_references_from_legacy_when_blob_was_overwritten_empty() {
        let dir = temp_dir("state-blob-legacy-recovery");
        let legacy_dir = temp_dir("legacy-reference-source");
        fs::write(legacy_dir.join(LEGACY_FILE), sample_state()).unwrap();

        let empty_state = json!({
            "schemaVersion": 3,
            "cur": "ws1",
            "curDoc": "doc1",
            "doc": "<p></p>",
            "docs": [{ "id": "doc1", "name": "Empty", "content": "<p></p>" }],
            "wss": [{ "id": "ws1", "name": "Workspace", "lib": [] }],
            "notes": []
        })
        .to_string();
        save_state(&dir, &empty_state, "bad-overwrite").unwrap();
        let conn = open_conn(dir.join(DB_FILE)).unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
            params![
                "legacy_source_path",
                legacy_dir.to_string_lossy().to_string()
            ],
        )
        .unwrap();
        drop(conn);

        let loaded = parse_json(&load_state(&dir).unwrap().unwrap()).unwrap();
        let lib = loaded
            .get("wss")
            .and_then(Value::as_array)
            .and_then(|workspaces| workspaces.first())
            .and_then(|workspace| workspace.get("lib"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        assert_eq!(lib.len(), 1);
        assert_eq!(lib[0].get("id").and_then(Value::as_str), Some("ref1"));

        let conn = open_conn(dir.join(DB_FILE)).unwrap();
        let source: String = conn
            .query_row(
                "SELECT value FROM kv WHERE key = 'state_source'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(source, "legacy-recovery");
    }

    #[test]
    fn load_state_does_not_recover_legacy_after_explicit_empty_workspace_save() {
        let dir = temp_dir("state-blob-no-legacy-recovery-after-user-save");
        let legacy_dir = temp_dir("legacy-reference-source-after-user-save");
        fs::write(legacy_dir.join(LEGACY_FILE), sample_state()).unwrap();

        let single_empty_workspace = json!({
            "schemaVersion": 3,
            "cur": "ws1",
            "curDoc": "doc1",
            "doc": "<p>User kept one workspace</p>",
            "docs": [{ "id": "doc1", "name": "Doc", "content": "<p>User kept one workspace</p>" }],
            "wss": [{ "id": "ws1", "name": "Only Workspace", "lib": [] }],
            "notes": []
        })
        .to_string();
        save_state(&dir, &single_empty_workspace, "persistState").unwrap();
        let conn = open_conn(dir.join(DB_FILE)).unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO kv(key, value) VALUES (?1, ?2)",
            params![
                "legacy_source_path",
                legacy_dir.to_string_lossy().to_string()
            ],
        )
        .unwrap();
        drop(conn);

        let loaded = parse_json(&load_state(&dir).unwrap().unwrap()).unwrap();
        assert_eq!(
            loaded.get("wss").and_then(Value::as_array).map(Vec::len),
            Some(1)
        );
        let lib = loaded
            .get("wss")
            .and_then(Value::as_array)
            .and_then(|workspaces| workspaces.first())
            .and_then(|workspace| workspace.get("lib"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        assert!(lib.is_empty());

        let conn = open_conn(dir.join(DB_FILE)).unwrap();
        let source: String = conn
            .query_row(
                "SELECT value FROM kv WHERE key = 'state_source'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(source, "persistState");
    }

    #[test]
    fn save_state_preserves_existing_references_when_empty_library_overwrite_arrives() {
        let dir = temp_dir("state-blob-empty-library-overwrite");
        save_state(&dir, &sample_state(), "reference-test").unwrap();

        let empty_state = json!({
            "schemaVersion": 3,
            "cur": "ws1",
            "curDoc": "doc1",
            "doc": "<p>Changed editor content</p>",
            "docs": [{ "id": "doc1", "name": "Changed", "content": "<p>Changed editor content</p>" }],
            "wss": [{ "id": "ws1", "name": "Workspace", "lib": [] }],
            "notes": []
        })
        .to_string();
        save_state(&dir, &empty_state, "legacy-empty-overwrite").unwrap();

        let loaded = parse_json(&load_state(&dir).unwrap().unwrap()).unwrap();
        let lib = loaded
            .get("wss")
            .and_then(Value::as_array)
            .and_then(|workspaces| workspaces.first())
            .and_then(|workspace| workspace.get("lib"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        assert_eq!(lib.len(), 1);
        assert_eq!(lib[0].get("id").and_then(Value::as_str), Some("ref1"));
        assert_eq!(
            loaded.get("doc").and_then(Value::as_str),
            Some("<p>Changed editor content</p>")
        );
    }

    #[test]
    fn editor_autosave_merges_missing_references_instead_of_shrinking_library() {
        let dir = temp_dir("state-blob-partial-library-overwrite");
        let richer = json!({
            "schemaVersion": 3,
            "cur": "ws1",
            "curDoc": "doc1",
            "doc": "<p>Original</p>",
            "docs": [{ "id": "doc1", "name": "Doc", "content": "<p>Original</p>" }],
            "wss": [{
                "id": "ws1",
                "name": "Workspace",
                "lib": [
                    { "id": "ref1", "title": "Old Ref", "authors": ["A"], "year": "2020" },
                    { "id": "ref2", "title": "External Text Ref", "authors": ["B"], "year": "2024" }
                ]
            }],
            "notes": []
        })
        .to_string();
        save_state(&dir, &richer, "reference-import").unwrap();

        let stale_editor_save = json!({
            "schemaVersion": 3,
            "cur": "ws1",
            "curDoc": "doc1",
            "doc": "<p>Autosaved editor content</p>",
            "docs": [{ "id": "doc1", "name": "Doc", "content": "<p>Autosaved editor content</p>" }],
            "wss": [{
                "id": "ws1",
                "name": "Workspace",
                "lib": [{ "id": "ref1", "title": "Old Ref", "authors": ["A"], "year": "2020" }]
            }],
            "notes": []
        })
        .to_string();
        save_state(&dir, &stale_editor_save, "editor-autosave").unwrap();

        let loaded = parse_json(&load_state(&dir).unwrap().unwrap()).unwrap();
        let lib = loaded
            .get("wss")
            .and_then(Value::as_array)
            .and_then(|workspaces| workspaces.first())
            .and_then(|workspace| workspace.get("lib"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        assert_eq!(lib.len(), 2);
        assert!(lib
            .iter()
            .any(|reference| reference.get("id").and_then(Value::as_str) == Some("ref2")));
        assert_eq!(
            loaded.get("doc").and_then(Value::as_str),
            Some("<p>Autosaved editor content</p>")
        );
    }

    #[test]
    fn explicit_persist_state_allows_reference_deletion() {
        let dir = temp_dir("state-blob-reference-delete");
        save_state(&dir, &sample_state(), "reference-test").unwrap();

        let deleted_state = json!({
            "schemaVersion": 3,
            "cur": "ws1",
            "curDoc": "doc1",
            "doc": "<p>Reference deleted</p>",
            "docs": [{ "id": "doc1", "name": "Doc", "content": "<p>Reference deleted</p>" }],
            "wss": [{ "id": "ws1", "name": "Workspace", "lib": [] }],
            "notes": []
        })
        .to_string();
        save_state(&dir, &deleted_state, "persistState").unwrap();

        let loaded = parse_json(&load_state(&dir).unwrap().unwrap()).unwrap();
        let lib = loaded
            .get("wss")
            .and_then(Value::as_array)
            .and_then(|workspaces| workspaces.first())
            .and_then(|workspace| workspace.get("lib"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        assert!(lib.is_empty());
    }

    #[test]
    fn save_state_rejects_smaller_workspace_or_document_overwrite() {
        let dir = temp_dir("state-blob-smaller-overwrite");
        let richer = json!({
            "schemaVersion": 3,
            "cur": "ws2",
            "curDoc": "doc2",
            "doc": "<p>Doc 2</p>",
            "docs": [
                { "id": "doc1", "name": "Doc 1", "content": "<p>Doc 1</p>" },
                { "id": "doc2", "name": "Doc 2", "content": "<p>Doc 2</p>" }
            ],
            "wss": [
                { "id": "ws1", "name": "Workspace 1", "docId": "doc1", "lib": [] },
                { "id": "ws2", "name": "Workspace 2", "docId": "doc2", "lib": [] }
            ],
            "notes": []
        })
        .to_string();
        save_state(&dir, &richer, "initial-rich-state").unwrap();

        let smaller = json!({
            "schemaVersion": 3,
            "cur": "ws1",
            "curDoc": "doc1",
            "doc": "<p>Stale blank</p>",
            "docs": [{ "id": "doc1", "name": "Doc 1", "content": "<p>Stale blank</p>" }],
            "wss": [{ "id": "ws1", "name": "Workspace 1", "docId": "doc1", "lib": [] }],
            "notes": []
        })
        .to_string();
        save_state(&dir, &smaller, "stale-autosave").unwrap();

        let loaded = parse_json(&load_state(&dir).unwrap().unwrap()).unwrap();
        assert_eq!(
            loaded.get("wss").and_then(Value::as_array).map(Vec::len),
            Some(2)
        );
        assert_eq!(
            loaded.get("docs").and_then(Value::as_array).map(Vec::len),
            Some(2)
        );
        assert_eq!(loaded.get("cur").and_then(Value::as_str), Some("ws2"));
    }

    #[test]
    fn editor_autosave_merges_missing_collections_and_keeps_new_content() {
        let dir = temp_dir("state-blob-editor-partial-merge");
        let richer = json!({
            "schemaVersion": 3,
            "cur": "ws2",
            "curDoc": "doc2",
            "doc": "<p>Doc 2 original</p>",
            "docs": [
                { "id": "doc1", "name": "Doc 1", "content": "<p>Doc 1</p>" },
                { "id": "doc2", "name": "Doc 2", "content": "<p>Doc 2 original</p>" }
            ],
            "wss": [
                { "id": "ws1", "name": "Workspace 1", "docId": "doc1", "lib": [] },
                { "id": "ws2", "name": "Workspace 2", "docId": "doc2", "lib": [] }
            ],
            "notes": []
        })
        .to_string();
        save_state(&dir, &richer, "initial-rich-state").unwrap();

        let partial_editor_save = json!({
            "schemaVersion": 3,
            "cur": "ws2",
            "curDoc": "doc2",
            "doc": "<p>Doc 2 changed by autosave</p>",
            "docs": [
                { "id": "doc2", "name": "Doc 2", "content": "<p>Doc 2 changed by autosave</p>" }
            ],
            "wss": [
                { "id": "ws2", "name": "Workspace 2", "docId": "doc2", "lib": [] }
            ],
            "notes": []
        })
        .to_string();
        save_state(&dir, &partial_editor_save, "editor-autosave").unwrap();

        let loaded = parse_json(&load_state(&dir).unwrap().unwrap()).unwrap();
        assert_eq!(
            loaded.get("docs").and_then(Value::as_array).map(Vec::len),
            Some(2)
        );
        assert_eq!(
            loaded.get("wss").and_then(Value::as_array).map(Vec::len),
            Some(2)
        );
        assert_eq!(
            loaded.get("doc").and_then(Value::as_str),
            Some("<p>Doc 2 changed by autosave</p>")
        );
        let doc2 = loaded
            .get("docs")
            .and_then(Value::as_array)
            .and_then(|docs| {
                docs.iter()
                    .find(|doc| doc.get("id").and_then(Value::as_str) == Some("doc2"))
            })
            .unwrap();
        assert_eq!(
            doc2.get("content").and_then(Value::as_str),
            Some("<p>Doc 2 changed by autosave</p>")
        );

        let history = get_document_history(&dir, "doc2", 10).unwrap();
        let snapshots = history
            .get("snapshots")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        assert!(snapshots.iter().any(|snapshot| {
            snapshot.get("content").and_then(Value::as_str)
                == Some("<p>Doc 2 changed by autosave</p>")
        }));
    }

    #[test]
    fn editor_autosave_preserves_notes_and_notebooks_when_partial_payload_arrives() {
        let dir = temp_dir("state-blob-editor-partial-notes-merge");
        let richer = json!({
            "schemaVersion": 3,
            "cur": "ws2",
            "curDoc": "doc2",
            "curNb": "ws2:nb1",
            "doc": "<p>Doc 2 original</p>",
            "docs": [
                { "id": "doc1", "name": "Doc 1", "content": "<p>Doc 1</p>" },
                { "id": "doc2", "name": "Doc 2", "content": "<p>Doc 2 original</p>" }
            ],
            "wss": [
                { "id": "ws1", "name": "Workspace 1", "docId": "doc1", "lib": [] },
                { "id": "ws2", "name": "Workspace 2", "docId": "doc2", "lib": [] }
            ],
            "notebooks": [
                { "id": "ws1:nb1", "wsId": "ws1", "name": "Workspace 1 Notes" },
                { "id": "ws2:nb1", "wsId": "ws2", "name": "Workspace 2 Notes" }
            ],
            "notes": [
                { "id": "note-ws1", "wsId": "ws1", "nbId": "ws1:nb1", "txt": "Workspace 1 note" },
                { "id": "note-ws2", "wsId": "ws2", "nbId": "ws2:nb1", "txt": "Workspace 2 note" }
            ]
        })
        .to_string();
        save_state(&dir, &richer, "initial-rich-state").unwrap();

        let partial_editor_save = json!({
            "schemaVersion": 3,
            "cur": "ws2",
            "curDoc": "doc2",
            "curNb": "ws2:nb1",
            "doc": "<p>Doc 2 changed by autosave</p>",
            "docs": [
                { "id": "doc2", "name": "Doc 2", "content": "<p>Doc 2 changed by autosave</p>" }
            ],
            "wss": [
                { "id": "ws2", "name": "Workspace 2", "docId": "doc2", "lib": [] }
            ],
            "notebooks": [
                { "id": "ws2:nb1", "wsId": "ws2", "name": "Workspace 2 Notes" }
            ],
            "notes": [
                { "id": "note-ws2", "wsId": "ws2", "nbId": "ws2:nb1", "txt": "Workspace 2 note" }
            ]
        })
        .to_string();
        save_state(&dir, &partial_editor_save, "editor-autosave").unwrap();

        let loaded = parse_json(&load_state(&dir).unwrap().unwrap()).unwrap();
        assert_eq!(
            loaded.get("docs").and_then(Value::as_array).map(Vec::len),
            Some(2)
        );
        assert_eq!(
            loaded.get("wss").and_then(Value::as_array).map(Vec::len),
            Some(2)
        );
        assert_eq!(
            loaded
                .get("notebooks")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(2)
        );
        assert_eq!(
            loaded.get("notes").and_then(Value::as_array).map(Vec::len),
            Some(2)
        );
        assert!(loaded
            .get("notes")
            .and_then(Value::as_array)
            .unwrap()
            .iter()
            .any(|note| note.get("id").and_then(Value::as_str) == Some("note-ws1")));
        assert_eq!(
            loaded.get("doc").and_then(Value::as_str),
            Some("<p>Doc 2 changed by autosave</p>")
        );
    }

    #[test]
    fn explicit_persist_state_allows_document_count_shrink() {
        let dir = temp_dir("state-blob-explicit-doc-delete");
        let richer = json!({
            "schemaVersion": 3,
            "cur": "ws1",
            "curDoc": "doc1",
            "doc": "<p>Doc 1</p>",
            "docs": [
                { "id": "doc1", "name": "Doc 1", "content": "<p>Doc 1</p>" },
                { "id": "doc2", "name": "Doc 2", "content": "<p>Doc 2</p>" }
            ],
            "wss": [{ "id": "ws1", "name": "Workspace 1", "docId": "doc1", "lib": [] }],
            "notes": []
        })
        .to_string();
        save_state(&dir, &richer, "initial-rich-state").unwrap();

        let deleted = json!({
            "schemaVersion": 3,
            "cur": "ws1",
            "curDoc": "doc1",
            "doc": "<p>Doc 1</p>",
            "docs": [{ "id": "doc1", "name": "Doc 1", "content": "<p>Doc 1</p>" }],
            "wss": [{ "id": "ws1", "name": "Workspace 1", "docId": "doc1", "lib": [] }],
            "notes": []
        })
        .to_string();
        save_state(&dir, &deleted, "persistState").unwrap();

        let loaded = parse_json(&load_state(&dir).unwrap().unwrap()).unwrap();
        assert_eq!(
            loaded.get("docs").and_then(Value::as_array).map(Vec::len),
            Some(1)
        );
    }

    #[test]
    fn explicit_persist_state_allows_note_and_notebook_deletion() {
        let dir = temp_dir("state-blob-explicit-note-delete");
        let richer = json!({
            "schemaVersion": 3,
            "cur": "ws1",
            "curDoc": "doc1",
            "curNb": "ws1:nb1",
            "doc": "<p>Doc 1</p>",
            "docs": [{ "id": "doc1", "name": "Doc 1", "content": "<p>Doc 1</p>" }],
            "wss": [{ "id": "ws1", "name": "Workspace 1", "docId": "doc1", "lib": [] }],
            "notebooks": [
                { "id": "ws1:nb1", "wsId": "ws1", "name": "General" },
                { "id": "ws1:nb2", "wsId": "ws1", "name": "Deleted Notebook" }
            ],
            "notes": [
                { "id": "note-1", "wsId": "ws1", "nbId": "ws1:nb1", "txt": "Keep" },
                { "id": "note-2", "wsId": "ws1", "nbId": "ws1:nb2", "txt": "Delete" }
            ]
        })
        .to_string();
        save_state(&dir, &richer, "initial-rich-state").unwrap();

        let deleted = json!({
            "schemaVersion": 3,
            "cur": "ws1",
            "curDoc": "doc1",
            "curNb": "ws1:nb1",
            "doc": "<p>Doc 1</p>",
            "docs": [{ "id": "doc1", "name": "Doc 1", "content": "<p>Doc 1</p>" }],
            "wss": [{ "id": "ws1", "name": "Workspace 1", "docId": "doc1", "lib": [] }],
            "notebooks": [
                { "id": "ws1:nb1", "wsId": "ws1", "name": "General" }
            ],
            "notes": [
                { "id": "note-1", "wsId": "ws1", "nbId": "ws1:nb1", "txt": "Keep" }
            ]
        })
        .to_string();
        save_state(&dir, &deleted, "persistState").unwrap();

        let loaded = parse_json(&load_state(&dir).unwrap().unwrap()).unwrap();
        assert_eq!(
            loaded
                .get("notebooks")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(1)
        );
        assert_eq!(
            loaded.get("notes").and_then(Value::as_array).map(Vec::len),
            Some(1)
        );
        assert_eq!(
            loaded
                .get("notes")
                .and_then(Value::as_array)
                .and_then(|notes| notes.first())
                .and_then(|note| note.get("id"))
                .and_then(Value::as_str),
            Some("note-1")
        );
    }

    #[test]
    fn save_state_projection_preserves_existing_revisions() {
        let dir = temp_dir("projection-keeps-revisions");
        let mut state = parse_json(&sample_state()).unwrap();
        save_state(&dir, &stable_json(&state).unwrap(), "initial").unwrap();

        let db_path = get_db_path(&dir);
        let conn = open_conn(&db_path).unwrap();
        let before: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM revisions WHERE doc_id = 'doc1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(before >= 1);
        drop(conn);

        state["doc"] = Value::String("<p>changed</p>".to_string());
        if let Some(docs) = state.get_mut("docs").and_then(Value::as_array_mut) {
            if let Some(doc) = docs.first_mut().and_then(Value::as_object_mut) {
                doc.insert(
                    "content".to_string(),
                    Value::String("<p>changed</p>".to_string()),
                );
            }
        }
        save_state(&dir, &stable_json(&state).unwrap(), "autosave").unwrap();

        let conn = open_conn(&db_path).unwrap();
        let after: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM revisions WHERE doc_id = 'doc1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            after >= before,
            "revisions dropped from {before} to {after}"
        );
    }
}
