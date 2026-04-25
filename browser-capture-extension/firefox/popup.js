(function(){
  var config = globalThis.AQ_CAPTURE_CONFIG || {};
  var ext = (typeof browser !== 'undefined') ? browser : chrome;
  var state = {
    detection: null,
    targets: null,
    bridgeOk: false,
    lookup: null,
    queueState: null
  };
  var STORAGE_KEYS = {
    workspace: 'aqLastWorkspaceId',
    comparison: 'aqLastComparisonId',
    cachedTargets: 'aqCachedTargets'
  };

  function $(id){ return document.getElementById(id); }
  function utils(){ return globalThis.AQBrowserCaptureUtils || null; }
  function asArray(value){ return Array.isArray(value) ? value : []; }
  function callMaybePromise(invoke){
    try{
      var result = invoke();
      if(result && typeof result.then === 'function') return result;
    }catch(_e){}
    return null;
  }
  function queryTabs(queryInfo){
    var promise = callMaybePromise(function(){ return ext.tabs.query(queryInfo); });
    if(promise) return promise;
    return new Promise(function(resolve, reject){
      try{
        ext.tabs.query(queryInfo, function(tabs){
          var err = ext.runtime && ext.runtime.lastError ? ext.runtime.lastError : null;
          if(err){ reject(new Error(err.message || 'tabs.query failed')); return; }
          resolve(tabs || []);
        });
      }catch(error){ reject(error); }
    });
  }
  function sendTabMessage(tabId, payload){
    var promise = callMaybePromise(function(){ return ext.tabs.sendMessage(tabId, payload); });
    if(promise) return promise;
    return new Promise(function(resolve, reject){
      try{
        ext.tabs.sendMessage(tabId, payload, function(response){
          var err = ext.runtime && ext.runtime.lastError ? ext.runtime.lastError : null;
          if(err){ reject(new Error(err.message || 'tabs.sendMessage failed')); return; }
          resolve(response);
        });
      }catch(error){ reject(error); }
    });
  }
  function createTab(url){
    var promise = callMaybePromise(function(){ return ext.tabs.create({ url: url }); });
    if(promise) return promise;
    return new Promise(function(resolve, reject){
      try{
        ext.tabs.create({ url: url }, function(tab){
          var err = ext.runtime && ext.runtime.lastError ? ext.runtime.lastError : null;
          if(err){ reject(new Error(err.message || 'tabs.create failed')); return; }
          resolve(tab || null);
        });
      }catch(error){ reject(error); }
    });
  }
  function runtimeSendMessage(message){
    var promise = callMaybePromise(function(){ return ext.runtime.sendMessage(message); });
    if(promise) return promise;
    return new Promise(function(resolve, reject){
      try{
        ext.runtime.sendMessage(message, function(response){
          var err = ext.runtime && ext.runtime.lastError ? ext.runtime.lastError : null;
          if(err){ reject(new Error(err.message || 'runtime.sendMessage failed')); return; }
          resolve(response || null);
        });
      }catch(error){ reject(error); }
    });
  }
  function storageGet(keys){
    var promise = callMaybePromise(function(){ return ext.storage.local.get(keys); });
    if(promise) return promise;
    return new Promise(function(resolve){
      try{
        ext.storage.local.get(keys, function(items){ resolve(items || {}); });
      }catch(_e){ resolve({}); }
    });
  }
  function storageSet(values){
    var promise = callMaybePromise(function(){ return ext.storage.local.set(values); });
    if(promise) return promise.catch(function(){});
    return new Promise(function(resolve){
      try{ ext.storage.local.set(values, function(){ resolve(); }); }catch(_e){ resolve(); }
    });
  }
  function setText(id, value){
    var el = $(id);
    if(el) el.textContent = value || '';
  }
  function setClass(id, className){
    var el = $(id);
    if(el) el.className = className || '';
  }

  function clearSelect(selectEl){
    if(selectEl) selectEl.innerHTML = '';
  }

  function appendOption(selectEl, value, label){
    if(!selectEl) return null;
    var opt = document.createElement('option');
    opt.value = value == null ? '' : String(value);
    opt.textContent = label || '';
    selectEl.appendChild(opt);
    return opt;
  }

  function hasOption(selectEl, value){
    if(!selectEl) return false;
    return Array.prototype.some.call(selectEl.options, function(opt){
      return String(opt.value || '') === String(value == null ? '' : value);
    });
  }

  function ensureWorkspaceFallbackOption(){
    var workspaceSel = $('workspaceSel');
    if(!workspaceSel || workspaceSel.options.length) return;
    appendOption(workspaceSel, '', 'Son aktif workspace (uygulama acilinca secilecek)');
  }

  function ensureComparisonFallbackOption(){
    var comparisonSel = $('comparisonSel');
    if(!comparisonSel || comparisonSel.options.length) return;
    appendOption(comparisonSel, '', 'Yok');
  }

  function setStatus(message, tone){
    var el = $('captureStatus');
    if(!el) return;
    el.textContent = message || '';
    el.style.color = tone === 'error' ? '#b54949' : (tone === 'ok' ? '#2f6d46' : '#526673');
  }

  function setLookupStatus(message, tone){
    var el = $('lookupStatus');
    if(!el) return;
    el.textContent = message || '';
    el.style.color = tone === 'error' ? '#b54949' : (tone === 'ok' ? '#2f6d46' : '#526673');
  }

  function browserSource(){
    return String(config.browserLabel || config.browserFamily || 'Browser');
  }

  function detectionEntry(name){
    var meta = state.detection && state.detection.detectionMeta && state.detection.detectionMeta[name];
    return meta && typeof meta === 'object'
      ? meta
      : { value: '', source: 'none', confidence: 'none', found: false };
  }

  function summaryText(value, fallback){
    var text = String(value || '').trim();
    return text || fallback || 'Algilanamadi';
  }

  function evidenceText(name, fallback){
    var api = utils();
    var entry = detectionEntry(name);
    if(api && typeof api.describeDetection === 'function'){
      return api.describeDetection(entry, fallback || 'Bulunamadi');
    }
    if(entry && entry.found){
      return String(entry.source || 'Algilandi');
    }
    return fallback || 'Bulunamadi';
  }

  function badgeTone(entry){
    if(!entry || !entry.found) return 'warn';
    if(entry.confidence === 'weak') return 'weak';
    if(entry.confidence === 'strong' || entry.confidence === 'medium') return 'ok';
    return 'muted';
  }

  function fieldValue(id, maxLen){
    var el = $(id);
    if(!el) return '';
    var value = String(el.value || '').trim();
    if(typeof maxLen === 'number' && maxLen > 0 && value.length > maxLen){
      value = value.slice(0, maxLen);
    }
    return value;
  }

  function setFieldValue(id, value){
    var el = $(id);
    if(!el) return;
    el.value = value == null ? '' : String(value);
  }

  function normalizeYear(value){
    var match = String(value || '').match(/\b(19|20)\d{2}\b/);
    return match && match[0] ? match[0] : '';
  }

  function normalizeReferenceType(value){
    var raw = String(value || '').trim().toLowerCase();
    if(raw === 'book' || raw === 'website' || raw === 'article') return raw;
    return 'article';
  }

  function applyReferenceTypeUI(value){
    var type = normalizeReferenceType(value);
    document.body.classList.remove('ref-type-article', 'ref-type-book', 'ref-type-website');
    document.body.classList.add('ref-type-' + type);
    var typeEl = $('editReferenceType');
    if(typeEl && typeEl.value !== type){
      typeEl.value = type;
    }
    if(type === 'website'){
      var accessed = $('editAccessedDate');
      if(accessed && !String(accessed.value || '').trim()){
        accessed.value = new Date().toISOString().slice(0, 10);
      }
    }
    return type;
  }

  function normalizeAuthorsInput(value){
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    if(!text) return [];
    var parts = text.split(/;|\u2022|\||\n|\t|(?:\s+and\s+)|(?:\s*&\s*)/i);
    if(parts.length <= 1) parts = [text];
    var seen = {};
    var out = [];
    parts.forEach(function(part){
      var cleaned = String(part || '')
        .replace(/^(?:by|authors?|yazar(?:lar)?)\s*(?:[:\-]\s*)?/i, '')
        .replace(/[,*;|]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if(!cleaned) return;
      var key = cleaned.toLowerCase();
      if(seen[key]) return;
      seen[key] = true;
      out.push(cleaned);
    });
    return out.slice(0, 12);
  }

  function captureDefaultsFromDetection(){
    var detection = state.detection || {};
    var inferredType = normalizeReferenceType(detection.referenceType || detection.detectedReferenceType);
    if(inferredType === 'article' && !detection.doi && !detection.detectedJournal){
      inferredType = 'website';
    }
    return {
      referenceType: inferredType,
      sourcePageUrl: detection.sourcePageUrl || '',
      detectedTitle: detection.detectedTitle || detection.pageTitle || '',
      detectedAuthors: Array.isArray(detection.detectedAuthors) ? detection.detectedAuthors.slice(0, 12) : [],
      detectedJournal: detection.detectedJournal || '',
      detectedPublisher: detection.detectedPublisher || '',
      detectedWebsiteName: detection.detectedWebsiteName || '',
      detectedEdition: detection.detectedEdition || '',
      detectedPublishedDate: detection.detectedPublishedDate || '',
      detectedAccessedDate: detection.detectedAccessedDate || '',
      detectedYear: detection.detectedYear || '',
      detectedAbstract: detection.detectedAbstract || '',
      doi: detection.doi || '',
      pdfUrl: detection.pdfUrl || ''
    };
  }

  function populateEditableFields(){
    var defaults = captureDefaultsFromDetection();
    setFieldValue('editReferenceType', defaults.referenceType || 'article');
    setFieldValue('editSourceUrl', defaults.sourcePageUrl);
    setFieldValue('editTitle', defaults.detectedTitle);
    setFieldValue('editAuthors', defaults.detectedAuthors.join('; '));
    setFieldValue('editJournal', defaults.detectedJournal);
    setFieldValue('editPublisher', defaults.detectedPublisher);
    setFieldValue('editWebsiteName', defaults.detectedWebsiteName);
    setFieldValue('editEdition', defaults.detectedEdition);
    setFieldValue('editPublishedDate', defaults.detectedPublishedDate);
    setFieldValue('editAccessedDate', defaults.detectedAccessedDate);
    setFieldValue('editYear', defaults.detectedYear);
    setFieldValue('editDoi', defaults.doi);
    setFieldValue('editPdfUrl', defaults.pdfUrl);
    setFieldValue('editAbstract', defaults.detectedAbstract);
    applyReferenceTypeUI(defaults.referenceType || 'article');
  }

  function captureFromEditorFields(){
    var api = utils();
    var defaults = captureDefaultsFromDetection();
    var referenceType = normalizeReferenceType(fieldValue('editReferenceType', 32));
    var rawDoi = fieldValue('editDoi', 512);
    var normalizedDoi = api && typeof api.normalizeDoi === 'function'
      ? api.normalizeDoi(rawDoi)
      : rawDoi;
    var rawPdfUrl = fieldValue('editPdfUrl', 4096);
    var normalizedPdfUrl = api && typeof api.normalizeUrl === 'function'
      ? api.normalizeUrl(rawPdfUrl)
      : rawPdfUrl;
    var rawSourceUrl = fieldValue('editSourceUrl', 4096);
    var normalizedSourceUrl = api && typeof api.normalizeUrl === 'function'
      ? api.normalizeUrl(rawSourceUrl)
      : rawSourceUrl;
    var authors = normalizeAuthorsInput(fieldValue('editAuthors', 4096));
    return {
      referenceType: referenceType,
      sourcePageUrl: normalizedSourceUrl || defaults.sourcePageUrl || '',
      detectedTitle: fieldValue('editTitle', 2048),
      detectedAuthors: authors,
      detectedJournal: fieldValue('editJournal', 1024),
      detectedPublisher: fieldValue('editPublisher', 1024),
      detectedWebsiteName: fieldValue('editWebsiteName', 1024),
      detectedEdition: fieldValue('editEdition', 128),
      detectedPublishedDate: fieldValue('editPublishedDate', 64),
      detectedAccessedDate: fieldValue('editAccessedDate', 64),
      detectedYear: normalizeYear(fieldValue('editYear', 16)),
      detectedAbstract: fieldValue('editAbstract', 12000),
      doi: normalizedDoi || '',
      pdfUrl: normalizedPdfUrl || '',
      // Keep raw input to avoid empty-state regressions when popup markup lags.
      _hasEditorFields: !!($('editTitle') || $('editAuthors') || $('editJournal') || $('editPublisher') || $('editWebsiteName') || $('editSourceUrl') || $('editDoi') || $('editPdfUrl') || $('editAbstract')),
      _defaults: defaults
    };
  }

  function activeCaptureData(){
    var edited = captureFromEditorFields();
    if(!edited._hasEditorFields) return edited._defaults;
    return {
      referenceType: edited.referenceType,
      sourcePageUrl: edited.sourcePageUrl,
      detectedTitle: edited.detectedTitle,
      detectedAuthors: edited.detectedAuthors,
      detectedJournal: edited.detectedJournal,
      detectedPublisher: edited.detectedPublisher,
      detectedWebsiteName: edited.detectedWebsiteName,
      detectedEdition: edited.detectedEdition,
      detectedPublishedDate: edited.detectedPublishedDate,
      detectedAccessedDate: edited.detectedAccessedDate,
      detectedYear: edited.detectedYear,
      detectedAbstract: edited.detectedAbstract,
      doi: edited.doi,
      pdfUrl: edited.pdfUrl
    };
  }

  function renderCitationSummaryFromForm(){
    var active = activeCaptureData();
    var activeType = applyReferenceTypeUI(active.referenceType || 'article');
    var journalLabelEl = $('journalSummaryLabel');
    if(journalLabelEl){
      journalLabelEl.textContent = activeType === 'book' ? 'Yayinevi' : (activeType === 'website' ? 'Site' : 'Dergi');
    }
    setText('detectedTitle', active.detectedTitle || (state.detection && state.detection.pageTitle) || 'Baslik algilanamadi');
    setText('authorSummary', summaryText((Array.isArray(active.detectedAuthors) ? active.detectedAuthors.join('; ') : ''), 'Algilanamadi'));
    if(activeType === 'book'){
      setText('journalSummary', summaryText(active.detectedPublisher, 'Algilanamadi'));
    }else if(activeType === 'website'){
      setText('journalSummary', summaryText(active.detectedWebsiteName, 'Algilanamadi'));
    }else{
      setText('journalSummary', summaryText(active.detectedJournal, 'Algilanamadi'));
    }
    setText('yearSummary', summaryText(active.detectedYear, 'Algilanamadi'));
  }

  var lookupDebounceTimer = null;
  function scheduleLookupRefresh(){
    if(lookupDebounceTimer){
      clearTimeout(lookupDebounceTimer);
      lookupDebounceTimer = null;
    }
    lookupDebounceTimer = setTimeout(function(){
      lookupDebounceTimer = null;
      renderCitationSummaryFromForm();
      updateLookup();
    }, 220);
  }

  async function getActiveTab(){
    var tabs = await queryTabs({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  }

  function buildPdfPageDetection(tab){
    var api = utils();
    var doi = api && typeof api.findDoiInText === 'function' ? api.findDoiInText(tab.url || '') : '';
    return {
      referenceType: 'article',
      sourcePageUrl: tab.url || '',
      pageTitle: tab.title || '',
      doi: doi,
      pdfUrl: tab.url || '',
      detectedTitle: tab.title || 'PDF',
      detectedAuthors: [],
      detectedJournal: '',
      detectedPublisher: '',
      detectedWebsiteName: '',
      detectedEdition: '',
      detectedPublishedDate: '',
      detectedAccessedDate: '',
      detectedYear: '',
      detectedAbstract: '',
      detectionMeta: {
        doi: { value: doi, source: doi ? 'page_url' : 'none', confidence: doi ? 'medium' : 'none', found: !!doi },
        pdfUrl: { value: tab.url || '', source: 'pdf_page', confidence: 'strong', found: !!(tab.url || '') },
        title: { value: tab.title || 'PDF', source: 'document_title', confidence: 'medium', found: !!(tab.title || 'PDF') },
        authors: { value: '', source: 'none', confidence: 'none', found: false },
        journal: { value: '', source: 'none', confidence: 'none', found: false },
        year: { value: '', source: 'none', confidence: 'none', found: false },
        abstract: { value: '', source: 'none', confidence: 'none', found: false }
      }
    };
  }

  async function detectFromTab(){
    var tab = await getActiveTab();
    if(!tab) return null;
    if(/\.pdf(?:$|[?#])/i.test(String(tab.url || ''))){
      return buildPdfPageDetection(tab);
    }
    try{
      var response = await sendTabMessage(tab.id, { type: 'AQ_DETECT_CAPTURE' });
      if(response && response.ok && response.payload) return response.payload;
    }catch(_e){}
    return {
      referenceType: 'article',
      sourcePageUrl: tab.url || '',
      pageTitle: tab.title || '',
      doi: '',
      pdfUrl: '',
      detectedTitle: tab.title || '',
      detectedAuthors: [],
      detectedJournal: '',
      detectedPublisher: '',
      detectedWebsiteName: '',
      detectedEdition: '',
      detectedPublishedDate: '',
      detectedAccessedDate: '',
      detectedYear: '',
      detectedAbstract: '',
      detectionMeta: {
        doi: { value: '', source: 'none', confidence: 'none', found: false },
        pdfUrl: { value: '', source: 'none', confidence: 'none', found: false },
        title: { value: tab.title || '', source: tab.title ? 'document_title' : 'none', confidence: tab.title ? 'weak' : 'none', found: !!tab.title },
        authors: { value: '', source: 'none', confidence: 'none', found: false },
        journal: { value: '', source: 'none', confidence: 'none', found: false },
        year: { value: '', source: 'none', confidence: 'none', found: false },
        abstract: { value: '', source: 'none', confidence: 'none', found: false }
      }
    };
  }

  function bridgeUrl(path){
    var base = String(config.bridgeBaseUrl || ('http://127.0.0.1:' + (config.port || 27183)));
    var rawPath = String(path || '/');
    var sep = rawPath.indexOf('?') >= 0 ? '&' : '?';
    return base + rawPath + sep + 'token=' + encodeURIComponent(String(config.token || ''));
  }

  function wait(ms){
    return new Promise(function(resolve){
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  async function bridgeFetch(path, options){
    var opts = Object.assign({}, options || {});
    opts.headers = Object.assign({}, opts.headers || {});
    if(opts.body && !opts.headers['Content-Type']){
      opts.headers['Content-Type'] = 'text/plain;charset=UTF-8';
    }
    var res = await fetch(bridgeUrl(path), opts);
    if(!res.ok) throw new Error('Bridge hatasi (' + res.status + ')');
    return res.json();
  }

  async function waitForBridgeReady(timeoutMs){
    var startedAt = Date.now();
    var maxWait = Math.max(1500, Number(timeoutMs) || 8000);
    var lastError = null;
    while((Date.now() - startedAt) < maxWait){
      try{
        var info = await bridgeFetch('/status');
        if(info && info.ok){
          state.bridgeOk = true;
          return info;
        }
      }catch(error){
        lastError = error;
      }
      await wait(500);
    }
    throw lastError || new Error('Bridge hazir degil');
  }

  async function sendHello(reason){
    try{
      return await bridgeFetch('/hello', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          extensionVersion: chrome && chrome.runtime && chrome.runtime.getManifest ? String((chrome.runtime.getManifest() || {}).version || '') : '',
          protocolVersion: 1,
          browserFamily: String(config.browserFamily || ''),
          browserName: String(config.browserLabel || ''),
          reason: String(reason || ''),
          timestamp: Date.now()
        })
      });
    }catch(_e){
      return null;
    }
  }

  async function loadTargets(){
    try{
      var data = await bridgeFetch('/targets');
      state.targets = data || null;
      state.bridgeOk = true;
      await persistCachedTargets(state.targets);
      return data;
    }catch(error){
      try{
        var viaRuntime = await runtimeSendMessage({ type: 'AQ_GET_TARGETS' });
        if(viaRuntime && viaRuntime.ok && viaRuntime.targets){
          state.targets = viaRuntime.targets || null;
          state.bridgeOk = !!viaRuntime.live;
          await persistCachedTargets(state.targets);
          return state.targets;
        }
      }catch(_runtimeError){}
      state.targets = null;
      state.bridgeOk = false;
      throw error;
    }
  }

  async function getOfflineQueueState(){
    try{
      return await runtimeSendMessage({ type: 'AQ_GET_QUEUE_STATE' });
    }catch(_e){
      return { ok: false, pendingCount: 0, pendingWorkspaces: [] };
    }
  }

  async function queueCaptureOffline(payload){
    return runtimeSendMessage({ type: 'AQ_QUEUE_CAPTURE', payload: payload });
  }

  async function queueWorkspaceOffline(name){
    return runtimeSendMessage({ type: 'AQ_QUEUE_WORKSPACE', name: name });
  }

  function loadRememberedSelection(){
    return storageGet([STORAGE_KEYS.workspace, STORAGE_KEYS.comparison]);
  }

  function persistSelection(){
    storageSet({
      aqLastWorkspaceId: $('workspaceSel') ? $('workspaceSel').value : '',
      aqLastComparisonId: $('comparisonSel') ? $('comparisonSel').value : ''
    });
  }

  async function persistCachedTargets(targets){
    if(!targets || !Array.isArray(targets.workspaces)) return;
    var payload = {};
    payload[STORAGE_KEYS.cachedTargets] = targets;
    await storageSet(payload);
  }

  async function loadCachedTargets(){
    var items = await storageGet([STORAGE_KEYS.cachedTargets]);
    var cached = items && items[STORAGE_KEYS.cachedTargets];
    if(cached && Array.isArray(cached.workspaces) && cached.workspaces.length){
      return cached;
    }
    return null;
  }

  function applyPendingWorkspaces(items){
    var workspaceSel = $('workspaceSel');
    if(!workspaceSel) return;
    asArray(items).forEach(function(item){
      if(!item || !item.id) return;
      var exists = hasOption(workspaceSel, item.id || '');
      if(exists) return;
      appendOption(workspaceSel, item.id || '', (item.name || 'Yeni Workspace') + ' (bekliyor)');
    });
  }

  async function createWorkspaceFromPopup(){
    var input = $('workspaceCreateInput');
    var name = input ? String(input.value || '').trim() : '';
    if(!name){
      setStatus('Yeni workspace adı gerekli.', 'error');
      return;
    }
    setStatus('Yeni workspace oluşturuluyor...', '');
    try{
      var result = state.bridgeOk
        ? await bridgeFetch('/workspace', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify({ name: name })
          })
        : await queueWorkspaceOffline(name);
      if(!(result && result.ok)){
        setStatus((result && result.error) || 'Workspace oluşturulamadı.', 'error');
        return;
      }
      if(result.targets){
        state.targets = result.targets || state.targets;
        await fillTargets(state.targets);
      }
      applyPendingWorkspaces([result.workspace]);
      if(result.workspace && result.workspace.id && $('workspaceSel')){
        $('workspaceSel').value = result.workspace.id;
        renderComparisons('');
        persistSelection();
      }
      if(input) input.value = '';
      setStatus(result.message || 'Yeni workspace oluşturuldu.', 'ok');
      updateLookup();
    }catch(error){
      setStatus(error && error.message ? error.message : 'Workspace oluşturulamadı.', 'error');
    }
  }

  async function fillTargets(data){
    var workspaceSel = $('workspaceSel');
    if(!workspaceSel) return;
    var workspaces = (data && Array.isArray(data.workspaces)) ? data.workspaces : [];
    clearSelect(workspaceSel);
    workspaces.forEach(function(ws){
      appendOption(workspaceSel, ws.id || '', ws.name || 'Calisma Alani');
    });
    if(state.queueState && state.queueState.pendingWorkspaces){
      applyPendingWorkspaces(state.queueState.pendingWorkspaces);
    }
    ensureWorkspaceFallbackOption();
    var remembered = await loadRememberedSelection();
    var preferredWorkspace = (remembered && remembered[STORAGE_KEYS.workspace]) || (data && data.preferredWorkspaceId) || (data && data.activeWorkspaceId) || (workspaces[0] && workspaces[0].id) || '';
    if(preferredWorkspace && hasOption(workspaceSel, preferredWorkspace)) workspaceSel.value = preferredWorkspace;
    renderComparisons((remembered && remembered[STORAGE_KEYS.comparison]) || (data && data.preferredComparisonId) || '');
  }

  function renderComparisons(preferredComparisonId){
    var comparisonSel = $('comparisonSel');
    var workspaceSel = $('workspaceSel');
    if(!comparisonSel || !workspaceSel) return;
    var workspaces = (state.targets && Array.isArray(state.targets.workspaces)) ? state.targets.workspaces : [];
    var selectedWs = workspaces.find(function(ws){ return String(ws.id || '') === String(workspaceSel.value || ''); }) || workspaces[0] || null;
    var comparisons = selectedWs && Array.isArray(selectedWs.comparisons) && selectedWs.comparisons.length ? selectedWs.comparisons : [{ id: '', name: 'Yok' }];
    clearSelect(comparisonSel);
    comparisons.forEach(function(item){
      appendOption(comparisonSel, item.id || '', item.name || 'Yok');
    });
    ensureComparisonFallbackOption();
    if(preferredComparisonId && hasOption(comparisonSel, preferredComparisonId)){
      comparisonSel.value = preferredComparisonId;
    }
  }

  function renderDetection(){
    var data = state.detection || {};
    var doiInfo = detectionEntry('doi');
    var pdfInfo = detectionEntry('pdfUrl');
    populateEditableFields();
    renderCitationSummaryFromForm();
    setText('doiBadge', doiInfo.found ? ('DOI tespit edildi: ' + data.doi) : 'DOI tespit edilemedi');
    setClass('doiBadge', 'badge ' + badgeTone(doiInfo));
    setText('pdfBadge', pdfInfo.found ? 'PDF baglantisi tespit edildi' : 'PDF baglantisi tespit edilemedi');
    setClass('pdfBadge', 'badge ' + badgeTone(pdfInfo));
    setText('doiEvidence', evidenceText('doi', 'Bulunamadi'));
    setText('pdfEvidence', evidenceText('pdfUrl', 'Bulunamadi'));
    setText('titleEvidence', evidenceText('title', 'Bulunamadi'));
    setText('captureUrl', data.sourcePageUrl || '');
  }

  async function refreshDetection(){
    setStatus('Sayfa bilgisi algilaniyor...', '');
    state.detection = await detectFromTab();
    renderDetection();
    await updateLookup();
    var doiInfo = detectionEntry('doi');
    var pdfInfo = detectionEntry('pdfUrl');
    if((doiInfo.confidence === 'weak' && doiInfo.found) || (pdfInfo.confidence === 'weak' && pdfInfo.found)){
      setStatus('Bazi alanlar zayif kanitla bulundu. Eklenmeden once kontrol edin.', '');
      return;
    }
    if(state.bridgeOk){
      setStatus('Hazir.', 'ok');
      return;
    }
    var queueInfo = await getOfflineQueueState();
    state.queueState = queueInfo || null;
    setStatus(queueInfo && queueInfo.pendingCount
      ? ('AcademiQ kapali. ' + queueInfo.pendingCount + ' bekleyen islem otomatik senkronize edilecek.')
      : 'AcademiQ kapali. Workspace listesi gelmese de ekleme yapabilirsiniz; kayitlar kuyrukta tutulacak.', '');
  }

  function buildPayload(){
    var detection = state.detection || {};
    var active = activeCaptureData();
    return {
      referenceType: normalizeReferenceType(active.referenceType || detection.referenceType || detection.detectedReferenceType || 'article'),
      sourcePageUrl: active.sourcePageUrl || detection.sourcePageUrl || '',
      pageTitle: detection.pageTitle || '',
      doi: active.doi || '',
      pdfUrl: active.pdfUrl || '',
      detectedTitle: active.detectedTitle || detection.detectedTitle || detection.pageTitle || '',
      detectedAuthors: Array.isArray(active.detectedAuthors) ? active.detectedAuthors : [],
      detectedJournal: active.detectedJournal || '',
      detectedPublisher: active.detectedPublisher || '',
      detectedWebsiteName: active.detectedWebsiteName || '',
      detectedEdition: active.detectedEdition || '',
      detectedPublishedDate: active.detectedPublishedDate || '',
      detectedAccessedDate: active.detectedAccessedDate || '',
      detectedYear: active.detectedYear || '',
      detectedAbstract: active.detectedAbstract || '',
      detectionMeta: detection.detectionMeta || {},
      selectedWorkspaceId: $('workspaceSel') ? $('workspaceSel').value : '',
      selectedComparisonId: $('comparisonSel') ? $('comparisonSel').value : '',
      browserSource: browserSource(),
      timestamp: Date.now()
    };
  }

  async function sendCapture(){
    var payload = buildPayload();
    if(!payload.detectedTitle && !payload.doi){
      setStatus('En azindan baslik veya DOI algilanmali.', 'error');
      return;
    }
    setStatus('AcademiQ\'a gonderiliyor...', '');
    try{
      if(state.bridgeOk){
        var response = await bridgeFetch('/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify(payload)
        });
        persistSelection();
        setStatus(response && response.message ? response.message : 'Kaynak AcademiQ\'a gonderildi.', 'ok');
      } else {
        var queued = await queueCaptureOffline(payload);
        persistSelection();
        state.queueState = await getOfflineQueueState();
        setStatus((queued && queued.message) || 'Kaynak kuyruğa alındı. AcademiQ açıldığında otomatik senkronize edilecek.', 'ok');
      }
    }catch(_error){
      try{
        var fallbackQueued = await queueCaptureOffline(payload);
        persistSelection();
        state.queueState = await getOfflineQueueState();
        setStatus((fallbackQueued && fallbackQueued.message) || 'Kaynak kuyruğa alındı. AcademiQ açıldığında otomatik senkronize edilecek.', 'ok');
      }catch(error){
        setStatus('AcademiQ baglantisi kurulamadi.', 'error');
      }
    }
  }

  async function openApp(){
    if(state.bridgeOk){
      setStatus('AcademiQ baglantisi zaten acik.', 'ok');
      return;
    }
    try{
      await createTab('academiq://open');
      try{
        await waitForBridgeReady(9000);
        state.queueState = await getOfflineQueueState();
        await loadTargets();
        await fillTargets(state.targets);
        setStatus('AcademiQ baglantisi hazir.', 'ok');
      }catch(_bridgeError){
        setStatus('AcademiQ aciliyor; kuyruktaki islemeler baglanti gelince otomatik senkronize edilecek.', '');
      }
    }catch(_e){
      setStatus('Uygulama acilamadi.', 'error');
    }
  }

  async function updateLookup(){
    if(!state.bridgeOk){
      setLookupStatus('Uygulama kapaliyken on kontrol yapilmaz; workspace listesi gelmese bile ekleme kuyruga alinabilir.', '');
      return;
    }
    var payload = buildPayload();
    if(!payload.detectedTitle && !payload.doi){
      setLookupStatus('On kontrol icin baslik veya DOI gerekli.', '');
      return;
    }
    try{
      var info = await bridgeFetch('/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload)
      });
      state.lookup = info || null;
      if(info && info.ok){
        setLookupStatus(info.message || 'On kontrol tamam.', info.existsInWorkspace ? 'ok' : '');
      }else{
        setLookupStatus('On kontrol yapilamadi.', '');
      }
    }catch(_e){
      setLookupStatus('On kontrol alinamadi.', '');
    }
  }

  async function init(){
    var refreshBtn = $('refreshBtn');
    var captureBtn = $('captureBtn');
    var openAppBtn = $('openAppBtn');
    var createWorkspaceBtn = $('workspaceCreateBtn');
    var createWorkspaceInput = $('workspaceCreateInput');
    var workspaceSel = $('workspaceSel');
    var comparisonSel = $('comparisonSel');
    var editFieldIds = ['editReferenceType', 'editSourceUrl', 'editTitle', 'editAuthors', 'editJournal', 'editPublisher', 'editWebsiteName', 'editEdition', 'editPublishedDate', 'editAccessedDate', 'editYear', 'editDoi', 'editPdfUrl', 'editAbstract'];
    if(refreshBtn){
      refreshBtn.addEventListener('click', function(){ refreshDetection().catch(function(error){ setStatus(error.message || 'Detection hatasi', 'error'); }); });
    }
    if(captureBtn){
      captureBtn.addEventListener('click', function(){ sendCapture().catch(function(error){ setStatus(error.message || 'Capture hatasi', 'error'); }); });
    }
    if(openAppBtn){
      openAppBtn.addEventListener('click', function(){ openApp(); });
    }
    if(createWorkspaceBtn){
      createWorkspaceBtn.addEventListener('click', function(){ createWorkspaceFromPopup(); });
    }
    if(createWorkspaceInput){
      createWorkspaceInput.addEventListener('keydown', function(event){
        if(event && event.key === 'Enter'){
          event.preventDefault();
          createWorkspaceFromPopup();
        }
      });
    }
    if(workspaceSel){
      workspaceSel.addEventListener('change', function(){
        renderComparisons('');
        persistSelection();
        updateLookup();
      });
    }
    if(comparisonSel){
      comparisonSel.addEventListener('change', function(){
        persistSelection();
        updateLookup();
      });
    }
    editFieldIds.forEach(function(id){
      var el = $(id);
      if(!el) return;
      if(id === 'editReferenceType'){
        el.addEventListener('change', function(){
          applyReferenceTypeUI(el.value);
          scheduleLookupRefresh();
        });
      }
      el.addEventListener('input', function(){
        scheduleLookupRefresh();
      });
      el.addEventListener('change', function(){
        renderCitationSummaryFromForm();
      });
    });
    try{
      await sendHello('popup');
      await loadTargets();
      state.queueState = await getOfflineQueueState();
      await fillTargets(state.targets);
      setStatus('AcademiQ baglantisi hazir.', 'ok');
    }catch(_e){
      state.queueState = await getOfflineQueueState();
      state.targets = await loadCachedTargets();
      await fillTargets(state.targets || { workspaces: [], activeWorkspaceId: '', preferredWorkspaceId: '', preferredComparisonId: '' });
      applyPendingWorkspaces(state.queueState && state.queueState.pendingWorkspaces);
      setStatus((state.queueState && state.queueState.pendingCount)
        ? ('AcademiQ kapali. ' + state.queueState.pendingCount + ' bekleyen islem otomatik senkronize edilecek.')
        : 'AcademiQ kapali. Workspace listesi gelmese de ekleme yapabilirsiniz; kayitlar kuyrukta tutulacak.', '');
    }
    await refreshDetection();
  }

  document.addEventListener('DOMContentLoaded', function(){
    init().catch(function(error){
      setStatus(error && error.message ? error.message : 'Popup baslatilamadi.', 'error');
    });
  }, { once: true });
})();
