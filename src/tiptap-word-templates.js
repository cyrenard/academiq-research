(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordTemplates = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var templates = {
    tez:'<h1>Başlık</h1><p class="ni">[Yazar Adı]</p><p class="ni">[Kurum Adı]</p><p class="ni">[Ders/Program]</p><p class="ni">[Danışman]</p><p class="ni">[Tarih]</p><p><br></p><h1>Özet</h1><p class="ni">Bu çalışmanın amacı... (150-250 kelime)</p><p class="ni"><em>Anahtar Kelimeler:</em> kelime1, kelime2, kelime3</p><p><br></p><h1>İçindekiler</h1><p class="ni">[Otomatik güncellenecek]</p><p><br></p><h1>Giriş</h1><p>Araştırmanın arka planı ve önemi...</p><p><br></p><h1>Literatür Taraması</h1><h2>Kuramsal Çerçeve</h2><p>İlgili kuramlar...</p><h2>İlgili Araştırmalar</h2><p>Önceki çalışmalar...</p><p><br></p><h1>Yöntem</h1><h2>Araştırma Deseni</h2><p>Bu çalışmada... deseni kullanılmıştır.</p><h2>Katılımcılar</h2><p>Araştırmanın örneklemi...</p><h2>Veri Toplama Araçları</h2><p>Veri toplamak için...</p><h2>Verilerin Analizi</h2><p>Veriler... yöntemiyle analiz edilmiştir.</p><p><br></p><h1>Bulgular</h1><p>Analiz sonuçları...</p><p><br></p><h1>Tartışma</h1><p>Bulgular literatür ışığında değerlendirildiğinde...</p><p><br></p><h1>Sonuç ve Öneriler</h1><p>Bu çalışmanın sonuçları...</p><p><br></p><h1>Kaynakça</h1><p class="refe">[Atıflar otomatik eklenecek]</p>',
    makale:'<h1>Başlık</h1><p class="ni">[Yazar Adı]</p><p class="ni">[Kurum Adı]</p><p><br></p><h1>Özet</h1><p class="ni">Bu çalışmanın amacı... (150-250 kelime)</p><p class="ni"><em>Anahtar Kelimeler:</em> kelime1, kelime2</p><p><br></p><h1>Giriş</h1><p>Araştırma problemi ve amaçlar...</p><p><br></p><h1>Yöntem</h1><h2>Katılımcılar</h2><p>Örneklem bilgileri...</p><h2>Prosedür</h2><p>Veri toplama süreci...</p><p><br></p><h1>Bulgular</h1><p>Analiz sonuçları...</p><p><br></p><h1>Tartışma</h1><p>Bulguların yorumu...</p><p><br></p><h1>Kaynakça</h1><p class="refe">[Atıflar otomatik eklenecek]</p>',
    rapor:'<h1>Başlık</h1><p class="ni">[Yazar Adı]</p><p class="ni">[Kurum Adı]</p><p class="ni">[Tarih]</p><p><br></p><h1>Özet</h1><p class="ni">Raporun özeti...</p><p><br></p><h1>Giriş</h1><p>Raporun amacı ve kapsamı...</p><p><br></p><h1>Bulgular</h1><h2>Bölüm 1</h2><p>Bulgular...</p><h2>Bölüm 2</h2><p>Bulgular...</p><p><br></p><h1>Sonuç</h1><p>Sonuçlar ve öneriler...</p><p><br></p><h1>Kaynakça</h1><p class="refe">[Atıflar otomatik eklenecek]</p>',
    literatur:'<h1>Başlık</h1><p class="ni">[Yazar Adı]</p><p class="ni">[Kurum Adı]</p><p><br></p><h1>Özet</h1><p class="ni">Bu literatür taramasının amacı... (150-250 kelime)</p><p class="ni"><em>Anahtar Kelimeler:</em> kelime1, kelime2</p><p><br></p><h1>Giriş</h1><p>Konu tanıtımı ve araştırma soruları...</p><p><br></p><h1>Yöntem</h1><p>Literatür tarama stratejisi, veritabanları, dahil etme/dışlama kriterleri...</p><p><br></p><h1>Bulgular</h1><h2>Tema 1</h2><p>İlgili çalışmaların sentezi...</p><h2>Tema 2</h2><p>İlgili çalışmaların sentezi...</p><h2>Tema 3</h2><p>İlgili çalışmaların sentezi...</p><p><br></p><h1>Tartışma</h1><p>Genel değerlendirme, boşluklar, gelecek araştırma önerileri...</p><p><br></p><h1>Kaynakça</h1><p class="refe">[Atıflar otomatik eklenecek]</p>'
  };

  function escapeHTML(text){
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildCoverHTML(options){
    options = options || {};
    var fields = [{ text: options.title || '', bold:true }];
    if(options.author) fields.push({ text: options.author });
    if(options.institution) fields.push({ text: options.institution });
    if(options.course) fields.push({ text: options.course });
    if(options.professor) fields.push({ text: options.professor });
    if(options.dateText) fields.push({ text: options.dateText });
    var html = '<div style="text-align:center;padding-top:192px;font-family:Times New Roman,serif;font-size:12pt;line-height:2;">';
    fields.forEach(function(field){
      if(!field.text) return;
      html += '<p style="text-indent:0;' + (field.bold ? 'font-weight:bold;' : '') + '">' + escapeHTML(field.text) + '</p>';
    });
    html += '</div><p><br></p>';
    return html;
  }

  function getTemplate(type){
    return templates[type] || '';
  }

  return {
    buildCoverHTML: buildCoverHTML,
    getTemplate: getTemplate
  };
});
