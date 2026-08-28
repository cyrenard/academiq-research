use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::pdf::{annotations, annotations::PdfAnnotation, export};

#[tauri::command]
pub async fn export_pdf(
    app: AppHandle,
    layout_json: Option<String>,
    options: Value,
) -> Result<Value, String> {
    if options.get("pdfBase64").and_then(Value::as_str).is_some() {
        return save_base64_file(
            &app,
            &options,
            "pdfBase64",
            "academiq-document.pdf",
            "PDF Document",
            &["pdf"],
        );
    }
    let result = export::export_from_value(layout_json, options)?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_docx(app: AppHandle, options: Value) -> Result<Value, String> {
    save_base64_file(
        &app,
        &options,
        "base64",
        "academiq-document.docx",
        "Word Document",
        &["docx"],
    )
}

fn save_base64_file(
    app: &AppHandle,
    options: &Value,
    base64_field: &str,
    fallback_name: &str,
    filter_name: &str,
    extensions: &[&str],
) -> Result<Value, String> {
    let base64 = options
        .get(base64_field)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{} verisi eksik", filter_name))?;
    let bytes = general_purpose::STANDARD
        .decode(base64)
        .map_err(|e| format!("{} verisi okunamadi: {e}", filter_name))?;
    save_bytes_file(
        app,
        options,
        &bytes,
        fallback_name,
        filter_name,
        extensions,
    )
}

fn save_bytes_file(
    app: &AppHandle,
    options: &Value,
    bytes: &[u8],
    fallback_name: &str,
    filter_name: &str,
    extensions: &[&str],
) -> Result<Value, String> {
    let default_path = options
        .get("defaultPath")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(fallback_name);
    let Some(target) = app
        .dialog()
        .file()
        .set_file_name(default_path)
        .add_filter(filter_name, extensions)
        .blocking_save_file()
    else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let Some(path) = target.as_path() else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let mut path = PathBuf::from(path);
    if let Some(extension) = extensions.first() {
        if path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case(extension))
            != Some(true)
        {
            path.set_extension(extension);
        }
    }
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(json!({
        "ok": true,
        "path": path.to_string_lossy(),
        "filePath": path.to_string_lossy(),
        "bytes": bytes.len(),
        "size": bytes.len()
    }))
}

#[tauri::command]
pub async fn pdf_export_annotated(app: AppHandle, options: Value) -> Result<Value, String> {
    let payload = options.get("payload").cloned().unwrap_or_else(|| json!({}));
    let pages = payload
        .get("pages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if pages.iter().any(|page| {
        page.get("drawingDataUrl")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
    }) {
        return Ok(json!({
            "ok": false,
            "error": "native_drawing_flatten_unsupported",
            "fallback": "browser_pdf_render"
        }));
    }
    let base64 = options
        .get("pdfBase64")
        .and_then(Value::as_str)
        .ok_or_else(|| "Kaynak PDF verisi yok".to_string())?;
    let source = general_purpose::STANDARD
        .decode(base64)
        .map_err(|e| format!("Kaynak PDF verisi okunamadi: {e}"))?;
    if source.is_empty() {
        return Err("Kaynak PDF bos".to_string());
    }
    let page_bounds = annotations::page_bounds_from_bytes(&source)?;
    let items = annotation_payload_to_pdf(&pages, &page_bounds);
    let output = if items.is_empty() {
        source
    } else {
        annotations::apply_annotations_to_bytes(&source, &items)?
    };
    let mut result = save_bytes_file(
        &app,
        &options,
        &output,
        "academiq-annotated.pdf",
        "Annotated PDF",
        &["pdf"],
    )?;
    if let Value::Object(map) = &mut result {
        map.insert("annotationCount".to_string(), json!(items.len()));
    }
    Ok(result)
}

fn annotation_payload_to_pdf(
    pages: &[Value],
    page_bounds: &std::collections::BTreeMap<u32, [f32; 4]>,
) -> Vec<PdfAnnotation> {
    let mut out = Vec::new();
    for page in pages {
        let page_number = page
            .get("page")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
            .unwrap_or(1)
            .max(1);
        let bounds = page_bounds
            .get(&page_number)
            .copied()
            .unwrap_or([0.0, 0.0, 612.0, 792.0]);
        let width = (bounds[2] - bounds[0]).max(1.0);
        let height = (bounds[3] - bounds[1]).max(1.0);
        if let Some(highlights) = page.get("highlights").and_then(Value::as_array) {
            for highlight in highlights {
                let color = highlight
                    .get("color")
                    .and_then(Value::as_str)
                    .unwrap_or("#fef08a")
                    .to_string();
                if let Some(rects) = highlight.get("rects").and_then(Value::as_array) {
                    for rect in rects {
                        let x = normalized(rect.get("x"));
                        let y = normalized(rect.get("y"));
                        let w = normalized(rect.get("w")).min(1.0 - x);
                        let h = normalized(rect.get("h")).min(1.0 - y);
                        if w <= 0.0 || h <= 0.0 {
                            continue;
                        }
                        let x1 = bounds[0] + x * width;
                        let x2 = x1 + w * width;
                        let y2 = bounds[3] - y * height;
                        let y1 = y2 - h * height;
                        out.push(PdfAnnotation {
                            kind: "highlight".to_string(),
                            page: page_number,
                            rect: [x1, y1, x2, y2],
                            color: Some(color.clone()),
                            text: None,
                            author: Some("AcademiQ".to_string()),
                            created_at: None,
                        });
                    }
                }
            }
        }
        let layout_width = positive(page.get("layoutWidth")).unwrap_or(width);
        let layout_height = positive(page.get("layoutHeight")).unwrap_or(height);
        if let Some(notes) = page.get("notes").and_then(Value::as_array) {
            for note in notes {
                let text = note
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim();
                if text.is_empty() {
                    continue;
                }
                let x = positive_or_zero(note.get("x")) / layout_width;
                let y = positive_or_zero(note.get("y")) / layout_height;
                let x1 = bounds[0] + x.clamp(0.0, 1.0) * width;
                let y2 = bounds[3] - y.clamp(0.0, 1.0) * height;
                let icon_size = 22.0_f32.min(width).min(height);
                out.push(PdfAnnotation {
                    kind: "note".to_string(),
                    page: page_number,
                    rect: [
                        x1,
                        (y2 - icon_size).max(bounds[1]),
                        (x1 + icon_size).min(bounds[2]),
                        y2,
                    ],
                    color: Some("#fff8c7".to_string()),
                    text: Some(text.to_string()),
                    author: Some("AcademiQ".to_string()),
                    created_at: None,
                });
            }
        }
    }
    out
}

fn normalized(value: Option<&Value>) -> f32 {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .unwrap_or(0.0)
        .clamp(0.0, 1.0) as f32
}

fn positive(value: Option<&Value>) -> Option<f32> {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| value as f32)
}

fn positive_or_zero(value: Option<&Value>) -> f32 {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(0.0) as f32
}
