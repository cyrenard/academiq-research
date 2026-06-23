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

pub fn resolve_pdfium_dll(app_data_dir: &Path, resource_dir: Option<&Path>) -> PathBuf {
    let mut candidates = Vec::new();
    if let Some(dir) = resource_dir {
        candidates.push(dir.join("binaries").join(PDFIUM_LIBRARY_NAME));
        candidates.push(dir.join(PDFIUM_LIBRARY_NAME));
    }
    candidates.extend([
        app_data_dir.join(PDFIUM_LIBRARY_NAME),
        PathBuf::from("binaries").join(PDFIUM_LIBRARY_NAME),
        PathBuf::from("src-tauri/binaries").join(PDFIUM_LIBRARY_NAME),
    ]);
    candidates
        .into_iter()
        .find(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from(PDFIUM_LIBRARY_NAME))
}

pub fn load_pdfium(app_data_dir: &Path, resource_dir: Option<&Path>) -> Result<Pdfium, String> {
    let library = resolve_pdfium_dll(app_data_dir, resource_dir);
    let bindings = Pdfium::bind_to_library(&library)
        .or_else(|_| Pdfium::bind_to_system_library())
        .map_err(|e| format!("pdfium_load_failed: {e}"))?;
    Ok(Pdfium::new(bindings))
}

#[cfg(test)]
mod tests {
    use super::{resolve_pdfium_dll, PDFIUM_LIBRARY_NAME};
    use std::fs;

    #[test]
    fn resolves_platform_pdfium_library_name() {
        let path = resolve_pdfium_dll(std::path::Path::new("missing-app-data-dir"), None);
        assert_eq!(
            path.file_name().and_then(|value| value.to_str()),
            Some(PDFIUM_LIBRARY_NAME)
        );
    }

    #[test]
    fn resolves_packaged_resource_pdfium_first() {
        let base = std::env::temp_dir().join(format!(
            "academiq-pdfium-resource-test-{}",
            std::process::id()
        ));
        let resource_dir = base.join("resources");
        let app_dir = base.join("app-data");
        fs::create_dir_all(resource_dir.join("binaries")).unwrap();
        fs::create_dir_all(&app_dir).unwrap();
        fs::write(resource_dir.join("binaries").join(PDFIUM_LIBRARY_NAME), b"stub").unwrap();
        fs::write(app_dir.join(PDFIUM_LIBRARY_NAME), b"old").unwrap();
        let path = resolve_pdfium_dll(&app_dir, Some(&resource_dir));
        assert_eq!(path, resource_dir.join("binaries").join(PDFIUM_LIBRARY_NAME));
        let _ = fs::remove_dir_all(base);
    }
}
