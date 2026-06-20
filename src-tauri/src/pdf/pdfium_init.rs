use pdfium_render::prelude::*;
use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
pub const PDFIUM_LIBRARY_NAME: &str = "pdfium.dll";
#[cfg(target_os = "linux")]
pub const PDFIUM_LIBRARY_NAME: &str = "libpdfium.so";
#[cfg(target_os = "macos")]
pub const PDFIUM_LIBRARY_NAME: &str = "libpdfium.dylib";
#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
pub const PDFIUM_LIBRARY_NAME: &str = "pdfium";

pub fn resolve_pdfium_dll(app_data_dir: &Path) -> PathBuf {
    let candidates = [
        PathBuf::from("src-tauri/binaries").join(PDFIUM_LIBRARY_NAME),
        PathBuf::from("binaries").join(PDFIUM_LIBRARY_NAME),
        app_data_dir.join(PDFIUM_LIBRARY_NAME),
    ];
    candidates
        .into_iter()
        .find(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from(PDFIUM_LIBRARY_NAME))
}

pub fn load_pdfium(app_data_dir: &Path) -> Result<Pdfium, String> {
    let library = resolve_pdfium_dll(app_data_dir);
    let bindings = Pdfium::bind_to_library(&library)
        .or_else(|_| Pdfium::bind_to_system_library())
        .map_err(|e| format!("pdfium_load_failed: {e}"))?;
    Ok(Pdfium::new(bindings))
}

#[cfg(test)]
mod tests {
    use super::{resolve_pdfium_dll, PDFIUM_LIBRARY_NAME};

    #[test]
    fn resolves_platform_pdfium_library_name() {
        let path = resolve_pdfium_dll(std::path::Path::new("missing-app-data-dir"));
        assert_eq!(
            path.file_name().and_then(|value| value.to_str()),
            Some(PDFIUM_LIBRARY_NAME)
        );
    }
}
