use serde_json::json;
use std::{collections::BTreeMap, env, fs, path::PathBuf};
use ttf_parser::{Face, GlyphId};

fn main() -> Result<(), String> {
    let root = env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows\Fonts"));
    let fonts = [
        ("Times New Roman", "regular", "times.ttf"),
        ("Times New Roman", "bold", "timesbd.ttf"),
        ("Times New Roman", "italic", "timesi.ttf"),
        ("Times New Roman", "boldItalic", "timesbi.ttf"),
    ];
    let glyphs = "ABCÇĞİÖŞÜabcçğıöşü0123456789.,;:!?()[]{}'-–— ";
    let size_px = 16.0f32;
    let mut out = BTreeMap::new();
    for (family, style, file) in fonts {
        let path = root.join(file);
        let data = fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        let face = Face::parse(&data, 0).map_err(|e| format!("{}: {e:?}", path.display()))?;
        let upem = face.units_per_em() as f32;
        let mut values = BTreeMap::new();
        for ch in glyphs.chars() {
            let glyph = face.glyph_index(ch).unwrap_or(GlyphId(0));
            let advance = face.glyph_hor_advance(glyph).unwrap_or(0) as f32;
            values.insert(ch.to_string(), advance * size_px / upem);
        }
        out.insert(format!("{family}:{style}"), values);
    }
    println!("{}", json!(out));
    Ok(())
}
