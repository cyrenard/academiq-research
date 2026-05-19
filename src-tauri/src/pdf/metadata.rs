use lopdf::{Document, Object};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfMetadata {
    pub title: String,
    pub author: String,
    pub page_count: usize,
    pub outline_count: usize,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineItem {
    pub title: String,
    pub page: Option<u32>,
    pub level: u32,
}

pub fn extract_metadata(path: &Path) -> Result<PdfMetadata, String> {
    let doc = Document::load(path).map_err(|e| e.to_string())?;
    let info = doc
        .trailer
        .get(b"Info")
        .ok()
        .and_then(|obj| resolve_dict(&doc, obj));
    let title = info
        .as_ref()
        .and_then(|dict| dict.get(b"Title").ok())
        .and_then(pdf_string)
        .unwrap_or_default();
    let author = info
        .as_ref()
        .and_then(|dict| dict.get(b"Author").ok())
        .and_then(pdf_string)
        .unwrap_or_default();
    let outline_count = get_outline(path).unwrap_or_default().len();
    Ok(PdfMetadata {
        title,
        author,
        page_count: doc.get_pages().len(),
        outline_count,
    })
}

pub fn get_outline(path: &Path) -> Result<Vec<OutlineItem>, String> {
    let doc = Document::load(path).map_err(|e| e.to_string())?;
    let catalog = doc.catalog().map_err(|e| e.to_string())?;
    let outlines = catalog
        .get(b"Outlines")
        .ok()
        .and_then(|obj| resolve_dict(&doc, obj));
    let first = outlines.and_then(|dict| dict.get(b"First").ok()).cloned();
    let Some(first) = first else {
        return Ok(Vec::new());
    };

    let mut items = Vec::new();
    collect_outline_items(&doc, first, 0, &mut items);
    Ok(items)
}

fn collect_outline_items(doc: &Document, start: Object, level: u32, items: &mut Vec<OutlineItem>) {
    let mut current = Some(start);
    while let Some(obj) = current {
        let Some(dict) = resolve_dict(doc, &obj) else {
            break;
        };
        let title = dict
            .get(b"Title")
            .ok()
            .and_then(pdf_string)
            .unwrap_or_default();
        if !title.is_empty() {
            items.push(OutlineItem {
                title,
                page: None,
                level,
            });
        }
        if let Ok(first) = dict.get(b"First") {
            collect_outline_items(doc, first.clone(), level + 1, items);
        }
        current = dict.get(b"Next").ok().cloned();
    }
}

fn resolve_dict<'a>(doc: &'a Document, obj: &'a Object) -> Option<&'a lopdf::Dictionary> {
    match obj {
        Object::Dictionary(dict) => Some(dict),
        Object::Reference(id) => doc.get_object(*id).ok()?.as_dict().ok(),
        _ => None,
    }
}

fn pdf_string(obj: &Object) -> Option<String> {
    let bytes = obj.as_str().ok()?;
    if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        let units = bytes[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_be_bytes([pair[0], pair[1]]))
            .collect::<Vec<_>>();
        return String::from_utf16(&units).ok();
    }
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let units = bytes[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect::<Vec<_>>();
        return String::from_utf16(&units).ok();
    }
    obj.as_string().ok().map(|s| s.into_owned())
}
