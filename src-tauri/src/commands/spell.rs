use serde::{Deserialize, Serialize};
use serde_json::Value;
use spellbook::Dictionary;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock, RwLock};
use tauri::{AppHandle, Manager};
use tokio::task;

use crate::db::migrate;

const USER_DICT_KEY_TR: &str = "spell_user_dict_tr";
const TR_ALPHABET: &str = "abcçdefgğhıijklmnoöprsştuüvyzwxq";
const TR_ALLOWLIST: &[&str] = &[
    "agorafobi",
    "akademik",
    "akademiq",
    "alanyazın",
    "altboyut",
    "altboyutları",
    "altboyutu",
    "altölçeği",
    "altölçek",
    "altölçekleri",
    "amacı",
    "amaç",
    "amigdala",
    "analiz",
    "analizi",
    "analizler",
    "analizleri",
    "ancova",
    "anket",
    "anketi",
    "anketler",
    "anksiyete",
    "anksiyolitik",
    "anksiyöz",
    "anova",
    "antidepresan",
    "antipsikotik",
    "antipsikotikler",
    "antisosyal",
    "apa",
    "apati",
    "apatik",
    "araştırma",
    "araştırmacı",
    "araştırmacılar",
    "araştırmalar",
    "atfedilen",
    "atfedilmektedir",
    "atfedilmiştir",
    "atfetmektedir",
    "atıf",
    "atıflanmaktadır",
    "atıflanmıştır",
    "atıflar",
    "atıflara",
    "atıfları",
    "atıfta",
    "bağımlı",
    "bağımlılık",
    "bağımsız",
    "betimleyici",
    "betimsel",
    "bibliyometrik",
    "biliş",
    "bilişsel",
    "bilişsel-davranışçı",
    "bilişselci",
    "bilişselcilik",
    "bilişüstü",
    "bipolar",
    "biyoistatistik",
    "bonferroni",
    "borderline",
    "boylamsal",
    "boyut",
    "boyutları",
    "boyutu",
    "bulgu",
    "bulgular",
    "bulguları",
    "cronbach",
    "crossref",
    "çalışma",
    "çalışmalar",
    "çalışmaları",
    "çalışması",
    "çıkarımsal",
    "danışan",
    "danışanın",
    "danışanlar",
    "danışman",
    "danışmanlık",
    "değerlendirme",
    "değişken",
    "değişkeni",
    "değişkenler",
    "değişkenleri",
    "delüzyon",
    "demografik",
    "deney",
    "deneyi",
    "deneyler",
    "deneysel",
    "depersonalizasyon",
    "depresif",
    "depresyon",
    "derealizasyon",
    "dergi",
    "dergiler",
    "dergipark",
    "dergisi",
    "desen",
    "deseni",
    "desenleri",
    "dezorganize",
    "disfori",
    "disforik",
    "distimi",
    "distimik",
    "doi",
    "doküman",
    "dokümanlar",
    "dokümantasyon",
    "dopamin",
    "dopaminerjik",
    "durbin-watson",
    "duygudurum",
    "duygudurumsal",
    "duygudurumu",
    "düzey",
    "düzeyi",
    "düzeyleri",
    "ego",
    "ekler",
    "empati",
    "empatik",
    "endnote",
    "envanter",
    "epistemoloji",
    "epistemolojik",
    "ergenlik",
    "etiyoloji",
    "etki",
    "etkileri",
    "etkililik",
    "etkinlik",
    "etkisi",
    "evren",
    "evrenden",
    "evreni",
    "f-testi",
    "faktör",
    "faktöriyel",
    "faktörler",
    "fark",
    "farkı",
    "farkındalık",
    "farklar",
    "fenomenoloji",
    "fenomenolojik",
    "fobi",
    "fobik",
    "frontal",
    "geçerlik",
    "geçerlilik",
    "gelişimsel",
    "gestalt",
    "gestaltçı",
    "gestaltçılık",
    "görüşme",
    "görüşmeler",
    "grubu",
    "grup",
    "gruplar",
    "grupları",
    "güdü",
    "güdülenme",
    "güvenilirlik",
    "güvenirlik",
    "halüsinasyon",
    "halüsinatif",
    "hedef",
    "hedefi",
    "hermeneutik",
    "heterojenlik",
    "hezeyan",
    "hipokampüs",
    "hipomani",
    "hipomanik",
    "hipotez",
    "hipotezler",
    "hipotezleri",
    "histeri",
    "histerik",
    "homojenlik",
    "hümanist",
    "hümanistik",
    "ığdır",
    "içerik",
    "içgüdü",
    "ilişki",
    "ilişkiler",
    "ilişkisi",
    "illüzyon",
    "imla",
    "indeks",
    "indeksler",
    "isbn",
    "istatistik",
    "istatistiksel",
    "işdoyumu",
    "ithenticate",
    "kapsam",
    "kapsamı",
    "karma",
    "katarsis",
    "katatoni",
    "katatonik",
    "katılımcı",
    "katılımcılar",
    "katılımcıların",
    "katkı",
    "katkısı",
    "kavram",
    "kavramlar",
    "kavramsal",
    "kaynakça",
    "kesitsel",
    "kısıt",
    "kısıtlar",
    "kısıtlılıklar",
    "ki-kare",
    "kikare",
    "klinik",
    "klinisyen",
    "klostrofobi",
    "kodlayıcı",
    "kodlayıcılar",
    "kolmogorov-smirnov",
    "komorbidite",
    "kompalsiyon",
    "kompulsif",
    "kompülsiyon",
    "konferans",
    "konferansı",
    "kontrol",
    "korelasyon",
    "korteks",
    "kruskal-wallis",
    "kuram",
    "kuramlar",
    "kuramsal",
    "libido",
    "likert",
    "likert-tipi",
    "literatür",
    "lob",
    "madde",
    "maddeler",
    "maddeleri",
    "maddesi",
    "makale",
    "makaleler",
    "makalesi",
    "mani",
    "manik",
    "manik-depresif",
    "mann-whitney",
    "manova",
    "melankoli",
    "melankolik",
    "mendeley",
    "meta",
    "meta-analiz",
    "metaanaliz",
    "metodoloji",
    "metodolojik",
    "mizaç",
    "model",
    "modeli",
    "modelleri",
    "motivasyon",
    "narsisistik",
    "narsisizm",
    "narsist",
    "narsizm",
    "nevrotik",
    "nevroz",
    "nicel",
    "niceliksel",
    "nitel",
    "niteliksel",
    "normallik",
    "nörobilim",
    "nörogörüntüleme",
    "nöroloji",
    "nörolojik",
    "nöron",
    "nöroplastisite",
    "nöropsikiyatri",
    "nöropsikiyatrik",
    "nöropsikoloji",
    "nöropsikolojik",
    "nörotransmiter",
    "obsesif",
    "obsesif-kompulsif",
    "obsesyon",
    "odak",
    "odak-grup",
    "oksitosin",
    "ontoloji",
    "ontolojik",
    "orcid",
    "öfori",
    "öforik",
    "ölçeği",
    "ölçeğin",
    "ölçek",
    "ölçekler",
    "ölçekleri",
    "ölçüm",
    "ölçümler",
    "ölçümleri",
    "ölçümü",
    "ölçüt",
    "ölçütler",
    "öneri",
    "öneriler",
    "örneklem",
    "örneklemde",
    "örnekleme",
    "örneklemi",
    "örneklemin",
    "örneklemler",
    "öz-yeterlik",
    "özduyarlık",
    "özdüzenleme",
    "özfarkındalık",
    "özgün",
    "özgünlük",
    "özgüven",
    "özkıyım",
    "özsaygı",
    "özşefkat",
    "özyeterlik",
    "p-değeri",
    "panik-atak",
    "paradigma",
    "parametrik",
    "paranoid",
    "paranoya",
    "paranoyak",
    "pedagog",
    "pedagoğu",
    "pedagoji",
    "pedagojik",
    "pekiştireç",
    "pekiştirme",
    "plagiarism",
    "post-hoc",
    "posthoc",
    "posttest",
    "posttestler",
    "posttravmatik",
    "pozitivist",
    "pozitivizm",
    "pretest",
    "pretestler",
    "prevalans",
    "problem",
    "problemi",
    "prognoz",
    "psikanalitik",
    "psikanaliz",
    "psikiyatri",
    "psikiyatrik",
    "psikoaktif",
    "psikobiyoloji",
    "psikobiyolojik",
    "psikodrama",
    "psikoeğitim",
    "psikoeğitsel",
    "psikofarmakoloji",
    "psikofarmakolojik",
    "psikofizik",
    "psikofizyolojik",
    "psikolog",
    "psikoloğu",
    "psikoloji",
    "psikolojik",
    "psikometrik",
    "psikomotor",
    "psikopat",
    "psikopati",
    "psikopatoloji",
    "psikopatolojik",
    "psikoseksüel",
    "psikosomatik",
    "psikososyal",
    "psikoterapi",
    "psikoterapist",
    "psikotik",
    "psikoz",
    "puan",
    "puanı",
    "puanları",
    "refleks",
    "regresyon",
    "rorschach",
    "sanrı",
    "scopus",
    "sempozyum",
    "sempozyumu",
    "serotonerjik",
    "serotonin",
    "shapiro-wilk",
    "sınır",
    "sınırları",
    "sınırlılık",
    "sınırlılıklar",
    "siklotimi",
    "siklotimik",
    "sinaps",
    "sinaptik",
    "sistematik",
    "somatik",
    "somatizasyon",
    "soru",
    "sorular",
    "soruları",
    "sosyodemografik",
    "sosyofobi",
    "standardizasyon",
    "şekil",
    "şekiller",
    "şizofreni",
    "şizoid",
    "şizotipal",
    "t-testi",
    "tablo",
    "tablolar",
    "tanısal",
    "tartışma",
    "tema",
    "temalar",
    "tematik",
    "teori",
    "teorik",
    "teoriler",
    "terapi",
    "terapisi",
    "terapötik",
    "tez",
    "tezler",
    "tolerans",
    "travma",
    "travmatik",
    "triangülasyon",
    "ttesti",
    "turnitin",
    "tükenmişlik",
    "ulakbim",
    "uygulama",
    "uygulamalar",
    "varoluşçu",
    "varoluşçuluk",
    "varsayım",
    "varsayımlar",
    "varyans",
    "varyanslar",
    "veri",
    "veriler",
    "verileri",
    "verilerin",
    "verimlilik",
    "veris",
    "verisi",
    "wilcoxon",
    "yapı",
    "yapılandırılmış",
    "yapılandırmacılık",
    "yapısal",
    "yapısı",
    "yarı-yapılandırılmış",
    "yarıdeneysel",
    "yayın",
    "yayınlar",
    "yazar",
    "yazarlar",
    "yazım",
    "yetişkinlik",
    "yılmazlık",
    "yoksunluk",
    "yöntem",
    "yöntemler",
    "yöntemleri",
    "yöntemsel",
    "z-skoru",
    "zotero",
];

const TR_ALLOWLIST_SUFFIXES: &[&str] = &[
    "", "i", "\u{0131}", "u", "\u{00fc}", "e", "a", "de", "da", "den", "dan", "nin",
    "n\u{0131}n", "nun", "n\u{00fc}n", "in", "\u{0131}n", "un", "\u{00fc}n", "le", "la",
    "ler", "lar", "leri", "lar\u{0131}", "lerde", "larda", "lerden", "lardan", "sel",
    "sal", "s\u{0131}", "si", "su", "s\u{00fc}", "li", "l\u{0131}", "lu", "l\u{00fc}",
    "lik", "l\u{0131}k", "luk", "l\u{00fc}k", "dir", "d\u{0131}r", "dur", "d\u{00fc}r",
    "tir", "t\u{0131}r", "tur", "t\u{00fc}r", "yle", "yla", "yken", "ken", "ci",
    "c\u{0131}", "cu", "c\u{00fc}", "ce", "ca", "\u{00e7}e", "\u{00e7}a",
];

struct WorkspaceSpellCache {
    dict: RwLock<Dictionary>,
    exact_words: RwLock<HashSet<String>>,
}

static SPELL_CACHE: OnceLock<RwLock<HashMap<String, Arc<WorkspaceSpellCache>>>> = OnceLock::new();

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
    ws_id: Option<String>,
) -> Result<Vec<SpellIssue>, String> {
    let ctx = spell_context(&app, lang).await?;
    let ws = ws_id.clone();
    task::spawn_blocking(move || check_text(&text, &ctx.app_data_dir, &ctx.aff_path, &ctx.dic_path, ws.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn spell_suggest(
    app: AppHandle,
    word: String,
    lang: Option<String>,
    ws_id: Option<String>,
) -> Result<Vec<String>, String> {
    let ctx = spell_context(&app, lang).await?;
    let ws = ws_id.clone();
    task::spawn_blocking(move || {
        suggest_word(&word, &ctx.app_data_dir, &ctx.aff_path, &ctx.dic_path, ws.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn spell_add_user_word(
    app: AppHandle,
    word: String,
    lang: Option<String>,
    ws_id: Option<String>,
) -> Result<(), String> {
    let ctx = spell_context(&app, lang).await?;
    let ws = ws_id.clone();
    task::spawn_blocking(move || {
        add_user_word(&word, &ctx.app_data_dir, &ctx.aff_path, &ctx.dic_path, ws.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn spell_get_user_dictionary(
    app: AppHandle,
    lang: Option<String>,
    ws_id: Option<String>,
) -> Result<Vec<String>, String> {
    let ctx = spell_context(&app, lang).await?;
    let ws = ws_id.clone();
    task::spawn_blocking(move || read_workspace_user_words(&ctx.app_data_dir, ws.as_deref()))
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
    bases.push(
        PathBuf::from("src-tauri")
            .join("resources")
            .join("dict")
            .join("tr"),
    );
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

fn get_workspace_dictionary(
    app_data_dir: &Path,
    aff_path: &Path,
    dic_path: &Path,
    ws_id: Option<&str>,
) -> Result<Arc<WorkspaceSpellCache>, String> {
    let key = ws_id.unwrap_or("").trim().to_string();
    let cache = SPELL_CACHE.get_or_init(|| RwLock::new(HashMap::new()));
    
    // 1. Try reading with a read lock
    {
        let map = cache.read().map_err(|_| "spell_cache_poisoned".to_string())?;
        if let Some(cache_entry) = map.get(&key) {
            return Ok(Arc::clone(cache_entry));
        }
    }
    
    // Load/build outside the global cache lock so another workspace warming
    // its dictionary does not stall spell checks in the active workspace.
    let aff = normalize_hunspell_zero_flag(
        &std::fs::read_to_string(aff_path).map_err(|e| e.to_string())?,
    );
    let dic = normalize_hunspell_zero_flag(
        &std::fs::read_to_string(dic_path).map_err(|e| e.to_string())?,
    );
    let mut exact_words = exact_words_from_dic(&dic);
    let mut dict = Dictionary::new(&aff, &dic).map_err(|e| e.to_string())?;
    for word in read_workspace_user_words(app_data_dir, ws_id)? {
        let _ = dict.add(&word);
        exact_words.insert(word.to_lowercase());
    }
    
    let cache_entry = Arc::new(WorkspaceSpellCache {
        dict: RwLock::new(dict),
        exact_words: RwLock::new(exact_words),
    });
    let mut map = cache.write().map_err(|_| "spell_cache_poisoned".to_string())?;
    if let Some(existing) = map.get(&key) {
        return Ok(Arc::clone(existing));
    }
    map.insert(key, Arc::clone(&cache_entry));
    Ok(cache_entry)
}

fn exact_words_from_dic(dic: &str) -> HashSet<String> {
    dic.lines()
        .skip(1)
        .filter_map(|line| line.split('/').next())
        .map(str::trim)
        .filter(|word| !word.is_empty())
        .map(str::to_lowercase)
        .collect()
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
                .map(|flag| {
                    if flag == "0" {
                        ZERO_FLAG_REPLACEMENT
                    } else {
                        flag
                    }
                })
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
    ws_id: Option<&str>,
) -> Result<Vec<SpellIssue>, String> {
    if text.trim().is_empty() {
        return Ok(Vec::new());
    }
    let workspace_spell = get_workspace_dictionary(app_data_dir, aff_path, dic_path, ws_id)?;
    let dict = workspace_spell
        .dict
        .read()
        .map_err(|_| "spell_dictionary_poisoned".to_string())?;
    let exact_words = workspace_spell
        .exact_words
        .read()
        .map_err(|_| "spell_dictionary_poisoned".to_string())?;
    let mut issues = Vec::new();
    let mut word_cache: HashMap<String, Option<Vec<String>>> = HashMap::new();
    let mut process_token = |word: &str, offset: usize, length: usize, char_count: usize| {
        if char_count < 2 || is_all_caps(word) {
            return;
        }
        let cached = if let Some(cached) = word_cache.get(word) {
            cached.clone()
        } else {
            let normalized = word.to_lowercase();
            if exact_words.contains(&normalized) || dict.check(word) || is_allowlisted_lower(&normalized) {
                word_cache.insert(word.to_string(), None);
                None
            } else {
                let suggestions = merged_suggestions(&dict, word, 5);
                word_cache.insert(word.to_string(), Some(suggestions.clone()));
                Some(suggestions)
            }
        };
        let Some(suggestions) = cached else {
            return;
        };
        issues.push(SpellIssue {
            offset,
            length,
            word: word.to_string(),
            suggestions,
        });
    };

    let mut byte_start = 0usize;
    let mut unit_start = 0usize;
    let mut units = 0usize;
    let mut chars = 0usize;
    let mut in_word = false;
    for (byte_idx, ch) in text.char_indices() {
        if is_word_char(ch) {
            if !in_word {
                byte_start = byte_idx;
                unit_start = units;
                chars = 0;
                in_word = true;
            }
            chars += 1;
        } else if in_word {
            process_token(&text[byte_start..byte_idx], unit_start, units - unit_start, chars);
            in_word = false;
        }
        units += ch.len_utf16();
    }
    if in_word {
        process_token(&text[byte_start..], unit_start, units - unit_start, chars);
    }
    Ok(issues)
}

fn is_allowlisted_lower(lower: &str) -> bool {
    let base = lower
        .split(['\'', '\u{2019}'])
        .next()
        .unwrap_or(lower)
        .trim_matches(|ch: char| !ch.is_alphabetic());
    if base.len() < 3 {
        return false;
    }
    if TR_ALLOWLIST.iter().any(|item| *item == base) {
        return true;
    }
    for suffix in TR_ALLOWLIST_SUFFIXES {
        if suffix.is_empty() || !base.ends_with(suffix) {
            continue;
        }
        let stem = &base[..base.len() - suffix.len()];
        if stem.chars().count() >= 3 && TR_ALLOWLIST.iter().any(|item| *item == stem) {
            return true;
        }
    }
    false
}

fn suggest_word(
    word: &str,
    app_data_dir: &Path,
    aff_path: &Path,
    dic_path: &Path,
    ws_id: Option<&str>,
) -> Result<Vec<String>, String> {
    let workspace_spell = get_workspace_dictionary(app_data_dir, aff_path, dic_path, ws_id)?;
    let dict = workspace_spell
        .dict
        .read()
        .map_err(|_| "spell_dictionary_poisoned".to_string())?;
    Ok(merged_suggestions(&dict, word, 8))
}

fn add_user_word(
    word: &str,
    app_data_dir: &Path,
    aff_path: &Path,
    dic_path: &Path,
    ws_id: Option<&str>,
) -> Result<(), String> {
    let normalized = word.trim();
    if normalized.is_empty() {
        return Ok(());
    }
    let mut words = read_workspace_user_words(app_data_dir, ws_id)?;
    if !words.iter().any(|w| w.eq_ignore_ascii_case(normalized)) {
        words.push(normalized.to_string());
        words.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        let raw = serde_json::to_string(&words).map_err(|e| e.to_string())?;
        migrate::kv_set(app_data_dir, &user_dict_key(ws_id), &raw)?;
    }
    let workspace_spell = get_workspace_dictionary(app_data_dir, aff_path, dic_path, ws_id)?;
    let mut dict = workspace_spell
        .dict
        .write()
        .map_err(|_| "spell_dictionary_poisoned".to_string())?;
    let _ = dict.add(normalized);
    if let Ok(mut exact_words) = workspace_spell.exact_words.write() {
        exact_words.insert(normalized.to_lowercase());
    }
    Ok(())
}

fn user_dict_key(ws_id: Option<&str>) -> String {
    let ws_clean = ws_id.unwrap_or("").trim();
    if ws_clean.is_empty() {
        USER_DICT_KEY_TR.to_string()
    } else {
        format!("{}_{}", USER_DICT_KEY_TR, ws_clean)
    }
}

fn read_workspace_user_words(app_data_dir: &Path, ws_id: Option<&str>) -> Result<Vec<String>, String> {
    let key = user_dict_key(ws_id);
    let raw = migrate::kv_get(app_data_dir, &key)?.unwrap_or_else(|| "[]".to_string());
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

fn is_word_char(ch: char) -> bool {
    ch.is_ascii_alphabetic()
        || matches!(
            ch,
            'ç' | 'ğ' | 'ı' | 'ö' | 'ş' | 'ü' | 'Ç' | 'Ğ' | 'İ' | 'Ö' | 'Ş' | 'Ü' | '\'' | '’'
        )
}

fn is_all_caps(word: &str) -> bool {
    let has_upper = word.chars().any(|ch| ch.is_uppercase());
    has_upper && word == word.to_uppercase()
}

#[allow(dead_code)]
fn merged_suggestions_legacy(dict: &Dictionary, word: &str, max: usize) -> Vec<String> {
    let mut out = Vec::new();
    dict.suggest(word, &mut out);
    for candidate in one_edit_candidates(dict, word) {
        if !out
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(&candidate))
        {
            out.push(candidate);
        }
    }
    out.sort_by(|a, b| {
        damerau(word, a)
            .cmp(&damerau(word, b))
            .then_with(|| {
                a.len()
                    .abs_diff(word.len())
                    .cmp(&b.len().abs_diff(word.len()))
            })
            .then_with(|| a.to_lowercase().cmp(&b.to_lowercase()))
    });
    out.truncate(max);
    out
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum SuggestionSource {
    Colloquial,
    Deascii,
    Nspell,
    OneEdit,
}

const COLLOQUIAL_MAPPINGS: &[(&str, &str)] = &[
    // Continuous tense (-yor)
    ("yom", "yorum"),
    ("yosun", "yorsun"),
    ("yon", "yorsun"),
    ("yo", "yor"),
    ("yoz", "yoruz"),
    ("yonuz", "yorsunuz"),
    ("yolar", "yorlar"),

    // Future tense (-acak/-ecek)
    // Type 1: with vowel prefix (-ıca/-ice)
    ("ıcam", "acağım"),
    ("ıcan", "acaksın"),
    ("ıcak", "acak"),
    ("ıcaz", "acağız"),
    ("ıcanız", "acaksınız"),
    ("ıcaklar", "acaklar"),
    ("icem", "eceğim"),
    ("icen", "eceksin"),
    ("icek", "ecek"),
    ("icez", "eceğiz"),
    ("iceniz", "eceksiniz"),
    ("icekler", "ecekler"),

    // Type 2: without vowel prefix (-ca/-ce)
    ("cam", "acağım"),
    ("can", "acaksın"),
    ("cak", "acak"),
    ("caz", "acağız"),
    ("canız", "acaksınız"),
    ("caklar", "acaklar"),
    ("cem", "eceğim"),
    ("cen", "eceksin"),
    ("cek", "ecek"),
    ("cez", "eceğiz"),
    ("ceniz", "eceksiniz"),
    ("cekler", "ecekler"),

    // Type 3: vowel-change colloquial forms (-ıyca/-iyce/-uyca/-üyce)
    ("ıycam", "ayacağım"),
    ("ıycan", "ayacaksın"),
    ("ıycak", "ayacak"),
    ("ıycaz", "ayacağız"),
    ("ıycanız", "ayacaksınız"),
    ("ıycaklar", "ayacaklar"),

    ("iycem", "eyeceğim"),
    ("iycen", "eyeceksin"),
    ("iycek", "eyecek"),
    ("iycez", "eyeceğiz"),
    ("iyceniz", "eyeceksiniz"),
    ("iycekler", "eyecekler"),

    ("uycam", "uyacağım"),
    ("uycan", "uyacaksın"),
    ("uycak", "uyacak"),
    ("uycaz", "uyacağız"),
    ("uycanız", "uyacaksınız"),
    ("uycaklar", "uyacaklar"),

    ("üycem", "üyeceğim"),
    ("üycen", "üyeceksin"),
    ("üycek", "üyecek"),
    ("üycez", "üyeceğiz"),
    ("üyceniz", "üyeceksiniz"),
    ("üycekler", "üyecekler"),

    // vowel-ending stem + colloquial (-uca/-üce)
    ("ucam", "uyacağım"),
    ("ucan", "uyacaksın"),
    ("ucak", "uyacak"),
    ("ucaz", "uyacağız"),
    ("ucanız", "uyacaksınız"),
    ("ucaklar", "uyacaklar"),

    ("ücem", "üyeceğim"),
    ("ücen", "üyeceksin"),
    ("ücek", "üyecek"),
    ("ücez", "üyeceğiz"),
    ("üceniz", "üyeceksiniz"),
    ("ücekler", "üyecekler"),
];

fn match_casing(original: &str, suggestion: &str) -> String {
    if original.is_empty() || suggestion.is_empty() {
        return suggestion.to_string();
    }
    let first_char = original.chars().next().unwrap();
    if first_char.is_uppercase() {
        let mut s_chars = suggestion.chars();
        let first_sug = s_chars.next().unwrap();
        let first_upper = match first_sug {
            'i' => "İ".to_string(),
            'ı' => "I".to_string(),
            _ => first_sug.to_uppercase().to_string(),
        };
        format!("{}{}", first_upper, s_chars.collect::<String>())
    } else {
        suggestion.to_string()
    }
}

fn colloquial_candidates(dict: &Dictionary, word: &str) -> Vec<String> {
    let lower = word.to_lowercase();
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    for &(suffix, replacement) in COLLOQUIAL_MAPPINGS {
        if lower.ends_with(suffix) && lower.len() > suffix.len() {
            let stem = &lower[..lower.len() - suffix.len()];
            
            // Generate standard candidate
            let candidate1 = format!("{}{}", stem, replacement);
            if dict.check(&candidate1) && seen.insert(candidate1.clone()) {
                candidates.push(match_casing(word, &candidate1));
            }

            // If stem ends with 't', try voicing to 'd' since replacement starts with a vowel
            if stem.ends_with('t') {
                let stem_voiced = format!("{}d", &stem[..stem.len() - 1]);
                let candidate2 = format!("{}{}", stem_voiced, replacement);
                if dict.check(&candidate2) && seen.insert(candidate2.clone()) {
                    candidates.push(match_casing(word, &candidate2));
                }
            }
        }
    }
    candidates
}

fn merged_suggestions(dict: &Dictionary, word: &str, max: usize) -> Vec<String> {
    if max == 0 {
        return Vec::new();
    }
    let lower_source = word.to_lowercase();
    let ascii_input = is_ascii_like(word);
    let deascii = deascii_candidates(dict, word);
    let has_deascii = !deascii.is_empty();
    let mut pool: HashMap<String, (String, SuggestionSource, usize)> = HashMap::new();

    let mut add = |suggestion: String, source: SuggestionSource, weight: usize| {
        if suggestion.is_empty() {
            return;
        }
        let key = suggestion.to_lowercase();
        if key == lower_source {
            return;
        }
        if has_deascii && source != SuggestionSource::Deascii {
            if suggestion.chars().count() < word.chars().count() {
                return;
            }
            if ascii_input && !has_turkish_diacritic(&suggestion) {
                return;
            }
        }
        match pool.get(&key) {
            Some((display, _source, existing_weight)) if *existing_weight <= weight => {
                let keep = display.clone();
                pool.insert(key, (keep, source, *existing_weight));
            }
            _ => {
                pool.insert(key, (suggestion, source, weight));
            }
        }
    };

    for candidate in colloquial_candidates(dict, word) {
        add(candidate, SuggestionSource::Colloquial, 0);
    }
    for candidate in deascii {
        add(candidate, SuggestionSource::Deascii, 1);
    }
    let mut native = Vec::new();
    dict.suggest(word, &mut native);
    for candidate in native {
        add(candidate, SuggestionSource::Nspell, 2);
    }
    for candidate in one_edit_candidates(dict, word) {
        add(candidate, SuggestionSource::OneEdit, 3);
    }

    let mut ranked = pool
        .into_iter()
        .filter_map(|(key, (display, source, weight))| {
            let distance = damerau(&lower_source, &key);
            if source != SuggestionSource::Deascii 
                && source != SuggestionSource::Nspell 
                && source != SuggestionSource::Colloquial 
            {
                let max_distance = if word.chars().count() <= 5 {
                    1
                } else if word.chars().count() <= 8 {
                    2
                } else {
                    3
                };
                if distance > max_distance {
                    return None;
                }
            }
            let source_priority = match source {
                SuggestionSource::Colloquial => 0,
                SuggestionSource::Deascii => 1,
                SuggestionSource::Nspell => 2,
                SuggestionSource::OneEdit => 2,
            };
            Some((
                display,
                source_priority,
                distance,
                weight,
                key.chars().count().abs_diff(word.chars().count()),
            ))
        })
        .collect::<Vec<_>>();
    ranked.sort_by(|a, b| {
        a.1.cmp(&b.1)
            .then_with(|| a.2.cmp(&b.2))
            .then_with(|| a.3.cmp(&b.3))
            .then_with(|| a.4.cmp(&b.4))
            .then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase()))
    });
    ranked
        .into_iter()
        .take(max)
        .map(|item| item.0)
        .collect()
}

fn is_ascii_like(value: &str) -> bool {
    value
        .chars()
        .all(|ch| ch.is_ascii_alphabetic() || ch == '\'' || ch == '\u{2019}')
}

fn has_turkish_diacritic(value: &str) -> bool {
    value.chars().any(|ch| {
        matches!(
            ch,
            '\u{00e7}' | '\u{011f}' | '\u{0131}' | '\u{00f6}' | '\u{015f}' | '\u{00fc}'
                | '\u{00c7}' | '\u{011e}' | '\u{0130}' | '\u{00d6}' | '\u{015e}' | '\u{00dc}'
        )
    })
}

fn deascii_options(ch: char) -> &'static [char] {
    match ch {
        'c' => &['c', '\u{00e7}'],
        'g' => &['g', '\u{011f}'],
        'i' => &['i', '\u{0131}', '\u{0130}'],
        'o' => &['o', '\u{00f6}'],
        's' => &['s', '\u{015f}'],
        'u' => &['u', '\u{00fc}'],
        'C' => &['C', '\u{00c7}'],
        'G' => &['G', '\u{011e}'],
        'I' => &['I', '\u{0130}'],
        'O' => &['O', '\u{00d6}'],
        'S' => &['S', '\u{015e}'],
        'U' => &['U', '\u{00dc}'],
        _ => &[],
    }
}

fn deascii_candidates(dict: &Dictionary, word: &str) -> Vec<String> {
    if !word.chars().any(|ch| !deascii_options(ch).is_empty()) {
        return Vec::new();
    }
    let chars = word.chars().collect::<Vec<_>>();
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    fn walk(
        dict: &Dictionary,
        chars: &[char],
        idx: usize,
        current: &mut Vec<char>,
        out: &mut Vec<String>,
        seen: &mut HashSet<String>,
        original: &str,
    ) {
        if out.len() >= 24 {
            return;
        }
        if idx >= chars.len() {
            let candidate = current.iter().collect::<String>();
            if candidate != original && seen.insert(candidate.clone()) && dict.check(&candidate) {
                out.push(candidate);
            }
            return;
        }
        let options = deascii_options(chars[idx]);
        if options.is_empty() {
            current.push(chars[idx]);
            walk(dict, chars, idx + 1, current, out, seen, original);
            current.pop();
            return;
        }
        for option in options {
            current.push(*option);
            walk(dict, chars, idx + 1, current, out, seen, original);
            current.pop();
        }
    }
    walk(dict, &chars, 0, &mut Vec::new(), &mut out, &mut seen, word);
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
        assert!(check_text("kitap şarkı öğretmen ığdır", &dir, &aff, &dic, None)
            .unwrap()
            .is_empty());
        let suggestions = suggest_word("kıtap", &dir, &aff, &dic, None).unwrap();
        assert!(suggestions.iter().any(|item| item == "kitap"));
    }

    #[test]
    fn phase4_spell_prioritizes_safe_deascii_suggestions() {
        let dir = temp_dir("quality");
        let base = fixture_dir();
        let aff = base.join("index.aff");
        let dic = base.join("index.dic");
        let suggestions = suggest_word("yanlis", &dir, &aff, &dic, None).unwrap();
        assert_eq!(suggestions.first().map(String::as_str), Some("yanl\u{0131}\u{015f}"));
        assert!(!suggestions.iter().any(|item| item == "yanis"));
    }

    #[test]
    fn phase4_spell_accepts_academic_terms_without_false_positives() {
        let dir = temp_dir("academic");
        let base = fixture_dir();
        let aff = base.join("index.aff");
        let dic = base.join("index.dic");
        let text = "Regresyon korelasyon psikometrik Likert Cronbach fenomenolojik \u{00f6}rneklemde";
        let issues = check_text(text, &dir, &aff, &dic, None).unwrap();
        assert!(issues.is_empty(), "unexpected academic false positives: {issues:?}");
    }

    #[test]
    fn phase4_spell_suggests_academic_turkish_typos() {
        let dir = temp_dir("academic-typos");
        let base = fixture_dir();
        let aff = base.join("index.aff");
        let dic = base.join("index.dic");
        let cases = [
            ("arastirma", "ara\u{015f}t\u{0131}rma"),
            ("ogrenci", "\u{00f6}\u{011f}renci"),
            ("olcut", "\u{00f6}l\u{00e7}\u{00fc}t"),
            ("sonuc", "sonu\u{00e7}"),
        ];
        for (wrong, expected) in cases {
            let suggestions = suggest_word(wrong, &dir, &aff, &dic, None).unwrap();
            assert_eq!(
                suggestions.first().map(String::as_str),
                Some(expected),
                "{wrong} suggestions were {suggestions:?}"
            );
        }
    }

    #[test]
    fn phase4_spell_suggests_morphological_typos() {
        let dir = temp_dir("morphological-typos");
        let base = fixture_dir();
        let aff = base.join("index.aff");
        let dic = base.join("index.dic");
        
        // geliyom -> geliyorum (distance 3)
        let suggestions1 = suggest_word("geliyom", &dir, &aff, &dic, None).unwrap();
        assert!(suggestions1.iter().any(|item| item == "geliyorum"), "Expected geliyorum in suggestions: {:?}", suggestions1);
        
        // yazıcam -> yazacağım (distance 3/4)
        let suggestions2 = suggest_word("yazıcam", &dir, &aff, &dic, None).unwrap();
        assert!(suggestions2.iter().any(|item| item == "yazacağım"), "Expected yazacağım in suggestions: {:?}", suggestions2);
    }

    #[test]
    fn phase4_spell_user_dictionary_persists() {
        let dir = temp_dir("user");
        let base = fixture_dir();
        let aff = base.join("index.aff");
        let dic = base.join("index.dic");
        let word = "academiqözel";
        assert!(!check_text(word, &dir, &aff, &dic, None).unwrap().is_empty());
        add_user_word(word, &dir, &aff, &dic, None).unwrap();
        assert!(read_workspace_user_words(&dir, None).unwrap().contains(&word.to_string()));
        assert!(check_text(word, &dir, &aff, &dic, None).unwrap().is_empty());
    }

    #[test]
    fn phase4_spell_user_dictionary_is_workspace_specific() {
        let dir = temp_dir("ws-spec");
        let base = fixture_dir();
        let aff = base.join("index.aff");
        let dic = base.join("index.dic");
        let word = "wsorozelword";
        let ws1 = Some("workspace-1");
        let ws2 = Some("workspace-2");

        // Initially marked misspelled in both workspaces
        assert!(!check_text(word, &dir, &aff, &dic, ws1).unwrap().is_empty());
        assert!(!check_text(word, &dir, &aff, &dic, ws2).unwrap().is_empty());

        // Add to workspace-1
        add_user_word(word, &dir, &aff, &dic, ws1).unwrap();

        // Now accepted in workspace-1, but still misspelled in workspace-2
        assert!(check_text(word, &dir, &aff, &dic, ws1).unwrap().is_empty());
        assert!(!check_text(word, &dir, &aff, &dic, ws2).unwrap().is_empty());
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
        let _ = check_text("kitap", &dir, &aff, &dic, None).unwrap();
        let start = std::time::Instant::now();
        let issues = check_text(&text, &dir, &aff, &dic, None).unwrap();
        let elapsed = start.elapsed();
        assert!(issues.is_empty());
        assert!(
            elapsed.as_millis() < 100,
            "10K word spell check should stay under 100ms, got {:?}",
            elapsed
        );
    }
}
