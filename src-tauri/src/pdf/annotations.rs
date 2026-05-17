use lopdf::{dictionary, Dictionary, Document, Object, StringFormat};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfAnnotation {
    pub kind: String,
    pub page: u32,
    pub rect: [f32; 4],
    pub color: Option<String>,
    pub text: Option<String>,
    pub author: Option<String>,
    pub created_at: Option<String>,
}

pub fn apply_annotations(path: &Path, annotations: &[PdfAnnotation]) -> Result<(), String> {
    let mut doc = Document::load(path).map_err(|e| e.to_string())?;
    for annotation in annotations {
        add_annotation(&mut doc, annotation)?;
    }
    doc.save(path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_annotations(path: &Path) -> Result<Vec<PdfAnnotation>, String> {
    let doc = Document::load(path).map_err(|e| e.to_string())?;
    let pages = doc.get_pages();
    let mut out = Vec::new();
    for (page_num, page_id) in pages {
        let page = doc
            .get_object(page_id)
            .map_err(|e| e.to_string())?
            .as_dict()
            .map_err(|e| e.to_string())?;
        let Ok(annots) = page.get(b"Annots").and_then(Object::as_array) else {
            continue;
        };
        for annot_ref in annots {
            let Ok(id) = annot_ref.as_reference() else {
                continue;
            };
            let Ok(dict) = doc.get_object(id).and_then(Object::as_dict) else {
                continue;
            };
            let subtype = dict
                .get(b"Subtype")
                .and_then(Object::as_name_str)
                .unwrap_or("Text");
            let kind = match subtype {
                "Highlight" => "highlight",
                "Link" => "link",
                _ => "note",
            };
            out.push(PdfAnnotation {
                kind: kind.to_string(),
                page: page_num,
                rect: rect_from_dict(dict),
                color: Some("#fff176".to_string()),
                text: dict.get(b"Contents").ok().and_then(pdf_string),
                author: dict.get(b"T").ok().and_then(pdf_string),
                created_at: dict.get(b"M").ok().and_then(pdf_string),
            });
        }
    }
    Ok(out)
}

fn add_annotation(doc: &mut Document, annotation: &PdfAnnotation) -> Result<(), String> {
    let pages = doc.get_pages();
    let page_id = *pages
        .get(&annotation.page.max(1))
        .ok_or_else(|| "annotation_page_not_found".to_string())?;
    let subtype = match annotation.kind.as_str() {
        "highlight" => "Highlight",
        "link" => "Link",
        _ => "Text",
    };
    let mut dict = dictionary! {
        "Type" => "Annot",
        "Subtype" => subtype,
        "Rect" => rect_object(annotation.rect),
        "Contents" => Object::String(annotation.text.clone().unwrap_or_default().into_bytes(), StringFormat::Literal),
        "T" => Object::String(annotation.author.clone().unwrap_or_else(|| "AcademiQ".to_string()).into_bytes(), StringFormat::Literal),
        "M" => Object::String(annotation.created_at.clone().unwrap_or_default().into_bytes(), StringFormat::Literal),
    };
    if subtype == "Highlight" {
        dict.set(
            "C",
            color_object(annotation.color.as_deref().unwrap_or("#fff176")),
        );
        dict.set("QuadPoints", quad_points(annotation.rect));
    }
    if subtype == "Link" {
        dict.set("Border", Object::Array(vec![0.into(), 0.into(), 0.into()]));
    }
    let annot_id = doc.add_object(Object::Dictionary(dict));
    let page = doc
        .get_object_mut(page_id)
        .map_err(|e| e.to_string())?
        .as_dict_mut()
        .map_err(|e| e.to_string())?;
    match page.get_mut(b"Annots") {
        Ok(obj) => obj
            .as_array_mut()
            .map_err(|e| e.to_string())?
            .push(Object::Reference(annot_id)),
        Err(_) => {
            page.set("Annots", Object::Array(vec![Object::Reference(annot_id)]));
        }
    }
    Ok(())
}

fn rect_object(rect: [f32; 4]) -> Object {
    Object::Array(rect.into_iter().map(Object::Real).collect())
}

fn quad_points(rect: [f32; 4]) -> Object {
    let [x1, y1, x2, y2] = rect;
    Object::Array(
        [x1, y2, x2, y2, x1, y1, x2, y1]
            .into_iter()
            .map(Object::Real)
            .collect(),
    )
}

fn color_object(color: &str) -> Object {
    let hex = color.trim().trim_start_matches('#');
    if hex.len() == 6 {
        let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(255) as f32 / 255.0;
        let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(241) as f32 / 255.0;
        let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(118) as f32 / 255.0;
        return Object::Array(vec![Object::Real(r), Object::Real(g), Object::Real(b)]);
    }
    Object::Array(vec![
        Object::Real(1.0),
        Object::Real(0.95),
        Object::Real(0.46),
    ])
}

fn rect_from_dict(dict: &Dictionary) -> [f32; 4] {
    let mut rect = [0.0_f32; 4];
    if let Ok(values) = dict.get(b"Rect").and_then(Object::as_array) {
        for (idx, value) in values.iter().take(4).enumerate() {
            rect[idx] = value.as_float().unwrap_or(0.0);
        }
    }
    rect
}

fn pdf_string(obj: &Object) -> Option<String> {
    obj.as_string().ok().map(|s| s.into_owned())
}
