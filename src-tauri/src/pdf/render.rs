use image::ImageFormat;
use pdfium_render::prelude::*;
use std::io::Cursor;
use std::path::Path;

use super::pdfium_init;

pub fn render_page_png(
    app_data_dir: &Path,
    resource_dir: Option<&Path>,
    pdf_path: &Path,
    page: u32,
    dpi: u32,
) -> Result<Vec<u8>, String> {
    let pdfium = pdfium_init::load_pdfium(app_data_dir, resource_dir)?;
    let document = pdfium
        .load_pdf_from_file(pdf_path, None)
        .map_err(|e| e.to_string())?;
    let page_index = page.saturating_sub(1) as u16;
    let page = document
        .pages()
        .get(page_index)
        .map_err(|e| e.to_string())?;
    let scale = (dpi.max(72).min(300) as f32) / 72.0;
    let width = (page.width().value * scale).round().max(1.0) as i32;
    let bitmap = page
        .render_with_config(&PdfRenderConfig::new().set_target_width(width))
        .map_err(|e| e.to_string())?;
    let image = bitmap.as_image();
    let mut out = Cursor::new(Vec::new());
    image
        .write_to(&mut out, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(out.into_inner())
}
