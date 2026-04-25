(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQPdfViewerState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function clampNumber(value, min, max, fallback){
    var n = Number(value);
    if(!Number.isFinite(n)) n = fallback;
    return Math.max(min, Math.min(max, n));
  }

  function clampPage(page, total){
    var safeTotal = Math.max(0, parseInt(total, 10) || 0);
    if(!safeTotal) return 0;
    return clampNumber(parseInt(page, 10), 1, safeTotal, 1);
  }

  function getPageProgress(page, total){
    var safeTotal = Math.max(0, parseInt(total, 10) || 0);
    if(!safeTotal) return 0;
    var safePage = clampPage(page, safeTotal);
    return Math.round((safePage / safeTotal) * 100);
  }

  function getZoomLabel(pdfScale, autoScale){
    var scale = Number(pdfScale) > 0 ? Number(pdfScale) : Number(autoScale);
    if(!Number.isFinite(scale) || scale <= 0) scale = 1;
    var prefix = Number(pdfScale) > 0 ? '' : 'Fit ';
    return prefix + Math.round(scale * 100) + '%';
  }

  function getNextZoom(currentScale, delta, options){
    options = options || {};
    var min = Number(options.min) || 0.3;
    var max = Number(options.max) || 4;
    var base = Number(currentScale);
    if(!Number.isFinite(base) || base <= 0) base = Number(options.autoScale) || 1;
    return Math.round(clampNumber(base + Number(delta || 0), min, max, 1) * 100) / 100;
  }

  function buildReaderStats(input){
    input = input || {};
    var total = Math.max(0, parseInt(input.total, 10) || 0);
    var page = clampPage(input.page, total);
    var highlightCount = Math.max(0, parseInt(input.highlightCount, 10) || 0);
    var annotationCount = Math.max(0, parseInt(input.annotationCount, 10) || 0);
    var ocrLabel = String(input.ocrLabel || '').trim();
    var activityLabel = highlightCount + ' highlight Â· ' + annotationCount + ' not';
    if(ocrLabel) activityLabel += ' Â· ' + ocrLabel;
    return {
      page: page,
      total: total,
      progress: getPageProgress(page, total),
      pageLabel: total ? (page + ' / ' + total) : '--',
      metaLabel: total ? ('Sayfa ' + page + ' / ' + total) : 'PDF bekleniyor',
      activityLabel: activityLabel
    };
  }

  function buildPdfOcrProbeState(input){
    input = input || {};
    var totalPages = Math.max(0, parseInt(input.totalPages, 10) || 0);
    var samplePages = Math.max(0, parseInt(input.samplePages, 10) || 0);
    if(totalPages && samplePages > totalPages) samplePages = totalPages;
    var scannedPages = Math.max(0, parseInt(input.scannedPages, 10) || 0);
    if(samplePages) scannedPages = Math.min(samplePages, scannedPages);
    else scannedPages = 0;
    var pagesWithText = Math.max(0, parseInt(input.pagesWithText, 10) || 0);
    pagesWithText = Math.min(pagesWithText, scannedPages);
    var pagesWithoutText = Math.max(0, scannedPages - pagesWithText);
    var ocrRunning = !!input.ocrRunning;
    var ocrAutoQueued = !!input.ocrAutoQueued;
    var ocrTargetPages = Math.max(0, parseInt(input.ocrTargetPages, 10) || 0);
    var ocrProcessedPages = Math.max(0, parseInt(input.ocrProcessedPages, 10) || 0);
    if(ocrTargetPages) ocrProcessedPages = Math.min(ocrTargetPages, ocrProcessedPages);
    var ocrAppliedPages = Math.max(0, parseInt(input.ocrAppliedPages, 10) || 0);
    var ocrFailedPages = Math.max(0, parseInt(input.ocrFailedPages, 10) || 0);
    var ocrSkippedPages = Math.max(0, parseInt(input.ocrSkippedPages, 10) || 0);
    var ocrCancelled = !!input.ocrCancelled;
    var error = String(input.error || '').trim();
    var status = 'idle';
    var needsOCR = false;
    var label = '';
    if(error){
      status = 'error';
      label = 'OCR tarama hatasi';
    }else if(ocrCancelled){
      status = 'cancelled';
      if(ocrTargetPages > 0){
        label = 'OCR iptal edildi: sf ' + ocrProcessedPages + '/' + ocrTargetPages;
      }else{
        label = 'OCR iptal edildi';
      }
    }else if(ocrRunning){
      status = 'ocr_running';
      if(ocrTargetPages > 0){
        label = 'OCR metni cikariliyor: sf ' + ocrProcessedPages + '/' + ocrTargetPages;
        if(ocrSkippedPages > 0) label += ' (' + ocrSkippedPages + ' atlandi)';
      }else{
        label = 'OCR metni cikariliyor';
      }
    }else if(ocrAutoQueued){
      status = 'scanning';
      label = 'OCR hazirlaniyor';
    }else if(samplePages <= 0){
      status = 'idle';
    }else if(scannedPages < samplePages){
      status = 'scanning';
      label = 'OCR tarama: sf ' + scannedPages + '/' + samplePages;
    }else if(ocrAppliedPages > 0){
      status = 'ocr_applied';
      label = 'OCR metni aktif: ' + ocrAppliedPages + ' sf';
      if(ocrFailedPages > 0) label += ' (' + ocrFailedPages + ' hata)';
      if(ocrSkippedPages > 0) label += ' · ' + ocrSkippedPages + ' atlandi';
    }else if(pagesWithText === 0 && scannedPages > 0){
      status = 'needed';
      needsOCR = true;
      label = 'OCR gerekli (metin katmani yok)';
    }else{
      status = 'ready';
      label = 'OCR gerekmiyor';
    }
    return {
      status: status,
      needsOCR: needsOCR,
      label: label,
      error: error,
      totalPages: totalPages,
      samplePages: samplePages,
      scannedPages: scannedPages,
      pagesWithText: pagesWithText,
      pagesWithoutText: pagesWithoutText,
      ocrRunning: ocrRunning,
      ocrTargetPages: ocrTargetPages,
      ocrProcessedPages: ocrProcessedPages,
      ocrAppliedPages: ocrAppliedPages,
      ocrFailedPages: ocrFailedPages,
      ocrSkippedPages: ocrSkippedPages,
      ocrCancelled: ocrCancelled,
      ocrAutoQueued: ocrAutoQueued
    };
  }

  function normalizePdfRegionSelection(input){
    input = input || {};
    var pageWidth = Math.max(1, Number(input.pageWidth) || 1);
    var pageHeight = Math.max(1, Number(input.pageHeight) || 1);
    var renderWidth = Math.max(1, Number(input.renderWidth) || pageWidth);
    var renderHeight = Math.max(1, Number(input.renderHeight) || pageHeight);
    var startX = clampNumber(Number(input.startX), 0, pageWidth, 0);
    var startY = clampNumber(Number(input.startY), 0, pageHeight, 0);
    var endX = clampNumber(Number(input.endX), 0, pageWidth, startX);
    var endY = clampNumber(Number(input.endY), 0, pageHeight, startY);
    var left = Math.min(startX, endX);
    var top = Math.min(startY, endY);
    var width = Math.abs(endX - startX);
    var height = Math.abs(endY - startY);
    var normalized = {
      x: left / pageWidth,
      y: top / pageHeight,
      w: width / pageWidth,
      h: height / pageHeight
    };
    return {
      page: parseInt(input.page, 10) || 1,
      left: left,
      top: top,
      width: width,
      height: height,
      normalized: normalized,
      cropX: Math.round(normalized.x * renderWidth),
      cropY: Math.round(normalized.y * renderHeight),
      cropW: Math.max(1, Math.round(normalized.w * renderWidth)),
      cropH: Math.max(1, Math.round(normalized.h * renderHeight)),
      valid: width >= (Number(input.minWidth) || 10) && height >= (Number(input.minHeight) || 10)
    };
  }

  function normalizeCaptureKind(kind){
    var raw = String(kind || '').toLowerCase();
    return raw === 'table' ? 'table' : 'figure';
  }

  function getCaptureLabel(kind){
    return kind === 'table' ? 'Tablo' : 'Sekil';
  }

  function buildPdfRegionCaptureHTML(input){
    input = input || {};
    var dataUrl = String(input.dataUrl || '');
    if(!/^data:image\/png;base64,/i.test(dataUrl)) return '';
    var page = parseInt(input.page, 10) || 1;
    var kind = normalizeCaptureKind(input.kind);
    var title = String(input.title || 'PDF').replace(/[<>]/g, '').trim() || 'PDF';
    var customCaption = String(input.caption || '').replace(/[<>]/g, '').trim();
    var caption = customCaption || (getCaptureLabel(kind) + '. ' + title + ' (s.' + page + ')');
    return '<figure class="pdf-capture pdf-capture--' + kind + '" style="margin:12px 0;text-align:center;">'
      + '<img src="' + dataUrl + '" alt="PDF bolgesi ' + (kind === 'table' ? 'tablo' : 'sekil') + ' s.' + page + '" style="max-width:100%;display:block;margin:0 auto;"/>'
      + '<figcaption style="text-align:center;font-style:italic;font-size:12px;margin-top:4px;">' + caption + '</figcaption>'
      + '</figure><p></p>';
  }

  function buildPdfRegionFigureHTML(input){
    input = input || {};
    return buildPdfRegionCaptureHTML({
      dataUrl: input.dataUrl,
      page: input.page,
      title: input.title,
      caption: input.caption,
      kind: 'figure'
    });
  }

  function buildPdfRegionNoteText(input){
    input = input || {};
    var kind = normalizeCaptureKind(input.kind);
    var page = parseInt(input.page, 10) || 1;
    var title = String(input.title || 'PDF').replace(/[<>]/g, '').trim() || 'PDF';
    var customCaption = String(input.caption || '').replace(/[<>]/g, '').trim();
    var label = getCaptureLabel(kind);
    var caption = customCaption || (label + '. ' + title + ' (s.' + page + ')');
    return '[PDF ' + (kind === 'table' ? 'tablo' : 'sekil') + ' yakalamasi] ' + caption;
  }

  function safePdfTabTitle(value){
    return String(value || '').replace(/\s+/g, ' ').trim() || 'PDF';
  }

  function buildPdfCompareCandidates(input){
    input = input || {};
    var tabs = Array.isArray(input.tabs) ? input.tabs : [];
    var activeTabId = String(input.activeTabId || '').trim();
    var workspaceId = String(input.workspaceId || '').trim();
    var candidates = tabs
      .filter(function(tab){
        if(!tab || typeof tab !== 'object') return false;
        if(!tab.id) return false;
        if(workspaceId && tab.wsId && String(tab.wsId) !== workspaceId) return false;
        return String(tab.id) !== activeTabId;
      })
      .map(function(tab){
        return {
          id: String(tab.id),
          title: safePdfTabTitle(tab.title),
          refId: String(tab.refId || ''),
          wsId: String(tab.wsId || '')
        };
      })
      .sort(function(a, b){
        return String(a.title || '').localeCompare(String(b.title || ''), 'tr', { sensitivity: 'base' });
      });
    return candidates.map(function(item, index){
      item.index = index + 1;
      item.label = item.index + '. ' + item.title;
      return item;
    });
  }

  function resolvePdfCompareSelection(input){
    input = input || {};
    var candidates = Array.isArray(input.candidates) ? input.candidates : [];
    var raw = String(input.selection || '').trim();
    if(!raw) return '';
    var selected = candidates.find(function(item){
      return item && item.id && String(item.id) === raw;
    });
    if(selected && selected.id) return String(selected.id);
    var numeric = Number(raw);
    if(Number.isFinite(numeric)){
      var byIndex = candidates.find(function(item){
        return Number(item && item.index) === numeric;
      });
      if(byIndex && byIndex.id) return String(byIndex.id);
    }
    var normalized = raw.toLocaleLowerCase('tr-TR');
    var byTitle = candidates.find(function(item){
      return item && item.title && String(item.title).toLocaleLowerCase('tr-TR') === normalized;
    });
    return byTitle && byTitle.id ? String(byTitle.id) : '';
  }

  function buildPdfCompareStatus(input){
    input = input || {};
    if(!input.enabled) return 'Karsilastirma kapali';
    var left = safePdfTabTitle(input.leftTitle);
    var right = safePdfTabTitle(input.rightTitle);
    var sync = input.syncScroll ? ' (scroll senkron)' : '';
    return 'Karsilastirma: ' + left + ' <> ' + right + sync;
  }

  function normalizeScrollRatio(input){
    input = input || {};
    var scrollHeight = Math.max(0, Number(input.scrollHeight) || 0);
    var clientHeight = Math.max(0, Number(input.clientHeight) || 0);
    var maxTop = Math.max(0, scrollHeight - clientHeight);
    if(!maxTop) return 0;
    var scrollTop = clampNumber(Number(input.scrollTop), 0, maxTop, 0);
    return Math.round((scrollTop / maxTop) * 10000) / 10000;
  }

  function scrollTopFromRatio(input){
    input = input || {};
    var scrollHeight = Math.max(0, Number(input.scrollHeight) || 0);
    var clientHeight = Math.max(0, Number(input.clientHeight) || 0);
    var maxTop = Math.max(0, scrollHeight - clientHeight);
    if(!maxTop) return 0;
    var ratio = clampNumber(Number(input.ratio), 0, 1, 0);
    return Math.round(maxTop * ratio);
  }

  return {
    clampPage: clampPage,
    getPageProgress: getPageProgress,
    getZoomLabel: getZoomLabel,
    getNextZoom: getNextZoom,
    buildReaderStats: buildReaderStats,
    buildPdfOcrProbeState: buildPdfOcrProbeState,
    normalizePdfRegionSelection: normalizePdfRegionSelection,
    normalizeCaptureKind: normalizeCaptureKind,
    buildPdfRegionCaptureHTML: buildPdfRegionCaptureHTML,
    buildPdfRegionFigureHTML: buildPdfRegionFigureHTML,
    buildPdfRegionNoteText: buildPdfRegionNoteText,
    buildPdfCompareCandidates: buildPdfCompareCandidates,
    resolvePdfCompareSelection: resolvePdfCompareSelection,
    buildPdfCompareStatus: buildPdfCompareStatus,
    normalizeScrollRatio: normalizeScrollRatio,
    scrollTopFromRatio: scrollTopFromRatio
  };
});
