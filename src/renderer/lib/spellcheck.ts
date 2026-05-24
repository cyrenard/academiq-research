/**
 * Turkish spell-checker — nspell + dictionary-tr (Harun Reşit Zafer's
 * dictionary, MIT) running entirely inside the renderer.
 *
 * No Java, no server, no Maven, no JRE, no electron-builder gymnastics.
 * The aff/dic files live under public/dictionary/tr/ and are streamed in
 * the first time `ensureSpellLoaded()` is called (~9 MB lazy fetch).
 * After that, `check()` is synchronous and cheap.
 *
 * Match shape stays compatible with the existing renderer "spell-check
 * surface" expectations: offset/length/message/replacements/ruleId/
 * category — same vocabulary as the LanguageTool client we briefly
 * tried, so any UI plumbing already wired for that JSON works here too.
 */
import nspell from 'nspell';

/** Single misspelling found in the submitted text. */
export interface SpellMatch {
  /** 0-based offset into the submitted text where the misspelling starts. */
  offset: number;
  /** Length in chars of the offending span. */
  length: number;
  /** The misspelled token as it appears in the source. */
  text: string;
  /** Human-readable explanation (Turkish, UI-ready). */
  message: string;
  /** Up to N replacement suggestions, best-first. */
  replacements: Array<{ value: string }>;
  /** Rule id — single value for now, makes "ignore this rule" work later. */
  ruleId: string;
  /** Rule category — kept compatible with the LT JSON shape. */
  category: string;
}

export interface CheckOptions {
  /** Max suggestions returned per misspelled word. Default 5. */
  maxSuggestions?: number;
  /** Override word-token regex (very rare; for tests). */
  wordRegex?: RegExp;
}

export interface SpellLoaderOptions {
  /** Override the aff file URL (or contents) — used by tests + the
   *  install controller. Defaults to `./dictionary/tr/index.aff`. */
  affUrl?: string;
  /** Override the dic file URL. Defaults to `./dictionary/tr/index.dic`. */
  dicUrl?: string;
  /** Injectable fetch for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Use the Tauri/Rust spell command instead of the renderer quality layer. */
  preferNative?: boolean;
  /** Scope native user dictionaries and caches to the active workspace. */
  workspaceId?: string;
}

// nspell exposes `correct(word) → boolean` and `suggest(word) → string[]`.
type NSpellInstance = ReturnType<typeof nspell>;

// ─── Lifecycle ─────────────────────────────────────────────────────────────

let instance: NSpellInstance | null = null;
let loadPromise: Promise<NSpellInstance> | null = null;
let nativeReady = false;
const nativeSpellFacade = {
  correct: () => true,
  suggest: () => []
} as any as NSpellInstance;

/**
 * Force-set the loaded spell instance. Used by tests so they don't have
 * to round-trip the real 9 MB dictionary. Also reachable from
 * spellcheck-controller.ts when we wire up a web-worker variant.
 */
export function _setSpellInstanceForTests(spell: NSpellInstance | null): void {
  instance = spell;
  loadPromise = spell ? Promise.resolve(spell) : null;
  nativeReady = false;
}

const DEFAULT_AFF_URL = './dictionary/tr/index.aff';
const DEFAULT_DIC_URL = './dictionary/tr/index.dic';

/**
 * Lazy-load the Turkish dictionary and build an nspell instance. Safe
 * to call concurrently — subsequent callers share the in-flight promise.
 */
export async function ensureSpellLoaded(options: SpellLoaderOptions = {}): Promise<NSpellInstance> {
  if (instance) return instance;
  if (canUseNativeSpell(options)) {
    nativeReady = true;
    return nativeSpellFacade;
  }
  if (loadPromise) return loadPromise;
  const affUrl = options.affUrl || DEFAULT_AFF_URL;
  const dicUrl = options.dicUrl || DEFAULT_DIC_URL;
  const fetchImpl = options.fetchImpl
    || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  if (!fetchImpl) {
    throw new Error('spellcheck: fetch unavailable in this environment');
  }
  loadPromise = (async () => {
    const [affRes, dicRes] = await Promise.all([
      fetchImpl(affUrl),
      fetchImpl(dicUrl)
    ]);
    if (!affRes.ok) throw new Error(`spellcheck: aff fetch failed (HTTP ${affRes.status})`);
    if (!dicRes.ok) throw new Error(`spellcheck: dic fetch failed (HTTP ${dicRes.status})`);
    const [affText, dicText] = await Promise.all([
      affRes.text(),
      dicRes.text()
    ]);
    const spell = nspell(affText, dicText);
    instance = spell;
    return spell;
  })().catch((err) => {
    // Reset so a later retry can try again.
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

/** Whether the dictionary has already finished loading. Cheap sync check. */
export function isSpellReady(): boolean {
  return nativeReady || instance !== null;
}

/** Drop the loaded instance — frees ~30 MB of in-memory dictionary state. */
export function disposeSpell(): void {
  instance = null;
  loadPromise = null;
  nativeReady = false;
}

export function isNativeSpellReady(): boolean {
  return nativeReady && !!nativeSpellApi();
}

// ─── Word tokenizer ────────────────────────────────────────────────────────

/**
 * Default word-token regex. Matches runs of letters (ASCII + Turkish
 * diacritics) and apostrophes (so "kitap'ı" stays one token).
 *
 * Numbers, punctuation, whitespace and emoji are skipped — the goal is
 * to send things that LOOK like Turkish words to nspell, not the entire

// ─── Word tokenizer ────────────────────────────────────────────────────────

/**
 * Default word-token regex. Matches runs of letters (ASCII + Turkish
 * diacritics) and apostrophes (so "kitap'ı" stays one token).
 *
 * Numbers, punctuation, whitespace and emoji are skipped — the goal is
 * to send things that LOOK like Turkish words to nspell, not the entire
 * stream of glyphs.
 */
const DEFAULT_WORD_RE = /[A-Za-zçğıöşüÇĞİÖŞÜ][A-Za-zçğıöşüÇĞİÖŞÜ'’]*/g;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Spell-check a string. Returns an array of misspellings in source order.
 * The dictionary must already be loaded (`ensureSpellLoaded()`); if not,
 * this throws so callers don't accidentally race the async load.
 *
 * `correct` and `suggest` are synchronous, so a full body of academic
 * prose checks in milliseconds; if you need to keep the UI thread fully
 * unblocked, run this inside a web worker.
 */
const ACADEMIC_TERMS = [
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
  "zotero"
];

const ACADEMIC_SUFFIXES = [
  '', 'i', '\u0131', 'u', '\u00fc', 'e', 'a', 'de', 'da', 'den', 'dan',
  'nin', 'n\u0131n', 'nun', 'n\u00fcn', 'in', '\u0131n', 'un', '\u00fcn',
  'le', 'la', 'ler', 'lar', 'leri', 'lar\u0131', 'lerde', 'larda',
  'lerden', 'lardan', 'sel', 'sal', 's\u0131', 'si', 'su', 's\u00fc'
];

const ACADEMIC_TERM_SET = new Set(ACADEMIC_TERMS.map((term) => term.toLocaleLowerCase('tr-TR')));

function nativeSpellApi(): any | null {
  const api = typeof window !== 'undefined' ? (window as any).electronAPI?.spell : null;
  return api && typeof api.check === 'function' ? api : null;
}

function currentWorkspaceId(): string {
  try {
    return String((window as any)?.S?.cur || '');
  } catch (_error) {
    return '';
  }
}

function canUseNativeSpell(options: SpellLoaderOptions = {}): boolean {
  return options.preferNative === true && !options.affUrl && !options.dicUrl && !options.fetchImpl && !!nativeSpellApi();
}

function isAcademicAllowlisted(word: string): boolean {
  const lower = word
    .toLocaleLowerCase('tr-TR')
    .split(/['’]/)[0]!
    .replace(/[^a-zçğıöşü]+/gi, '');
  if (!lower || lower.length < 3) return false;
  if (ACADEMIC_TERM_SET.has(lower)) return true;
  for (const suffix of ACADEMIC_SUFFIXES) {
    if (!suffix || !lower.endsWith(suffix)) continue;
    const stem = lower.slice(0, -suffix.length);
    if (stem.length >= 3 && ACADEMIC_TERM_SET.has(stem)) return true;
  }
  return false;
}

function normalizeNativeIssues(issues: any, maxSuggestions: number): SpellMatch[] {
  if (!Array.isArray(issues)) return [];
  const cap = Math.max(0, maxSuggestions);
  return issues.map((issue) => {
    const word = String(issue?.word ?? issue?.text ?? '');
    const suggestions = Array.isArray(issue?.suggestions) ? issue.suggestions : [];
    return {
      offset: Number(issue?.offset) || 0,
      length: Number(issue?.length) || word.length,
      text: word,
      message: 'OlasÄ± yazÄ±m hatasÄ±',
      replacements: suggestions.slice(0, cap).map((value: unknown) => ({ value: String(value) })),
      ruleId: 'SPELLBOOK_TR',
      category: 'TYPOS'
    };
  });
}

export function checkLoaded(text: string, options: CheckOptions = {}): SpellMatch[] {
  if (!instance) {
    throw new Error('spellcheck: dictionary not loaded — call ensureSpellLoaded() first');
  }
  return runCheck(instance, text, options);
}

/**
 * Convenience: load on demand + check. Use when you don't already know
 * whether the dictionary is loaded. If you call this in a hot path,
 * prefer ensureSpellLoaded() up-front + checkLoaded() in the loop.
 */
export async function checkText(text: string, options: CheckOptions & SpellLoaderOptions = {}): Promise<SpellMatch[]> {
  if (canUseNativeSpell(options)) {
    nativeReady = true;
    const issues = await nativeSpellApi()!.check(String(text || ''), 'tr', options.workspaceId || currentWorkspaceId());
    return normalizeNativeIssues(issues, options.maxSuggestions ?? 5);
  }
  const spell = await ensureSpellLoaded(options);
  return runCheck(spell, text, options);
}

export async function suggestWord(word: string, options: CheckOptions & SpellLoaderOptions = {}): Promise<string[]> {
  const clean = String(word || '').trim();
  if (!clean) return [];
  const maxSug = Math.max(0, options.maxSuggestions ?? 8);
  if (canUseNativeSpell(options)) {
    const native = await nativeSpellApi()!.suggest(clean, 'tr', options.workspaceId || currentWorkspaceId());
    return Array.isArray(native) ? native.slice(0, maxSug).map(String) : [];
  }
  const spell = await ensureSpellLoaded(options);
  return mergedSuggestions(spell, clean, maxSug);
}

/**
 * Tüm Türkçe + ASCII harfler. Tek-edit varyant generator burayı
 * insertion / substitution için tarar.
 */
const TR_ALPHABET = 'abcçdefgğhıijklmnoöprsştuüvyzwxq';

/**
 * Bir kelimenin tüm 1-edit (insert/delete/sub/transpose) varyantlarını
 * üretip içlerinden sözlükte bulunanları sıralı döndür. nspell.suggest()
 * `.aff` TRY/REP rule'larıyla sınırlı — ekleme varyantlarını ("meraba" →
 * "merhaba" gibi h-insert) çoğu zaman kaçırıyor. Bu fonksiyon o boşluğu
 * mekanik olarak doldurur: ~33×len varyant, her birine sync `correct()`,
 * milisaniyeler içinde biter.
 */
/**
 * Edit türü — sıralama için ağırlıklandırılır.
 * insertion + transposition kullanıcının en sık niyeti (atlanmış harf,
 * komşu transpozisyonu); substitution ve deletion daha geniş havuz
 * ürettiği için aynı distance'ta arkaya alınır.
 */
type EditKind = 'insert' | 'transpose' | 'delete' | 'substitute';

interface EditCandidate {
  word: string;
  kind: EditKind;
}

type SuggestionSource = 'colloquial' | 'deascii' | 'nspell' | 'oneEdit';

interface SuggestionPoolEntry {
  display: string;
  source: SuggestionSource;
  kindWeight: number;
}

function oneEditCandidates(spell: NSpellInstance, word: string): EditCandidate[] {
  const lower = word.toLocaleLowerCase('tr-TR');
  if (lower.length < 2) return [];
  const seen = new Set<string>();
  const candidates: EditCandidate[] = [];
  function tryWord(w: string, kind: EditKind) {
    if (!w || w === lower) return;
    if (seen.has(w)) return;
    seen.add(w);
    if (spell.correct(w)) candidates.push({ word: w, kind });
  }
  // Insertion — Türkçe için en yüksek kalite kaynağı (atlanmış h, ş, ı, ğ).
  for (let i = 0; i <= lower.length; i++) {
    for (let k = 0; k < TR_ALPHABET.length; k++) {
      tryWord(lower.slice(0, i) + TR_ALPHABET[k]! + lower.slice(i), 'insert');
    }
  }
  for (let i = 0; i < lower.length; i++) {
    if (i + 1 < lower.length) {
      tryWord(lower.slice(0, i) + lower[i + 1] + lower[i] + lower.slice(i + 2), 'transpose');
    }
    tryWord(lower.slice(0, i) + lower.slice(i + 1), 'delete');
    for (let k = 0; k < TR_ALPHABET.length; k++) {
      const ch = TR_ALPHABET[k]!;
      if (ch !== lower[i]) tryWord(lower.slice(0, i) + ch + lower.slice(i + 1), 'substitute');
    }
  }
  // Restore original capitalization for sentence-initial words.
  const capitalize = /^[A-ZÇĞİÖŞÜ]/.test(word);
  if (capitalize) {
    for (const c of candidates) {
      c.word = c.word.charAt(0).toLocaleUpperCase('tr-TR') + c.word.slice(1);
    }
  }
  return candidates;
}

/** Her edit türünün ranking ağırlığı — düşük = öncelikli. */
const KIND_WEIGHT: Record<EditKind, number> = {
  insert: 0,
  transpose: 0,
  delete: 1,
  substitute: 1
};

const DEASCII_MAP: Record<string, string[]> = {
  c: ['c', 'ç'],
  g: ['g', 'ğ'],
  i: ['i', 'ı', 'İ'],
  o: ['o', 'ö'],
  s: ['s', 'ş'],
  u: ['u', 'ü'],
  C: ['C', 'Ç'],
  G: ['G', 'Ğ'],
  I: ['I', 'İ'],
  O: ['O', 'Ö'],
  S: ['S', 'Ş'],
  U: ['U', 'Ü']
};

function deasciiCandidates(spell: NSpellInstance, word: string): string[] {
  if (!/[cgiosuCGIOSU]/.test(word)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const chars = Array.from(word);
  const walk = (idx: number, current: string[]) => {
    if (out.length >= 24) return;
    if (idx >= chars.length) {
      const candidate = current.join('');
      if (candidate !== word && !seen.has(candidate)) {
        seen.add(candidate);
        if (spell.correct(candidate)) out.push(candidate);
      }
      return;
    }
    const options = DEASCII_MAP[chars[idx]!] || [chars[idx]!];
    for (const option of options) {
      current.push(option);
      walk(idx + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return out;
}

function hasTurkishDiacritic(value: string): boolean {
  return /[çğıöşüÇĞİÖŞÜ]/.test(value);
}

function isAsciiLike(value: string): boolean {
  return /^[A-Za-z'’]+$/.test(value);
}

/**
 * Damerau-Levenshtein (transpose dahil) edit distance — küçük dizgiler
 * için klasik DP. Önerileri benzerlik sırasına dizmek için kullanırız.
 */
function damerauLevenshtein(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const d: number[][] = [];
  for (let i = 0; i <= n; i++) { d[i] = new Array(m + 1); d[i]![0] = i; }
  for (let j = 0; j <= m; j++) d[0]![j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + cost
      );
      if (i > 1 && j > 1
          && a.charCodeAt(i - 1) === b.charCodeAt(j - 2)
          && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[n]![m]!;
}

/**
 * nspell.suggest() çıktısını mekanik 1-edit candidate'leriyle birleştir,
 * gerçek Damerau-Levenshtein mesafesine göre sırala, tekrarları düşür,
 * maxSug ile kes.
 *
 * Saf nspell çıktısı `.aff` TRY/REP rule'larıyla sınırlı; özellikle
 * tek-harf ekleme ("meraba" → "merhaba") önerilerini kaçırıyor. 1-edit
 * generator o boşluğu kapatır; merge sonrası gerçek edit-distance ile
 * sıralamak kullanıcının "en yakın doğru kelime" beklentisine uyar.
 */
function mergedSuggestionsLegacy(spell: NSpellInstance, word: string, maxSug: number): string[] {
  if (maxSug <= 0) return [];
  const lowerSource = word.toLocaleLowerCase('tr-TR');
  // Havuz: key = lowercased, value = { display, kindWeight }.
  // Aynı kelime hem nspell.suggest()'ten hem 1-edit'ten gelirse
  // edit-türünden gelen ağırlığı saklarız (daha düşük weight kazanır).
  type PoolEntry = { display: string; kindWeight: number };
  const pool = new Map<string, PoolEntry>();
  function add(suggestion: string, kindWeight: number) {
    if (!suggestion) return;
    const key = suggestion.toLocaleLowerCase('tr-TR');
    const existing = pool.get(key);
    if (!existing) {
      pool.set(key, { display: suggestion, kindWeight });
    } else if (kindWeight < existing.kindWeight) {
      pool.set(key, { display: existing.display, kindWeight });
    }
  }
  // ASCII Turkish input is common on Windows keyboards; prioritize valid
  // diacritic restorations before broad edit-distance candidates.
  deasciiCandidates(spell, word).forEach((s) => add(s, 0));
  // nspell çıktısı (zaten ranked) — edit-türü bilinmiyor; substitution
  // benzeri ağırlık ver (1).
  try { spell.suggest(word).forEach((s) => add(s, 1)); } catch (_e) {}
  oneEditCandidates(spell, word).forEach((c) => add(c.word, KIND_WEIGHT[c.kind]));
  if (pool.size === 0) return [];
  // Sıralama anahtarı: önce Damerau-Levenshtein distance, sonra edit
  // türü ağırlığı (insertion/transpose: 0, sub/delete: 1), sonra kelime
  // uzunluğunun source'a yakınlığı, son olarak alfabetik.
  const ranked = Array.from(pool.entries())
    .map(([key, entry]) => ({
      display: entry.display,
      distance: damerauLevenshtein(lowerSource, key),
      weight: entry.kindWeight,
      lenDiff: Math.abs(entry.display.length - word.length)
    }))
    .sort((a, b) =>
      a.distance - b.distance
      || a.weight - b.weight
      || a.lenDiff - b.lenDiff
      || a.display.localeCompare(b.display, 'tr-TR')
    );
  return ranked.slice(0, maxSug).map((r) => r.display);
}



const COLLOQUIAL_MAPPINGS: Array<[string, string]> = [
  // Continuous tense (-yor)
  ["yom", "yorum"],
  ["yosun", "yorsun"],
  ["yon", "yorsun"],
  ["yo", "yor"],
  ["yoz", "yoruz"],
  ["yonuz", "yorsunuz"],
  ["yolar", "yorlar"],

  // Future tense (-acak/-ecek)
  // Type 1: with vowel prefix (-ıca/-ice)
  ["ıcam", "acağım"],
  ["ıcan", "acaksın"],
  ["ıcak", "acak"],
  ["ıcaz", "acağız"],
  ["ıcanız", "acaksınız"],
  ["ıcaklar", "acaklar"],
  ["icem", "eceğim"],
  ["icen", "eceksin"],
  ["icek", "ecek"],
  ["icez", "eceğiz"],
  ["iceniz", "eceksiniz"],
  ["icekler", "ecekler"],

  // Type 2: without vowel prefix (-ca/-ce)
  ["cam", "acağım"],
  ["can", "acaksın"],
  ["cak", "acak"],
  ["caz", "acağız"],
  ["canız", "acaksınız"],
  ["caklar", "acaklar"],
  ["cem", "eceğim"],
  ["cen", "eceksin"],
  ["cek", "ecek"],
  ["cez", "eceğiz"],
  ["ceniz", "eceksiniz"],
  ["cekler", "ecekler"],

  // Type 3: vowel-change colloquial forms (-ıyca/-iyce/-uyca/-üyce)
  ["ıycam", "ayacağım"],
  ["ıycan", "ayacaksın"],
  ["ıycak", "ayacak"],
  ["ıycaz", "ayacağız"],
  ["ıycanız", "ayacaksınız"],
  ["ıycaklar", "ayacaklar"],

  ["iycem", "eyeceğim"],
  ["iycen", "eyeceksin"],
  ["iycek", "eyecek"],
  ["iycez", "eyeceğiz"],
  ["iyceniz", "eyeceksiniz"],
  ["iycekler", "eyecekler"],

  ["uycam", "uyacağım"],
  ["uycan", "uyacaksın"],
  ["uycak", "uyacak"],
  ["uycaz", "uyacağız"],
  ["uycanız", "uyacaksınız"],
  ["uycaklar", "uyacaklar"],

  ["üycem", "üyeceğim"],
  ["üycen", "üyeceksin"],
  ["üycek", "üyecek"],
  ["üycez", "üyeceğiz"],
  ["üyceniz", "üyeceksiniz"],
  ["üycekler", "üyecekler"],

  // vowel-ending stem + colloquial (-uca/-üce)
  ["ucam", "uyacağım"],
  ["ucan", "uyacaksın"],
  ["ucak", "uyacak"],
  ["ucaz", "uyacağız"],
  ["ucanız", "uyacaksınız"],
  ["ucaklar", "uyacaklar"],

  ["ücem", "üyeceğim"],
  ["ücen", "üyeceksin"],
  ["ücek", "üyecek"],
  ["ücez", "üyeceğiz"],
  ["üceniz", "üyeceksiniz"],
  ["ücekler", "üyecekler"],
];

function matchCasing(original: string, suggestion: string): string {
  if (!original || !suggestion) return suggestion;
  const firstChar = original.charAt(0);
  if (firstChar === firstChar.toUpperCase() && /[A-ZÇĞİÖŞÜ]/.test(firstChar)) {
    const firstSug = suggestion.charAt(0);
    let firstUpper = firstSug.toUpperCase();
    if (firstSug === 'i') firstUpper = 'İ';
    else if (firstSug === 'ı') firstUpper = 'I';
    return firstUpper + suggestion.slice(1);
  }
  return suggestion;
}

function colloquialCandidates(spell: NSpellInstance, word: string): string[] {
  const lower = word.toLocaleLowerCase('tr-TR');
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const [suffix, replacement] of COLLOQUIAL_MAPPINGS) {
    if (lower.endsWith(suffix) && lower.length > suffix.length) {
      const stem = lower.slice(0, -suffix.length);
      
      // Standard candidate
      const candidate1 = stem + replacement;
      if (spell.correct(candidate1) && !seen.has(candidate1)) {
        seen.add(candidate1);
        candidates.push(matchCasing(word, candidate1));
      }

      // If stem ends with 't', try voicing to 'd' since replacement starts with a vowel
      if (stem.endsWith('t')) {
        const stemVoiced = stem.slice(0, -1) + 'd';
        const candidate2 = stemVoiced + replacement;
        if (spell.correct(candidate2) && !seen.has(candidate2)) {
          seen.add(candidate2);
          candidates.push(matchCasing(word, candidate2));
        }
      }
    }
  }
  return candidates;
}

function mergedSuggestions(spell: NSpellInstance, word: string, maxSug: number): string[] {
  if (maxSug <= 0) return [];
  const lowerSource = word.toLocaleLowerCase('tr-TR');
  const asciiInput = isAsciiLike(word);
  const deascii = deasciiCandidates(spell, word);
  const hasDeascii = deascii.length > 0;
  const pool = new Map<string, SuggestionPoolEntry>();

  function add(suggestion: string, source: SuggestionSource, kindWeight: number) {
    if (!suggestion) return;
    const key = suggestion.toLocaleLowerCase('tr-TR');
    if (key === lowerSource) return;
    if (hasDeascii && source !== 'deascii') {
      if (suggestion.length < word.length) return;
      if (asciiInput && !hasTurkishDiacritic(suggestion)) return;
    }
    const existing = pool.get(key);
    if (!existing) {
      pool.set(key, { display: suggestion, source, kindWeight });
    } else if (kindWeight < existing.kindWeight) {
      pool.set(key, { display: existing.display, source, kindWeight });
    }
  }

  colloquialCandidates(spell, word).forEach((s, idx) => add(s, 'colloquial', 0 + idx * 0.001));
  deascii.forEach((s, idx) => add(s, 'deascii', 1 + idx * 0.001));
  try { spell.suggest(word).forEach((s, idx) => add(s, 'nspell', 2 + idx * 0.001)); } catch (_e) {}
  oneEditCandidates(spell, word).forEach((c, idx) => add(c.word, 'oneEdit', 3 + KIND_WEIGHT[c.kind] + idx * 0.001));
  if (pool.size === 0) return [];

  const ranked = Array.from(pool.entries())
    .map(([key, entry]) => ({
      display: entry.display,
      distance: damerauLevenshtein(lowerSource, key),
      source: entry.source,
      weight: entry.kindWeight,
      lenDiff: Math.abs(entry.display.length - word.length)
    }))
    .filter((item) => {
      if (item.source === 'deascii' || item.source === 'nspell' || item.source === 'colloquial') return true;
      const maxDistance = word.length <= 5 ? 1 : word.length <= 8 ? 2 : 3;
      return item.distance <= maxDistance;
    })
    .sort((a, b) => {
      const pA = a.source === 'colloquial' ? 0 : a.source === 'deascii' ? 1 : 2;
      const pB = b.source === 'colloquial' ? 0 : b.source === 'deascii' ? 1 : 2;
      return pA - pB
        || a.distance - b.distance
        || a.weight - b.weight
        || a.lenDiff - b.lenDiff
        || a.display.localeCompare(b.display, 'tr-TR');
    });
  return ranked.slice(0, maxSug).map((r) => r.display);
}

function runCheck(spell: NSpellInstance, text: string, options: CheckOptions): SpellMatch[] {
  if (!text) return [];
  const maxSug = Math.max(0, options.maxSuggestions ?? 5);
  const re = options.wordRegex
    ? new RegExp(options.wordRegex.source, options.wordRegex.flags.includes('g') ? options.wordRegex.flags : options.wordRegex.flags + 'g')
    : new RegExp(DEFAULT_WORD_RE.source, DEFAULT_WORD_RE.flags);
  const matches: SpellMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const word = m[0];
    // Skip 1-letter tokens (mostly noise: "a", "I", initials) — they
    // generate too many false positives against academic prose.
    if (word.length < 2) continue;
    // Skip ALL-CAPS tokens — usually acronyms (APA, DOI, ISBN) that
    // aren't in a generic dictionary. We'd rather not flag them.
    if (word === word.toUpperCase() && /[A-ZÇĞİÖŞÜ]/.test(word)) continue;
    if (isAcademicAllowlisted(word) || spell.correct(word)) continue;
    const suggestions = mergedSuggestions(spell, word, maxSug);
    matches.push({
      offset: m.index,
      length: word.length,
      text: word,
      message: 'Olası yazım hatası',
      replacements: suggestions.map((value) => ({ value })),
      ruleId: 'NSPELL_TR',
      category: 'TYPOS'
    });
  }
  return matches;
}
