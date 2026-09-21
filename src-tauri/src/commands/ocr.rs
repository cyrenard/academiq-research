use serde_json::{json, Value};
#[cfg(target_os = "windows")]
use windows::core::HSTRING;
#[cfg(target_os = "windows")]
use windows::Globalization::Language;
#[cfg(target_os = "windows")]
use windows::Graphics::Imaging::BitmapDecoder;
#[cfg(target_os = "windows")]
use windows::Media::Ocr::OcrEngine;
#[cfg(target_os = "windows")]
use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
use base64::prelude::*;
use tauri::AppHandle;
#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(target_os = "macos")]
fn run_ocr(bytes: &[u8], lang_code: &str, app: &AppHandle) -> Result<String, String> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;

    let helper = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("binaries")
        .join("vision-ocr");
    if !helper.is_file() {
        return Err("Bundled macOS Vision OCR helper is missing".to_string());
    }

    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let mut temp = None;
    for attempt in 0..4 {
        let path = cache_dir.join(format!("vision-ocr-{}-{nonce}-{attempt}.image", std::process::id()));
        let file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&path);
        match file {
            Ok(file) => {
                temp = Some((path, file));
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    let (path, mut file) = temp.ok_or("Could not create private OCR input file")?;
    let result = (|| {
        file.write_all(bytes).map_err(|e| e.to_string())?;
        drop(file);
        let output = std::process::Command::new(&helper)
            .arg(&path)
            .arg(lang_code)
            .output()
            .map_err(|e| format!("Vision OCR helper failed to start: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "Vision OCR failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        let result: Value = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Vision OCR returned invalid JSON: {e}"))?;
        result.get("text")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .ok_or_else(|| "Vision OCR response has no text".to_string())
    })();
    let _ = std::fs::remove_file(&path);
    result
}

#[cfg(target_os = "windows")]
fn run_ocr(bytes: &[u8], lang_code: &str) -> Result<String, String> {
    let stream = InMemoryRandomAccessStream::new().map_err(|e| e.to_string())?;
    let output_stream = stream.GetOutputStreamAt(0).map_err(|e| e.to_string())?;
    
    let writer = DataWriter::CreateDataWriter(&output_stream).map_err(|e| e.to_string())?;
    writer.WriteBytes(bytes).map_err(|e| e.to_string())?;
    writer.StoreAsync().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    writer.FlushAsync().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    
    // Seek back to start
    stream.Seek(0).map_err(|e| e.to_string())?;
    
    let decoder = BitmapDecoder::CreateAsync(&stream).map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let bitmap = decoder.GetSoftwareBitmapAsync().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    
    // Normalize language code to Windows locale (e.g., "tur+eng" -> "tr" or "en")
    let target_lang = if lang_code.contains("tur") {
        "tr"
    } else if lang_code.contains("eng") {
        "en"
    } else {
        lang_code
    };
    
    let h_lang = HSTRING::from(target_lang);
    let engine = if let Ok(lang) = Language::CreateLanguage(&h_lang) {
        OcrEngine::TryCreateFromLanguage(&lang).or_else(|_| OcrEngine::TryCreateFromUserProfileLanguages()).map_err(|e| e.to_string())?
    } else {
        OcrEngine::TryCreateFromUserProfileLanguages().map_err(|e| e.to_string())?
    };
    
    let result = engine.RecognizeAsync(&bitmap).map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let text = result.Text().map_err(|e| e.to_string())?.to_string();
    Ok(text)
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn run_ocr(_bytes: &[u8], _lang_code: &str) -> Result<String, String> {
    Err("OCR is only supported on Windows".to_string())
}

#[tauri::command]
pub async fn ocr_recognize(_app: AppHandle, payload: Value) -> Result<Value, String> {
    let data_url = payload
        .get("imageDataUrl")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "imageDataUrl is missing".to_string())?;
        
    let lang = payload
        .get("lang")
        .and_then(|v| v.as_str())
        .unwrap_or("tur+eng");

    if !data_url.starts_with("data:") {
        return Ok(json!({
            "ok": false,
            "code": "OCR_INVALID_INPUT",
            "message": "Invalid image data URL"
        }));
    }

    let comma_idx = data_url
        .find(',')
        .ok_or_else(|| "Invalid data URL format".to_string())?;
        
    let base64_str = &data_url[comma_idx + 1..];
    
    let bytes = match BASE64_STANDARD.decode(base64_str) {
        Ok(b) => b,
        Err(err) => {
            return Ok(json!({
                "ok": false,
                "code": "OCR_DECODE_FAILED",
                "message": format!("Base64 decode failed: {}", err)
            }));
        }
    };

    // Run OCR in blocking thread pool
    let lang_owned = lang.to_string();
    #[cfg(target_os = "macos")]
    let app = _app;
    let text_result = tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        { run_ocr(&bytes, &lang_owned, &app) }
        #[cfg(not(target_os = "macos"))]
        { run_ocr(&bytes, &lang_owned) }
    })
    .await
    .map_err(|e| format!("Task execution failed: {}", e))?;

    match text_result {
        Ok(text) => {
            Ok(json!({
                "ok": true,
                "text": text,
                "lang": lang
            }))
        }
        Err(err) => {
            Ok(json!({
                "ok": false,
                "code": "OCR_FAILED",
                "message": format!("Native OCR failed: {}", err)
            }))
        }
    }
}
