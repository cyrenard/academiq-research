# Gemini görevi — legacy-runtime.js domain'lerini appStore'a porte et (strangler, sırayla)

Sen `migrate-tauri-debt` worktree'sinde, `debt/phase3-statestore` dalında çalışıyorsun.
Mekanik `win.S → appStore` okuma taşıması BİTTİ. Bu görev, `src/legacy-runtime.js`
(~14.600 satır) içinde hâlâ duran legacy-owned domain'leri React/appStore'a taşıyıp
`win.S` dikişini adım adım daraltmaktır.

**Sırayla yap (küçükten büyüğe), her domain ayrı commit:**
1. Notes / Notebooks
2. Research Matrix
3. Doc-engine (docs/curDoc/track-changes) — EN SON, en riskli

Her domaini bitirmeden bir sonrakine GEÇME. Her domain sonunda yeşil bırak.

---

## Değişmez kurallar

1. **Dal:** sadece `debt/phase3-statestore`. Başka dala geçme, push ETME, rebase ETME.
2. **Worktree:** `C:\Users\iceti\OneDrive\Masaüstü\academiq-research-2.1.18\.claude\worktrees\migrate-tauri-debt`
3. **DOKUNMA (başka ajan aktif olarak üzerinde çalışıyor — merge çakışması yaratma):**
   - `src/renderer/lib/citation-finder/**` (tümü)
   - `src/renderer/components/shell/CitationFinderModal.tsx`
   - `src/renderer/components/shell/CommentsFeature.tsx`
   - `src/renderer/lib/aq-engine/**`
   - `experiments/aq-engine/**`
4. **Köprüyü BOZMA — bunlar kasıtlı dikiş, kaldırma:**
   - `src/renderer/lib/legacy-state-bridge.ts` (`publishStateToLegacyWindow` — React→legacy yazma)
   - `appStore.setState` içindeki write-through (`publishStateToLegacyWindow(currentState)`)
   - `window.__aqReactSyncFromLegacy` (legacy→React hidrasyon)
   - `legacy-doc-helpers.ts`, `legacy-dom-helpers.ts`, `quality-surface.ts`,
     `external-reference-import.ts` içindeki köprü yorumları/çağrıları
5. **Stale-read TUZAĞI:** `window.__aqReactSyncFromLegacy` OTOMATİK DEĞİL — sadece belirli
   noktalarda çağrılıyor. Bu yüzden legacy bir mutasyondan HEMEN SONRA `win.S` okuyan kod,
   legacy'nin otoriter kopyasını okuyor. Bunu körlemesine `appStore.getState()` ile
   değiştirme — önce o domaini appStore'a SAHİP yapacaksın, sonra okuma+yazma ikisini de
   appStore'a alacaksın. Tek tarafı taşırsan stale-read regresyonu olur.
6. **Persistence mutasyonları:** legacy nesnesine yazıp legacy save zincirinin görmesini
   bekleyen kod (örn. `App.tsx:~1340` `legacyRef.pdfData = buffer`) — appStore'a taşıdıktan
   sonra DA write-through (`publishStateToLegacyWindow`) sayesinde `win.S`'e yansımalı.
   Persistence'in kırılmadığını test ile kanıtla.
7. **Her domain sonunda ZORUNLU:**
   - `npx tsc --noEmit` → 0 hata
   - `npx vitest run` → şu an 618 test geçiyor; SAYI DÜŞMESİN, yeni domain için test EKLE
   - Yeşilse commit. Kırmızıysa düzelt, commit etme.
8. Commit mesajı sonu:
   ```
   Co-Authored-By: Gemini <noreply@google.com>
   ```

---

## appStore API (zaten var, kullan)

`src/renderer/lib/app-store.ts`:
- `appStore.getState()` / `appStore.setState(next | partial | (state)=>partial)`
  - `setState` zaten `publishStateToLegacyWindow(currentState)` ile `win.S`'e yazıyor.
- `useAppStore(selector)` — React aboneliği (useSyncExternalStore).
- Seçiciler: `selectWorkspace(state, id?)`, `selectCurrentWorkspace(state)`,
  `selectCurrentWorkspaceId(state)`, `selectWorkspaceLibrary(state, id?)`,
  `selectReferenceById(state, id, ws?)`, `selectNotes(state)`.

State şekli `src/renderer/lib/app-state.ts` (`AcademiqAppState`, `createBlankState`).
Domaini porte ederken alanı (varsa) buraya ekle/şema garantisi ver ve `createBlankState`'te
başlat. `win.S` ile birebir aynı isimleri koru (legacy-runtime.js o isimlerle okuyor).

---

## DOMAIN 1 — Notes / Notebooks (önce bu)

**ÖNEMLİ:** `app-state.ts` şemasında alanlar ZATEN VAR (`notes: AcademiqNote[]`,
`notebooks?: {id,name,wsId?}[]`, `curNb?: string`) ve `createBlankState` bunları
**workspace-scoped** başlatıyor: `notebooks: [{ id:'ws1:nb1', wsId:'ws1', name:'Genel Notlar' }]`,
`curNb: 'ws1:nb1'`. Yani ŞEMA EKLEME YOK — sadece okuma/yazmayı appStore'a al ve
defterin workspace-scoped (wsId + `ws:nb` id) şeklini KORU. Legacy bloktaki `{id:'nb1'}`
varsayılanı eski/scoped-değil — şema şeklini referans al, onu kopyalama.

**Mevcut legacy-owned saha:** `src/renderer/components/shell/LegacyCompatibilityHost.tsx`
~satır 1409-1448 (her çalıştırmadan önce `grep -nE "win\.S\.(notes|notebooks|curNb)"` ile
DOĞRULA, satır numaraları kayar):
```
if (!Array.isArray(win.S.notes)) win.S.notes = [];
if (!Array.isArray(win.S.notebooks) || !win.S.notebooks.length) { win.S.notebooks = [{ id:'nb1', name:'Genel Notlar' }]; }
if (!win.S.curNb) win.S.curNb = win.S.notebooks[0]?.id || 'nb1';
... note = { wsId: win.S.cur, nbId: win.S.curNb, ... }
win.S.notes.unshift(note);
```

**Yapılacak:**
1. `app-store.ts`'e saf, test edilebilir yardımcılar ekle:
   - `selectNotebooks(state)`, `selectCurrentNotebookId(state)`
   - `ensureNotebooks(state): Partial<state>` (varsayılan defteri garanti eder — schema'daki
     workspace-scoped şekille; zaten doluysa boş `{}` döndür, gereksiz setState tetikleme)
   - `addNote(state, note): Partial<state>` (notes'un başına ekler, immutable)
2. `LegacyCompatibilityHost.tsx`'teki blokları: önce `appStore.setState(ensureNotebooks)`,
   okuma için `appStore.getState().curNb/cur`, ekleme için `appStore.setState(s => addNote(s, note))`.
   `setState` write-through ile `win.S.notes/notebooks/curNb`'i zaten güncelleyecek — yani
   legacy-runtime.js kırılmaz.
4. **Test:** `app-store.test.ts`'e `ensureNotebooks`/`addNote`/`selectNotebooks` için birim
   testler ekle (immutability + varsayılan defter + unshift sırası + write-through doğrula).
5. tsc + vitest yeşil → commit: `feat(debt): port notes/notebooks domain to appStore`

---

## DOMAIN 2 — Research Matrix

**DİKKAT — bu domain Domain 1'den daha bağımlı.** `matrixApi` ayrı bir TS modülü DEĞİL;
`LegacyCompatibilityHost.tsx` ~1468'de legacy global'den alınıyor:
```
const matrixApi = win.AQLiteratureMatrixState;   // legacy-runtime.js global
...
matrixApi.ensureRowForReference(win.S, win.S.cur, ref, {...})
matrixApi.appendTextToCell(win.S, win.S.cur, row.id, column, selectedText, {...})
matrixApi.appendNoteToCell(win.S, win.S.cur, row.id, column, '', selectedText, {...})
```
Yani matris MANTIĞI hâlâ legacy-runtime.js içinde ve `win.S`'i in-place mutasyonluyor.
React tarafı sadece çağırıcı. Bu yüzden bu domaini "porte etmek" iki ölçekte düşünülmeli.

**Yapılacak (muhafazakâr dilim — önce bunu yap):**
1. matris mantığını legacy-runtime.js'ten ÇIKARMA (büyük iş, ayrı). Bunun yerine sadece
   React çağırıcısını state-tutarlı hâle getir: `matrixApi.*` çağrılarından SONRA
   `appStore.setState({ wss: win.S.wss, ... })` ile legacy'nin az önce mutasyonladığı alanları
   appStore'a geri senkronla — ya da daha temizi, `win.__aqReactSyncFromLegacy(win.S)` çağır
   (zaten köprü bu iş için var). Böylece React state'i matris mutasyonundan sonra stale kalmaz.
   matris verisinin `win.S`'te HANGİ alanda durduğunu (`wss[].matrix`? top-level?) önce `grep`/
   inceleme ile DOĞRULA; sync'i o alana göre yap.
2. matrixApi imzasını DEĞİŞTİRME (legacy-runtime.js kendi içinde de çağırıyor).
3. **Test:** matris ekleme sonrası appStore.getState()'in legacy mutasyonla tutarlı olduğunu
   doğrulayan bir test ekle (`grep -rn matrix tests/ src/renderer` ile mevcutları referans al).
4. tsc + vitest yeşil → commit: `feat(debt): sync appStore after legacy matrix mutations`

> Not: Matris mantığının tamamını legacy'den TS'e taşımak ayrı/büyük bir iştir; bu dilimde
> SADECE state tutarlılığını sağla, mantığı taşıma. Tam taşıma gerekirse önce harita çıkar.

---

## DOMAIN 3 — Doc-engine (docs / curDoc / track-changes) — EN SON

Bu en büyük ve en riskli. `win.getCurrentDocument()` (legacy) ve `win.S.docs/curDoc` çok
yerde okunuyor; aq-engine zaten doc modelinin bir kısmını sağlıyor. Bu domaine BAŞLAMADAN
ÖNCE bir "etki haritası" çıkar ve commit et (kod değil, sadece markdown):
- `grep -rn "getCurrentDocument\|\.docs\b\|curDoc\|trackChanges" src/renderer` ile tüm okuma/yazma
  sahalarını listele.
- Her sahayı sınıflandır: (a) appStore'a taşınabilir saf okuma, (b) legacy doc-engine'e bağımlı
  (aq-engine'e devredilmeli — DİKKAT: aq-engine dosyalarına DOKUNMA yasağı var, sadece okuma
  tarafını appStore selector'a çevir), (c) persistence mutasyonu.
- Haritayı `DOC_ENGINE_PORT_MAP.md` olarak commit et ve DUR. İnsan onayı bekle; tek hamlede
  porte etme.

---

## Akış özeti
- Domain 1 → tsc+vitest yeşil → commit.
- Domain 2 → tsc+vitest yeşil → commit.
- Domain 3 → sadece harita çıkar, commit, dur.
- Hiçbir aşamada DOKUNMA listesindeki dosyalara dokunma, push etme.
- Takıldığın/şüpheli her noktada (özellikle stale-read) DUR ve not bırak; tahmin etme.
