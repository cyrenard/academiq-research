type PdfViewerPanelProps = {
  title: string;
  pageText: string;
  zoomText: string;
  toolMode: string;
  open: boolean;
  fullscreen: boolean;
};

export function PdfViewerPanel({ title, pageText, zoomText, toolMode, open, fullscreen }: PdfViewerPanelProps) {
  const win = window as any;
  const openUpload = () => document.getElementById('lfinp')?.click();

  return (
    <section id="pdfpanel" className={['aq-legacy-pdf-panel', open ? 'open' : '', fullscreen ? 'fullscreen' : ''].filter(Boolean).join(' ')} data-tool-mode={toolMode || undefined} aria-label="PDF viewer">
      <div id="pdfresize" className="aq-legacy-pdf-resize" title="Genislik ayarla" />
      <div id="pdftb" className="aq-legacy-pdf-toolbar">
        <div className="pdf-brand">
          <span className="pdf-kicker">PDF Reader</span>
          <span id="pdftitle" className="aq-legacy-pdf-title">{title}</span>
        </div>
        <div className="pdf-toolbar-group compact" aria-label="Sayfa gezinme">
          <button className="ppb" id="pdfPrevBtn" type="button" title="Önceki sayfa" aria-label="Önceki sayfa" onClick={() => win.pPrev?.()}>◀</button>
          <span id="pdfpg" role="button" tabIndex={0} title="Sayfaya git" aria-label="Sayfa numarasına git" onClick={() => win.goToPage?.()}>{pageText}</span>
          <button className="ppb" id="pdfNextBtn" type="button" title="Sonraki sayfa" aria-label="Sonraki sayfa" onClick={() => win.pNext?.()}>▶</button>
        </div>
        <div className="pdf-toolbar-group compact" aria-label="Yakınlaştırma">
          <button className="ppb" id="pdfZoomOutBtn" type="button" title="Uzaklaştır" aria-label="Uzaklaştır" onClick={() => win.pZO?.()}>-</button>
          <span id="pdfzoom" role="button" tabIndex={0} title="Genişliğe sığdır" aria-label="Genişliğe sığdır" onClick={() => win.pZFit?.()}>{zoomText}</span>
          <button className="ppb" id="pdfZoomInBtn" type="button" title="Yakınlaştır" aria-label="Yakınlaştır" onClick={() => win.pZI?.()}>+</button>
        </div>
        <div className="pdf-toolbar-spacer" />
        <div className="pdf-toolbar-window" aria-label="Pencere">
          <button
            className="ppb"
            id="pdffullbtn"
            type="button"
            title={fullscreen ? 'Küçült' : 'Tam ekran'}
            aria-label={fullscreen ? 'PDF okuyucuyu küçült' : 'Tam ekran aç/kapat'}
            onClick={() => win.togglePdfFullscreen?.()}
          >
            {fullscreen ? '✖' : '⛶'}
          </button>
          <button className="ppb pdf-close-btn" id="pdfclosebtn" type="button" title="Kapat" aria-label="PDF okuyucuyu kapat" onClick={() => win.togglePDF?.()}>×</button>
        </div>
      </div>
      <div id="pdftabs" className="aq-legacy-pdf-tabs" />
      <div id="pdfsearchbar" className="aq-legacy-pdf-search">
        <input id="pdfsearchinp" placeholder="PDF içinde ara..." onKeyDown={(event) => {
          if (event.key === 'Enter') win.pdfSearchNext?.();
          if (event.key === 'Escape') win.togglePdfSearch?.();
        }} />
        <span id="pdfsearchcount">--</span>
        <button id="pdfSearchPrevBtn" type="button" onClick={() => win.pdfSearchPrev?.()}>Önceki</button>
        <button id="pdfSearchNextBtn" type="button" onClick={() => win.pdfSearchNext?.()}>Sonraki</button>
        <button id="pdfSearchCloseBtn" type="button" onClick={() => win.togglePdfSearch?.()}>Kapat</button>
      </div>
      <div id="hlbar" className="aq-legacy-pdf-tools">
        <div className="pdf-tools-group" aria-label="Görünüm">
          <button className="ppb" id="pdfSearchToggleBtn" type="button" title="PDF içinde ara" onClick={() => win.togglePdfSearch?.()}>🔍</button>
          <button className="ppb" id="pdfThumbsToggleBtn" type="button" title="Küçük resimler" onClick={() => win.toggleThumbs?.()}>☷</button>
          <button className="ppb" id="pdfOutlineToggleBtn" type="button" title="İçerik tablosu" onClick={() => win.toggleOutline?.()}>≡</button>
          <button className="ppb" id="pdfAnnotsToggleBtn" type="button" title="Notlar ve highlightlar" onClick={() => win.togglePdfAnnotations?.()}>✍</button>
          <button className="ppb pdf-pill" id="pdfRelatedToggleBtn" type="button" title="Benzer makaleler" onClick={() => win.togglePdfRelated?.()}>🔗 Benzer</button>
        </div>
        <div className="pdf-tools-divider" />
        <div className="pdf-tools-group" aria-label="Highlight">
          {['#fef08a', '#86efac', '#93c5fd', '#fca5a5'].map((color, index) => (
            <button
              key={color}
              type="button"
              className={`hlc${index === 0 ? ' on' : ''}`}
              data-c={color}
              style={{ background: color }}
              title="Highlight rengi"
              onClick={(event) => win.setHLC?.(event.currentTarget)}
            />
          ))}
        </div>
        <div className="pdf-tools-divider" />
        <div className="pdf-tools-group" aria-label="Not ve kalem">
          <button className={`ppb${toolMode === 'annot' ? ' on' : ''}`} id="annotbtn" type="button" title="Metin notu ekle" onClick={() => win.toggleAnnotMode?.()}>✎</button>
          <button className={`ppb${toolMode === 'draw' ? ' on' : ''}`} id="drawbtn" type="button" title="Serbest çizim" onClick={() => win.toggleDrawMode?.()}>✏</button>
          <input id="pdfDrawColor" className="pdf-draw-color" type="color" defaultValue="#c9453e" title="Çizim rengi" onChange={(event) => win.setPdfDrawColor?.(event.target.value)} />
          <button className={`ppb${toolMode === 'region' ? ' on' : ''}`} id="pdfRegionBtn" type="button" title="PDF bölgesi seç" onClick={() => win.togglePdfRegionCaptureMode?.()}>▢</button>
          <select id="pdfDrawWidth" className="pdf-draw-width" title="Çizim kalınlığı" defaultValue="2.5" onChange={(event) => win.setPdfDrawWidth?.(event.target.value)}>
            <option value="1.5">İnce</option>
            <option value="2.5">Orta</option>
            <option value="4">Kalın</option>
            <option value="7">Marker</option>
          </select>
          <button className="ppb" id="pdfDrawClearBtn" type="button" title="Bu sayfadaki çizimi temizle" onClick={() => win.clearPdfDrawingPage?.()}>🗑</button>
        </div>
        <div className="pdf-tools-spacer" />
        <button className="ppb" id="pdfUploadBtn" type="button" title="PDF yükle" onClick={openUpload}>+</button>
      </div>
      <div id="pdfreaderbar" className="aq-legacy-pdf-status">
        <div className="pdf-reader-line">
          <span id="pdfreadmeta">PDF bekleniyor</span>
          <span id="pdfreadstats">0 vurgu · 0 not</span>
          <span id="pdfReaderStatus" />
        </div>
        <span id="pdfprogress"><i id="pdfprogressbar" /></span>
      </div>
      <div id="pdfbody" className="aq-legacy-pdf-body">
        <aside id="pdfthumbs" className="aq-legacy-pdf-side" style={{ display: 'none' }} />
        <aside id="pdfoutline" className="aq-legacy-pdf-side" style={{ display: 'none' }} />
        <aside id="pdfannots" className="aq-legacy-pdf-annots" style={{ display: 'none' }} />
        <aside id="pdfrelated" className="aq-legacy-pdf-side" style={{ display: 'none' }} />
        <div id="pdfscroll" className="aq-legacy-pdf-scroll">
          <div id="pdfempty" className="aq-legacy-pdf-empty">
            <div>PDF yükle veya kütüphaneden seç</div>
            <button id="pdfEmptyUploadBtn" type="button" onClick={openUpload}>PDF Yükle</button>
          </div>
        </div>
      </div>
    </section>
  );
}
