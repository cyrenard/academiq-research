export type LegacyFeature = {
  id: string;
  group: string;
  label: string;
  kind?: 'window' | 'editorCommand' | 'editorAction' | 'module' | 'input';
  fn?: string;
  args?: unknown[];
  module?: string;
  method?: string;
  inputId?: string;
};

export function callLegacy(name: string, ...args: unknown[]) {
  const target = (window as any)[name];
  if (typeof target !== 'function') return false;
  try {
    const result = target(...args);
    return result !== false;
  } catch (error) {
    console.error('[legacy-feature]', name, error);
    return false;
  }
}

export function clickLegacyInput(inputId: string) {
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  if (!input || typeof input.click !== 'function') return false;
  input.click();
  return true;
}

export function runEditorCommand(cmd: string, val?: unknown) {
  const win = window as any;
  const editor = win.editor;
  const commands = win.AQTipTapWordCommands;
  try {
    if (commands && typeof commands.applyCommand === 'function' && editor) {
      const handled = commands.applyCommand(editor, cmd, val);
      if (handled) {
        if (win.AQEditorRuntime && typeof win.AQEditorRuntime.syncCommandUI === 'function') win.AQEditorRuntime.syncCommandUI();
        return true;
      }
    }
    if (typeof win.ec === 'function') {
      win.ec(cmd, val);
      return true;
    }
  } catch (error) {
    console.error('[legacy-editor-command]', cmd, error);
  }
  return callLegacy('ec', cmd, val);
}

export function runEditorAction(fnName: string, ...args: unknown[]) {
  const win = window as any;
  const fn = win.AQUIEventBindings && win.AQUIEventBindings.callEditorActionAndSync;
  if (typeof fn === 'function') {
    try {
      fn(fnName, ...args);
      return true;
    } catch (error) {
      console.error('[legacy-editor-action]', fnName, error);
    }
  }
  return callLegacy(fnName, ...args);
}

export function runLegacyModule(moduleName: string, methodName: string, ...args: unknown[]) {
  const mod = (window as any)[moduleName];
  const method = mod && mod[methodName];
  if (typeof method !== 'function') return false;
  try {
    method(...args);
    return true;
  } catch (error) {
    console.error('[legacy-module]', moduleName, methodName, error);
    return false;
  }
}

export function runLegacyFeature(feature: LegacyFeature) {
  if (feature.kind === 'editorCommand') return runEditorCommand(String(feature.fn || ''), feature.args?.[0]);
  if (feature.kind === 'editorAction') return runEditorAction(String(feature.fn || ''), ...(feature.args || []));
  if (feature.kind === 'module') return runLegacyModule(String(feature.module || ''), String(feature.method || ''), ...(feature.args || []));
  if (feature.kind === 'input' && feature.inputId) return clickLegacyInput(feature.inputId);
  return callLegacy(String(feature.fn || feature.id), ...(feature.args || []));
}

export const legacyFeatures: LegacyFeature[] = [
  { id: 'citation-insert', group: 'Atıf', label: 'Atıf ekle', fn: 'doTrigRef' },
  { id: 'citation-link-plain', group: 'Atıf', label: 'Düz APA atıflarını kaynaklara bağla', fn: 'openPlainCitationLinking' },
  { id: 'citation-link-safe', group: 'Atıf', label: 'Güvenli düz atıfları otomatik bağla', fn: 'linkHighConfidencePlainCitations' },
  { id: 'citation-style-apa', group: 'Atıf', label: 'APA 7 stilini seç', fn: 'setCitationStyle', args: ['apa7'] },
  { id: 'citation-style-chicago', group: 'Atıf', label: 'Chicago stilini seç', fn: 'setCitationStyle', args: ['chicago'] },
  { id: 'citation-style-vancouver', group: 'Atıf', label: 'Vancouver stilini seç', fn: 'setCitationStyle', args: ['vancouver'] },
  { id: 'bibliography-insert', group: 'Kaynakça', label: 'Kaynakça ekle/güncelle', fn: 'insRefs' },
  { id: 'bibliography-refresh', group: 'Kaynakça', label: 'Kaynakçayı yenile', fn: 'refreshBibliographyManual' },
  { id: 'bibliography-reset', group: 'Kaynakça', label: 'Kaynakça elle düzenlemeyi sıfırla', fn: 'resetBibliographyManual' },
  { id: 'bibliography-export-bib', group: 'Dışa Aktar', label: 'Bibliography BIB export', fn: 'expBIB' },
  { id: 'bibliography-export-ris', group: 'Dışa Aktar', label: 'Bibliography RIS export', fn: 'expRIS' },
  { id: 'bibliography-export-csl', group: 'Dışa Aktar', label: 'Bibliography CSL JSON export', fn: 'expCSLJSON' },
  { id: 'bibliography-export-apa', group: 'Dışa Aktar', label: 'APA kaynakça metni export', fn: 'expBibliographyAPA' },
  { id: 'bibliography-export-chicago', group: 'Dışa Aktar', label: 'Chicago kaynakça metni export', fn: 'expBibliographyChicago' },
  { id: 'bibliography-export-vancouver', group: 'Dışa Aktar', label: 'Vancouver kaynakça metni export', fn: 'expBibliographyVancouver' },
  { id: 'notes-export', group: 'Dışa Aktar', label: 'Notları dışa aktar', fn: 'expNotes' },
  { id: 'library-export', group: 'Dışa Aktar', label: 'Kütüphane export et', fn: 'expLib' },
  { id: 'export-preview', group: 'Dışa Aktar', label: 'Dışa aktarma önizlemesini aç', fn: 'openExportPreview' },

  { id: 'paragraph', group: 'Editor', label: 'Paragraf yap', kind: 'editorCommand', fn: 'formatBlock', args: ['p'] },
  { id: 'heading-1', group: 'Editor', label: 'Başlık 1', kind: 'editorCommand', fn: 'formatBlock', args: ['h1'] },
  { id: 'heading-2', group: 'Editor', label: 'Başlık 2', kind: 'editorCommand', fn: 'formatBlock', args: ['h2'] },
  { id: 'heading-3', group: 'Editor', label: 'Başlık 3', kind: 'editorCommand', fn: 'formatBlock', args: ['h3'] },
  { id: 'heading-4', group: 'Editor', label: 'Başlık 4', kind: 'editorCommand', fn: 'formatBlock', args: ['h4'] },
  { id: 'heading-5', group: 'Editor', label: 'Başlık 5', kind: 'editorCommand', fn: 'formatBlock', args: ['h5'] },
  { id: 'bold', group: 'Editor', label: 'Bold', kind: 'editorCommand', fn: 'bold' },
  { id: 'italic', group: 'Editor', label: 'Italic', kind: 'editorCommand', fn: 'italic' },
  { id: 'underline', group: 'Editor', label: 'Underline', kind: 'editorCommand', fn: 'underline' },
  { id: 'strike', group: 'Editor', label: 'Strike', kind: 'editorCommand', fn: 'strikeThrough' },
  { id: 'align-left', group: 'Editor', label: 'Sola hizala', kind: 'editorCommand', fn: 'justifyLeft' },
  { id: 'align-center', group: 'Editor', label: 'Ortala', kind: 'editorCommand', fn: 'justifyCenter' },
  { id: 'align-right', group: 'Editor', label: 'Sağa hizala', kind: 'editorCommand', fn: 'justifyRight' },
  { id: 'align-full', group: 'Editor', label: 'Iki yana yasla', kind: 'editorCommand', fn: 'justifyFull' },
  { id: 'bullet-list', group: 'Editor', label: 'Madde listesi', kind: 'editorCommand', fn: 'insertUnorderedList' },
  { id: 'ordered-list', group: 'Editor', label: 'Numarali liste', kind: 'editorCommand', fn: 'insertOrderedList' },
  { id: 'multilevel-list', group: 'Editor', label: 'Cok seviyeli liste', kind: 'editorCommand', fn: 'applyMultiLevelList', args: ['number'] },
  { id: 'indent', group: 'Editor', label: 'Girintiyi arttir', kind: 'editorCommand', fn: 'indent' },
  { id: 'outdent', group: 'Editor', label: 'Girintiyi azalt', kind: 'editorCommand', fn: 'outdent' },
  { id: 'page-break', group: 'Editor', label: 'Sayfa sonu ekle', kind: 'editorCommand', fn: 'insertPageBreak' },
  { id: 'superscript', group: 'Editor', label: 'Ust simge', kind: 'editorCommand', fn: 'superscript' },
  { id: 'subscript', group: 'Editor', label: 'Alt simge', kind: 'editorCommand', fn: 'subscript' },
  { id: 'line-spacing-1', group: 'Editor', label: 'Satır aralığı 1.0', kind: 'editorAction', fn: 'setLineSpacing', args: ['1'] },
  { id: 'line-spacing-15', group: 'Editor', label: 'Satır aralığı 1.5', kind: 'editorAction', fn: 'setLineSpacing', args: ['1.5'] },
  { id: 'line-spacing-2', group: 'Editor', label: 'Satır aralığı 2.0', kind: 'editorAction', fn: 'setLineSpacing', args: ['2'] },
  { id: 'page-size-a4', group: 'Editor', label: 'Sayfa A4', kind: 'editorCommand', fn: 'setPageSize', args: ['A4'] },
  { id: 'page-size-letter', group: 'Editor', label: 'Sayfa Letter', kind: 'editorCommand', fn: 'setPageSize', args: ['Letter'] },
  { id: 'find-open', group: 'Editor', label: 'Bul', fn: 'toggleFindBar' },
  { id: 'find-next', group: 'Editor', label: 'Sonraki bul', fn: 'findNext' },
  { id: 'find-prev', group: 'Editor', label: 'Önceki bul', fn: 'findPrev' },
  { id: 'zoom-in', group: 'Editor', label: 'Editor zoom arttir', fn: 'editorZoom', args: [10] },
  { id: 'zoom-out', group: 'Editor', label: 'Editor zoom azalt', fn: 'editorZoom', args: [-10] },

  { id: 'insert-table', group: 'Ekle', label: 'Tablo ekle', fn: 'openTableWizard' },
  { id: 'insert-figure', group: 'Ekle', label: 'Şekil/Figure ekle', fn: 'insFig' },
  { id: 'insert-image', group: 'Ekle', label: 'Gorsel ekle', fn: 'insImage' },
  { id: 'insert-blockquote', group: 'Ekle', label: 'Blok alinti ekle', fn: 'insBlkQ' },
  { id: 'insert-cover', group: 'Ekle', label: 'Kapak sayfasi ekle', fn: 'insCover' },
  { id: 'insert-abstract', group: 'Ekle', label: 'Abstract/Özet ekle', fn: 'insAbstract' },
  { id: 'insert-appendix', group: 'Ekle', label: 'Appendix ekle', fn: 'insAppendix' },
  { id: 'template-thesis', group: 'Şablon', label: 'Tez Şablonu uygula', fn: 'applyTemplate', args: ['tez'] },
  { id: 'template-article', group: 'Şablon', label: 'Makale Şablonu uygula', fn: 'applyTemplate', args: ['makale'] },
  { id: 'template-report', group: 'Şablon', label: 'Rapor Şablonu uygula', fn: 'applyTemplate', args: ['rapor'] },
  { id: 'template-literature', group: 'Şablon', label: 'Literatür Şablonu uygula', fn: 'applyTemplate', args: ['literatur'] },
  { id: 'toc-insert', group: 'Belge', label: 'Icindekiler ekle/güncelle', fn: 'insertTOC' },
  { id: 'toc-remove', group: 'Belge', label: 'Icindekileri kaldir', fn: 'removeTOC' },
  { id: 'outline-open', group: 'Belge', label: 'Belge anahatını aç', fn: 'openDocumentOutline' },
  { id: 'caption-manager', group: 'Belge', label: 'Başlık yöneticisini aç', fn: 'openCaptionManager' },
  { id: 'footnote', group: 'Belge', label: 'Dipnot ekle', kind: 'module', module: 'AQFootnotes', method: 'insertFootnote', args: ['footnote'] },
  { id: 'endnote', group: 'Belge', label: 'Sonnot ekle', kind: 'module', module: 'AQFootnotes', method: 'insertFootnote', args: ['endnote'] },
  { id: 'cross-ref', group: 'Belge', label: 'Cross-reference dialog', kind: 'module', module: 'AQFootnotes', method: 'showCrossRefDialog' },
  { id: 'margin-note-mode', group: 'Belge', label: 'Margin note modu', kind: 'module', module: 'AQMarginNotes', method: 'toggleMnMode' },
  { id: 'margin-note-visible', group: 'Belge', label: 'Margin notes göster/gizle', kind: 'module', module: 'AQMarginNotes', method: 'toggleMnVisible' },
  { id: 'track-toggle', group: 'Değişiklik İzleme', label: 'Track changes aç/kapat', fn: 'toggleTrackChangesMode' },
  { id: 'track-next', group: 'Değişiklik İzleme', label: 'Sonraki değişikliğe git', fn: 'focusNextTrackedChange' },
  { id: 'track-prev', group: 'Değişiklik İzleme', label: 'Önceki değişikliğe git', fn: 'focusPrevTrackedChange' },
  { id: 'track-accept-current', group: 'Değişiklik İzleme', label: 'Seçili değişikliği kabul et', fn: 'acceptCurrentTrackedChange' },
  { id: 'track-reject-current', group: 'Değişiklik İzleme', label: 'Seçili değişikliği reddet', fn: 'rejectCurrentTrackedChange' },
  { id: 'track-accept-all', group: 'Değişiklik İzleme', label: 'Tüm değişiklikleri kabul et', fn: 'acceptTrackedChanges' },
  { id: 'track-reject-all', group: 'Değişiklik İzleme', label: 'Tüm değişiklikleri reddet', fn: 'rejectTrackedChanges' },

  { id: 'pdf-toggle', group: 'PDF', label: 'PDF panelini aç/kapat', fn: 'togglePDF' },
  { id: 'pdf-upload', group: 'PDF', label: 'PDF yükle', kind: 'input', inputId: 'lfinp' },
  { id: 'pdf-prev', group: 'PDF', label: 'PDF önceki sayfa', fn: 'pPrev' },
  { id: 'pdf-next', group: 'PDF', label: 'PDF sonraki sayfa', fn: 'pNext' },
  { id: 'pdf-zoom-in', group: 'PDF', label: 'PDF zoom arttir', fn: 'pZI' },
  { id: 'pdf-zoom-out', group: 'PDF', label: 'PDF zoom azalt', fn: 'pZO' },
  { id: 'pdf-fit', group: 'PDF', label: 'PDF sayfaya sigdir', fn: 'pZFit' },
  { id: 'pdf-search', group: 'PDF', label: 'PDF arama', fn: 'togglePdfSearch' },
  { id: 'pdf-thumbs', group: 'PDF', label: 'PDF thumbnails', fn: 'toggleThumbs' },
  { id: 'pdf-outline', group: 'PDF', label: 'PDF outline', fn: 'toggleOutline' },
  { id: 'pdf-annots', group: 'PDF', label: 'PDF annotations', fn: 'togglePdfAnnotations' },
  { id: 'pdf-related', group: 'PDF', label: 'PDF related papers', fn: 'togglePdfRelated' },
  { id: 'pdf-annot-mode', group: 'PDF', label: 'PDF annotation modu', fn: 'toggleAnnotMode' },
  { id: 'pdf-draw-mode', group: 'PDF', label: 'PDF cizim modu', fn: 'toggleDrawMode' },
  { id: 'pdf-region', group: 'PDF', label: 'PDF bölge yakalama', fn: 'togglePdfRegionCaptureMode' },
  { id: 'pdf-draw-clear', group: 'PDF', label: 'PDF sayfa çizimini temizle', fn: 'clearPdfDrawingPage' },
  { id: 'pdf-fullscreen', group: 'PDF', label: 'PDF tam ekran', fn: 'togglePdfFullscreen' },
  { id: 'pdf-ocr-scan', group: 'PDF OCR', label: 'OCR tarama gerekli mi', fn: 'runPdfOcrNeedScan' },
  { id: 'pdf-ocr-run', group: 'PDF OCR', label: 'OCR çalıştır', fn: 'runPdfOcrExtractionNow' },
  { id: 'pdf-ocr-retry', group: 'PDF OCR', label: 'OCR hatalı sayfaları tekrar dene', fn: 'runPdfOcrRetryFailedNow' },
  { id: 'pdf-ocr-cancel', group: 'PDF OCR', label: 'OCR işlemini iptal et', fn: 'cancelPdfOcrRun' },
  { id: 'pdf-ocr-status', group: 'PDF OCR', label: 'OCR durumunu göster', fn: 'showPdfOcrStatus' },

  { id: 'reference-import-bib', group: 'Kaynak', label: 'BibTeX/RIS içe aktar', kind: 'input', inputId: 'bibinp' },
  { id: 'reference-import-zotero', group: 'Kaynak', label: 'Zotero içe aktar', kind: 'input', inputId: 'zoteroinp' },
  { id: 'reference-import-external', group: 'Kaynak', label: 'Harici kaynak içe aktar modal', fn: 'openExternalReferenceImportModal' },
  { id: 'reference-duplicates', group: 'Kaynak', label: 'Duplicate review aç', fn: 'openDuplicateReview' },
  { id: 'reference-metadata-health', group: 'Kaynak', label: 'Metadata health center aç', fn: 'openMetadataHealthCenter' },
  { id: 'reference-collections', group: 'Kaynak', label: 'Koleksiyon yonetimi', fn: 'openCollectionManager' },
  { id: 'reference-labels', group: 'Kaynak', label: 'Label filtre paneli', fn: 'toggleLabelFilterPanel' },
  { id: 'reference-related', group: 'Kaynak', label: 'Related papers paneli', fn: 'toggleRelatedPanel' },
  { id: 'reference-batch-oa', group: 'Kaynak', label: 'Batch open access PDF indir', fn: 'batchDownloadOA' },
  { id: 'reference-batch-cites', group: 'Kaynak', label: 'Batch citation metadata cek', fn: 'batchFetchCitations' },
  { id: 'matrix-open', group: 'Literatür Matrisi', label: 'Literatür matrisini aç', fn: 'openLiteratureMatrix' },
  { id: 'matrix-toggle', group: 'Literatür Matrisi', label: 'Literatür matrisini aç/kapat', fn: 'toggleLiteratureMatrix' },
  { id: 'theme-toggle', group: 'Görünüm', label: 'Tema değiştir', fn: 'toggleTheme' },
  { id: 'zen-toggle', group: 'Görünüm', label: 'Odak/Zen modu', fn: 'toggleZenMode' },
  { id: 'sync-settings', group: 'Ayarlar', label: 'Sync ayarlari', fn: 'showSyncSettings' }
];

export function getLegacyFeatures(group?: string) {
  return group ? legacyFeatures.filter((feature) => feature.group === group) : legacyFeatures;
}
