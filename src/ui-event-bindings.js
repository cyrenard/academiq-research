(function(root, factory){
  var api = factory(root);
  if(typeof module !== 'undefined' && module.exports){
    // CommonJS require: export the API but do NOT auto-install. Hosts
    // (HTML or other modules) must call api.install() explicitly. This
    // prevents duplicate bindings when the module is required while an
    // inline copy is also active on the page.
    module.exports = api;
    return;
  }
  if(root){
    root.AQUIEventBindings = api;
  }
  api.autoInstall();
})(typeof window !== 'undefined' ? window : globalThis, function(root){
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

  function ensureCitationTriggerReady(){
    if(root.AQCitationRuntime && typeof root.AQCitationRuntime.init === 'function'){
      try{ root.AQCitationRuntime.init(); }catch(_e){}
    }
  }

  function triggerCitationInsert(){
    ensureCitationTriggerReady();
    if(typeof root.doTrigRef === 'function'){
      try{ root.doTrigRef(); }catch(_e){}
    }
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

  function execAndHideModal(fnName, modalId){
    call(fnName);
    if(modalId) call('hideM', modalId);
    closeDropdown();
  }

  function callAndSync(fnName){
    call.apply(null, arguments);
    if(typeof root.updateFmtState === 'function'){
      setTimeout(function(){
        try{ root.updateFmtState(); }catch(_e){}
      }, 0);
    }
  }

  var EDITOR_SELECTION_SAFE_COMMANDS = {
    bold:true,
    italic:true,
    underline:true,
    strikeThrough:true,
    formatBlock:true,
    setParagraphStyle:true,
    justifyLeft:true,
    justifyCenter:true,
    justifyRight:true,
    justifyFull:true,
    insertUnorderedList:true,
    insertOrderedList:true,
    applyMultiLevelList:true,
    indent:true,
    outdent:true,
    insertPageBreak:true,
    superscript:true,
    subscript:true,
    foreColor:true,
    hiliteColor:true,
    fontName:true,
    setPageSize:true,
    setParagraphSpacing:true
  };

  var EDITOR_SELECTION_SAFE_ACTIONS = {
    applyFontSize:true,
    setLineSpacing:true
  };

  function preserveEditorSelection(){
    // Select/change controls also steal focus, not only buttons. Keep the
    // selection restoration path centralized so formatting commands behave
    // like Word: operate on the current selection, then return to writing.
    call('captureEditorListStyleSelection');
    call('restoreEditorListStyleSelection');
  }

  function callEditorCommandAndSync(cmd, val, options){
    options = options || {};
    var preserveSelection = options.preserveSelection !== false && !!EDITOR_SELECTION_SAFE_COMMANDS[cmd];
    if(preserveSelection){
      preserveEditorSelection();
    }
    callAndSync('ec', cmd, val);
  }

  function callEditorActionAndSync(fnName){
    var args = Array.prototype.slice.call(arguments);
    var options = args.length && args[args.length - 1] && args[args.length - 1].__aqOptions ? args.pop() : {};
    if(options.preserveSelection !== false && !!EDITOR_SELECTION_SAFE_ACTIONS[fnName]){
      preserveEditorSelection();
    }
    callAndSync.apply(null, args);
  }

  function bindTopToolbarEvents(){
    on('tbBoldBtn', 'click', function(){ callEditorCommandAndSync('bold'); });
    on('tbItalicBtn', 'click', function(){ callEditorCommandAndSync('italic'); });
    on('tbUnderlineBtn', 'click', function(){ callEditorCommandAndSync('underline'); });
    on('tbH1Btn', 'click', function(){ callEditorCommandAndSync('formatBlock', 'h1'); });
    on('tbH2Btn', 'click', function(){ callEditorCommandAndSync('formatBlock', 'h2'); });
    on('tbH3Btn', 'click', function(){ callEditorCommandAndSync('formatBlock', 'h3'); });
    on('tbParagraphBtn', 'click', function(){ callEditorCommandAndSync('formatBlock', 'p'); });

    on('tbInsertMenuBtn', 'click', function(event){ call('opdd', 'ddins', event && event.currentTarget ? event.currentTarget : this); });
    on('ddInsCitationBtn', 'click', function(){ triggerCitationInsert(); closeDropdown(); });
    on('ddInsTableBtn', 'click', function(){ call('openTableWizard'); closeDropdown(); });
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
    on('ddExpApaTxtBtn', 'click', function(){ execAndClose('expBibliographyAPA'); });
    on('ddExpChicagoTxtBtn', 'click', function(){ execAndClose('expBibliographyChicago'); });
    on('ddExpVancouverTxtBtn', 'click', function(){ execAndClose('expBibliographyVancouver'); });
    on('ddExpCslJsonBtn', 'click', function(){ execAndClose('expCSLJSON'); });
    on('ddExpNotesBtn', 'click', function(){ execAndClose('expNotes'); });
    on('ddExpLibBtn', 'click', function(){ execAndClose('expLib'); });
    on('zenExitBtn', 'click', function(){ call('toggleZenMode'); });
  }

  function bindEditorToolbarEvents(){
    var toolbar = get('etb');
    if(toolbar && !toolbar.__aqSelectionGuard){
      toolbar.__aqSelectionGuard = true;
      toolbar.addEventListener('mousedown', function(event){
        var target = event && event.target && event.target.closest ? event.target : null;
        var btn = target ? target.closest('button.efmt') : null;
        var field = target ? target.closest('select,input[type="color"]') : null;
        if(field){
          // Selects/color inputs must still open normally, so capture the
          // editor selection without preventing the native control behavior.
          call('captureEditorListStyleSelection');
          return;
        }
        if(!btn) return;
        if(btn.classList && btn.classList.contains('efmt-menu')) return;
        call('captureEditorListStyleSelection');
        if(typeof event.preventDefault === 'function') event.preventDefault();
      });
    }

    on('btnBold', 'click', function(){ callEditorCommandAndSync('bold'); });
    on('btnItalic', 'click', function(){ callEditorCommandAndSync('italic'); });
    on('btnUnderline', 'click', function(){ callEditorCommandAndSync('underline'); });
    on('btnStrike', 'click', function(){ callEditorCommandAndSync('strikeThrough'); });
    on('txtColor', 'change', function(event){ callEditorCommandAndSync('foreColor', event && event.target ? event.target.value : '#000000'); });
    on('hlColor', 'change', function(event){ callEditorCommandAndSync('hiliteColor', event && event.target ? event.target.value : '#FFFF00'); });
    on('btnParagraph', 'click', function(){ callEditorCommandAndSync('formatBlock', 'p'); });
    on('btnH1', 'click', function(){ callEditorCommandAndSync('formatBlock', 'h1'); });
    on('btnH2', 'click', function(){ callEditorCommandAndSync('formatBlock', 'h2'); });
    on('btnH3', 'click', function(){ callEditorCommandAndSync('formatBlock', 'h3'); });
    on('btnH4', 'click', function(){ callEditorCommandAndSync('formatBlock', 'h4'); });
    on('btnH5', 'click', function(){ callEditorCommandAndSync('formatBlock', 'h5'); });
    on('btnBlockQuote', 'click', function(){ callAndSync('insBlkQ'); });

    on('lineSpacing', 'change', function(event){ callEditorActionAndSync('setLineSpacing', event && event.target ? event.target.value : '2'); });
    on('paragraphStyleSel', 'change', function(event){
      var val = event && event.target ? event.target.value : 'normal';
      callEditorCommandAndSync('setParagraphStyle', val);
    });
    on('btnAlignLeft', 'click', function(){ callEditorCommandAndSync('justifyLeft'); });
    on('btnAlignCenter', 'click', function(){ callEditorCommandAndSync('justifyCenter'); });
    on('btnAlignRight', 'click', function(){ callEditorCommandAndSync('justifyRight'); });
    on('btnUnorderedList', 'click', function(){ callEditorCommandAndSync('insertUnorderedList'); });
    on('btnOrderedList', 'click', function(){ callEditorCommandAndSync('insertOrderedList'); });
    on('btnMultiLevelList', 'click', function(){ callEditorCommandAndSync('applyMultiLevelList', 'number'); });
    on('btnIndent', 'click', function(){ callEditorCommandAndSync('indent'); });
    on('btnOutdent', 'click', function(){ callEditorCommandAndSync('outdent'); });
    on('btnPageBreak', 'click', function(){ callEditorCommandAndSync('insertPageBreak'); });
    on('pageSizeSel', 'change', function(event){
      var val = event && event.target ? event.target.value : 'A4';
      callEditorCommandAndSync('setPageSize', val);
      if(typeof root.updatePageHeight === 'function') setTimeout(function(){ root.updatePageHeight(); }, 100);
    });
    on('paraSpacingSel', 'change', function(event){
      var val = event && event.target ? event.target.value : '0,0';
      callEditorCommandAndSync('setParagraphSpacing', val);
      if(typeof root.updatePageHeight === 'function') setTimeout(function(){ root.updatePageHeight(); }, 100);
    });
    on('fontsel', 'change', function(event){ callEditorCommandAndSync('fontName', event && event.target ? event.target.value : 'Times New Roman'); });
    on('sizesel', 'change', function(event){ callEditorActionAndSync('applyFontSize', event && event.target ? event.target.value : '12'); });
    on('editorInsertMenuBtn', 'click', function(event){
      if(event && typeof event.preventDefault === 'function') event.preventDefault();
      call('openQuickToolbarMenu', 'editorInsertQuickMenuModal', event && event.currentTarget ? event.currentTarget : this);
    });
    on('toolbarFindInp', 'input', function(event){
      call('syncToolbarFindQuery', event && event.target ? event.target.value : '');
      call('findExec');
    });
    on('toolbarFindInp', 'keydown', function(event){
      if(!event) return;
      if(event.key === 'Enter'){
        event.preventDefault();
        if(event.shiftKey) call('findPrev');
        else call('findNext');
      }else if(event.key === 'Escape'){
        event.preventDefault();
        call('closeFindBar');
      }
    });
    on('toolbarFindPrevBtn', 'click', function(){ call('findPrev'); });
    on('toolbarFindNextBtn', 'click', function(){ call('findNext'); });
    on('toolbarFindReplaceBtn', 'click', function(event){
      if(event && typeof event.preventDefault === 'function') event.preventDefault();
      call('openQuickToolbarMenu', 'findReplaceQuickMenuModal', event && event.currentTarget ? event.currentTarget : this);
      if(typeof root.syncToolbarFindUI === 'function') root.syncToolbarFindUI();
      setTimeout(function(){
        var inp = get('toolbarReplaceFindInp') || get('toolbarReplaceInp');
        if(inp && typeof inp.focus === 'function') inp.focus();
      }, 30);
    });
    on('bibliographyGoBtn', 'click', function(){ call('insRefs'); });
    on('bibliographyRefreshBtn', 'click', function(){ call('refreshBibliographyManual'); });
    on('bibliographyMenuBtn', 'click', function(event){
      if(event && typeof event.preventDefault === 'function') event.preventDefault();
      call('openQuickToolbarMenu', 'bibliographyQuickMenuModal', event && event.currentTarget ? event.currentTarget : this);
    });
    on('tbTocInsertBtn', 'click', function(){ callAndSync('insertTOC'); });
    on('tbTocUpdateBtn', 'click', function(){ callAndSync('insertTOC'); });
    on('tbTocRemoveBtn', 'click', function(){ callAndSync('removeTOC'); });
    on('tbBibResetBtn', 'click', function(){ call('resetBibliographyManual'); closeDropdown(); });
    on('tbBibDuplicateBtn', 'click', function(){ call('openDuplicateReview'); closeDropdown(); });
    on('tbBibMetadataBtn', 'click', function(){ call('openMetadataHealthCenter'); closeDropdown(); });
    on('tbInsCitationBtn', 'click', function(){ triggerCitationInsert(); closeDropdown(); });
    on('tbInsTableBtn', 'click', function(){ call('openTableWizard'); closeDropdown(); });
    on('tbInsFigureBtn', 'click', function(){ call('insFig'); closeDropdown(); });
    on('ddTocInsertBtn', 'click', function(){ execAndHideModal('insertTOC', 'tocQuickMenuModal'); });
    on('ddTocUpdateBtn', 'click', function(){ execAndHideModal('insertTOC', 'tocQuickMenuModal'); });
    on('ddTocRemoveBtn', 'click', function(){ execAndHideModal('removeTOC', 'tocQuickMenuModal'); });
    on('ddInsEditorCitationBtn', 'click', function(){ triggerCitationInsert(); call('hideM', 'editorInsertQuickMenuModal'); closeDropdown(); });
    on('ddInsEditorTableBtn', 'click', function(){ call('hideM', 'editorInsertQuickMenuModal'); call('openTableWizard'); closeDropdown(); });
    on('ddInsEditorBlockQuoteBtn', 'click', function(){ execAndHideModal('insBlkQ', 'editorInsertQuickMenuModal'); });
    on('ddInsEditorFigureBtn', 'click', function(){ execAndHideModal('insFig', 'editorInsertQuickMenuModal'); });
    on('ddInsEditorCoverBtn', 'click', function(){ execAndHideModal('insCover', 'editorInsertQuickMenuModal'); });
    on('ddInsEditorAbstractBtn', 'click', function(){ execAndHideModal('insAbstract', 'editorInsertQuickMenuModal'); });
    on('ddInsEditorRefsBtn', 'click', function(){ execAndHideModal('insRefs', 'editorInsertQuickMenuModal'); });
    on('ddInsEditorTplTezBtn', 'click', function(){ call('applyTemplate', 'tez'); call('hideM', 'editorInsertQuickMenuModal'); closeDropdown(); });
    on('ddInsEditorTplMakaleBtn', 'click', function(){ call('applyTemplate', 'makale'); call('hideM', 'editorInsertQuickMenuModal'); closeDropdown(); });
    on('ddInsEditorTplRaporBtn', 'click', function(){ call('applyTemplate', 'rapor'); call('hideM', 'editorInsertQuickMenuModal'); closeDropdown(); });
    on('ddInsEditorTplLiteraturBtn', 'click', function(){ call('applyTemplate', 'literatur'); call('hideM', 'editorInsertQuickMenuModal'); closeDropdown(); });
    on('ddInsEditorWordImportBtn', 'click', function(){ clickInput('wordinp'); call('hideM', 'editorInsertQuickMenuModal'); closeDropdown(); });
    on('ddBibResetBtn', 'click', function(){ call('resetBibliographyManual'); call('hideM', 'bibliographyQuickMenuModal'); closeDropdown(); });
    on('ddBibExternalImportBtn', 'click', function(){ call('hideM', 'bibliographyQuickMenuModal'); call('openExternalReferenceImportModal'); closeDropdown(); });
    on('ddBibDuplicateBtn', 'click', function(){ call('openDuplicateReview'); call('hideM', 'bibliographyQuickMenuModal'); closeDropdown(); });
    on('ddBibMetadataBtn', 'click', function(){ call('openMetadataHealthCenter'); call('hideM', 'bibliographyQuickMenuModal'); closeDropdown(); });
    on('toolbarReplaceFindInp', 'input', function(event){
      call('syncToolbarFindQuery', event && event.target ? event.target.value : '');
      call('findExec');
    });
    on('toolbarReplaceInp', 'input', function(event){
      call('syncToolbarReplaceQuery', event && event.target ? event.target.value : '');
    });
    on('toolbarReplaceFindInp', 'keydown', function(event){
      if(!event) return;
      if(event.key === 'Enter'){
        event.preventDefault();
        call('findNext');
      }else if(event.key === 'Escape'){
        event.preventDefault();
        call('hideM', 'findReplaceQuickMenuModal');
      }
    });
    on('toolbarReplaceInp', 'keydown', function(event){
      if(!event) return;
      if(event.key === 'Enter'){
        event.preventDefault();
        call('replaceCurrent');
        call('hideM', 'findReplaceQuickMenuModal');
      }else if(event.key === 'Escape'){
        event.preventDefault();
        call('hideM', 'findReplaceQuickMenuModal');
      }
    });
    on('toolbarFindRegex', 'change', function(event){
      call('syncToolbarFindOptions', 'regex', !!(event && event.target && event.target.checked));
      call('findExec');
    });
    on('toolbarFindCase', 'change', function(event){
      call('syncToolbarFindOptions', 'case', !!(event && event.target && event.target.checked));
      call('findExec');
    });
    on('toolbarReplaceCurrentBtn', 'click', function(){
      call('replaceCurrent');
      call('hideM', 'findReplaceQuickMenuModal');
    });
    on('toolbarReplaceAllBtn', 'click', function(){
      call('replaceAll');
      call('hideM', 'findReplaceQuickMenuModal');
    });
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
    on('pdfAnnotsToggleBtn', 'click', function(){ call('togglePdfAnnotations'); });
    on('pdfRelatedToggleBtn', 'click', function(){ call('togglePdfRelated'); });
    on('annotbtn', 'click', function(){ call('toggleAnnotMode'); });
    on('drawbtn', 'click', function(){ call('toggleDrawMode'); });
    on('pdfRegionBtn', 'click', function(){ call('togglePdfRegionCaptureMode'); });
    on('pdfDrawColor', 'change', function(event){ call('setPdfDrawColor', event && event.target ? event.target.value : '#c9453e'); });
    on('pdfDrawWidth', 'change', function(event){ call('setPdfDrawWidth', event && event.target ? event.target.value : '2.5'); });
    on('pdfDrawClearBtn', 'click', function(){ call('clearPdfDrawingPage'); });
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
    on('tocQuickMenuModal', 'click', function(event){
      if(event && event.target === this) call('hideM', 'tocQuickMenuModal');
    });
    on('editorInsertQuickMenuModal', 'click', function(event){
      if(event && event.target === this) call('hideM', 'editorInsertQuickMenuModal');
    });
    on('bibliographyQuickMenuModal', 'click', function(event){
      if(event && event.target === this) call('hideM', 'bibliographyQuickMenuModal');
    });
    on('externalReferenceImportModal', 'click', function(event){
      if(event && event.target === this){
        call('hideM', 'externalReferenceImportModal');
      }
    });
    on('findReplaceQuickMenuModal', 'click', function(event){
      if(event && event.target === this) call('hideM', 'findReplaceQuickMenuModal');
    });
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
    on('externalReferenceFileInput', 'change', function(event){ call('importExternalReferenceFile', event); });
    on('externalReferenceTextImportBtn', 'click', function(){ call('importExternalReferenceText'); });
    on('externalReferenceDoiImportBtn', 'click', function(){ call('importExternalReferenceDoi'); });
    on('externalReferenceImportCloseBtn', 'click', function(){
      call('hideM', 'externalReferenceImportModal');
    });
    on('lfinp', 'change', function(event){ call('hPDFs', event); });

    bindEditorToolbarEvents();
    bindRightPanelEvents();
    bindPDFPanelEvents();
    bindModalEvents();
    setTimeout(function(){
      var lineSpacingEl = get('lineSpacing');
      if(lineSpacingEl) call('setLineSpacing', lineSpacingEl.value || '2');
    }, 0);

    on('outlineOpenBtn', 'click', function(){ call('openDocumentOutline'); });
    on('captionManagerOpenBtn', 'click', function(){ call('openCaptionManager'); });
    on('insImageBtn', 'click', function(){ call('insImage'); });
    on('trigRefBtn', 'click', function(){ triggerCitationInsert(); });
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

  function install(){
    // Guard against duplicate installations when both this module and the
    // inline HTML copy are present on the same page.
    if(root && root.__aqUIEventBindingsInstalled) return false;
    bindUIEvents();
    if(root) root.__aqUIEventBindingsInstalled = true;
    return true;
  }

  function autoInstall(){
    if(typeof document === 'undefined') return;
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', install, { once:true });
    }else{
      install();
    }
  }

  return {
    install: install,
    autoInstall: autoInstall,
    bindUIEvents: bindUIEvents,
    bindEditorToolbarEvents: bindEditorToolbarEvents,
    bindTopToolbarEvents: bindTopToolbarEvents,
    EDITOR_SELECTION_SAFE_COMMANDS: EDITOR_SELECTION_SAFE_COMMANDS,
    EDITOR_SELECTION_SAFE_ACTIONS: EDITOR_SELECTION_SAFE_ACTIONS,
    callEditorCommandAndSync: callEditorCommandAndSync,
    callEditorActionAndSync: callEditorActionAndSync
  };
});
