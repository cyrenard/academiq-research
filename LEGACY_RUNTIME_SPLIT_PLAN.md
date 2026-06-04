# LEGACY_RUNTIME_SPLIT_PLAN — legacy-runtime.js emekliye ayırma

> Hedef: `src/legacy-runtime.js` (~14.8k satır) doc-engine monolitini, **state
> emekliliği** yoluyla aşamalı küçültmek. Her dilim: tek domain → state
> okuma/yazmasını appStore'a bağla (legacy `S` yalnızca write-through alıcısı
> kalır) → `tsc --noEmit` + `vitest` yeşil → canlı `tauri:dev` doğrulaması →
> ayrı commit. Son güncelleme: 2026-06-04.

## 0) Mevcut mimari (keşif)
```
S (global, legacy-runtime.js:108) ──write-through (legacy-state-bridge)──► appStore ──► React (selector)
   │
   ├── *-state.js singleton'ları (index.html:94-117) ZATEN ayrılmış:
   │     notes / notebook / highlight / annotation / pdf-tabs / state-schema /
   │     document / bibliography / library / doc-tabs / sync
   │
   └── legacy-runtime.js = DAVRANIŞ/RENDER/UI katmanı (script-tag, global scope, IIFE değil)
```
- Yükleme: `index.html` sırayla script-tag; `legacy-runtime.js` EN SON (satır 118).
- `S` kanonik kalıcı state; appStore write-through ile besleniyor. React tarafı
  appStore selector'larıyla okur.
- `academiq-research.html` (kök) = ESKİ tek-dosya arşiv sürümü; canlı uygulamanın
  parçası DEĞİL. Dokunma.
- DOKUNMA YASAĞI: `experiments/aq-engine/**` (editör motoru). `trackChangesEnabled`
  okumaları oradan write-through ile beslenir.

## 1) Domain sınıflandırması (legacy-runtime.js TOC'a göre)
- **Kategori A — saf veri / CRUD** (appStore'a en kolay; çoğu React'e zaten taşınmış):
  DOCUMENT TABS, WORKSPACES, NOTEBOOKS, NOTES, REFS, APA 7, CITATION COUNT, CUSTOM LABELS.
- **Kategori B — DOM-ağır UI** (React'e taşınabilir): UI/modals, SYNC SETTINGS UI,
  THUMBNAIL, OUTLINE/TOC, FIND & REPLACE.
- **Kategori C — pdfjs/imperatif** (taşınmaz; legacy kalır veya ayrı modül):
  PDF UPLOAD/RENDER/TABS/ANNOTATIONS/DRAWING/SEARCH/SYNC, HIGHLIGHT PERSIST,
  TIPTAP INIT (aq-engine sınırı), EXPORT, KEYBOARD SHORTCUTS.

## 2) Çalışma yöntemi (dikey dilim, en düşük riskten)
Her domain için adımlar:
1. React+appStore tarafında domain'in zaten karşılığı var mı tespit et
   (varsa legacy fonksiyonlar **ölü kod** → güvenle kaldır).
2. Yoksa: legacy fonksiyonun `S.*` okuma/yazmasını appStore'a yönlendir; mutasyonu
   `appStore.setState` veya ilgili `*-state.js` API'sine devret.
3. Her fonksiyonun TÜM çağıranlarını say (legacy-runtime içi + diğer src/*.js +
   React + HTML onclick + window expose). 1 occurrence = yalnız tanım = ölü.
4. `tsc --noEmit` + `vitest run` yeşil; canlı doğrulama; ayrı commit (sadece kendi
   dosyaların `git add`, `-A` kullanma).

## 3) Dilim sırası ve durum
| # | Dilim | Satır (yakl.) | Durum | Not |
|---|-------|---------------|-------|-----|
| 1 | DOCUMENT TABS — ölü fonksiyonlar | 1182-1235 | ✅ tamam | createDoc/switchDoc/renameDoc/deleteDoc/showDocMenu/nextDocName kaldırıldı (~54 satır). React (DocumentTabs+appStore) tam karşılıyor. `rDocTabs` (12 iç çağrı + browser-capture guard) KALDI. tsc+vitest(720) yeşil; canlı doğrulandı (belge sekmesi ekle/değiştir). |
| 2 | ÖLÜ KOD SÜPÜRME (13 fonksiyon) | dağınık | ✅ tamam | Tüm dosya tarandı (559 fn). occurrence=1 olan 56 adaydan dış çağıranı olanlar elendi → 13 gerçek ölü: rThemes, showLabelMenuLegacy, addManualReference, showMoveMenu, setPdfAnnotationQuery, getFindCountEl, toggleTrigSel, toggleToolbarMenu, applyEditorListStyle, initPdfAnnotBody, buildNarrativeCitationHTML, replaceTOCInEditorHTML, __handleMetadataHealthAction. ~495 satır (14835→14340). brace-aware script + `node --check`; tsc+vitest(720) yeşil; canlı doğrulandı. |
| 3 | CUSTOM LABELS | dağınık | 🟡 state emekli | KEŞİF: Label UI+state ZATEN React+appStore (appState.customLabels, handleCreate/Delete/ToggleReferenceLabel → persistState). Legacy S.customLabels/activeLabelFilter kanonik DEĞİL; legacy label fn'leri (rLabelFilter/openLabelPickerPanel/showLabelMenu) DOM yok → no-op. **State emekliliği TAMAM.** Fiziksel ölü-render temizliği library zincirine bağlı → dilim 5'e devredildi. |
| 4 | WORKSPACES (rWS/rDocTabs no-op temizliği) | dağınık | ✅ tamam | rWS (`wsbar`→yok) + rDocTabs (`doctabs`→yok) no-op; React WorkspaceTabs/DocumentTabs karşılıyor. 18 çağrı (rWS=7, rDocTabs=11) + 2 tanım kaldırıldı (~35 satır). browser-capture.js guard'lı çağrıları (typeof check) dokunulmadı. node --check + tsc + vitest(720) yeşil; canlı doğrulandı (workspace ekle modal). |
| 5a | LIBRARY render (rLib) emekliliği | rLib | ✅ tamam | rLib `getElementById('liblist')`→yok→no-op; React RefSidebar `references={activeWorkspace.lib}` karşılıyor. 47 çağrı + tanım (~326 satır) kaldırıldı → dosya 14k altına (13979). React adapter'lar (legacy-dom-helpers/quality-surface) typeof-guard'lı, dokunulmadı. node --check + tsc + vitest(720) yeşil; canlı doğrulandı (reference sidebar). |
| 5b | LABEL render zinciri emekliliği | rLabelFilter, openLabelPickerPanel, showLabelMenu, closeCtxLabelPanel, setLabelFilterPanelOpen, toggleLabelFilterPanel, deleteCustomLabel + activeLabelFilter/labelFilterPanelOpen | ✅ tamam | 7 no-op fn + deleteCustomLabel reassign + 2 state (activeLabelFilter/labelFilterPanelOpen) kaldırıldı (~301 satır → 13979→13678). Dış çağrılar elle ayıklandı: rRefs contextmenu bloğu, showSidebarRefMenu "Etiket Ekle"+closeCtxLabelPanel, hideCtx closeCtxLabelPanel, label-panel outside-click handler. React command-palette kaydı (legacy-feature-adapter.ts 'reference-labels') silindi. Label create/delete/toggle React'te (App.tsx → appStore). node --check + tsc + vitest(720) yeşil. |
| 4 | REFS kart aksiyonları | 6655-7257 | ⬜ | RefSidebar ile örtüşme. |
| 5 | UI modals / dropdowns | 8346-8619 | ⬜ | React modal'a. |
| 6 | PDF / TIPTAP / EXPORT (Kategori C) | — | ⬜ | Büyük ölçüde legacy kalır; kapsam dışı. |

## 4) Bulgular (dilim 1 analizi)
- React `DocumentTabs` (App.tsx:2016) handler'ları TAMAMEN appStore:
  `switchDocument` / `addDocument` / `renameDocument` / `deleteDocument`
  (app-state.ts saf fn → `persistState`). Legacy `createDoc/switchDoc/...` çağrılmıyor.
- `#doctabs` DOM elementi index.html'de YOK → `rDocTabs` no-op.
- Kaldırılan 6 fonksiyonun HTML onclick / window expose çağrısı yok (yalnızca
  `academiq-research.html` arşivinde duplicate tanım var — canlı değil).
