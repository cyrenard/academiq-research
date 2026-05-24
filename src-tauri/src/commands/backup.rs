use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Seek, Write},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

const MANIFEST_PATH: &str = "manifest.json";

fn compact_database_if_exists(data_dir: &Path) {
    let db_path = data_dir.join("academiq.sqlite");
    if db_path.exists() {
        if let Ok(conn) = rusqlite::Connection::open(&db_path) {
            let _ = conn.execute("VACUUM", []);
        }
    }
}

#[tauri::command]
pub async fn backup_create(app: AppHandle) -> Result<Value, String> {
    let Some(target) = app
        .dialog()
        .file()
        .add_filter("AcademiQ Backup", &["aqbackup"])
        .blocking_save_file()
    else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let Some(path) = target.as_path() else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    
    // Compact SQLite database before backup
    compact_database_if_exists(&data_dir);
    
    let file = fs::File::create(path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let manifest = json!({
        "format": "academiq-tauri-backup",
        "formatVersion": 1,
        "version": app.package_info().version.to_string(),
        "source": data_dir.to_string_lossy(),
        "createdAt": chrono_like_now()
    });
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file(MANIFEST_PATH, options)
        .map_err(|e| e.to_string())?;
    zip.write_all(&serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    let mut file_count = 1_u64;
    let mut total_bytes = 0_u64;
    add_dir_to_zip(
        &mut zip,
        &data_dir,
        &data_dir,
        path,
        &mut file_count,
        &mut total_bytes,
    )?;
    zip.finish().map_err(|e| e.to_string())?;

    Ok(json!({
        "ok": true,
        "filePath": path.to_string_lossy(),
        "fileCount": file_count,
        "totalBytes": total_bytes
    }))
}

#[tauri::command]
pub async fn backup_create_auto(app: AppHandle) -> Result<Value, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backups_dir = data_dir.join("backups");
    fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;

    // Compact database first
    compact_database_if_exists(&data_dir);

    // Create the auto backup file path
    let timestamp = chrono_like_now();
    let backup_filename = format!("autobackup_{}.aqbackup", timestamp);
    let backup_path = backups_dir.join(&backup_filename);

    let file = fs::File::create(&backup_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let manifest = json!({
        "format": "academiq-tauri-backup",
        "formatVersion": 1,
        "version": app.package_info().version.to_string(),
        "source": data_dir.to_string_lossy(),
        "createdAt": timestamp
    });
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file(MANIFEST_PATH, options)
        .map_err(|e| e.to_string())?;
    zip.write_all(&serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    let mut file_count = 1_u64;
    let mut total_bytes = 0_u64;
    add_dir_to_zip(
        &mut zip,
        &data_dir,
        &data_dir,
        &backup_path,
        &mut file_count,
        &mut total_bytes,
    )?;
    zip.finish().map_err(|e| e.to_string())?;

    // Rolling rotation: Keep only the latest 3 backups
    let mut auto_backups = Vec::new();
    if let Ok(entries) = fs::read_dir(&backups_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                    if filename.starts_with("autobackup_") && filename.ends_with(".aqbackup") {
                        if let Ok(metadata) = entry.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                auto_backups.push((path, modified));
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort by modified time: oldest first
    auto_backups.sort_by(|a, b| a.1.cmp(&b.1));

    // If more than 3, delete oldest ones
    if auto_backups.len() > 3 {
        let delete_count = auto_backups.len() - 3;
        for i in 0..delete_count {
            let _ = fs::remove_file(&auto_backups[i].0);
        }
    }

    Ok(json!({
        "ok": true,
        "filePath": backup_path.to_string_lossy(),
        "fileCount": file_count,
        "totalBytes": total_bytes
    }))
}

#[tauri::command]
pub async fn backup_restore(app: AppHandle) -> Result<Value, String> {
    let Some(source) = app
        .dialog()
        .file()
        .add_filter("AcademiQ Backup", &["aqbackup"])
        .blocking_pick_file()
    else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let Some(path) = source.as_path() else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    validate_manifest(&mut archive)?;

    let restore_backup_dir = data_dir.with_file_name(format!(
        "{}.pre-restore.{}",
        data_dir
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("academiq-data"),
        chrono_like_now()
    ));
    if data_dir.exists() {
        if restore_backup_dir.exists() {
            fs::remove_dir_all(&restore_backup_dir).map_err(|e| e.to_string())?;
        }
        fs::rename(&data_dir, &restore_backup_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let result = extract_archive(&mut archive, &data_dir);
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&data_dir);
        if restore_backup_dir.exists() {
            let _ = fs::rename(&restore_backup_dir, &data_dir);
        }
        return Ok(json!({ "ok": false, "error": error }));
    }

    Ok(json!({
        "ok": true,
        "filePath": path.to_string_lossy(),
        "restored": true,
        "preRestoreBackup": restore_backup_dir.to_string_lossy()
    }))
}

fn add_dir_to_zip<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    root: &Path,
    dir: &Path,
    target_backup_path: &Path,
    file_count: &mut u64,
    total_bytes: &mut u64,
) -> Result<(), String> {
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if same_path(&path, target_backup_path) {
            continue;
        }
        // Exclude the "backups" directory to prevent infinite recursion/nesting
        if path.is_dir() && path.file_name().and_then(|n| n.to_str()) == Some("backups") {
            continue;
        }
        let rel = path
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if path.is_dir() {
            add_dir_to_zip(
                zip,
                root,
                &path,
                target_backup_path,
                file_count,
                total_bytes,
            )?;
            continue;
        }
        if !path.is_file() {
            continue;
        }
        zip.start_file(format!("data/{rel}"), options)
            .map_err(|e| e.to_string())?;
        let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
        let bytes = std::io::copy(&mut file, zip).map_err(|e| e.to_string())?;
        *file_count += 1;
        *total_bytes += bytes;
    }
    Ok(())
}

fn validate_manifest<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Result<(), String> {
    let mut file = archive
        .by_name(MANIFEST_PATH)
        .map_err(|_| "Backup manifest bulunamadi".to_string())?;
    let mut raw = String::new();
    file.read_to_string(&mut raw).map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if value.get("format").and_then(Value::as_str) != Some("academiq-tauri-backup") {
        return Err("Gecersiz AcademiQ backup dosyasi".into());
    }
    Ok(())
}

fn extract_archive<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    data_dir: &Path,
) -> Result<(), String> {
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|e| e.to_string())?;
        let name = file.name().replace('\\', "/");
        if name == MANIFEST_PATH || file.is_dir() {
            continue;
        }
        let Some(rel) = name.strip_prefix("data/") else {
            continue;
        };
        if rel.contains("..") {
            return Err("Backup icinde guvensiz yol var".into());
        }
        let out_path = safe_join(data_dir, rel)?;
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = fs::File::create(&out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut file, &mut out).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let mut out = root.to_path_buf();
    for part in rel.split('/') {
        if part.is_empty() || part == "." || part == ".." {
            return Err("Backup icinde guvensiz yol var".into());
        }
        out.push(part);
    }
    Ok(out)
}

fn same_path(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

fn chrono_like_now() -> String {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => duration.as_secs().to_string(),
        Err(_) => "0".into(),
    }
}
