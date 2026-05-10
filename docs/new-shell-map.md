# New Shell Map

Bu dokuman mevcut React/Tailwind shell'in gorsel ve yerlesim sozlesmesini tarif eder. Davranis legacy koddan gelir; gorsel sistem bu shell'den gelir.

| Shell area | Existing component | Intended purpose | Allowed UI patterns |
|---|---|---|---|
| App chrome/header | `AppShell` header | Marka, global view toggles, global export/settings/pdf/library/notes girisleri | Tek satir kompakt buttonlar, global action dropdown, status badge. Rastgele feature butonlari yok. |
| Workspace strip | `WorkspaceTabs` | Workspace secme ve workspace CRUD girisi | Tab/button list, add button, context menu veya kucuk rename/delete modal. Uzun feature listesi yok. |
| Document strip | `DocumentTabs` | Document secme ve document CRUD girisi | Tab/button list, add/rename/delete, document settings/history girisi. Kutuphane/PDF action yok. |
| Left sidebar | `LeftSidebar` | Workspace scoped navigation ve kaynak/koleksiyon filtreleme | Search input, compact filter buttons, collection popover/modal, reference navigation cards. PDF/import gibi yalnizca kaynak girisiyle ilgili kisa entry olabilir. |
| Center editor area | `EditorHost` inside `AppShell` center | Editor engine host ve belge yuzeyi | React editor content'i yonetmez. Legacy DOM host, editor toolbar, floating legacy UI. |
| Editor toolbar | `TopToolbar` | Editor formatting, citation/bibliography/editor insert gibi belge komutlari | Icon buttons, selects, small dropdowns/popovers. Sadece editor command/adapter/legacy editor actions. |
| Right panel tabs | `RightPanel` | Workspace scoped feature panels | Tabs: References, PDF, Notes, Matrix. Her tab yalniz kendi domain actionlarini tasir. |
| References tab | `RightPanel` refs branch | Kaynak listeleme, secme, atif, edit/delete, PDF relation actions | Reference cards, small per-card actions, detail drawer, add/edit modal, filter popover. Not/matrix/settings buton deposu degil. |
| PDF tab | `RightPanel` pdf branch | Secili kaynak PDF dosya islemleri ve PDF viewer girisi | Attach/open/download/show/delete/sync actions, PDF status badges, viewer modal/drawer entry. Citation/settings yok. |
| Notes tab | `RightPanel` notes branch | Not listesi, not CRUD, notu belgeye/matrise gonderme | Note cards, note form, note detail drawer/modal, type/tag selects. Reference CRUD yok. |
| Matrix tab | `RightPanel` matrix branch | Workspace literature matrix preview/open entry | Matrix summary, fullscreen matrix modal/legacy view entry, selected ref add action. PDF/settings yok. |
| Status bar | `StatusBar` | Save/sync word count feedback | Short save state, word count, low-noise badges. Action button kalabaligi yok. |
| Feature modals | `FeatureModals` + `Modal` | Settings, history, browser capture, reference edit, matrix fallback | Complex form/preview only. Submit gerçek handler/API cagirir. Empty modal yok. |
| Modal primitive | `Modal` | Form, confirm, preview, command palette | Centered overlay, compact header, scrollable body. Büyük detay gerekiyorsa drawer tercih edilir. |
| Drawer primitive | `Drawer` | Kaynak/not/PDF detaylari | Right-side detail surface. Form submit gerçek handler'a bagli. |
| Popover primitive | `Popover` | Kucuk secimler | Citation options, collection/label selection, style picker, small menu. |
| Dropdown primitive | `DropdownMenu` | Button/menu action gruplari | Export/import/insert action listesi. Her item gerçek handler'a bagli. |
| Command palette | `CommandPalette` | Mevcut çalışan komutlara hizli erisim | Sadece bound komutlar veya gerçek modal acan komutlar. Inventory dump yok. |
| Legacy compatibility host | `LegacyCompatibilityHost` | Eski runtime'in bekledigi DOM koklerini saglamak | Hidden inputs, legacy modal roots, PDF viewer roots. Kullaniciya yeni shell gibi gorunmemeli; davranis altyapisi. |
| UI primitives | `Button`, `Input`, `Textarea`, `Select`, `Badge`, `Spinner`, `EmptyState`, `ErrorState`, `ConfirmDialog`, `Toast` | Tutarlı Tailwind visual system | Form states, loading/success/error/confirm. Native `alert/confirm/prompt` uzun vadede shell primitive'e tasinmali. |

## Placement Guardrails

| Rule | Meaning |
|---|---|
| LeftSidebar is navigation/filter first | Workspace/document navigation and reference search/filter live here; deep settings/export/editor tools do not. |
| TopToolbar is document/editor/global actions | Formatting, citation/bibliography, import/export file actions may live here; source list management should not. |
| RightPanel is domain scoped | References/PDF/Notes/Matrix actions stay under their tab. |
| Settings modal is app settings only | Sync, update, browser capture setup, about, storage/PDF/OCR preferences. |
| Legacy host is not a new UI layer | It may provide DOM roots for old runtime, but React shell should expose only planned entries. |
| No duplicate action surfaces | A feature may have one primary UI location plus command palette shortcut. |
| No unbound actions | Every visible element must map to a real legacy function/API/helper before it is shown. |
