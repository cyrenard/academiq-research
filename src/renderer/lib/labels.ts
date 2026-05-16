/**
 * Central UI label dictionary.
 *
 * Why this exists
 * ---------------
 * The app currently has 50–100 hardcoded Turkish strings scattered across
 * .tsx and legacy .js files. Every time we want to (a) fix a typo, (b)
 * keep wording consistent across surfaces, or (c) eventually add a second
 * language, those strings have to be located one-by-one. This module is
 * the single place new UI text should land — components import the
 * namespace they need (`L.app.title`, `L.refs.openMenu`) and the strings
 * themselves stay editable in one file.
 *
 * Adding a new label
 * ------------------
 *  1. Decide which namespace it belongs to (app / refs / notes / editor
 *     / pdf / modals / errors). Add a new namespace only when none fits.
 *  2. Add the entry as an `as const` string — no template literals at
 *     this layer; if the value needs interpolation, expose a helper.
 *  3. Use it in the component via `import { L } from '../lib/labels';`.
 *
 * Migration plan
 * --------------
 * Existing hardcoded strings are migrated opportunistically: every
 * commit that touches a label should pull it into this dictionary, not
 * rewrite it inline. This file is also the natural starting point if we
 * ever wire up i18next/next-intl — the namespace shape maps cleanly to
 * JSON resources.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Interpolate `{name}` placeholders into a label template. Used so
 * label strings stay declarative even when they include user data.
 *
 *   fmt('Belge {n} silinsin mi?', { n: 3 })  // → 'Belge 3 silinsin mi?'
 */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`
  );
}

// ---------------------------------------------------------------------------
// Namespaces — keep these grouped by UI surface, alphabetical inside
// ---------------------------------------------------------------------------

export const L = {
  /** App-shell / chrome (top toolbar, status bar, window controls). */
  app: {
    name: 'AcademiQ Research',
    close: 'Kapat',
    minimize: 'Küçült',
    maximize: 'Büyült',
    workspace: 'Çalışma Alanı',
    newWorkspace: 'Yeni çalışma alanı',
    deleteWorkspace: 'Çalışma alanını sil',
    confirmDeleteWorkspace: '"{name}" silinsin mi?'
  },

  /** Reference sidebar and reference operations. */
  refs: {
    library: 'Kütüphane',
    referenceMenu: 'Kaynak menüsü',
    addLabel: 'Etiket ekle',
    addCollection: 'Klasör ekle',
    newLabelName: 'Yeni etiket adı',
    newCollectionName: 'Yeni klasör adı',
    noUserLabels: 'Kullanıcı etiketi yok',
    noCollections: 'Klasör yok',
    deleteLabel: 'Etiketi sil',
    manageCollections: 'Klasörleri Yönet',
    placeholderSearch: 'Kaynaklarda ara...'
  },

  /** Notes sidebar and note operations. */
  notes: {
    tabNotes: 'Notlar',
    tabBibliography: 'Kaynakça',
    addNote: 'Not Ekle',
    placeholderFree: 'Serbest not...',
    placeholderSearch: 'Notlarda ara...',
    placeholderTag: 'etiket...',
    helpEmpty: 'PDF\'ten metin seç -> Nota Kaydet veya aşağıdan yaz.'
  },

  /** Editor surface (top toolbar + content). */
  editor: {
    placeholder: 'Yazmaya başlayın...',
    save: 'Kaydet',
    saved: 'kaydedildi',
    risks: '{n} sorun',
    apaRisk: 'APA 7 riskli',
    export: 'Dışa Aktar',
    exportPDF: 'PDF olarak aktar',
    exportDOCX: 'DOCX olarak aktar',
    exportAnnotatedPDF: 'Vurgulu PDF aktar',
    exportBibTeX: 'Kaynakça BibTeX aktar'
  },

  /** PDF reader surface. */
  pdf: {
    title: 'PDF Okuyucu',
    waiting: 'PDF bekleniyor',
    prevPage: 'Önceki sayfa',
    nextPage: 'Sonraki sayfa',
    goToPage: 'Sayfa numarasına git',
    zoomIn: 'Yakınlaştır',
    zoomOut: 'Uzaklaştır',
    fitWidth: 'Genişliğe sığdır',
    fullscreen: 'Tam ekran aç/kapat',
    closeReader: 'PDF okuyucuyu kapat',
    upload: 'PDF Yükle',
    uploadHint: 'PDF yükle veya kütüphaneden seç',
    abstract: 'Özet',
    abstractSearching: 'Özet aranıyor…',
    abstractNotFound: 'Bu kaynak için açık bir özet bulunamadı.',
    abstractNotStored: 'Bu kaynak için özet kayıtlı değil.',
    abstractFetchFailed: 'Özet alınamadı.',
    highlight: 'Vurgu',
    note: 'Not',
    saveAsNote: 'Nota kaydet',
    copySelection: 'Seçimi kopyala',
    statsZero: '0 vurgu · 0 not'
  },

  /** Settings + feature modals tab labels. */
  modals: {
    settingsTitle: 'Ayarlar',
    settingsRecovery: 'Kurtarma / Otomatik Kayıt',
    settingsHistory: 'Belge Geçmişi',
    settingsCapture: 'Tarayıcı Yakalama',
    settingsMatrixAssistant: 'Matris Yardımcısı',
    settingsSync: 'Eşitleme',
    settingsStorage: 'Depolama / Yedekleme',
    settingsUpdates: 'Güncellemeler',
    settingsAbout: 'Hakkında',
    referenceEdit: 'Kaynak Düzenle',
    browserCaptureTitle: 'Tarayıcıdan Yakala',
    historyTitle: 'Belge Sürümleri',
    commandPalette: 'Komut Paleti'
  },

  /** Error / empty / status messages. */
  errors: {
    uiCrashed: 'Arayüz hatası',
    retry: 'Tekrar dene',
    sourceNotInWorkspace: 'Kaynak aktif çalışma alanında değil.',
    pdfNotFound: 'PDF dosyası bulunamadı',
    pdfOpening: 'PDF açılıyor'
  }
} as const;

export type LabelNamespace = keyof typeof L;
