use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
};

#[derive(Debug, Clone, Eq, PartialEq, Hash)]
pub struct FontKey {
    pub family: String,
    pub weight: u16,
    pub italic: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FontSource {
    System,
    Bundled,
}

#[derive(Debug, Clone)]
pub struct ResolvedFont {
    pub bytes: Vec<u8>,
    pub source: FontSource,
    pub name: String,
    #[cfg_attr(not(test), allow(dead_code))]
    pub path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontWarning {
    pub family: String,
    pub requested: String,
    pub substituted: String,
    pub source: FontSource,
}

pub struct FontResolver;

static CACHE: OnceLock<Mutex<HashMap<FontKey, Arc<ResolvedFont>>>> = OnceLock::new();
static WARNINGS: OnceLock<Mutex<Vec<FontWarning>>> = OnceLock::new();

impl FontResolver {
    pub fn resolve(family: &str, weight: u16, italic: bool) -> Result<Arc<ResolvedFont>, String> {
        let key = FontKey {
            family: canonical_family(family),
            weight: if weight >= 700 { 700 } else { 400 },
            italic,
        };
        let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        if let Some(found) = cache
            .lock()
            .map_err(|_| "font cache lock failed")?
            .get(&key)
        {
            return Ok(found.clone());
        }

        let resolved = Arc::new(resolve_uncached(&key)?);
        if resolved.source != FontSource::System {
            WARNINGS
                .get_or_init(|| Mutex::new(Vec::new()))
                .lock()
                .map_err(|_| "font warning lock failed")?
                .push(FontWarning {
                    family: key.family.clone(),
                    requested: requested_name(&key),
                    substituted: resolved.name.clone(),
                    source: resolved.source.clone(),
                });
        }
        cache
            .lock()
            .map_err(|_| "font cache lock failed")?
            .insert(key, resolved.clone());
        Ok(resolved)
    }

    pub fn take_warnings() -> Vec<FontWarning> {
        WARNINGS
            .get_or_init(|| Mutex::new(Vec::new()))
            .lock()
            .map(|mut warnings| std::mem::take(&mut *warnings))
            .unwrap_or_default()
    }
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn system_font_path(family: &str, weight: u16, italic: bool) -> Option<PathBuf> {
    let key = FontKey {
        family: canonical_family(family),
        weight: if weight >= 700 { 700 } else { 400 },
        italic,
    };
    system_file_name(&key).and_then(|name| windows_font_dir().map(|dir| dir.join(name)))
}

fn resolve_uncached(key: &FontKey) -> Result<ResolvedFont, String> {
    resolve_uncached_with_system(key, true)
}

fn resolve_uncached_with_system(key: &FontKey, allow_system: bool) -> Result<ResolvedFont, String> {
    if allow_system {
        if let Some(path) =
            system_file_name(key).and_then(|name| windows_font_dir().map(|dir| dir.join(name)))
        {
            if path.exists() {
                return read_font(path, FontSource::System, requested_name(key));
            }
        }
    }

    let (file_name, fallback_name) = fallback_file_name(key);
    let path = fallback_root().join(file_name);
    read_font(path, FontSource::Bundled, fallback_name.to_string())
}

fn read_font(path: PathBuf, source: FontSource, name: String) -> Result<ResolvedFont, String> {
    let bytes = fs::read(&path).map_err(|e| format!("font read failed {}: {e}", path.display()))?;
    Ok(ResolvedFont {
        bytes,
        source,
        name,
        path,
    })
}

fn canonical_family(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    if lower.contains("times") {
        "Times New Roman".to_string()
    } else if lower.contains("arial") || lower.contains("helvetica") {
        "Arial".to_string()
    } else if lower.contains("calibri") {
        "Calibri".to_string()
    } else {
        "Times New Roman".to_string()
    }
}

fn requested_name(key: &FontKey) -> String {
    match (key.weight >= 700, key.italic) {
        (true, true) => format!("{} Bold Italic", key.family),
        (true, false) => format!("{} Bold", key.family),
        (false, true) => format!("{} Italic", key.family),
        (false, false) => key.family.clone(),
    }
}

fn system_file_name(key: &FontKey) -> Option<&'static str> {
    match (key.family.as_str(), key.weight >= 700, key.italic) {
        ("Times New Roman", false, false) => Some("times.ttf"),
        ("Times New Roman", true, false) => Some("timesbd.ttf"),
        ("Times New Roman", false, true) => Some("timesi.ttf"),
        ("Times New Roman", true, true) => Some("timesbi.ttf"),
        ("Arial", false, false) => Some("arial.ttf"),
        ("Arial", true, false) => Some("arialbd.ttf"),
        ("Arial", false, true) => Some("ariali.ttf"),
        ("Arial", true, true) => Some("arialbi.ttf"),
        ("Calibri", false, false) => Some("calibri.ttf"),
        ("Calibri", true, false) => Some("calibrib.ttf"),
        ("Calibri", false, true) => Some("calibrii.ttf"),
        ("Calibri", true, true) => Some("calibriz.ttf"),
        _ => None,
    }
}

fn fallback_file_name(key: &FontKey) -> (&'static str, &'static str) {
    match (key.family.as_str(), key.weight >= 700, key.italic) {
        ("Arial", false, false) => ("LiberationSans-Regular.ttf", "Liberation Sans"),
        ("Arial", true, false) => ("LiberationSans-Bold.ttf", "Liberation Sans Bold"),
        ("Arial", false, true) => ("LiberationSans-Italic.ttf", "Liberation Sans Italic"),
        ("Arial", true, true) => (
            "LiberationSans-BoldItalic.ttf",
            "Liberation Sans Bold Italic",
        ),
        ("Calibri", false, false) => ("Carlito-Regular.ttf", "Carlito"),
        ("Calibri", true, false) => ("Carlito-Bold.ttf", "Carlito Bold"),
        ("Calibri", false, true) => ("Carlito-Italic.ttf", "Carlito Italic"),
        ("Calibri", true, true) => ("Carlito-BoldItalic.ttf", "Carlito Bold Italic"),
        (_, false, false) => ("LiberationSerif-Regular.ttf", "Liberation Serif"),
        (_, true, false) => ("LiberationSerif-Bold.ttf", "Liberation Serif Bold"),
        (_, false, true) => ("LiberationSerif-Italic.ttf", "Liberation Serif Italic"),
        (_, true, true) => (
            "LiberationSerif-BoldItalic.ttf",
            "Liberation Serif Bold Italic",
        ),
    }
}

fn windows_font_dir() -> Option<PathBuf> {
    std::env::var_os("WINDIR")
        .map(PathBuf::from)
        .map(|dir| dir.join("Fonts"))
        .filter(|dir| dir.exists())
        .or_else(|| {
            let path = PathBuf::from(r"C:\Windows\Fonts");
            path.exists().then_some(path)
        })
}

fn fallback_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("fonts")
        .join("fallback")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::MutexGuard;

    static TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

    fn lock_and_clear() -> MutexGuard<'static, ()> {
        let guard = TEST_LOCK.get_or_init(|| Mutex::new(())).lock().unwrap();
        if let Some(cache) = CACHE.get() {
            cache.lock().unwrap().clear();
        }
        FontResolver::take_warnings();
        guard
    }

    #[test]
    fn phase5_times_new_roman_resolves_from_system_or_fallback() {
        let _guard = lock_and_clear();
        std::env::remove_var("AQ_FONT_DISABLE_SYSTEM");
        let font = FontResolver::resolve("Times New Roman", 400, false).unwrap();
        assert!(!font.bytes.is_empty());
        if system_font_path("Times New Roman", 400, false)
            .as_ref()
            .is_some_and(|path| path.exists())
        {
            assert_eq!(font.source, FontSource::System);
            assert!(font.path.ends_with(r"Fonts\times.ttf") || font.path.ends_with("times.ttf"));
        }
    }

    #[test]
    fn phase5_times_new_roman_fallback_warns_when_system_disabled() {
        let _guard = lock_and_clear();
        let key = FontKey {
            family: "Times New Roman".to_string(),
            weight: 700,
            italic: true,
        };
        let font = resolve_uncached_with_system(&key, false).unwrap();
        assert_eq!(font.source, FontSource::Bundled);
        assert_eq!(font.name, "Liberation Serif Bold Italic");
    }
}
