# AcademiQ Lean UI Product Roadmap

Bu roadmap, AcademiQ'i yazım, referans, PDF, kalite kontrol, performans/UX polish ve veri çıkarma tarafında büyütürken arayüzü kalabalıklaştırmamak için hazırlanmıştır.

Temel fikir: Özellik sayısı artacak, görünen UI artmayacak. Yeni güçler toolbar'a buton olarak yığılmayacak; komut paleti, status bar, sağ yan panel, context menu ve inline sinyaller üzerinden dağıtılacak.

## Product North Star

AcademiQ, akademik yazı yazarken Word kadar güvenilir, Zotero/Mendeley kadar referans odaklı, güçlü bir PDF okuma/annotation deneyimine sahip, ama arayüz olarak sade kalan bir araştırma stüdyosu olmalı.

Kullanıcı ekranda şunları hissetmeli:

- Yazı alanı temiz ve merkezde.
- Toolbar iki satırı geçmiyor ve sadece sık kullanılan yazım kontrollerini taşıyor.
- Daha gelişmiş komutlar arandığında bulunuyor, ama sürekli göz önünde durmuyor.
- Belge, referans ve PDF kalitesi pasif sinyallerle takip ediliyor.
- Uygulama "özellik dolu" ama "kalabalık" hissettirmiyor.

## Hard UI Rules

- Tema/dark mode şimdilik yok. Mevcut warm-cream tema ürün kimliği olarak korunacak.
- Toolbar'a yeni ana buton eklemek son çare olacak.
- Yeni özellik önce komut paletine eklenecek.
- Öğeye bağlı aksiyonlar context menu içinde yaşayacak.
- Belgeye bağlı analiz ve yardımcı paneller tek sağ panel içinde sekmeli çalışacak.
- Status bar küçük ama değerli bilgi kanalı olacak.
- Inline uyarılar pasif olacak: kenar çizgisi, tooltip, ghost icon, alt çizgi gibi.
- Kullanıcı yazarken modal/panel kendiliğinden yüzüne atlamayacak.

## Core Containers

### 1. Komut Paleti

Kısayol: `Ctrl+K` / `Cmd+K`

Yeni özelliklerin ana giriş noktası burası olacak. Toolbar büyümeden komutlar aranabilir hale gelecek.

İlk komut grupları:

- Belge: başlık haritası, APA kontrolü, kaynakça güncelle, kaynakça dışarıdan ekle.
- Referans: DOI/URL/ISBN'den kaynak ekle, yinelenenleri tara, citation graph aç.
- PDF: annotation özetini çıkar, seçimi nota aktar, annotationlı PDF dışa aktar.
- Yazım: odak modu, bul/değiştir, kelime sayımı detayları.
- Veri: tablo/figure çıkar, kaynakça metninden referans üret, BibTeX/RIS içe aktar.

Kabul kriteri:

- Komutlar fuzzy search ile bulunabilir.
- Enter seçili komutu çalıştırır.
- Escape kapatır.
- Komut çalışınca editor selection bozulmaz.
- Aynı komut hem palette hem UI'da varsa tek command registry üzerinden çalışır.

### 2. Status Bar

Amaç: pasif bilgi, minimum alan.

Önerilen tek satır:

`sf 3/12 · 1247 kelime · APA ✓ · 2 uyarı · kaydedildi`

Segment davranışı:

- Sayfa bilgisi: tıklanınca sayfaya git.
- Kelime: detaylı istatistik.
- APA: linter panelini aç.
- Uyarı: ilgili uyarıya git.
- Kaydetme durumu: autosave/recovery bilgisini aç.

Kabul kriteri:

- Yazarken dikkat dağıtmaz.
- Bilgi canlı güncellenir.
- Tıklanabilir segmentler ilgili panele götürür.
- Autosave durumu premium küçük pill/nokta gibi görünür.

### 3. Sekmeli Sağ Yan Panel

Kısayol: `F9`

Default kapalı. Açıldığında tek panel, birden fazla sekme.

İlk sekmeler:

- Outline: H1-H5 belge haritası.
- APA Linter: biçim, atıf, kaynakça, sayfa düzeni uyarıları.
- Citation Graph: metindeki atıflar ve kaynakça ilişkisi.
- Öneriler: eksik kaynak, olası DOI, kaynak önerileri.
- Geçmiş: autosave snapshot ve sürüm geçmişi.

Kabul kriteri:

- Aynı anda tek sekme görünür.
- Panel resize edilebilir.
- Panel kapalıyken uygulama aynı temiz görünümde kalır.
- Her sekme command palette ile açılabilir.

### 4. Context Menu

Nesneye bağlı tüm aksiyonlar sağ tıkta yaşayacak.

Örnekler:

- Paragraf: kaynak öner, APA uyarılarını göster, paraphrase değil ama akademik iyileştirme önerisi.
- Kaynak kartı: künye düzenle, etiketle, koleksiyona ekle, PDF aç, DOI kopyala.
- PDF highlight: nota aktar, metne aktar, etikete bağla, annotation rengini değiştir.
- Kaynakça girişi: künyeyi düzenle, DOI ile tamamla, kaynak kartına git.

Kabul kriteri:

- Sağ tık menüleri kartların arkasına düşmez.
- Menü viewport içinde kalır.
- Alt menüler koleksiyon/etiket gibi gerçek listeyi gösterir.

### 5. Inline Passive Signals

Kullanıcıya bağırmadan sinyal verme sistemi.

Örnekler:

- APA sorunu olan paragrafın solunda ince sarı çizgi.
- Kaynaksız iddia gibi görünen paragrafta ghost citation icon.
- Eksik DOI olan kaynakta küçük amber nokta.
- PDF annotation ile bağlı notta küçük link rozeti.

Kabul kriteri:

- Yazı akışını kesmez.
- Hover/click ile açıklama verir.
- Kapatılabilir veya ignore edilebilir.

## Roadmap Phases

## Phase 0: UI Shell Foundation

Amaç: Özellikleri taşıyacak görünmez omurgayı kurmak.

İşler:

- Komut paleti altyapısı.
- Status bar altyapısı.
- Sekmeli sağ panel iskeleti.
- Ortak command registry.
- Panel/komut/status event sözleşmesi.

Öncelik: Çok yüksek.

Neden önce: Bundan sonra gelecek her özellik toolbar'a eklenmeden bu altyapıya bağlanır.

Kabul:

- `Ctrl+K` çalışır.
- `F9` panel açar/kapatır.
- Status bar kelime/kaydetme/APA placeholder gösterebilir.
- Command registry testlenebilir.

## Phase 1: Yazım Deneyimi

Amaç: Word seviyesine yaklaşan yazma hissi.

İşler:

- Outline panel: H1-H5 haritası ve tıklayınca heading'e gitme.
- Focus mode: komut paletinden açılır, aktif paragrafı öne çıkarır.
- Bul/değiştir stabilizasyonu: selection, highlight temizleme, find input focus güvenliği.
- Undo/redo contract: citation, toolbar, paste ve list işlemleri güvenilir adımlar üretir.
- Paste cleanup: Word/Web/PDF yapıştırmaları temiz ama anlamlı içe alınır.
- Heading style contract: APA 7 H1-H5 stilleri tek kaynaktan gelir.

UI ilkesi:

- Toolbar değişmeyecek.
- Outline sağ panelde.
- Focus mode sadece komut paleti/status bar ile görünür.

Kabul:

- Yazarken focus kaybı yok.
- `/r` ve `/t` sonrası aynı satırda yazmaya devam edilir.
- Bul/değiştir highlight kalıntısı bırakmaz.
- Heading'ler APA 7'ye uygun kalır.

## Phase 2: Referans ve Veri

Amaç: Kaynak yönetimi güvenilir, hızlı ve akademik iş akışına uygun olsun.

İşler:

- DOI/URL/ISBN yapıştırınca otomatik künye oluşturma.
- Kitap, web sitesi, kitap bölümü, konferans bildirisi için referans modeli.
- Dışarıdan kaynakça ekle: APA metni, DOI listesi, `.bib`, `.ris`.
- APA metin parser: satır/giriş bazlı güvenli parse, yarım gelen kaynakları azaltma.
- Dedupe: DOI, normalized title, author-year-title eşleşmesi.
- Citation popup sıralama: alfabetik ve arama dostu.
- Citation graph: metindeki atıf ve kaynakça uyumluluğunu görselleştirme.
- Etiket/koleksiyon: sağ tık merkezli, kartta küçük renk/rozet.

UI ilkesi:

- Kaynakça grubuna tek "Dışarıdan Ekle" erişimi olabilir, ama detay modal içinde.
- Gelişmiş referans aksiyonları command palette ve context menu'de.
- Library kartları sade kalır.

Kabul:

- Dışarıdan eklenen kaynaklar kaynakça sayfasında APA 7 alfabetik sıraya oturur.
- Yazmaya devam edip yeni atıf ekleyince kaynakça bozulmaz.
- `/r` ve `/t` aynı library kaynağını kullanır.
- Duplicate kaynak kirliliği oluşmaz.

## Phase 3: PDF Viewer ve Annotation

Amaç: Kullanıcı uygulamayı sadece PDF okumak ve annotation yapmak için bile açmak istesin.

İşler:

- PDF annotation panelinin arama/filtreleme kalitesini artırma.
- Highlight, çizim, not, serbest metin annotationlarını tek modelde tutma.
- Annotationları notlara ve belgeye tek tıkla aktarma.
- Annotationlı PDF dışa aktarma: gerçek PDF flatten katmanı.
- PDF text selection context menu: nota aktar, metne aktar, kaynakla bağla.
- Full-text annotation search.
- PDF outline/thumbnail/annotation panel polish.
- Figure/table extractor: seçili bölgeyi PNG veya nota aktar.
- OCR: text layer yoksa arka planda opsiyonel çıkarma, UI'ı şişirmeden.

UI ilkesi:

- PDF viewer kendi sağ/sol iç panel pattern'ini kullanır.
- Yeni PDF aksiyonları selection context menu'de yaşar.
- Ana toolbar'a PDF butonu eklenmez.

Kabul:

- Annotationlar veri kaybetmeden kalıcıdır.
- Annotation özeti belgeye ve notlara güvenli aktarılır.
- Export edilen annotationlı PDF başka PDF viewerlarda açılır.
- Büyük PDF'de scroll/zoom akıcı kalır.

## Phase 4: Kalite Kontrolü

Amaç: APA 7 ve akademik kalite hatalarını kullanıcı yazarken fark etsin ama rahatsız olmasın.

İşler:

- APA linter: başlık, margin, line spacing, kaynakça, atıf-kaynakça uyumu.
- Atıf-kaynakça tutarlılığı: metinde var kaynakçada yok, kaynakçada var metinde yok.
- DOI/URL kalite kontrolü.
- Okunabilirlik skoru.
- Kayıp metadata kontrolü.
- Export öncesi preflight checklist.

UI ilkesi:

- Inline sol kenar çizgisi + status bar sayaç.
- Detaylar sağ panelde.
- Export öncesi kritik hata varsa küçük preflight modal.

Kabul:

- Linter false-positive üretirse ignore edilebilir.
- Yazarken ağır tarama yapılmaz, debounced çalışır.
- Status bar tek bakışta belge sağlığını gösterir.

## Phase 5: Performans ve UX Polish

Amaç: Büyük belge, çok kaynak ve büyük PDF'de uygulama sakin kalsın.

İşler:

- Editor update throttling ve layout sync idempotency.
- Büyük library listelerinde virtualization.
- PDF render cache ve annotation layer ayrımı.
- Autosave atomic write ve bounded snapshots.
- Komutların telemetry'siz lokal performans ölçümü.
- Menü ve dropdown positioning hardening.
- Keyboard cheat sheet: `?` ile mini yardım.
- Error boundary ve recovery toastları.

UI ilkesi:

- Performans özellikleri görünmez olmalı.
- Recovery ve autosave sadece gerektiğinde görünür olmalı.

Kabul:

- Yazarken blink/jump olmaz.
- Büyük dokümanda typing latency hissedilmez.
- Sidebar listeleri takılmaz.
- App update sonrası eski runtime/data çakışması yaşanmaz.

## Phase 6: Veri Çıkarma ve Akademik İş Akışı

Amaç: PDF, kaynakça ve notlardan anlamlı veri çıkarıp yazıya bağlamak.

İşler:

- Kaynakça metninden library üretme.
- PDF figure/table seçimi ve dışa aktarma.
- Annotation digest: konuya, etikete, kaynağa göre özet.
- Evidence matrix'e annotation/not aktarımı.
- Web/kitap/akademik kaynak metadata tamamlama.
- Proje backup/restore `.aqresearch`.

UI ilkesi:

- Veri çıkarma aksiyonları command palette veya context menu'de.
- Sonuçlar modalda önizlenir, kullanıcı onaylamadan belgeye yazılmaz.

Kabul:

- Çıkarılan veri kaynakla bağlı kalır.
- Yanlış parse edilen kaynak kullanıcı tarafından düzeltilebilir.
- Belgeye aktarılan içerik APA akışını bozmaz.

## Implementation Order

1. Komut paleti.
2. Status bar.
3. Sekmeli sağ panel.
4. Outline panel.
5. APA linter iskeleti.
6. Referans dışarıdan ekle stabilizasyonu.
7. PDF annotation export/flatten hardening.
8. Performance pass.
9. Veri çıkarma araçları.

Bu sıra bilinçli: önce görünür alanı büyütmeden taşıyıcı sistem kurulacak, sonra özellikler bu sisteme bağlanacak.

## Non-Goals For Now

- Dark mode.
- Büyük toolbar redesign.
- Her feature için ayrı sidebar.
- Cloud sync.
- AI-heavy otomasyonları ana yazma akışına zorla sokmak.
- Editor engine rewrite.

## Definition Of Done

Bir feature tamam sayılmaz, eğer:

- Toolbar'ı kalabalıklaştırıyorsa,
- Editor focus/selection bozuyorsa,
- Autosave/recovery sinyalini tetiklemiyorsa,
- Kaynakça/atıf pipeline'ını bypass ediyorsa,
- Büyük belge/PDF performansını kötüleştiriyorsa,
- Test veya en azından smoke senaryosu yoksa.

Her yeni özellik için minimum kontrol:

- Command palette kaydı var mı?
- Context menu daha doğru yer mi?
- Status bar sinyali gerekiyor mu?
- Sağ panel sekmesi gerekiyor mu?
- Toolbar'a gerçekten girmesi şart mı?
- Yazı yazma döngüsünü bozuyor mu?

