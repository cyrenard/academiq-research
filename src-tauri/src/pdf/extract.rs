use lopdf::Document;
use std::path::Path;

pub fn extract_text(path: &Path, page: u32) -> Result<String, String> {
    let doc = Document::load(path).map_err(|e| e.to_string())?;
    let page = page.max(1);
    doc.extract_text(&[page]).map_err(|e| e.to_string())
}
