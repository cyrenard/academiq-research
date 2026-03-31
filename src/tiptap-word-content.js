(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordContent = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function getGlobalDocumentApi(){
    if(typeof window !== 'undefined' && window.AQTipTapWordDocument){
      return window.AQTipTapWordDocument;
    }
    if(typeof globalThis !== 'undefined' && globalThis.AQTipTapWordDocument){
      return globalThis.AQTipTapWordDocument;
    }
    return null;
  }

  function getGlobalTemplatesApi(){
    if(typeof window !== 'undefined' && window.AQTipTapWordTemplates){
      return window.AQTipTapWordTemplates;
    }
    if(typeof globalThis !== 'undefined' && globalThis.AQTipTapWordTemplates){
      return globalThis.AQTipTapWordTemplates;
    }
    return null;
  }

  function getGlobalCommandsApi(){
    if(typeof window !== 'undefined' && window.AQTipTapWordCommands){
      return window.AQTipTapWordCommands;
    }
    if(typeof globalThis !== 'undefined' && globalThis.AQTipTapWordCommands){
      return globalThis.AQTipTapWordCommands;
    }
    return null;
  }

  function getGlobalBridgeApi(){
    if(typeof window !== 'undefined' && window.AQTipTapWordBridge){
      return window.AQTipTapWordBridge;
    }
    if(typeof globalThis !== 'undefined' && globalThis.AQTipTapWordBridge){
      return globalThis.AQTipTapWordBridge;
    }
    return null;
  }

  function getGlobalDocumentBuilderApi(){
    return getGlobalDocumentApi();
  }

  function getEditorHTML(options){
    options = options || {};
    var documentApi = options.documentApi || getGlobalDocumentApi();
    if(documentApi && typeof documentApi.getEditorHTML === 'function'){
      return documentApi.getEditorHTML(options);
    }
    var editor = options.editor || null;
    if(editor && typeof editor.getHTML === 'function'){
      return editor.getHTML();
    }
    var shell = options.shell || null;
    if(shell && typeof shell.getHTML === 'function'){
      return shell.getHTML();
    }
    var host = options.host || null;
    return host ? (host.innerHTML || '<p></p>') : '<p></p>';
  }

  function setEditorHTML(options){
    options = options || {};
    var documentApi = options.documentApi || getGlobalDocumentApi();
    if(documentApi && typeof documentApi.setEditorHTML === 'function'){
      return !!documentApi.setEditorHTML(options);
    }
    var editor = options.editor || null;
    var html = String(options.html || '<p></p>');
    if(editor && editor.commands && typeof editor.commands.setContent === 'function'){
      editor.commands.setContent(html);
      return true;
    }
    var shell = options.shell || null;
    if(shell && typeof shell.setHTML === 'function'){
      shell.setHTML(html);
      return true;
    }
    var host = options.host || null;
    if(host){
      host.innerHTML = html;
      return true;
    }
    return false;
  }

  function runMutationEffects(options){
    options = options || {};
    if(typeof window !== 'undefined' && window.AQEditorRuntime && typeof window.AQEditorRuntime.runContentApplyEffects === 'function'){
      window.AQEditorRuntime.runContentApplyEffects({
        target: options.target || null,
        onApplied: options.onApplied || null,
        afterLayout: options.afterLayout || null,
        normalize: options.normalize !== false,
        layout: options.layout !== false,
        syncChrome: !!options.syncChrome,
        syncTOC: !!options.syncTOC,
        syncRefs: !!options.syncRefs,
        refreshTrigger: !!options.refreshTrigger
      });
      return true;
    }
    return false;
  }

  function applyEditorHTML(options){
    options = options || {};
    var editor = options.editor || null;
    var html = String(options.html || '<p></p>');
    var onApplied = typeof options.onApplied === 'function' ? options.onApplied : null;
    var afterLayout = typeof options.afterLayout === 'function' ? options.afterLayout : null;

    if(editor && editor.commands && typeof editor.commands.setContent === 'function'){
      editor.commands.setContent(html, false);
      if(runMutationEffects({
          target: editor && editor.view ? editor.view.dom : null,
          onApplied: onApplied,
          afterLayout: afterLayout,
          normalize: options.normalize !== false,
          layout: options.layout !== false,
          syncChrome: !!options.syncChrome,
          syncTOC: !!options.syncTOC,
          syncRefs: !!options.syncRefs,
          refreshTrigger: !!options.refreshTrigger
        })){
        return true;
      }
      setTimeout(function(){
        if(typeof options.normalizeCitationSpans === 'function') options.normalizeCitationSpans();
        if(typeof options.updatePageHeight === 'function') options.updatePageHeight();
        if(onApplied) onApplied();
        if(afterLayout) afterLayout();
      }, 0);
      return true;
    }

    setEditorHTML({
      documentApi: options.documentApi || null,
      editor: null,
      shell: options.shell || null,
      host: options.host || null,
      html: html
    });
    if(runMutationEffects({
        onApplied: onApplied,
        afterLayout: afterLayout,
        normalize: false,
        layout: options.layout !== false,
        syncChrome: !!options.syncChrome,
        syncTOC: !!options.syncTOC,
        syncRefs: !!options.syncRefs,
        refreshTrigger: !!options.refreshTrigger
      })){
      return true;
    }
    if(typeof options.updatePageHeight === 'function') options.updatePageHeight();
    if(onApplied) onApplied();
    if(afterLayout) afterLayout();
    return true;
  }

  function insertHTML(options){
    options = options || {};
    if(typeof window !== 'undefined' && window.AQTipTapWordDocument && typeof window.AQTipTapWordDocument.insertHTML === 'function'){
      return window.AQTipTapWordDocument.insertHTML(options);
    }
    return false;
  }

  function insertEditorHTML(options){
    options = options || {};
    var editor = options.editor || null;
    var host = options.host || null;
    var target = editor && editor.view ? editor.view.dom : host;
    var onAfterInsert = typeof options.onAfterInsert === 'function'
      ? options.onAfterInsert
      : function(nextTarget){
          return runMutationEffects({
            target: nextTarget || null,
            normalize: true,
            layout: true,
            syncChrome: true,
            syncTOC: true,
            syncRefs: true,
            refreshTrigger: false
          });
        };

    return insertHTML({
      editor: editor,
      html: options.html,
      host: host,
      savedRangeRef: options.savedRangeRef,
      beforeEditorInsert: function(){
        if(typeof options.ensureEditableRoot === 'function'){
          options.ensureEditableRoot();
        }
      },
      afterEditorInsert: function(){
        onAfterInsert(target || null);
      },
      afterDomInsert: function(nextHost){
        onAfterInsert(nextHost || host || null);
      }
    });
  }

  function insertEditorHTMLWithState(options){
    options = options || {};
    return insertEditorHTML({
      editor: options.editor || null,
      html: options.html,
      host: options.host || null,
      savedRangeRef: options.savedRangeRef || {
        get current(){
          return typeof options.getSavedRange === 'function' ? options.getSavedRange() : null;
        },
        set current(value){
          if(typeof options.setSavedRange === 'function') options.setSavedRange(value);
        }
      },
      ensureEditableRoot: options.ensureEditableRoot,
      onAfterInsert: options.onAfterInsert
    });
  }

  function insertEditorHTMLWithBridge(options){
    options = options || {};
    var bridgeApi = options.bridgeApi || getGlobalBridgeApi();
    var runtimeApi = options.runtimeApi || (typeof window !== 'undefined' ? window.AQEditorRuntime || null : null);
    var documentApi = options.documentApi || getGlobalDocumentApi();

    return insertEditorHTMLWithState({
      editor: options.editor || null,
      html: options.html,
      host: options.host || null,
      getSavedRange: options.getSavedRange,
      setSavedRange: options.setSavedRange,
      ensureEditableRoot: function(){
        if(bridgeApi && typeof bridgeApi.ensureEditableRoot === 'function'){
          if(bridgeApi.ensureEditableRoot({
            documentApi: documentApi,
            editor: options.editor || null,
            sanitizeHTML: options.sanitizeHTML || null
          })) return;
        }
        if(typeof options.ensureEditableRoot === 'function'){
          options.ensureEditableRoot();
        }
      },
      onAfterInsert: function(target){
        if(bridgeApi && typeof bridgeApi.runEditorMutationEffects === 'function'){
          bridgeApi.runEditorMutationEffects({
            contentApi: options.contentApi || null,
            runtimeApi: runtimeApi,
            target: target || null,
            normalize: true,
            layout: true,
            syncChrome: true,
            syncTOC: true,
            syncRefs: true,
            refreshTrigger: false
          });
          return;
        }
        if(typeof options.onAfterInsert === 'function'){
          options.onAfterInsert(target || null);
          return;
        }
        runMutationEffects({
          target: target || null,
          normalize: true,
          layout: true,
          syncChrome: true,
          syncTOC: true,
          syncRefs: true,
          refreshTrigger: false
        });
      }
    });
  }

  function insertGeneratedHTML(options){
    options = options || {};
    var html = String(options.html || '');
    if(!html) return false;
    return insertEditorHTMLWithState({
      editor: options.editor || null,
      html: html,
      host: options.host || null,
      getSavedRange: options.getSavedRange,
      setSavedRange: options.setSavedRange,
      ensureEditableRoot: options.ensureEditableRoot,
      onAfterInsert: options.onAfterInsert
    });
  }

  function buildFallbackBlockHTML(builderName, value){
    switch(String(builderName || '')){
      case 'buildAbstractHTML':
        return '<h1>Abstract</h1><p class="ni">Ozet metni (150-250 kelime).</p><p class="ni"><em>Keywords:</em> kelime1, kelime2</p><p><br></p>';
      case 'buildBlockquoteHTML':
        return '<blockquote>Alinti metni (40+ kelime). (Yazar, Yil, s. XX)</blockquote><p><br></p>';
      case 'buildFigureHTML': {
        var figureArgs = Array.isArray(value) ? value : [];
        var number = figureArgs[0] || '1';
        var title = figureArgs[1] || '';
        return '<p style="text-align:center;text-indent:0">[Şekil ' + number + ']</p><p style="text-align:center;text-indent:0;font-style:italic">Şekil ' + number + (title ? ' - ' + title : '') + '</p><p><br></p>';
      }
      case 'buildTableHTML': {
        var table = value || {};
        var cols = Math.max(1, parseInt(table.cols, 10) || 3);
        var rows = Math.max(2, parseInt(table.rows, 10) || 4);
        var header = '';
        var body = '';
        for(var c = 0; c < cols; c++) header += '<th>Baslik ' + (c + 1) + '</th>';
        for(var r = 0; r < rows - 1; r++){
          body += '<tr>';
          for(var i = 0; i < cols; i++) body += '<td>&nbsp;</td>';
          body += '</tr>';
        }
        var html = '<p class="ni"><strong>Tablo ' + String(table.number || '1') + '</strong></p>';
        if(table.title) html += '<p class="ni"><em>' + String(table.title) + '</em></p>';
        html += '<table><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table>';
        if(table.note) html += '<p class="ni"><em>Not.</em> ' + String(table.note) + '</p>';
        html += '<p><br></p>';
        return html;
      }
      default:
        return '';
    }
  }

  function resolveBuiltBlockHTML(options){
    options = options || {};
    var commandsApi = options.commandsApi || getGlobalCommandsApi();
    var html = '';
    if(commandsApi && typeof options.builderName === 'string' && typeof commandsApi[options.builderName] === 'function'){
      html = commandsApi[options.builderName](options.builderArgs || options.builderValue);
    }
    if(!html && typeof options.fallbackHTML === 'function'){
      html = options.fallbackHTML(options.builderArgs || options.builderValue);
    }
    if(!html){
      html = buildFallbackBlockHTML(options.builderName, options.builderArgs || options.builderValue);
    }
    return String(html || '');
  }

  function applyTemplate(options){
    options = options || {};
    var editor = options.editor || null;
    var html = String(options.html || '');
    if(!html) return false;
    if(typeof window !== 'undefined') window.suppressDocSave = true;
    if(editor && typeof editor.setEditable === 'function') editor.setEditable(true);
    return applyEditorHTML({
      editor: editor,
      html: html || '<p></p>',
      setCurrentEditorHTML: options.setCurrentEditorHTML,
      normalizeCitationSpans: options.normalizeCitationSpans,
      updatePageHeight: options.updatePageHeight,
      syncChrome: true,
      syncTOC: true,
      syncRefs: true,
      onApplied: function(){
        if(typeof window !== 'undefined') window.suppressDocSave = false;
        if(typeof options.ensureEditableRoot === 'function') options.ensureEditableRoot();
        if(!editor && typeof options.focusEditorSurface === 'function') options.focusEditorSurface(true);
        if(editor && editor.commands && typeof editor.commands.focus === 'function') editor.commands.focus('end');
      }
    });
  }

  function applyTemplateByType(options){
    options = options || {};
    var confirmFn = typeof options.confirmFn === 'function' ? options.confirmFn : null;
    var templatesApi = options.templatesApi || getGlobalTemplatesApi();
    if(confirmFn && !confirmFn(options.confirmMessage || 'Mevcut belge içeriği silinecek. Devam etmek istiyor musunuz?')){
      return false;
    }
    var html = templatesApi && typeof templatesApi.getTemplate === 'function'
      ? templatesApi.getTemplate(options.type)
      : '';
    if(!html) return false;
    return applyTemplate({
      editor: options.editor || null,
      html: html,
      setCurrentEditorHTML: options.setCurrentEditorHTML,
      ensureEditableRoot: options.ensureEditableRoot,
      normalizeCitationSpans: options.normalizeCitationSpans,
      updatePageHeight: options.updatePageHeight,
      focusEditorSurface: options.focusEditorSurface
    });
  }

  function applyTemplateByTypeWithBridge(options){
    options = options || {};
    var bridgeApi = options.bridgeApi || getGlobalBridgeApi();
    var documentApi = options.documentApi || getGlobalDocumentApi();
    return applyTemplateByType({
      type: options.type,
      confirmFn: options.confirmFn,
      templatesApi: options.templatesApi || getGlobalTemplatesApi(),
      editor: options.editor || null,
      ensureEditableRoot: function(){
        if(bridgeApi && typeof bridgeApi.ensureEditableRoot === 'function'){
          if(bridgeApi.ensureEditableRoot({
            documentApi: documentApi,
            editor: options.editor || null,
            sanitizeHTML: options.sanitizeHTML || null
          })) return;
        }
        if(typeof options.ensureEditableRoot === 'function'){
          options.ensureEditableRoot();
        }
      },
      focusEditorSurface: options.focusEditorSurface,
      normalizeCitationSpans: options.normalizeCitationSpans,
      updatePageHeight: options.updatePageHeight
    });
  }

  function insertCoverFromFields(options){
    options = options || {};
    var templatesApi = options.templatesApi || getGlobalTemplatesApi();
    var html = options.html || '';
    if(!html && templatesApi && typeof templatesApi.buildCoverHTML === 'function'){
      html = templatesApi.buildCoverHTML({
        title: options.title,
        author: options.author,
        institution: options.institution,
        course: options.course,
        professor: options.professor,
        dateText: options.dateText
      });
    }
    html = String(html || '');
    if(!html) return false;
    return insertCover({
      editor: options.editor || null,
      html: html,
      host: options.host || null
    });
  }

  function buildFallbackCoverHTML(title){
    return '<div style="text-align:center;padding-top:192px;font-family:Times New Roman,serif;font-size:12pt;line-height:2;"><p style="text-indent:0;font-weight:bold;">'
      + String(title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      + '</p></div><p><br></p>';
  }

  function insertCoverDocument(options){
    options = options || {};
    if(!String(options.title || '').trim()) return false;
    var templatesApi = options.templatesApi || getGlobalTemplatesApi();
    var html = options.html || '';
    if(!html && !(templatesApi && typeof templatesApi.buildCoverHTML === 'function')){
      html = buildFallbackCoverHTML(options.title);
    }
    return insertCoverFromFields({
      templatesApi: templatesApi,
      editor: options.editor || null,
      host: options.host || null,
      html: html,
      title: options.title,
      author: options.author,
      institution: options.institution,
      course: options.course,
      professor: options.professor,
      dateText: options.dateText
    });
  }

  function insertCoverFromForm(options){
    options = options || {};
    var documentObj = options.documentObj || (typeof document !== 'undefined' ? document : null);
    if(!documentObj || typeof documentObj.getElementById !== 'function') return false;

    var titleId = options.titleId || 'cvtitle';
    var fieldIds = options.fieldIds || {
      author: 'cvauthor',
      institution: 'cvinst',
      course: 'cvcourse',
      professor: 'cvprof'
    };
    var clearIds = options.clearIds || [
      titleId,
      fieldIds.author,
      fieldIds.institution,
      fieldIds.course,
      fieldIds.professor
    ];
    var titleEl = documentObj.getElementById(titleId);
    if(!titleEl) return false;

    var title = String(titleEl.value || '').trim();
    if(!title){
      if(typeof titleEl.focus === 'function') titleEl.focus();
      return false;
    }

    var dateText = typeof options.getDateText === 'function'
      ? options.getDateText()
      : String(options.dateText || '');

    if(typeof options.hideModal === 'function'){
      options.hideModal(options.modalId || 'covermodal');
    }

    var inserted = insertCoverDocument({
      templatesApi: options.templatesApi || getGlobalTemplatesApi(),
      editor: options.editor || null,
      host: options.host || null,
      title: title,
      author: String((documentObj.getElementById(fieldIds.author) || {}).value || '').trim(),
      institution: String((documentObj.getElementById(fieldIds.institution) || {}).value || '').trim(),
      course: String((documentObj.getElementById(fieldIds.course) || {}).value || '').trim(),
      professor: String((documentObj.getElementById(fieldIds.professor) || {}).value || '').trim(),
      dateText: dateText
    });

    if(inserted){
      clearIds.forEach(function(id){
        var el = documentObj.getElementById(id);
        if(el) el.value = '';
      });
    }
    return inserted;
  }

  function insertImageWithState(options){
    options = options || {};
    return insertImage({
      editor: options.editor || null,
      src: options.src,
      alt: options.alt,
      html: options.html,
      host: options.host || null,
      savedRangeRef: options.savedRangeRef || {
        get current(){
          return typeof options.getSavedRange === 'function' ? options.getSavedRange() : null;
        },
        set current(value){
          if(typeof options.setSavedRange === 'function') options.setSavedRange(value);
        }
      }
    });
  }

  function insertImageFile(options){
    options = options || {};
    var file = options.file || null;
    if(!file) return false;

    var readFileAsDataURL = typeof options.readFileAsDataURL === 'function'
      ? options.readFileAsDataURL
      : function(inputFile, onLoad){
          var reader = new FileReader();
          reader.onload = function(ev){
            onLoad(ev && ev.target ? ev.target.result : '');
          };
          reader.readAsDataURL(inputFile);
        };

    readFileAsDataURL(file, function(result){
      var documentApi = options.documentApi || getGlobalDocumentBuilderApi();
      var html = documentApi && typeof documentApi.buildImageHTML === 'function'
        ? documentApi.buildImageHTML(result, file.name)
        : '<div style="text-align:left;margin:12px 0;text-indent:0"><img src="' + result + '" style="max-width:100%;height:auto;border:1px solid var(--b);border-radius:4px;" alt="' + String(file.name || '') + '"/></div><p><br></p>';

      insertImageWithState({
        editor: options.editor || null,
        src: result,
        alt: file.name,
        html: html,
        host: options.host || null,
        getSavedRange: options.getSavedRange,
        setSavedRange: options.setSavedRange
      });

      if(typeof options.onComplete === 'function'){
        options.onComplete(result, html);
      }
    });

    return true;
  }

  function insertImageFromEvent(options){
    options = options || {};
    var event = options.event || null;
    var target = event && event.target ? event.target : null;
    var file = target && target.files ? target.files[0] : null;
    if(!file) return false;
    var handled = insertImageFile({
      file: file,
      editor: options.editor || null,
      host: options.host || null,
      getSavedRange: options.getSavedRange,
      setSavedRange: options.setSavedRange,
      readFileAsDataURL: options.readFileAsDataURL,
      documentApi: options.documentApi,
      onComplete: options.onComplete
    });
    if(handled && target) target.value = '';
    return handled;
  }

  function insertCover(options){
    options = options || {};
    var editor = options.editor || null;
    var html = String(options.html || '');
    if(!html) return false;
    if(editor && editor.commands && typeof editor.commands.insertContentAt === 'function'){
      editor.commands.insertContentAt(0, html);
    }else if(typeof options.host !== 'undefined' && options.host){
      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      while(tmp.lastChild) options.host.insertBefore(tmp.lastChild, options.host.firstChild);
    }else{
      return false;
    }
    if(runMutationEffects({
        layout: true,
        syncChrome: true,
        normalize: false,
        syncTOC: false,
        syncRefs: false,
        refreshTrigger: false
      })){
      return true;
    }
    if(typeof options.uSt === 'function') options.uSt();
    if(typeof options.save === 'function') options.save();
    if(typeof options.updatePageHeight === 'function') options.updatePageHeight();
    return true;
  }

  function insertImage(options){
    options = options || {};
    var editor = options.editor || null;
    if(editor && editor.chain && typeof editor.chain().focus === 'function'){
      editor.chain().focus().setImage({ src:options.src, alt:options.alt }).run();
      if(runMutationEffects({
          target: editor && editor.view ? editor.view.dom : null,
          layout: true,
          syncChrome: true,
          normalize: false,
          syncTOC: false,
          syncRefs: false,
          refreshTrigger: false
        })){
        return true;
      }
      if(typeof options.uSt === 'function') options.uSt();
      if(typeof options.save === 'function') options.save();
      if(typeof options.updatePageHeight === 'function') options.updatePageHeight();
      return true;
    }
    return insertHTML({
      editor: null,
      html: options.html,
      host: options.host,
      savedRangeRef: options.savedRangeRef,
      afterDomInsert: function(host){
        if(runMutationEffects({
          target: host || null,
          normalize: true,
          layout: true,
          syncChrome: true,
          syncTOC: false,
          syncRefs: false,
          refreshTrigger: false
        })) return;
        if(typeof options.normalizeCitationSpans === 'function') options.normalizeCitationSpans(host);
        if(typeof options.uSt === 'function') options.uSt();
        if(typeof options.save === 'function') options.save();
        if(typeof options.updatePageHeight === 'function') options.updatePageHeight();
      }
    });
  }

  function insertCommandBuiltBlock(options){
    options = options || {};
    var html = resolveBuiltBlockHTML(options);
    if(!html) return false;

    return insertGeneratedHTML({
      editor: options.editor || null,
      html: html,
      host: options.host || null,
      getSavedRange: options.getSavedRange,
      setSavedRange: options.setSavedRange,
      ensureEditableRoot: options.ensureEditableRoot,
      onAfterInsert: options.onAfterInsert
    });
  }

  function insertCommandBuiltBlockWithBridge(options){
    options = options || {};
    var html = resolveBuiltBlockHTML(options);
    if(!html) return false;
    return insertEditorHTMLWithBridge({
      editor: options.editor || null,
      html: html,
      host: options.host || null,
      bridgeApi: options.bridgeApi || getGlobalBridgeApi(),
      documentApi: options.documentApi || getGlobalDocumentApi(),
      runtimeApi: options.runtimeApi || (typeof window !== 'undefined' ? window.AQEditorRuntime || null : null),
      sanitizeHTML: options.sanitizeHTML || null,
      getSavedRange: options.getSavedRange,
      setSavedRange: options.setSavedRange,
      contentApi: options.contentApi || null
    });
  }

  return {
    getEditorHTML: getEditorHTML,
    setEditorHTML: setEditorHTML,
    runMutationEffects: runMutationEffects,
    applyEditorHTML: applyEditorHTML,
    insertHTML: insertHTML,
    insertEditorHTML: insertEditorHTML,
    insertEditorHTMLWithState: insertEditorHTMLWithState,
    insertEditorHTMLWithBridge: insertEditorHTMLWithBridge,
    insertGeneratedHTML: insertGeneratedHTML,
    buildFallbackBlockHTML: buildFallbackBlockHTML,
    resolveBuiltBlockHTML: resolveBuiltBlockHTML,
    applyTemplate: applyTemplate,
    applyTemplateByType: applyTemplateByType,
    applyTemplateByTypeWithBridge: applyTemplateByTypeWithBridge,
    buildFallbackCoverHTML: buildFallbackCoverHTML,
    insertCoverDocument: insertCoverDocument,
    insertCoverFromForm: insertCoverFromForm,
    insertCoverFromFields: insertCoverFromFields,
    insertCover: insertCover,
    insertImageFromEvent: insertImageFromEvent,
    insertImageFile: insertImageFile,
    insertImageWithState: insertImageWithState,
    insertImage: insertImage,
    insertCommandBuiltBlock: insertCommandBuiltBlock,
    insertCommandBuiltBlockWithBridge: insertCommandBuiltBlockWithBridge
  };
});
