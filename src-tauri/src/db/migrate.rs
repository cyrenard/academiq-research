use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const INIT_SQL: &str = include_str!("../../migrations/0001_init.sql");
const DB_FILE: &str = "academiq.sqlite";
const LEGACY_FILE: &str = "academiq-data.json";
const LEGACY_ALT_FILE: &str = "data.json";
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
        let conn = Connection::open(&db_paths.db_path).map_err(|e| e.to_string())?;
        ensure_schema(&conn)?;
        return Ok(db_paths);
    }

    let mut conn = Connection::open(&db_paths.db_path).map_err(|e| e.to_string())?;
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
    let conn = Connection::open(db_paths.db_path).map_err(|e| e.to_string())?;
    let value = conn
        .query_row(
            "SELECT value FROM kv WHERE key = ?1",
            params![STATE_BLOB_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(value)
}

pub fn save_state(app_data_dir: &Path, raw: &str, source: &str) -> Result<Value, String> {
    if raw.as_bytes().len() > MAX_DATA_JSON_BYTES {
        return Err("Veri boyutu sınırı aşıldı".to_string());
    }
    parse_json(raw)?;
    let db_paths = init_or_migrate(app_data_dir)?;
    let mut conn = Connection::open(db_paths.db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    save_state_blob_tx(&tx, raw, source)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "savedAt": now_millis(), "storage": "sqlite" }))
}

pub fn save_draft(app_data_dir: &Path, raw: &str) -> Result<Value, String> {
    if raw.as_bytes().len() > MAX_DATA_JSON_BYTES {
        return Err("Draft boyutu sınırı aşıldı".to_string());
    }
    parse_json(raw)?;
    let db_paths = init_or_migrate(app_data_dir)?;
    let conn = Connection::open(db_paths.db_path).map_err(|e| e.to_string())?;
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
    let conn = Connection::open(db_paths.db_path).map_err(|e| e.to_string())?;
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
    let mut conn = Connection::open(db_paths.db_path).map_err(|e| e.to_string())?;
    let snapshot_json = conn
        .query_row(
            "SELECT snapshot_json FROM revisions WHERE doc_id = ?1 AND id = ?2",
            params![doc_id, snapshot_id.parse::<i64>().unwrap_or(-1)],
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
    let conn = Connection::open(db_paths.db_path).map_err(|e| e.to_string())?;
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
    let conn = Connection::open(db_paths.db_path).map_err(|e| e.to_string())?;
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
    let conn = Connection::open(db_paths.db_path).map_err(|e| e.to_string())?;
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
    let mut conn = Connection::open(db_paths.db_path).map_err(|e| e.to_string())?;
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
    let conn = Connection::open(db_paths.db_path).map_err(|e| e.to_string())?;
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

pub fn integrity_check(app_data_dir: &Path) -> Result<String, String> {
    let db_paths = init_or_migrate(app_data_dir)?;
    let conn = Connection::open(db_paths.db_path).map_err(|e| e.to_string())?;
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
    rebuild_projection(tx, &parsed)
}

fn rebuild_projection(tx: &rusqlite::Transaction<'_>, state: &Value) -> Result<(), String> {
    for table in [
        "tabs",
        "citations",
        "bibliography_entries",
        "annotations",
        "highlights",
        "library_items",
        "documents",
    ] {
        tx.execute(&format!("DELETE FROM {table}"), [])
            .map_err(|e| e.to_string())?;
    }
    insert_documents(tx, state)?;
    insert_library_items(tx, state)?;
    Ok(())
}

fn insert_documents(tx: &rusqlite::Transaction<'_>, state: &Value) -> Result<(), String> {
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
            "INSERT OR REPLACE INTO documents(id, title, body_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, COALESCE(?4, datetime('now')), datetime('now'))",
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
        insert_revision_if_changed(tx, &id, doc)?;
    }
    Ok(())
}

fn insert_revision_if_changed(
    tx: &rusqlite::Transaction<'_>,
    doc_id: &str,
    doc: &Value,
) -> Result<(), String> {
    let snapshot = json!({
        "docId": doc_id,
        "docName": doc.get("name").and_then(Value::as_str).unwrap_or(""),
        "content": doc.get("content").and_then(Value::as_str).unwrap_or(""),
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
        let start = std::time::Instant::now();
        let hits = library_search(&dir, "Türkçe akademik").unwrap();
        let elapsed = start.elapsed();
        assert!(!hits.is_empty());
        assert!(
            elapsed.as_millis() < 50,
            "FTS query should stay under 50ms, got {:?}",
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
}
