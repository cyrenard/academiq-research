(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory(null);
    return;
  }
  root.AQTipTapShell = factory(root.document);
})(typeof window !== 'undefined' ? window : globalThis, function(boundDocument){
  var STYLE_ID = 'aq-tiptap-shell-style';
  var SHELL_ID = 'aq-tiptap-shell';
  var BODY_ID = 'aq-tiptap-body';
  var CONTENT_ID = 'aq-tiptap-content';

  function getDoc(){
    if(boundDocument) return boundDocument;
    if(typeof document !== 'undefined') return document;
    return null;
  }

  function normalizeHTML(html){
    var value = String(html || '').trim();
    return value || '<p></p>';
  }

  function buildShellMarkup(){
    return '<div id="' + SHELL_ID + '"><div id="' + BODY_ID + '"><div id="' + CONTENT_ID + '"></div></div></div>';
  }

  function injectStyles(doc){
    if(!doc || doc.getElementById(STYLE_ID)) return;
    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#aq-tiptap-shell{display:block;width:var(--aq-page-width,21cm);max-width:100%;min-height:var(--aq-page-height,29.7cm);padding:var(--aq-page-margin,2.54cm);box-sizing:border-box;position:relative;margin:0 auto;}',
      '#aq-tiptap-body{display:block;width:var(--aq-page-content-width,calc(21cm - (2.54cm * 2)));max-width:100%;min-height:var(--aq-page-content-height,calc(29.7cm - (2.54cm * 2)));margin:0 auto;position:relative;pointer-events:auto;}',
      '#aq-tiptap-content{display:block;width:100%;max-width:100%;min-height:var(--aq-page-content-height,calc(29.7cm - (2.54cm * 2)));position:relative;pointer-events:auto;cursor:text;}',
      '#aq-tiptap-content.ProseMirror,#aq-tiptap-content .ProseMirror{pointer-events:auto;display:block;width:100%;max-width:100%;min-height:var(--aq-page-content-height,calc(29.7cm - (2.54cm * 2)));cursor:text;}',
      '@media print{#aq-tiptap-shell{padding:0;min-height:auto;}#aq-tiptap-body,#aq-tiptap-content{min-height:auto;}}'
    ].join('');
    doc.head.appendChild(style);
  }

  function getHostEl(doc){
    return doc ? doc.getElementById('apaed') : null;
  }

  function queryHost(host, selector){
    if(!host || typeof host.querySelector !== 'function') return null;
    try{
      return host.querySelector(selector);
    }catch(e){
      return null;
    }
  }

  function getShellEl(doc){
    var host = getHostEl(doc);
    if(host){
      var scoped = queryHost(host, '#' + SHELL_ID);
      if(scoped) return scoped;
    }
    return doc ? doc.getElementById(SHELL_ID) : null;
  }

  function getBodyEl(doc){
    var shell = getShellEl(doc);
    if(shell && typeof shell.querySelector === 'function'){
      var body = shell.querySelector('#' + BODY_ID);
      if(body) return body;
    }
    var host = getHostEl(doc);
    if(host){
      var scoped = queryHost(host, '#' + BODY_ID);
      if(scoped) return scoped;
    }
    return doc ? doc.getElementById(BODY_ID) : null;
  }

  function getMountEl(doc){
    var body = getBodyEl(doc);
    if(body && typeof body.querySelector === 'function'){
      var mount = body.querySelector('#' + CONTENT_ID);
      if(mount) return mount;
    }
    var shell = getShellEl(doc);
    if(shell && typeof shell.querySelector === 'function'){
      var shellMount = shell.querySelector('#' + CONTENT_ID);
      if(shellMount) return shellMount;
    }
    var host = getHostEl(doc);
    if(host){
      var scoped = queryHost(host, '#' + CONTENT_ID);
      if(scoped) return scoped;
    }
    return doc ? doc.getElementById(CONTENT_ID) : null;
  }

  function getFocusableEl(doc){
    var mount = getMountEl(doc);
    if(!mount) return null;
    return mount.querySelector('.ProseMirror') || mount;
  }

  function getHTMLFromHost(host){
    if(!host) return '<p></p>';
    var mount = host.querySelector('#' + CONTENT_ID);
    if(mount) return normalizeHTML(mount.innerHTML);
    return normalizeHTML(host.innerHTML);
  }

  function hasCanonicalShell(host){
    if(!host) return false;
    if(!host.firstElementChild || host.firstElementChild.id !== SHELL_ID) return false;
    if(host.children && host.children.length !== 1) return false;
    var shell = host.firstElementChild;
    var body = shell && shell.querySelector ? shell.querySelector('#' + BODY_ID) : null;
    var mount = body && body.querySelector ? body.querySelector('#' + CONTENT_ID) : null;
    return !!(body && mount && mount.parentElement === body);
  }

  function init(){
    var doc = getDoc();
    var host = getHostEl(doc);
    if(!doc || !host) return null;
    injectStyles(doc);
    var existingHTML = getHTMLFromHost(host);
    if(!hasCanonicalShell(host)){
      host.innerHTML = buildShellMarkup();
    }
    var mount = getMountEl(doc);
    if(mount && !String(mount.innerHTML || '').trim()){
      mount.innerHTML = existingHTML;
    }
    return host;
  }

  function getHTML(){
    var doc = getDoc();
    var mount = getMountEl(doc);
    if(mount) return normalizeHTML(mount.innerHTML);
    return getHTMLFromHost(getHostEl(doc));
  }

  function setHTML(html){
    var doc = getDoc();
    init();
    var mount = getMountEl(doc);
    if(mount) mount.innerHTML = normalizeHTML(html);
    return normalizeHTML(html);
  }

  return {
    init: init,
    normalizeHTML: normalizeHTML,
    buildShellMarkup: buildShellMarkup,
    getHostEl: function(){ return getHostEl(getDoc()); },
    getShellEl: function(){ return getShellEl(getDoc()); },
    getBodyEl: function(){ return getBodyEl(getDoc()); },
    getMountEl: function(){ return getMountEl(getDoc()); },
    getFocusableEl: function(){ return getFocusableEl(getDoc()); },
    getHTML: getHTML,
    setHTML: setHTML
  };
});
