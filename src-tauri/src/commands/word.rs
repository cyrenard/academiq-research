use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};

#[tauri::command]
pub async fn word_to_html(file_path: String) -> Result<Value, String> {
    if file_path.trim().is_empty() {
        return Ok(json!({ "ok": false, "error": "No file path" }));
    }
    let bytes = tokio::fs::read(&file_path)
        .await
        .map_err(|e| format!("word_read_failed: {e}"))?;
    if bytes.len() > 120 * 1024 * 1024 {
        return Ok(
            json!({ "ok": false, "error": "DOCX file is too large", "filePath": file_path }),
        );
    }
    Ok(json!({
        "ok": true,
        "base64": general_purpose::STANDARD.encode(bytes),
        "filePath": file_path
    }))
}

#[tauri::command]
pub async fn read_file_text(path: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("No file path".to_string());
    }
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read_file_text_failed: {e}"))
}

#[tauri::command]
pub async fn read_file_base64(path: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("No file path".to_string());
    }
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("read_file_base64_failed: {e}"))?;
    Ok(general_purpose::STANDARD.encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;

    #[test]
    fn test_read_file_text_ok() {
        let mut temp_path = env::temp_dir();
        temp_path.push(format!("test_read_file_text_{}.txt", std::process::id()));
        
        fs::write(&temp_path, "Hello Rust Text! ğ ş ı ö ü ç").unwrap();
        
        let path_str = temp_path.to_string_lossy().to_string();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let content = rt.block_on(read_file_text(path_str.clone())).unwrap();
        assert!(content.contains("Hello Rust Text!"));
        assert!(content.contains("ğ ş ı ö ü ç"));
        
        let _ = fs::remove_file(&temp_path);
    }

    #[test]
    fn test_read_file_text_empty_path() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let err = rt.block_on(read_file_text(String::new())).unwrap_err();
        assert_eq!(err, "No file path");
    }

    #[test]
    fn test_read_file_base64_ok() {
        let mut temp_path = env::temp_dir();
        temp_path.push(format!("test_read_file_b64_{}.bin", std::process::id()));
        
        fs::write(&temp_path, b"Hello Base64!").unwrap();
        
        let path_str = temp_path.to_string_lossy().to_string();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let b64 = rt.block_on(read_file_base64(path_str.clone())).unwrap();
        assert_eq!(b64, "SGVsbG8gQmFzZTY0IQ==");
        
        let _ = fs::remove_file(&temp_path);
    }
}

