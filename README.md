# AcademiQ Research — Windows Uygulaması

Akademik yazım ve kaynak yönetim uygulaması.

## Hızlı Kurulum

1. Tüm dosyaları aynı klasöre indirin
2. `AcademiQ-Kur.bat` dosyasına çift tıklayın
3. Kurulum otomatik tamamlanır (~5 dakika)
4. Masaüstündeki **AcademiQ Research** kısayoluna tıklayın

### Gerekli Dosyalar
```
AcademiQ-Kur.bat          ← Çift tıkla (başlatıcı)
AcademiQ-Kur.ps1          ← Kurulum scripti
main.js                   ← Electron ana process
preload.js                ← IPC köprüsü
package.json              ← Bağımlılıklar
academiq-research.html    ← Uygulama (src/index.html olur)
```

## Cihazlar Arası Sync

1. Uygulamada araç çubuğundaki **🔄 Sync** butonuna tıklayın
2. Bulut klasörünüzü seçin (OneDrive, Proton Drive, Google Drive, Dropbox)
3. Veriler otomatik olarak `SeçilenKlasör\AcademiQ\academiq-data.json` dosyasına kaydedilir
4. Aynı klasörü diğer Windows bilgisayarlarda da seçin — veriler senkronize olur

**Not:** PDF dosyaları boyut nedeniyle senkronize edilmez, her cihazda yerel kalır.

## Kurulum Detayları

Uygulama `%LOCALAPPDATA%\AcademiQ\` dizinine kurulur:
```
%LOCALAPPDATA%\AcademiQ\
├── main.js              ← Electron ana process
├── preload.js           ← IPC köprüsü
├── package.json
├── AcademiQ.bat         ← Başlatıcı
├── settings.json        ← Sync ayarları
├── academiq-data.json   ← Yerel veri (sync yoksa)
├── node\                ← Portable Node.js v20
├── node_modules\        ← Electron
├── pdfs\                ← PDF önbelleği
└── src\
    └── index.html       ← Uygulama
```

Yönetici yetkisi gerektirmez. Toplam ~110 MB (Node.js + Electron).

## Özellikler

- **Kütüphane:** DOI ile otomatik metadata (CrossRef) + açık erişim PDF (Unpaywall)
- **APA 7 Editör:** Türkçe atıf, çoklu kaynak seçimi, otomatik kaynakça
- **PDF Reader:** Metin seçimi, highlight, nota kaydetme
- **Not Defteri:** Çoklu defterler, PDF'ten alıntı, etiketleme
- **Dışa Aktarma:** DOC (Word), PDF (yazdır), notlar TXT, kütüphane JSON
- **Sync:** OneDrive / Proton Drive / Google Drive ile cihazlar arası senkronizasyon
