pub mod annotations;
pub mod export;
pub mod extract;
pub mod fonts;
pub mod metadata;
pub mod pdfium_init;
pub mod render;
pub mod url_fallback;

#[cfg(test)]
mod tests {
    use super::{annotations, extract, metadata, render};
    use crate::db::migrate;
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;
    use std::time::Instant;

    fn fixture_dir() -> Option<PathBuf> {
        std::env::var("AQ_PDF_FIXTURE_DIR").ok().map(PathBuf::from)
    }

    fn temp_app_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("academiq-phase3-{name}-{}", now_ms()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn now_ms() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    }

    #[test]
    fn phase3_pdf_metadata_extracts_basic_fields() {
        let Some(dir) = fixture_dir() else { return };
        let meta = metadata::extract_metadata(&dir.join("sample.pdf")).unwrap();
        assert_eq!(meta.title, "AcademiQ Phase 3 Fixture");
        assert_eq!(meta.author, "AcademiQ");
        assert_eq!(meta.page_count, 1);
    }

    #[test]
    fn phase3_pdf_annotation_roundtrip_and_db_sync() {
        let Some(dir) = fixture_dir() else { return };
        let app_dir = temp_app_dir("annotations");
        let pdf = app_dir.join("annotated.pdf");
        fs::copy(dir.join("sample.pdf"), &pdf).unwrap();
        let items = vec![annotations::PdfAnnotation {
            kind: "highlight".to_string(),
            page: 1,
            rect: [72.0, 650.0, 240.0, 670.0],
            color: Some("#fff176".to_string()),
            text: Some("Phase 3 highlight".to_string()),
            author: Some("AcademiQ".to_string()),
            created_at: Some("2026-05-17".to_string()),
        }];
        annotations::apply_annotations(&pdf, &items).unwrap();
        let read = annotations::read_annotations(&pdf).unwrap();
        assert!(read.iter().any(|item| item.kind == "highlight"));
        let values = items
            .iter()
            .map(|item| serde_json::to_value(item).unwrap())
            .collect::<Vec<_>>();
        migrate::save_pdf_annotations(&app_dir, "ref-sample", &values).unwrap();
        assert_eq!(
            migrate::read_pdf_annotations(&app_dir, "ref-sample")
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn phase3_pdf_render_page_returns_png() {
        let Some(dir) = fixture_dir() else { return };
        let app_dir = temp_app_dir("render");
        let png = render::render_page_png(&app_dir, None, &dir.join("sample.pdf"), 1, 150).unwrap();
        assert!(png.len() > 1024);
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    }

    #[test]
    fn phase3_pdf_text_extraction_finds_known_string() {
        let Some(dir) = fixture_dir() else { return };
        let text = extract::extract_text(&dir.join("sample.pdf"), 1).unwrap();
        assert!(text.contains("AcademiQ Phase 3 Text"), "{text}");
    }

    #[test]
    fn phase3_pdf_ingest_updates_library_items_projection() {
        let Some(dir) = fixture_dir() else { return };
        let app_dir = temp_app_dir("ingest");
        let pdf = dir.join("sample.pdf");
        let meta = metadata::extract_metadata(&pdf).unwrap();
        migrate::upsert_pdf_library_item(
            &app_dir,
            "ref-ingest",
            &meta.title,
            &meta.author,
            &pdf.to_string_lossy(),
            &json!(meta),
        )
        .unwrap();
        let item = migrate::library_get(&app_dir, "ref-ingest")
            .unwrap()
            .unwrap();
        assert_eq!(item.title, "AcademiQ Phase 3 Fixture");
        assert!(item.pdf_path.ends_with("sample.pdf"));
    }

    #[test]
    fn phase3_pdf_perf_budget_large_annotation_and_render() {
        let Some(dir) = fixture_dir() else { return };
        let app_dir = temp_app_dir("perf");
        let pdf = app_dir.join("large.pdf");
        fs::copy(dir.join("large.pdf"), &pdf).unwrap();
        let annotations = (1..=100)
            .map(|page| annotations::PdfAnnotation {
                kind: "highlight".to_string(),
                page,
                rect: [40.0, 700.0, 180.0, 720.0],
                color: Some("#fff176".to_string()),
                text: Some(format!("Highlight {page}")),
                author: Some("AcademiQ".to_string()),
                created_at: Some("2026-05-17".to_string()),
            })
            .collect::<Vec<_>>();
        let annotate_start = Instant::now();
        annotations::apply_annotations(&pdf, &annotations).unwrap();
        assert!(annotate_start.elapsed().as_secs_f32() < 2.0);

        let warm_png = render::render_page_png(&app_dir, None, &pdf, 1, 150).unwrap();
        assert_eq!(&warm_png[..8], b"\x89PNG\r\n\x1a\n");
        let render_start = Instant::now();
        let png = render::render_page_png(&app_dir, None, &pdf, 2, 150).unwrap();
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
        let render_limit_ms = if cfg!(debug_assertions) { 2_000 } else { 500 };
        assert!(render_start.elapsed().as_millis() < render_limit_ms);
    }
}
