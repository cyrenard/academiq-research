# Legacy Electron Data Schema — Migration Reference

**Captured from live user environment on 2026-05-18.** This is the actual schema
Codex must migrate from in the Phase 8 hotfix.

> **Hotfix #1 sebebi**: Migration kodu `app_data_dir()` (Roaming) kullandı, ama
> Electron `process.env.LOCALAPPDATA || app.getPath('userData')` kullanıyor
> ([main.js:86](../main.js#L86)) → tam yol `%LOCALAPPDATA%\AcademiQ\`.

---

## Kök Konum

```
%LOCALAPPDATA%\AcademiQ\
  Windows tam: C:\Users\<USER>\AppData\Local\AcademiQ\
```

**ASLA**: `%APPDATA%\academiq-research\` veya `%APPDATA%\com.academiq.research\` —
bunlar boş Tauri data dizinleri, kaynak değil.

---

## Dosya/Klasör Envanteri (kullanıcı makinesinden ölçüldü)

| Yol | Tip | Boyut/Sayı | Migration hedefi |
|---|---|---|---|
| `academiq-data.json` | JSON | 867 B | SQLite `documents` + `kv.state_blob` |
| `academiq-data.json.bak` | JSON | 867 B | Korunsun (rollback için) |
| `academiq-data.json.recovery.json` | JSON | 1.4 KB | Korunsun (autosave recovery) |
| `document-history.json` | JSON | 28.8 MB | SQLite `revisions` (824 snapshot, 81 doc) |
| `settings.json` | JSON | 1.3 KB | `kv.settings` |
| `capture-agent-state.json` | JSON | 490 B | `%APPDATA%\com.academiq.research\capture-sidecar\` (Tauri sidecar zaten oraya bakıyor) |
| `capture-queue.json` | JSON | 63 B | Aynı yer |
| `capture-targets.json` | JSON | 436 B | Aynı yer |
| `session-state.json` | JSON | 254 B | `kv.session_state` |
| `ui-load-probe.json` | JSON | 16 KB | İsteğe bağlı, ignore edilebilir |
| `renderer-errors.log` | TEXT | 3.4 MB | İsteğe bağlı, taşıma yok (eski tanı log'u) |
| `pdfs/` | klasör | 12 dosya | `%APPDATA%\com.academiq.research\pdfs\` (copy) |
| `workspaces/` | klasör | 7 ws / 68 PDF | `%APPDATA%\com.academiq.research\workspaces\` (copy) |
| `browser-capture-extension/` | klasör | extension kaynak | Tauri sidecar zaten bundle'dan yeniden push ediyor — ignore |
| `browser-capture-profile/` | klasör | tarayıcı profil | Korunsun yerinde (Tauri zaten extension'u yeniden yapılandırıyor) |
| `runtime-overrides/` | klasör | runtime patch'leri | İgnore (Electron-spesifik) |
| `runtime-legacy/` | klasör | eski runtime backup | İgnore |
| `updates/` | klasör | 2 eski installer (240 MB) | İgnore (eski .exe'ler, gerek yok) |
| `tesseract-cache/` | klasör | OCR cache | Korunsun yerinde (Tauri JS tesseract.js aynı path'i kullanabilir, ya da yeniden cache'lenir) |
| `institutional-downloads/` | klasör | indirme cache | Korunsun yerinde |
| `AcademiQ.bat` | TEXT | 201 B | İgnore |

---

## Şema #1: `academiq-data.json`

```json
{
  "schemaVersion": 3,
  "wss": [
    {
      "id": "ws1",
      "name": "Calisma Alani 1",
      "docId": "doc1",
      "collections": [],
      "notebooks": [{ "id": "nb1", "name": "Genel Notlar" }],
      "curNb": "nb1",
      "notes": [],
      "lib": []
    }
  ],
  "cur": "ws1",                  // aktif workspace
  "notebooks": [...],            // global notebooks (legacy)
  "curNb": "nb1",
  "notes": [],
  "doc": "<p>...</p>",           // legacy single-doc içeriği (bypass)
  "cm": "apa7",                  // citation mode
  "docs": [                      // ASIL DOC LİSTESİ
    {
      "id": "doc1",
      "name": "Calisma Alani 1",
      "content": "<p>...</p>",
      "bibliographyHTML": "",
      "bibliographyManual": false,
      "bibliographyExtraRefIds": [],
      "coverHTML": "",
      "tocHTML": "",
      "appendicesHTML": "",
      "citationStyle": "apa7",
      "trackChangesEnabled": false
    }
  ],
  "curDoc": "doc1",
  "showPageNumbers": false,
  "customLabels": [],
  "literatureMatrix": {
    "ws1": {
      "rows": [],
      "selectedCell": null,
      "dismissedReferenceIds": [],
      "updatedAt": 1778941727256
    }
  }
}
```

**Migration mapping**:

| Field | SQLite hedefi |
|---|---|
| `docs[]` | `documents` tablosu (her doc bir satır; `body_json` = full doc obj) |
| `wss[]` | `tabs` tablosu + workspace bilgisi `kv.workspaces` |
| `cur` | `kv.active_workspace` |
| `curDoc` | `kv.active_doc` |
| `cm`, `showPageNumbers`, `customLabels` | `kv.settings` (settings.json ile birleşir) |
| `literatureMatrix` | `kv.literature_matrix` veya yeni tablo |
| **TÜM ÜST DÜZEY OBJE** | `kv.state_blob` (lossless round-trip için — Faz 2'de zaten yapılmış pattern) |

---

## Şema #2: `document-history.json` (28.8 MB, 824 snapshot, 81 doc)

```json
{
  "version": 1,
  "updatedAt": 1779033900037,
  "docs": {
    "<docId>": {
      "docId": "xmnq5mauwuurk4l2qdqb",
      "docName": "test",
      "updatedAt": 1775809917852,
      "snapshots": [
        {
          "id": "ver-1775809893774-2c52c733",
          "createdAt": 1775809893774,
          "docName": "test",
          "content": "<p>...</p>",         // FULL doc HTML
          "excerpt": "...",
          "wordCount": 1,
          "charCount": 6,
          "contentHash": "5b9f35266569...",
          "source": "autosave"               // veya "manual"
        }
      ]
    }
  }
}
```

**Migration**: her `docs[*].snapshots[*]` → `revisions` tablosunda bir satır:

```sql
INSERT INTO revisions (doc_id, snapshot_json, created_at)
  VALUES (?docId, ?snapshot_full_json, ?createdAt);
```

**Önemli**: 824 satır × 28.8 MB toplam = ~35 KB ortalama snapshot. Tek transaction
içinde batch insert. Bellek için chunk'la (örn 100'er).

**docHistory:get / docHistory:restore** komutları (Faz 1'de portlandı) bu
revisions tablosundan okumaya devam etsin — şema zaten Faz 2'de kuruldu.

---

## Şema #3: `settings.json`

```json
{
  "syncDir": "",
  "theme": "",
  "browserCapture": {
    "token": "aq_48g8tywfrktmnpx6b81l1w6dfz7t2g",
    "port": 27183,
    "defaultBrowserLabel": "Firefox",
    "defaultBrowserProgId": "FirefoxURL-F0DC299D809B9700",
    "browserFamily": "firefox",
    "installDir": "C:\\Users\\iceti\\AppData\\Local\\AcademiQ\\browser-capture-extension\\firefox",
    "guidePath": "...\\INSTALLATION.txt",
    "lastPreparedAt": 1778788891853,
    "setupPromptSeen": true,
    "browserOpenCommand": "...",
    "browserExecutablePath": "C:\\Program Files\\Zen Browser\\zen.exe",
    "bundledExtensionVersion": "1.0.0",
    "bridgeProtocolVersion": 1,
    "lastVerificationAt": 1777473561177,
    "lifecycleState": "installed_not_verified",
    "compatibilityState": "pending_verification",
    "lastLifecycleAction": "update",
    "lastError": "",
    "lastConnectedAt": 1775670708860,
    "installedExtensionVersion": "1.0.0",
    "installedProtocolVersion": 1,
    "updatePending": false,
    "lastUsedWorkspaceId": "ws_mowy92y7_kddgv4",
    "pendingPayloads": [],
    "lastUsedComparisonId": "",
    "agentAutoStartSupported": true,
    "agentAutoStart": false,
    "managedProfileDir": "",
    "enabled": true
  }
}
```

**Migration**: `kv.settings` = full JSON (lossless). Tauri sync/syncDir komutları
bu blob'tan okur.

**Dikkat**: `browserCapture.installDir` ve `guidePath` Electron yerel path'leri.
Tauri sidecar yeniden yazdığında bu path'ler güncellenecek (Faz 6 zaten
`prepareSetup` ile yapıyor).

---

## Şema #4: capture-* dosyaları

`capture-agent-state.json`, `capture-queue.json`, `capture-targets.json` —
Tauri sidecar zaten kendi data dizinine yazıyor
(`%APPDATA%\com.academiq.research\capture-sidecar\`).

**Migration**: kopyala (kullanıcı browser capture konfigürasyonunu kaybetmesin):

```
%LOCALAPPDATA%\AcademiQ\capture-agent-state.json
  → %APPDATA%\com.academiq.research\capture-sidecar\agent-state.json
%LOCALAPPDATA%\AcademiQ\capture-queue.json
  → %APPDATA%\com.academiq.research\capture-sidecar\queue.json
%LOCALAPPDATA%\AcademiQ\capture-targets.json
  → %APPDATA%\com.academiq.research\capture-sidecar\targets.json
```

Sidecar bridge.rs ([src-tauri/src/capture/bridge.rs:62](../src-tauri/src/capture/bridge.rs#L62))
zaten bu dizini env olarak veriyor — sidecar JS tarafı bu dosya isimlerini okur.

---

## Şema #5: `session-state.json`

```json
{
  "previousCleanExit": true,
  "cleanExit": true,
  "launchedAt": 1779033873101,
  "appVersion": "1.1.8",
  "updatedAt": 1779033900545,
  "closedAt": 1779033900544,
  "lastSavedAt": 1779033900453,
  "lastSaveError": "",
  "lastDraftAt": 1779033877835
}
```

**Migration**: `kv.session_state` = full JSON. Tauri başlatma sırasında bu'na
bakıp "crash sonrası açılıyor mu" tespit edebilir.

---

## PDF Dosyaları

### Root `pdfs/`

12 dosya, workspace-bağımsız (legacy). Adlandırma kalıpları:

- `10.3389_frai.2025.1614993__<hash>.pdf` (DOI-based)
- `https___openalex.org_W4407637219__<hash>.pdf` (URL-based)
- `ref_<refId>__<hash>.pdf` (internal ref)

**Migration**: doğrudan kopyala `%APPDATA%\com.academiq.research\pdfs\`.
Tauri'nin `pdf:save/load/exists` komutları `pdf_path` parametresiyle çalışıyor —
yeni konumdan okuyacak.

### Workspace-bound `workspaces/<ws>/pdfs/`

7 workspace, 68 PDF (toplam ~280 MB):

```
workspaces/AcademiQ-12-4f0391/pdfs/         (5 file)
workspaces/AcademiQ-Calisma Alani 1-9ae7f5/pdfs/  (1)
workspaces/AcademiQ-EĞT. ARŞ-f106db/pdfs/   (6)
workspaces/AcademiQ-RC-4f0391/pdfs/         (6)
workspaces/AcademiQ-Test-31d816/pdfs/       (22)
workspaces/AcademiQ-Workspace 1-3c2a2d/pdfs/ (3)
workspaces/AcademiQ-Workspace 2-3c2a2d/pdfs/ (25)
```

**Migration**: tüm `workspaces/` klasörünü kopyala:

```
%LOCALAPPDATA%\AcademiQ\workspaces\  → %APPDATA%\com.academiq.research\workspaces\
```

Klasör adında Türkçe karakter (`EĞT. ARŞ`) var — encoding'e dikkat (Rust'ta
OsString güvenli; std::fs::copy_dir_all kullanılabilir).

---

## Migration Algoritması (önerilen)

```
fn init_or_migrate(app_data_dir: &Path) -> Result<MigrationReport> {
  let sqlite_path = app_data_dir.join("academiq.sqlite");
  if sqlite_path.exists() {
    return upgrade_schema(...);  // mevcut Tauri data var, sadece schema upgrade
  }
  
  // Yeni kurulum / legacy detection
  let legacy_dir = local_appdata().join("AcademiQ");
  if !legacy_dir.exists() {
    return clean_init(...);
  }
  
  // Legacy bulundu — migrate et
  let report = MigrationReport::default();
  
  // 1. Snapshot (ASLA SİLİNMEZ): kaynak klasör olduğu gibi kalır
  
  // 2. Tek transaction: SQLite migration
  let tx = conn.transaction()?;
  
  // 2a. academiq-data.json
  let main = read_json(legacy_dir.join("academiq-data.json"))?;
  for doc in main["docs"].as_array() {
    tx.execute("INSERT INTO documents (id, title, body_json, ...) VALUES (?,?,?,...)", 
               [doc["id"], doc["name"], doc.to_string(), ...])?;
  }
  tx.execute("INSERT INTO kv (key, value) VALUES ('state_blob', ?)", [main.to_string()])?;
  tx.execute("INSERT INTO kv (key, value) VALUES ('active_workspace', ?)", [main["cur"]])?;
  tx.execute("INSERT INTO kv (key, value) VALUES ('active_doc', ?)", [main["curDoc"]])?;
  
  // 2b. document-history.json (chunked)
  let hist = read_json(legacy_dir.join("document-history.json"))?;
  for (doc_id, doc) in hist["docs"].as_object() {
    for snap in doc["snapshots"].as_array() {
      tx.execute("INSERT INTO revisions (doc_id, snapshot_json, created_at) VALUES (?,?,?)",
                 [doc_id, snap.to_string(), snap["createdAt"]])?;
    }
  }
  
  // 2c. settings.json
  let settings = read_json(legacy_dir.join("settings.json"))?;
  tx.execute("INSERT INTO kv (key, value) VALUES ('settings', ?)", [settings.to_string()])?;
  
  // 2d. session-state.json
  let sess = read_json(legacy_dir.join("session-state.json"))?;
  tx.execute("INSERT INTO kv (key, value) VALUES ('session_state', ?)", [sess.to_string()])?;
  
  tx.commit()?;
  
  // 3. Dosya kopyaları (tx dışında, hata olursa SQLite zaten yazıldı)
  copy_dir(legacy_dir.join("pdfs"), app_data_dir.join("pdfs"))?;
  copy_dir(legacy_dir.join("workspaces"), app_data_dir.join("workspaces"))?;
  
  // 4. Capture state (sidecar dizinine)
  let sidecar_dir = app_data_dir.join("capture-sidecar");
  fs::create_dir_all(&sidecar_dir)?;
  fs::copy(legacy_dir.join("capture-agent-state.json"), sidecar_dir.join("agent-state.json"))?;
  fs::copy(legacy_dir.join("capture-queue.json"), sidecar_dir.join("queue.json"))?;
  fs::copy(legacy_dir.join("capture-targets.json"), sidecar_dir.join("targets.json"))?;
  
  // 5. Migration completed marker
  tx2.execute("INSERT INTO kv VALUES ('migration_completed_at', ?)", [now_iso()])?;
  tx2.execute("INSERT INTO kv VALUES ('legacy_source_path', ?)", [legacy_dir.to_str()])?;
  
  Ok(report)
}
```

---

## Acceptance Kontrolleri (hotfix sonrası)

Beta.2 ile bu kullanıcı makinesinde:

```sql
SELECT COUNT(*) FROM documents;        -- beklenen >= 1 (en az "Calisma Alani 1")
SELECT COUNT(*) FROM revisions;        -- beklenen 824
SELECT COUNT(DISTINCT doc_id) FROM revisions;  -- beklenen 81
SELECT length(value) FROM kv WHERE key='state_blob';   -- ~867
SELECT length(value) FROM kv WHERE key='settings';     -- ~1300
SELECT value FROM kv WHERE key='legacy_source_path';   -- "C:\Users\iceti\AppData\Local\AcademiQ"
SELECT value FROM kv WHERE key='migration_completed_at';
```

Dosya sistemi:

```
%APPDATA%\com.academiq.research\
  academiq.sqlite                                ← BÜYÜMÜŞ (>1 MB), önceden boş
  pdfs\*.pdf                                     ← 12 dosya
  workspaces\AcademiQ-Test-31d816\pdfs\*.pdf     ← 22 dosya
  workspaces\AcademiQ-Workspace 2-3c2a2d\pdfs\   ← 25 dosya
  capture-sidecar\agent-state.json              ← varlık
  capture-sidecar\queue.json
  capture-sidecar\targets.json
```

Korunan kaynak:

```
%LOCALAPPDATA%\AcademiQ\        ← DOKUNULMADAN duruyor
```
