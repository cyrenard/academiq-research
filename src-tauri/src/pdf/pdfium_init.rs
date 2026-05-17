use pdfium_render::prelude::*;
use std::path::{Path, PathBuf};

pub fn resolve_pdfium_dll(app_data_dir: &Path) -> PathBuf {
    let candidates = [
        PathBuf::from("src-tauri/binaries/pdfium.dll"),
        PathBuf::from("binaries/pdfium.dll"),
        app_data_dir.join("pdfium.dll"),
    ];
    candidates
        .into_iter()
        .find(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from("pdfium.dll"))
}

pub fn load_pdfium(app_data_dir: &Path) -> Result<Pdfium, String> {
    let dll = resolve_pdfium_dll(app_data_dir);
    let bindings = Pdfium::bind_to_library(&dll)
        .or_else(|_| Pdfium::bind_to_system_library())
        .map_err(|e| format!("pdfium_load_failed: {e}"))?;
    Ok(Pdfium::new(bindings))
}
