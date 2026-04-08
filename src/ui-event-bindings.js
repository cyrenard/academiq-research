(function(root){
  function call(fnName){
    if(typeof root[fnName] !== 'function') return;
    var args = Array.prototype.slice.call(arguments, 1);
    try{ root[fnName].apply(root, args); }catch(e){}
  }

  function get(id){
    return document.getElementById(id);
  }

  function on(id, eventName, handler){
    var el = get(id);
    if(!el || !eventName || typeof handler !== 'function') return;
    el.addEventListener(eventName, handler);
  }

  function clickInput(id){
    var input = get(id);
    if(input && typeof input.click === 'function') input.click();
  }

  function closeLibraryActionGroups(exceptEl){
    var groups = document.querySelectorAll('#libactions details.libgroup[open]');
    if(!groups || !groups.length) return;
    Array.prototype.forEach.call(groups, function(group){
      if(exceptEl && group === exceptEl) return;
      group.removeAttribute('open');
    });
  }

  function bindLibraryActionGroups(){
    var host = get('libactions');
    if(!host || host.__aqBound) return;
    host.__aqBound = true;

    host.addEventListener('toggle', function(event){
      var group = event && event.target && event.target.closest ? event.target.closest('details.libgroup') : null;
      if(!group || !group.open) return;
      closeLibraryActionGroups(group);
    }, true);

    host.addEventListener('click', function(event){
      var btn = event && event.target && event.target.closest ? event.target.closest('button') : null;
      if(!btn) return;
      closeLibraryActionGroups(null);
    });

    document.addEventListener('click', function(event){
      if(host.contains(event.target)) return;
      closeLibraryActionGroups(null);
    });
  }

  function closeDropdown(){
    call('cdd');
  }

  function execAndClose(fnName){
    call(fnName);
    closeDropdown();
  }

  function bindTopToolbarEvents(){
    on('tbBoldBtn', 'click', function(){ call('ec', 'bold'); });
    on('tbItalicBtn', 'click', function(){ call('ec', 'italic'); });
    on('tbUnderlineBtn', 'click', function(){ call('ec', 'underline'); });
    on('tbH1Btn', 'click', function(){ call('ec', 'formatBlock', 'h1'); });
    on('tbH2Btn', 'click', function(){ call('ec', 'formatBlock', 'h2'); });
    on('tbH3Btn', 'click', function(){ call('ec', 'formatBlock', 'h3'); });
    on('tbParagraphBtn', 'click', function(){ call('ec', 'formatBlock', 'p'); });

    on('tbInsertMenuBtn', 'click', function(event){ call('opdd', 'ddins', event && event.currentTarget ? event.currentTarget : this); });
    on('ddInsCitationBtn', 'click', function(){ execAndClose('doTrigRef'); });
    on('ddInsTableBtn', 'click', function(){ call('showM', 'wiz'); closeDropdown(); });
    on('ddInsBlockQuoteBtn', 'click', function(){ execAndClose('insBlkQ'); });
    on('ddInsFigureBtn', 'click', function(){ execAndClose('insFig'); });
    on('ddInsCoverBtn', 'click', function(){ execAndClose('insCover'); });
    on('ddInsAbstractBtn', 'click', function(){ execAndClose('insAbstract'); });
    on('ddInsRefsBtn', 'click', function(){ execAndClose('insRefs'); });
    on('ddTplTezBtn', 'click', function(){ call('applyTemplate', 'tez'); closeDropdown(); });
    on('ddTplMakaleBtn', 'click', function(){ call('applyTemplate', 'makale'); closeDropdown(); });
    on('ddTplRaporBtn', 'click', function(){ call('applyTemplate', 'rapor'); closeDropdown(); });
    on('ddTplLiteraturBtn', 'click', function(){ call('applyTemplate', 'literatur'); closeDropdown(); });
    on('ddWordImportBtn', 'click', function(){ clickInput('wordinp'); closeDropdown(); });

    on('tbExportMenuBtn', 'click', function(event){ call('opdd', 'ddexp', event && event.currentTarget ? event.currentTarget : this); });
    on('ddExpPreviewBtn', 'click', function(){ execAndClose('openExportPreview'); });
    on('ddExpPdfBtn', 'click', function(){ execAndClose('expPDF'); });
    on('ddExpDocBtn', 'click', function(){ execAndClose('expDOC'); });
    on('ddExpBibBtn', 'click', function(){ execAndClose('expBIB'); });
    on('ddExpRisBtn', 'click', function(){ execAndClose('expRIS'); });
    on('ddExpNotesBtn', 'click', function(){ execAndClose('expNotes'); });
    on('ddExpLibBtn', 'click', function(){ execAndClose('expLib'); });
    on('zenExitBtn', 'click', function(){ call('toggleZenMode'); });
  }

  function bindEditorToolbarEvents(){
    on('btnBold', 'click', function(){ call('ec', 'bold'); });
    on('btnItalic', 'click', function(){ call('ec', 'italic'); });
    on('btnUnderline', 'click', function(){ call('ec', 'underline'); });
    on('btnStrike', 'click', function(){ call('ec', 'strikeThrough'); });
    on('txtColor', 'change', function(event){ call('ec', 'foreColor', event && event.target ? event.target.value : '#000000'); });
    on('hlColor', 'change', function(event){ call('ec', 'hiliteColor', event && event.target ? event.target.value : '#FFFF00'); });

    on('btnParagraph', 'click', function(){ call('ec', 'formatBlock', 'p'); });
    on('btnH1', 'click', function(){ call('ec', 'formatBlock', 'h1'); });
    on('btnH2', 'click', function(){ call('ec', 'formatBlock', 'h2'); });
    on('btnH3', 'click', function(){ call('ec', 'formatBlock', 'h3'); });
    on('btnH4', 'click', function(){ call('ec', 'formatBlock', 'h4'); });
    on('btnH5', 'click', function(){ call('ec', 'formatBlock', 'h5'); });
    on('btnBlockQuote', 'click', function(){ call('insBlkQ'); });

    on('lineSpacing', 'change', function(event){ call('setLineSpacing', event && event.target ? event.target.value : '2'); });
    on('btnAlignLeft', 'click', function(){ call('ec', 'justifyLeft'); });
    on('btnAlignCenter', 'click', function(){ call('ec', 'justifyCenter'); });
    on('btnAlignRight', 'click', function(){ call('ec', 'justifyRight'); });
    on('btnUnorderedList', 'click', function(){ call('ec', 'insertUnorderedList'); });
    on('btnOrderedList', 'click', function(){ call('ec', 'insertOrderedList'); });
    on('fontsel', 'change', function(event){ call('ec', 'fontName', event && event.target ? event.target.value : 'Times New Roman'); });
    on('sizesel', 'change', function(event){ call('applyFontSize', event && event.target ? event.target.value : '12'); });

    on('findPrevBtn', 'click', function(){ call('findPrev'); });
    on('findNextBtn', 'click', function(){ call('findNext'); });
    on('findCloseBtn', 'click', function(){ call('closeFindBar'); });
    on('replaceCurrentBtn', 'click', function(){ call('replaceCurrent'); });
    on('replaceAllBtn', 'click', function(){ call('replaceAll'); });
    on('zoomOutBtn', 'click', function(){ call('editorZoom', -10); });
    on('zoomInBtn', 'click', function(){ call('editorZoom', 10); });
  }

  function bindRightPanelEvents(){
    on('rtypeNotesBtn', 'click', function(event){ call('swR', 'notes', event && event.currentTarget ? event.currentTarget : this); });
    on('rtypeRefsBtn', 'click', function(event){ call('swR', 'refs', event && event.currentTarget ? event.currentTarget : this); });
    on('bsn', 'click', function(){ call('saveNote'); });
    on('noteFilterType', 'change', function(event){ call('setNoteFilterType', event && event.target ? event.target.value : 'all'); });
    on('noteFilterUsage', 'change', function(event){ call('setNoteFilterUsage', event && event.target ? event.target.value : 'all'); });
    on('noteFilterTag', 'input', function(event){ call('setNoteFilterTag', event && event.target ? event.target.value : ''); });
    on('noteFilterRef', 'change', function(event){ call('setNoteFilterRef', event && event.target ? event.target.value : 'all'); });
    on('refreshBibliographyBtn', 'click', function(){ call('refreshBibliographyManual'); });
    on('resetBibliographyBtn', 'click', function(){ call('resetBibliographyManual'); });
    on('goBibliographyBtn', 'click', function(){ call('insRefs'); });
    on('sbgoal', 'click', function(){ call('setWordGoal'); });
  }

  function bindPDFPanelEvents(){
    on('pdfPrevBtn', 'click', function(){ call('pPrev'); });
    on('pdfpg', 'click', function(){ call('goToPage'); });
    on('pdfNextBtn', 'click', function(){ call('pNext'); });
    on('pdfZoomOutBtn', 'click', function(){ call('pZO'); });
    on('pdfzoom', 'click', function(){ call('pZFit'); });
    on('pdfZoomInBtn', 'click', function(){ call('pZI'); });
    on('pdfSearchToggleBtn', 'click', function(){ call('togglePdfSearch'); });
    on('pdfThumbsToggleBtn', 'click', function(){ call('toggleThumbs'); });
    on('pdfOutlineToggleBtn', 'click', function(){ call('toggleOutline'); });
    on('annotbtn', 'click', function(){ call('toggleAnnotMode'); });
    on('drawbtn', 'click', function(){ call('toggleDrawMode'); });
    on('pdffullbtn', 'click', function(){ call('togglePdfFullscreen'); });
    on('pdfUploadBtn', 'click', function(){ clickInput('lfinp'); });
    on('pdfclosebtn', 'click', function(){ call('togglePDF'); });
    on('pdfEmptyUploadBtn', 'click', function(){ clickInput('lfinp'); });

    on('pdfsearchinp', 'keydown', function(event){
      if(!event) return;
      if(event.key === 'Enter'){
        event.preventDefault();
        call('pdfSearchNext');
      }else if(event.key === 'Escape'){
        event.preventDefault();
        call('togglePdfSearch');
      }
    });
    on('pdfSearchPrevBtn', 'click', function(){ call('pdfSearchPrev'); });
    on('pdfSearchNextBtn', 'click', function(){ call('pdfSearchNext'); });
    on('pdfSearchCloseBtn', 'click', function(){ call('togglePdfSearch'); });

    on('hlbar', 'click', function(event){
      var target = event && event.target;
      if(!target || !target.classList || !target.classList.contains('hlc')) return;
      call('setHLC', target);
    });
    on('pdfscroll', 'dragover', function(event){
      if(event && typeof event.preventDefault === 'function') event.preventDefault();
    });
    on('pdfscroll', 'drop', function(event){
      if(event && typeof event.preventDefault === 'function') event.preventDefault();
      call('hDrop', event);
    });

    on('hlToNoteBtn', 'click', function(){ call('doHL', true); });
    on('hlOnlyBtn', 'click', function(){ call('doHL', false); });
    on('hlCloseBtn', 'click', function(){ call('hideHLtip'); });
    on('citationInlineModeBtn', 'click', function(event){ call('setCM', 'inline', event && event.currentTarget ? event.currentTarget : this); });
    on('citationFootnoteModeBtn', 'click', function(event){ call('setCM', 'footnote', event && event.currentTarget ? event.currentTarget : this); });
  }

  function bindModalEvents(){
    on('promptInput', 'keydown', function(event){
      if(!event) return;
      if(event.key === 'Enter'){
        event.preventDefault();
        call('resolvePrompt', true);
      }else if(event.key === 'Escape'){
        event.preventDefault();
        call('resolvePrompt', false);
      }
    });
    on('promptCancelBtn', 'click', function(){ call('resolvePrompt', false); });
    on('promptConfirmBtn', 'click', function(){ call('resolvePrompt', true); });
    on('refMetaCancelBtn', 'click', function(){ call('closeRefMetadataModal', false); });
    on('refMetaSaveBtn', 'click', function(){ call('closeRefMetadataModal', true); });

    on('wsminp', 'keydown', function(event){
      if(event && event.key === 'Enter'){
        event.preventDefault();
        call('doAddWs');
      }
    });
    on('wsCancelBtn', 'click', function(){ call('hideM', 'wsm'); });
    on('wsCreateBtn', 'click', function(){ call('doAddWs'); });
    on('nbminp', 'keydown', function(event){
      if(event && event.key === 'Enter'){
        event.preventDefault();
        call('doAddNb');
      }
    });
    on('nbCancelBtn', 'click', function(){ call('hideM', 'nbm'); });
    on('nbCreateBtn', 'click', function(){ call('doAddNb'); });

    on('prefPageNum', 'change', function(event){
      if(!root.S) return;
      root.S.showPageNumbers = !!(event && event.target && event.target.checked);
      call('save');
      call('updatePageHeight');
    });
    on('syncCloseBtn', 'click', function(){ call('hideM', 'syncmodal'); });
    on('updateCheckBtn', 'click', function(){ call('checkForUpdate'); });
    on('btnDoUpdate', 'click', function(){ call('doUpdate'); });
    on('updateUrlSaveBtn', 'click', function(){ call('saveUpdateUrl'); });
    on('wizCancelBtn', 'click', function(){ call('hideM', 'wiz'); });
    on('wizInsertBtn', 'click', function(){ call('doTable'); });
    on('coverCancelBtn', 'click', function(){ call('hideM', 'covermodal'); });
    on('coverInsertBtn', 'click', function(){ call('doCover'); });
    on('dupCloseBtn', 'click', function(){ call('hideM', 'dupModal'); });
    on('metaHealthCloseBtn', 'click', function(){ call('hideM', 'metaHealthModal'); });
    on('collectionNameInp', 'keydown', function(event){
      if(event && event.key === 'Enter'){
        event.preventDefault();
        call('createCollectionFromInput');
      }
    });
    on('collectionCreateBtn', 'click', function(){ call('createCollectionFromInput'); });
    on('collectionCloseBtn', 'click', function(){ call('hideM', 'collectionModal'); });
    on('exportPreviewRefreshBtn', 'click', function(){ call('refreshExportPreview'); });
    on('exportPreviewPdfBtn', 'click', function(){ call('expPDF'); });
    on('exportPreviewCloseBtn', 'click', function(){ call('hideM', 'exportPreviewModal'); });
  }

  function bindUIEvents(){
    bindTopToolbarEvents();
    bindLibraryActionGroups();

    on('themebtn', 'click', function(){ call('toggleTheme'); });
    on('zenbtn', 'click', function(){ call('toggleZenMode'); });
    on('settingsBtn', 'click', function(){ call('showSyncSettings'); });
    on('togglePdfBtn', 'click', function(){ call('togglePDF'); });
    on('btnsbl', 'click', function(){ call('tSB', 'sbl'); });
    on('btnsbr', 'click', function(){ call('tSB', 'sbr'); });

    on('doiinp', 'keydown', function(event){
      if(event && event.key === 'Enter'){
        event.preventDefault();
        call('addDOI');
      }
    });
    on('doiFetchBtn', 'click', function(){ call('addDOI'); });
    on('libsrch', 'input', function(){ call('rLib'); });
    on('labelToggleBtn', 'click', function(){ call('toggleLabelFilterPanel'); });
    on('collectionFilterSel', 'change', function(event){
      call('setCollectionFilter', event && event.target ? event.target.value : 'all');
    });
    on('collectionManageBtn', 'click', function(){ call('openCollectionManager'); });
    on('batchOABtn', 'click', function(){ call('batchDownloadOA'); });
    on('batchCiteBtn', 'click', function(){ call('batchFetchCitations'); });
    on('btnPdfUpload', 'click', function(){
      clickInput('lfinp');
    });
    on('btnBibImport', 'click', function(){
      clickInput('bibinp');
    });
    on('btnZoteroImport', 'click', function(){
      clickInput('zoteroinp');
    });
    on('btnFindDuplicates', 'click', function(){ call('openDuplicateReview'); });
    on('btnMetadataHealth', 'click', function(){ call('openMetadataHealthCenter'); });
    on('relatedToggleBtn', 'click', function(event){
      if(event && typeof event.preventDefault === 'function') event.preventDefault();
      call('toggleRelatedPanel');
    });
    on('bibinp', 'change', function(event){ call('importBib', event); });
    on('zoteroinp', 'change', function(event){ call('importZotero', event); });
    on('lfinp', 'change', function(event){ call('hPDFs', event); });

    bindEditorToolbarEvents();
    bindRightPanelEvents();
    bindPDFPanelEvents();
    bindModalEvents();

    on('tocInsertBtn', 'click', function(){ call('insertTOC'); });
    on('tocUpdateBtn', 'click', function(){ call('insertTOC'); });
    on('tocRemoveBtn', 'click', function(){ call('removeTOC'); });
    on('insImageBtn', 'click', function(){ call('insImage'); });
    on('trigRefBtn', 'click', function(){ call('doTrigRef'); });
    on('btnFootnote', 'click', function(){ if(window.AQFootnotes) window.AQFootnotes.insertFootnote('footnote'); });
    on('btnEndnote', 'click', function(){ if(window.AQFootnotes) window.AQFootnotes.insertFootnote('endnote'); });
    on('btnCrossRef', 'click', function(){ if(window.AQFootnotes) window.AQFootnotes.showCrossRefDialog(); });
    on('btnMnMode', 'click', function(){ if(window.AQMarginNotes) window.AQMarginNotes.toggleMnMode(); });
    on('btnMnToggle', 'click', function(){ if(window.AQMarginNotes) window.AQMarginNotes.toggleMnVisible(); });
    on('citationStyleSel', 'change', function(event){
      call('setCitationStyle', event && event.target ? event.target.value : 'apa7');
    });
    on('imginp', 'change', function(event){ call('handleImgUpload', event); });
    on('wordinp', 'change', function(event){ call('importWordFile', event); });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bindUIEvents, { once:true });
  }else{
    bindUIEvents();
  }
})(typeof window !== 'undefined' ? window : globalThis);
