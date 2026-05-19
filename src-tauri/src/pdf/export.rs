use crate::pdf::fonts::{FontResolver, FontSource};
use printpdf::{BuiltinFont, Color, IndirectFontRef, Mm, PdfDocument, Rgb};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    io::{BufWriter, Cursor},
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    #[serde(default)]
    pub running_head: String,
    #[serde(default = "default_page_size")]
    pub page_size: String,
    #[serde(default)]
    pub margins_pt: Option<[f32; 4]>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub ok: bool,
    pub bytes: Vec<u8>,
    pub warnings: Vec<String>,
    pub font_substituted: bool,
    pub substituted_font_warning: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Layout {
    #[serde(default)]
    pages: Vec<Page>,
    #[serde(default)]
    page_width_px: f32,
    #[serde(default)]
    page_height_px: f32,
}

#[derive(Debug, Deserialize)]
struct Page {
    #[serde(default)]
    lines: Vec<Line>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Line {
    #[serde(default)]
    x: f32,
    #[serde(default)]
    y: f32,
    #[serde(default)]
    items: Vec<TextItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextItem {
    #[serde(default)]
    text: String,
    #[serde(default)]
    font: String,
    #[serde(default)]
    color: Option<String>,
}

fn default_page_size() -> String {
    "A4".to_string()
}

pub fn export_pdf_from_layout(
    layout_json: &str,
    options: ExportOptions,
) -> Result<ExportResult, String> {
    let mut layout: Layout =
        serde_json::from_str(layout_json).map_err(|e| format!("layout_json_parse_failed: {e}"))?;
    if layout.pages.is_empty() {
        layout.pages.push(Page { lines: Vec::new() });
    }
    let (page_w_pt, page_h_pt) = page_size_points(&options, &layout);
    let (doc, first_page, first_layer) = PdfDocument::new(
        "AcademiQ Research Export",
        pt_to_mm(page_w_pt),
        pt_to_mm(page_h_pt),
        "Layer 1",
    );
    let mut fonts = FontCache::default();
    let fallback = doc
        .add_builtin_font(BuiltinFont::TimesRoman)
        .map_err(|e| format!("builtin_font_failed: {e}"))?;
    let pages_len = layout.pages.len();

    for (index, page) in layout.pages.iter().enumerate() {
        let (page_ref, layer_ref) = if index == 0 {
            (first_page, first_layer)
        } else {
            doc.add_page(
                pt_to_mm(page_w_pt),
                pt_to_mm(page_h_pt),
                format!("Layer {}", index + 1),
            )
        };
        let layer = doc.get_page(page_ref).get_layer(layer_ref);
        draw_header(
            &layer,
            &fallback,
            &options,
            index + 1,
            pages_len,
            page_w_pt,
            page_h_pt,
        );
        for line in &page.lines {
            let mut cursor_x = line.x;
            for item in &line.items {
                if item.text.is_empty() {
                    continue;
                }
                let style = FontStyle::parse(&item.font);
                let font = fonts.get(&doc, &style).unwrap_or_else(|_| fallback.clone());
                if let Some((r, g, b)) = parse_hex_color(item.color.as_deref()) {
                    layer.set_fill_color(Color::Rgb(Rgb::new(r, g, b, None)));
                } else {
                    layer.set_fill_color(Color::Rgb(Rgb::new(0.0, 0.0, 0.0, None)));
                }
                layer.use_text(
                    &item.text,
                    style.size_pt,
                    pt_to_mm(px_to_pt(cursor_x)),
                    pt_to_mm(page_h_pt - px_to_pt(line.y)),
                    &font,
                );
                cursor_x += measure_approx(&item.text, style.size_pt);
            }
        }
    }

    let mut bytes = Vec::new();
    {
        let mut writer = BufWriter::new(Cursor::new(&mut bytes));
        doc.save(&mut writer)
            .map_err(|e| format!("pdf_save_failed: {e}"))?;
    }
    let font_warnings = FontResolver::take_warnings();
    let warnings = font_warnings
        .iter()
        .map(|warning| {
            format!(
                "{} substituted with {}",
                warning.requested, warning.substituted
            )
        })
        .collect::<Vec<_>>();
    Ok(ExportResult {
        ok: true,
        bytes,
        substituted_font_warning: font_warnings
            .iter()
            .find(|warning| warning.source != FontSource::System)
            .map(|warning| warning.substituted.clone()),
        font_substituted: !font_warnings.is_empty(),
        warnings,
    })
}

#[derive(Debug, Clone)]
struct FontStyle {
    family: String,
    weight: u16,
    italic: bool,
    size_pt: f32,
}

impl FontStyle {
    fn parse(raw: &str) -> Self {
        let lower = raw.to_ascii_lowercase();
        let weight = if lower.contains("bold") || lower.contains("700") {
            700
        } else {
            400
        };
        let italic = lower.contains("italic");
        let family = if lower.contains("arial") || lower.contains("helvetica") {
            "Arial"
        } else if lower.contains("calibri") {
            "Calibri"
        } else {
            "Times New Roman"
        };
        Self {
            family: family.to_string(),
            weight,
            italic,
            size_pt: parse_font_size(raw).unwrap_or(12.0),
        }
    }
}

#[derive(Default)]
struct FontCache {
    fonts: HashMap<(String, u16, bool), IndirectFontRef>,
}

impl FontCache {
    fn get(
        &mut self,
        doc: &printpdf::PdfDocumentReference,
        style: &FontStyle,
    ) -> Result<IndirectFontRef, String> {
        let key = (style.family.clone(), style.weight, style.italic);
        if let Some(font) = self.fonts.get(&key) {
            return Ok(font.clone());
        }
        let resolved = FontResolver::resolve(&style.family, style.weight, style.italic)?;
        let font = doc
            .add_external_font(Cursor::new(resolved.bytes.clone()))
            .map_err(|e| format!("external_font_failed {}: {e}", resolved.name))?;
        self.fonts.insert(key, font.clone());
        Ok(font)
    }
}

fn draw_header(
    layer: &printpdf::PdfLayerReference,
    font: &IndirectFontRef,
    options: &ExportOptions,
    page_number: usize,
    _page_count: usize,
    page_w_pt: f32,
    page_h_pt: f32,
) {
    let top = options.margins_pt.map(|m| m[0]).unwrap_or(36.0).max(18.0);
    let left = options.margins_pt.map(|m| m[3]).unwrap_or(54.0).max(18.0);
    let right = options.margins_pt.map(|m| m[1]).unwrap_or(54.0).max(18.0);
    let y = page_h_pt - (top * 0.55);
    if !options.running_head.trim().is_empty() {
        layer.use_text(
            options.running_head.trim(),
            10.0,
            pt_to_mm(left),
            pt_to_mm(y),
            font,
        );
    }
    layer.use_text(
        page_number.to_string(),
        10.0,
        pt_to_mm(page_w_pt - right),
        pt_to_mm(y),
        font,
    );
}

fn page_size_points(options: &ExportOptions, layout: &Layout) -> (f32, f32) {
    if layout.page_width_px > 0.0 && layout.page_height_px > 0.0 {
        return (
            px_to_pt(layout.page_width_px),
            px_to_pt(layout.page_height_px),
        );
    }
    match options.page_size.to_ascii_lowercase().as_str() {
        "letter" => (612.0, 792.0),
        _ => (595.276, 841.89),
    }
}

fn parse_font_size(raw: &str) -> Option<f32> {
    for token in raw.split_whitespace() {
        if let Some(px) = token.strip_suffix("px") {
            if let Ok(value) = px.parse::<f64>() {
                return Some((value * 0.75) as f32);
            }
        }
        if let Some(pt) = token.strip_suffix("pt") {
            if let Ok(value) = pt.parse::<f64>() {
                return Some(value as f32);
            }
        }
    }
    None
}

fn parse_hex_color(raw: Option<&str>) -> Option<(f32, f32, f32)> {
    let value = raw?.trim().strip_prefix('#')?;
    if value.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&value[0..2], 16).ok()? as f32 / 255.0;
    let g = u8::from_str_radix(&value[2..4], 16).ok()? as f32 / 255.0;
    let b = u8::from_str_radix(&value[4..6], 16).ok()? as f32 / 255.0;
    Some((r, g, b))
}

fn measure_approx(text: &str, size_pt: f32) -> f32 {
    text.chars().count() as f32 * size_pt * 0.5
}

fn px_to_pt(px: f32) -> f32 {
    px * 0.75
}

fn pt_to_mm(pt: f32) -> Mm {
    Mm(pt * 25.4 / 72.0)
}

pub fn export_from_value(
    layout_json: Option<String>,
    options: Value,
) -> Result<ExportResult, String> {
    let layout = layout_json
        .or_else(|| {
            options
                .get("layoutJson")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            options
                .get("layout_json")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .ok_or("layout_json_required")?;
    let export_options =
        serde_json::from_value::<ExportOptions>(options).unwrap_or(ExportOptions {
            running_head: String::new(),
            page_size: default_page_size(),
            margins_pt: None,
        });
    export_pdf_from_layout(&layout, export_options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::Document;

    fn sample_layout(pages: usize) -> String {
        let pages = (0..pages)
            .map(|page| {
                serde_json::json!({
                    "lines": [
                        {
                            "x": 96,
                            "y": 120,
                            "items": [
                                {
                                    "text": format!("AcademiQ APA sayfa {}: Türkçe ğ ş ı ö ü ç", page + 1),
                                    "font": "16px \"Times New Roman\", Times, serif",
                                    "color": "#000000"
                                }
                            ]
                        }
                    ]
                })
            })
            .collect::<Vec<_>>();
        serde_json::json!({
            "pageWidthPx": 816,
            "pageHeightPx": 1056,
            "pages": pages
        })
        .to_string()
    }

    #[test]
    fn phase5_pdf_export_writes_pages_and_embeds_font() {
        let result = export_pdf_from_layout(
            &sample_layout(5),
            ExportOptions {
                running_head: "ACADEMIQ".to_string(),
                page_size: "Letter".to_string(),
                margins_pt: Some([36.0, 54.0, 36.0, 54.0]),
            },
        )
        .unwrap();
        assert!(result.ok);
        assert!(result.bytes.len() > 2048);
        let doc = Document::load_mem(&result.bytes).unwrap();
        assert_eq!(doc.get_pages().len(), 5);
        let text = String::from_utf8_lossy(&result.bytes);
        if !result.font_substituted {
            assert!(text.contains("Times") || text.contains("NewRoman"));
        }
    }

    #[test]
    fn phase5_pdf_export_handles_apa_page_counts() {
        for pages in [25usize, 50] {
            let result = export_pdf_from_layout(
                &sample_layout(pages),
                ExportOptions {
                    running_head: "ACADEMIQ".to_string(),
                    page_size: "Letter".to_string(),
                    margins_pt: Some([36.0, 54.0, 36.0, 54.0]),
                },
            )
            .unwrap();
            assert!(result.ok);
            assert!(result.bytes.len() > 4096);
            let doc = Document::load_mem(&result.bytes).unwrap();
            assert_eq!(doc.get_pages().len(), pages);
            if pages == 50 {
                if let Ok(dir) = std::env::var("AQ_EXPORT_ARTIFACT_DIR") {
                    let dir = std::path::PathBuf::from(dir);
                    std::fs::create_dir_all(&dir).unwrap();
                    std::fs::write(dir.join("phase5-50-page-apa.pdf"), &result.bytes).unwrap();
                }
            }
        }
    }
}
