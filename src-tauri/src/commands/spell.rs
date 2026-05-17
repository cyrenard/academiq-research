use serde::{Deserialize, Serialize};
use serde_json::Value;
use spellbook::Dictionary;
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};
use tauri::{AppHandle, Manager};
use tokio::task;

use crate::db::migrate;

const USER_DICT_KEY_TR: &str = "spell_user_dict_tr";
const TR_ALPHABET: &str = "abcçdefgğhıijklmnoöprsştuüvyzwxq";
const TR_ALLOWLIST: &[&str] = &["ığdır"];

static SPELL_TR: OnceLock<RwLock<Dictionary>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellIssue {
    pub offset: usize,
    pub length: usize,
    pub word: String,
    pub suggestions: Vec<String>,
}

#[tauri::command]
pub async fn spell_check(
    app: AppHandle,
    text: String,
    lang: Option<String>,
) -> Result<Vec<SpellIssue>, String> {
    let ctx = spell_context(&app, lang).await?;
    task::spawn_blocking(move || check_text(&text, &ctx.app_data_dir, &ctx.aff_path, &ctx.dic_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn spell_suggest(
    app: AppHandle,
    word: String,
    lang: Option<String>,
) -> Result<Vec<String>, String> {
    let ctx = spell_context(&app, lang).await?;
    task::spawn_blocking(move || suggest_word(&word, &ctx.app_data_dir, &ctx.aff_path, &ctx.dic_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn spell_add_user_word(
    app: AppHandle,
    word: String,
    lang: Option<String>,
) -> Result<(), String> {
    let ctx = spell_context(&app, lang).await?;
    task::spawn_blocking(move || add_user_word(&word, &ctx.app_data_dir, &ctx.aff_path, &ctx.dic_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn spell_get_user_dictionary(
    app: AppHandle,
    lang: Option<String>,
) -> Result<Vec<String>, String> {
    let ctx = spell_context(&app, lang).await?;
    task::spawn_blocking(move || read_user_words(&ctx.app_data_dir))
        .await
        .map_err(|e| e.to_string())?
}

struct SpellContext {
    app_data_dir: PathBuf,
    aff_path: PathBuf,
    dic_path: PathBuf,
}

async fn spell_context(app: &AppHandle, lang: Option<String>) -> Result<SpellContext, String> {
    let lang = lang.unwrap_or_else(|| "tr".to_string());
    if lang != "tr" {
        return Err(format!("unsupported_spell_language:{lang}"));
    }
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(&app_data_dir)
        .await
        .map_err(|e| e.to_string())?;
    let resource_dir = app.path().resource_dir().ok();
    let (aff_path, dic_path) = dict_paths(resource_dir.as_deref())?;
    Ok(SpellContext {
        app_data_dir,
        aff_path,
        dic_path,
    })
}

fn dict_paths(resource_dir: Option<&Path>) -> Result<(PathBuf, PathBuf), String> {
    let mut bases = Vec::new();
    if let Some(dir) = resource_dir {
        bases.push(dir.join("resources").join("dict").join("tr"));
        bases.push(dir.join("dict").join("tr"));
    }
    bases.push(PathBuf::from("src-tauri").join("resources").join("dict").join("tr"));
    bases.push(PathBuf::from("resources").join("dict").join("tr"));
    bases.push(PathBuf::from("public").join("dictionary").join("tr"));
    for base in bases {
        let aff = base.join("index.aff");
        let dic = base.join("index.dic");
        if aff.exists() && dic.exists() {
            return Ok((aff, dic));
        }
    }
    Err("spell_dictionary_not_found".to_string())
}

fn dictionary(
    app_data_dir: &Path,
    aff_path: &Path,
    dic_path: &Path,
) -> Result<&'static RwLock<Dictionary>, String> {
    if let Some(lock) = SPELL_TR.get() {
        return Ok(lock);
    }
    let aff = normalize_hunspell_zero_flag(&std::fs::read_to_string(aff_path).map_err(|e| e.to_string())?);
    let dic = normalize_hunspell_zero_flag(&std::fs::read_to_string(dic_path).map_err(|e| e.to_string())?);
    let mut dict = Dictionary::new(&aff, &dic).map_err(|e| e.to_string())?;
    for word in read_user_words(app_data_dir)? {
        let _ = dict.add(&word);
    }
    let _ = SPELL_TR.set(RwLock::new(dict));
    SPELL_TR
        .get()
        .ok_or_else(|| "spell_dictionary_init_failed".to_string())
}

fn normalize_hunspell_zero_flag(input: &str) -> String {
    const ZERO_FLAG_REPLACEMENT: &str = "10000";
    input
        .lines()
        .map(|line| {
            if let Some(rest) = line.strip_prefix("SFX 0 ") {
                return format!("SFX {ZERO_FLAG_REPLACEMENT} {rest}");
            }
            if let Some(rest) = line.strip_prefix("PFX 0 ") {
                return format!("PFX {ZERO_FLAG_REPLACEMENT} {rest}");
            }
            let Some((stem, flags)) = line.split_once('/') else {
                return line.to_string();
            };
            if flags.is_empty() || !flags.split(',').any(|flag| flag == "0") {
                return line.to_string();
            }
            let mapped = flags
                .split(',')
                .map(|flag| if flag == "0" { ZERO_FLAG_REPLACEMENT } else { flag })
                .collect::<Vec<_>>()
                .join(",");
            format!("{stem}/{mapped}")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn check_text(
    text: &str,
    app_data_dir: &Path,
    aff_path: &Path,
    dic_path: &Path,
) -> Result<Vec<SpellIssue>, String> {
    if text.trim().is_empty() {
        return Ok(Vec::new());
    }
    let lock = dictionary(app_data_dir, aff_path, dic_path)?;
    let dict = lock.read().map_err(|_| "spell_dictionary_poisoned".to_string())?;
    let mut issues = Vec::new();
    for token in tokenize_words(text) {
        if token.word.chars().count() < 2 || is_all_caps(&token.word) {
            continue;
        }
        if dict.check(&token.word) || is_allowlisted(&token.word) {
            continue;
        }
        let suggestions = merged_suggestions(&dict, &token.word, 5);
        issues.push(SpellIssue {
            offset: token.offset,
            length: token.length,
            word: token.word,
            suggestions,
        });
    }
    Ok(issues)
}

fn suggest_word(
    word: &str,
    app_data_dir: &Path,
    aff_path: &Path,
    dic_path: &Path,
) -> Result<Vec<String>, String> {
    let lock = dictionary(app_data_dir, aff_path, dic_path)?;
    let dict = lock.read().map_err(|_| "spell_dictionary_poisoned".to_string())?;
    Ok(merged_suggestions(&dict, word, 8))
}

fn add_user_word(
    word: &str,
    app_data_dir: &Path,
    aff_path: &Path,
    dic_path: &Path,
) -> Result<(), String> {
    let normalized = word.trim();
    if normalized.is_empty() {
        return Ok(());
    }
    let mut words = read_user_words(app_data_dir)?;
    if !words.iter().any(|w| w.eq_ignore_ascii_case(normalized)) {
        words.push(normalized.to_string());
        words.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        let raw = serde_json::to_string(&words).map_err(|e| e.to_string())?;
        migrate::kv_set(app_data_dir, USER_DICT_KEY_TR, &raw)?;
    }
    let lock = dictionary(app_data_dir, aff_path, dic_path)?;
    let mut dict = lock
        .write()
        .map_err(|_| "spell_dictionary_poisoned".to_string())?;
    let _ = dict.add(normalized);
    Ok(())
}

fn read_user_words(app_data_dir: &Path) -> Result<Vec<String>, String> {
    let raw = migrate::kv_get(app_data_dir, USER_DICT_KEY_TR)?.unwrap_or_else(|| "[]".to_string());
    let value = serde_json::from_str::<Value>(&raw).unwrap_or(Value::Array(Vec::new()));
    Ok(value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|word| !word.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default())
}

struct Token {
    offset: usize,
    length: usize,
    word: String,
}

fn tokenize_words(text: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut start_units = 0usize;
    let mut units = 0usize;
    for ch in text.chars() {
        let is_word = is_word_char(ch);
        if is_word {
            if current.is_empty() {
                start_units = units;
            }
            current.push(ch);
        } else if !current.is_empty() {
            tokens.push(Token {
                offset: start_units,
                length: units - start_units,
                word: std::mem::take(&mut current),
            });
        }
        units += ch.len_utf16();
    }
    if !current.is_empty() {
        tokens.push(Token {
            offset: start_units,
            length: units - start_units,
            word: current,
        });
    }
    tokens
}

fn is_word_char(ch: char) -> bool {
    ch.is_ascii_alphabetic()
        || matches!(
            ch,
            'ç' | 'ğ'
                | 'ı'
                | 'ö'
                | 'ş'
                | 'ü'
                | 'Ç'
                | 'Ğ'
                | 'İ'
                | 'Ö'
                | 'Ş'
                | 'Ü'
                | '\''
                | '’'
        )
}

fn is_all_caps(word: &str) -> bool {
    let has_upper = word.chars().any(|ch| ch.is_uppercase());
    has_upper && word == word.to_uppercase()
}

fn is_allowlisted(word: &str) -> bool {
    let lower = word.to_lowercase();
    TR_ALLOWLIST.iter().any(|item| *item == lower)
}

fn merged_suggestions(dict: &Dictionary, word: &str, max: usize) -> Vec<String> {
    let mut out = Vec::new();
    dict.suggest(word, &mut out);
    for candidate in one_edit_candidates(dict, word) {
        if !out.iter().any(|existing| existing.eq_ignore_ascii_case(&candidate)) {
            out.push(candidate);
        }
    }
    out.sort_by(|a, b| {
        damerau(word, a)
            .cmp(&damerau(word, b))
            .then_with(|| a.len().abs_diff(word.len()).cmp(&b.len().abs_diff(word.len())))
            .then_with(|| a.to_lowercase().cmp(&b.to_lowercase()))
    });
    out.truncate(max);
    out
}

fn one_edit_candidates(dict: &Dictionary, word: &str) -> Vec<String> {
    let lower = word.to_lowercase();
    let chars = lower.chars().collect::<Vec<_>>();
    let alphabet = TR_ALPHABET.chars().collect::<Vec<_>>();
    let mut out = Vec::new();
    for idx in 0..=chars.len() {
        for ch in &alphabet {
            let mut candidate = chars.clone();
            candidate.insert(idx, *ch);
            push_candidate(dict, &mut out, candidate);
        }
    }
    for idx in 0..chars.len() {
        let mut deleted = chars.clone();
        deleted.remove(idx);
        push_candidate(dict, &mut out, deleted);
        for ch in &alphabet {
            if *ch == chars[idx] {
                continue;
            }
            let mut substituted = chars.clone();
            substituted[idx] = *ch;
            push_candidate(dict, &mut out, substituted);
        }
        if idx + 1 < chars.len() {
            let mut transposed = chars.clone();
            transposed.swap(idx, idx + 1);
            push_candidate(dict, &mut out, transposed);
        }
    }
    out
}

fn push_candidate(dict: &Dictionary, out: &mut Vec<String>, chars: Vec<char>) {
    let candidate = chars.into_iter().collect::<String>();
    if !candidate.is_empty()
        && dict.check(&candidate)
        && !out.iter().any(|existing| existing == &candidate)
    {
        out.push(candidate);
    }
}

fn damerau(a: &str, b: &str) -> usize {
    let aa = a.to_lowercase().chars().collect::<Vec<_>>();
    let bb = b.to_lowercase().chars().collect::<Vec<_>>();
    let n = aa.len();
    let m = bb.len();
    let mut d = vec![vec![0usize; m + 1]; n + 1];
    for (idx, row) in d.iter_mut().enumerate().take(n + 1) {
        row[0] = idx;
    }
    for idx in 0..=m {
        d[0][idx] = idx;
    }
    for i in 1..=n {
        for j in 1..=m {
            let cost = usize::from(aa[i - 1] != bb[j - 1]);
            d[i][j] = (d[i - 1][j] + 1)
                .min(d[i][j - 1] + 1)
                .min(d[i - 1][j - 1] + cost);
            if i > 1 && j > 1 && aa[i - 1] == bb[j - 2] && aa[i - 2] == bb[j - 1] {
                d[i][j] = d[i][j].min(d[i - 2][j - 2] + 1);
            }
        }
    }
    d[n][m]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("dict")
            .join("tr")
    }

    fn temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "academiq-spell-test-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn phase4_spell_accepts_turkish_and_suggests() {
        let dir = temp_dir("basic");
        let base = fixture_dir();
        let aff = base.join("index.aff");
        let dic = base.join("index.dic");
        assert!(check_text("kitap şarkı öğretmen ığdır", &dir, &aff, &dic)
            .unwrap()
            .is_empty());
        let suggestions = suggest_word("kıtap", &dir, &aff, &dic).unwrap();
        assert!(suggestions.iter().any(|item| item == "kitap"));
    }

    #[test]
    fn phase4_spell_user_dictionary_persists() {
        let dir = temp_dir("user");
        let base = fixture_dir();
        let aff = base.join("index.aff");
        let dic = base.join("index.dic");
        let word = "academiqözel";
        assert!(!check_text(word, &dir, &aff, &dic).unwrap().is_empty());
        add_user_word(word, &dir, &aff, &dic).unwrap();
        assert!(read_user_words(&dir).unwrap().contains(&word.to_string()));
        assert!(check_text(word, &dir, &aff, &dic).unwrap().is_empty());
    }

    #[test]
    fn phase4_spell_checks_10000_words_under_budget() {
        let dir = temp_dir("perf");
        let base = fixture_dir();
        let aff = base.join("index.aff");
        let dic = base.join("index.dic");
        let text = std::iter::repeat("kitap şarkı öğretmen")
            .take(3334)
            .collect::<Vec<_>>()
            .join(" ");
        let _ = check_text("kitap", &dir, &aff, &dic).unwrap();
        let start = std::time::Instant::now();
        let issues = check_text(&text, &dir, &aff, &dic).unwrap();
        let elapsed = start.elapsed();
        assert!(issues.is_empty());
        assert!(
            elapsed.as_millis() < 100,
            "10K word spell check should stay under 100ms, got {:?}",
            elapsed
        );
    }
}
