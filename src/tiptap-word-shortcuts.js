(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordShortcuts = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function run(fn){
    if(typeof fn === 'function') fn();
    return true;
  }

  function isEditorFocused(host, activeElement){
    return !!(host && activeElement && (activeElement === host || host.contains(activeElement)));
  }

  function handleEditorShortcut(event, deps){
    deps = deps || {};
    var e = event || {};
    var mod = !!(e.ctrlKey || e.metaKey);
    if(!mod) return false;
    var key = String(e.key || '');

    if(key === 'Enter'){
      return run(function(){ deps.execCommand('insertPageBreak'); });
    }
    if(key === 'a' || key === 'A'){
      return run(deps.selectAll);
    }
    if(key === 's' && !e.shiftKey){
      return run(deps.save);
    }
    if(key === 'S' && e.shiftKey){
      return run(deps.exportDoc);
    }
    if(key === 'p'){
      return run(deps.printDoc);
    }
    if(key === 'z' || key === 'Z'){
      if(e.shiftKey){
        return run(deps.redo || deps.undoRedoSync);
      }
      return run(deps.undo || deps.undoRedoSync);
    }
    if(key === 'y' || key === 'Y'){
      return run(deps.redo || deps.undoRedoSync);
    }
    if(key === '1') return run(function(){ deps.execCommand('formatBlock','h1'); });
    if(key === '2') return run(function(){ deps.execCommand('formatBlock','h2'); });
    if(key === '3') return run(function(){ deps.execCommand('formatBlock','h3'); });
    if(key === '4') return run(function(){ deps.execCommand('formatBlock','h4'); });
    if(key === '5') return run(function(){ deps.execCommand('formatBlock','h5'); });
    if(key === '0') return run(function(){ deps.execCommand('formatBlock','p'); });
    if(key === 'L' && e.shiftKey) return run(function(){ deps.execCommand('insertUnorderedList'); });
    if(key === 'N' && e.shiftKey) return run(function(){ deps.execCommand('insertOrderedList'); });
    if(key === 'e') return run(function(){ deps.execCommand('justifyCenter'); });
    if(key === 'l') return run(function(){ deps.execCommand('justifyLeft'); });
    if(key === 'r' && !e.shiftKey) return run(function(){ deps.execCommand('justifyRight'); });
    if(key === 'j') return run(function(){ deps.execCommand('justifyFull'); });
    if((key === '>' || key === '.') && e.shiftKey) return run(deps.increaseFontSize);
    if((key === '<' || key === ',') && e.shiftKey) return run(deps.decreaseFontSize);
    if(key === 'q') return run(deps.insertBlockquote);
    if(key === 'd') return run(function(){ deps.execCommand('strikeThrough'); });
    if(key === 'X' && e.shiftKey) return run(function(){ deps.execCommand('subscript'); });
    if(key === 'P' && e.shiftKey) return run(function(){ deps.execCommand('superscript'); });
    return false;
  }

  function handleEditorTabShortcut(event, deps){
    deps = deps || {};
    var e = event || {};
    if(String(e.key || '') !== 'Tab') return false;
    if(!deps.editorFocused) return false;
    if(!deps.inList) return false;
    if(e.ctrlKey || e.metaKey || e.altKey) return false;
    return run(e.shiftKey ? deps.outdent : deps.indent);
  }

  function handleGlobalShortcut(event, deps){
    deps = deps || {};
    var e = event || {};
    var mod = !!(e.ctrlKey || e.metaKey);
    var key = String(e.key || '');

    if(mod && key === 'h' && !e.shiftKey) return run(deps.toggleFindBar);
    if(mod && key === 'f' && !deps.pdfOpen) return run(deps.toggleFindBar);
    if(mod && (key === 'e' || key === 'E') && e.shiftKey) return run(deps.toggleTrackChanges);
    // Footnote shortcuts
    if(e.altKey && key === 'f' && !mod){ return run(function(){ if(window.AQFootnotes) window.AQFootnotes.insertFootnote('footnote'); }); }
    if(e.altKey && key === 'e' && !mod){ return run(function(){ if(window.AQFootnotes) window.AQFootnotes.insertFootnote('endnote'); }); }
    if(e.altKey && key === 'r' && !mod){ return run(function(){ if(window.AQFootnotes) window.AQFootnotes.showCrossRefDialog(); }); }
    if(key === 'F10') return run(deps.toggleZenMode);
    if(key === 'Escape' && deps.zenActive) return run(deps.toggleZenMode);
    if(mod && key === 's' && !e.shiftKey && !deps.editorFocused) return run(deps.save);
    if(mod && key === '=' && !deps.pdfOpen) return run(function(){ deps.editorZoom(10); });
    if(mod && key === '-' && !deps.pdfOpen) return run(function(){ deps.editorZoom(-10); });
    if(mod && key === '0' && !deps.pdfOpen) return run(deps.resetEditorZoom);
    return false;
  }

  function handlePdfShortcut(event, deps){
    deps = deps || {};
    var e = event || {};
    var mod = !!(e.ctrlKey || e.metaKey);
    var key = String(e.key || '');
    if(!deps.pdfOpen) return false;

    if(mod && key === 'f') return run(deps.focusPdfSearch);
    if(key === 'F11') return run(deps.togglePdfFullscreen);
    if(mod && key === 'g') return run(deps.goToPage);
    if(mod && key === '=') return run(deps.zoomInPdf);
    if(mod && key === '-') return run(deps.zoomOutPdf);
    if(mod && key === '0' && !deps.editorFocused) return run(deps.resetPdfZoom);

    if(deps.inInput) return false;

    if(key === 'PageUp') return run(deps.prevPdfPage);
    if(key === 'PageDown') return run(deps.nextPdfPage);
    if(key === 'ArrowUp') return run(deps.scrollPdfUp);
    if(key === 'ArrowDown') return run(deps.scrollPdfDown);
    if(key === 'Home') return run(deps.firstPdfPage);
    if(key === 'End') return run(deps.lastPdfPage);
    return false;
  }

  function handleDocumentShortcut(event, deps){
    deps = deps || {};
    if(handleGlobalShortcut(event, deps)) return true;
    if(deps.editorFocused && handleEditorShortcut(event, deps)) return true;
    if(handleEditorTabShortcut(event, deps)) return true;
    if(handlePdfShortcut(event, deps)) return true;
    if(deps.inInput) return true;
    return false;
  }

  function resolveDocumentShortcutState(event, options){
    options = options || {};
    var e = event || {};
    var target = options.target || e.target || null;
    var doc = options.doc || null;
    var pdfPanel = options.pdfPanel || (doc && typeof doc.getElementById === 'function' ? doc.getElementById('pdfpanel') : null);
    var host = options.host || (doc && typeof doc.getElementById === 'function' ? doc.getElementById('apaed') : null);
    var activeElement = options.activeElement || (doc ? doc.activeElement : null);
    var chromeApi = options.chromeApi || null;
    return {
      pdfOpen: !!(pdfPanel && pdfPanel.classList && pdfPanel.classList.contains('open')),
      inInput: !!(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)),
      editorFocused: isEditorFocused(host, activeElement),
      inList: typeof options.isInList === 'function' ? !!options.isInList() : false,
      zenActive: typeof options.getZenActive === 'function'
        ? !!options.getZenActive()
        : !!(chromeApi && typeof chromeApi.isZenActive === 'function' && chromeApi.isZenActive())
    };
  }

  function handleAppDocumentShortcut(event, options){
    options = options || {};
    var state = resolveDocumentShortcutState(event, options);
    var deps = Object.assign({}, options.actions || {}, state);
    return handleDocumentShortcut(event, deps);
  }

  return {
    isEditorFocused:isEditorFocused,
    handleEditorShortcut:handleEditorShortcut,
    handleEditorTabShortcut:handleEditorTabShortcut,
    handleGlobalShortcut:handleGlobalShortcut,
    handlePdfShortcut:handlePdfShortcut,
    handleDocumentShortcut:handleDocumentShortcut,
    resolveDocumentShortcutState:resolveDocumentShortcutState,
    handleAppDocumentShortcut:handleAppDocumentShortcut
  };
});
