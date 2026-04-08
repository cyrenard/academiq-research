(function(){
  var config = globalThis.AQ_CAPTURE_CONFIG || {};
  var ext = (typeof browser !== 'undefined') ? browser : chrome;
  var state = {
    detection: null,
    targets: null,
    bridgeOk: false,
    lookup: null
  };
  var STORAGE_KEYS = {
    workspace: 'aqLastWorkspaceId',
    comparison: 'aqLastComparisonId'
  };

  function $(id){ return document.getElementById(id); }
  function utils(){ return globalThis.AQBrowserCaptureUtils || null; }
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

  async function getActiveTab(){
    var tabs = await queryTabs({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  }

  function buildPdfPageDetection(tab){
    var api = utils();
    var doi = api && typeof api.findDoiInText === 'function' ? api.findDoiInText(tab.url || '') : '';
    return {
      sourcePageUrl: tab.url || '',
      pageTitle: tab.title || '',
      doi: doi,
      pdfUrl: tab.url || '',
      detectedTitle: tab.title || 'PDF',
      detectedAuthors: [],
      detectedJournal: '',
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
      sourcePageUrl: tab.url || '',
      pageTitle: tab.title || '',
      doi: '',
      pdfUrl: '',
      detectedTitle: tab.title || '',
      detectedAuthors: [],
      detectedJournal: '',
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
    return String(config.bridgeBaseUrl || ('http://127.0.0.1:' + (config.port || 27183))) + path;
  }

  async function bridgeFetch(path, options){
    var opts = Object.assign({}, options || {});
    opts.headers = Object.assign({}, opts.headers || {}, { 'X-AQ-Token': String(config.token || '') });
    var res = await fetch(bridgeUrl(path), opts);
    if(!res.ok) throw new Error('Bridge hatasi (' + res.status + ')');
    return res.json();
  }

  async function sendHello(reason){
    try{
      return await bridgeFetch('/hello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      return data;
    }catch(error){
      state.targets = null;
      state.bridgeOk = false;
      throw error;
    }
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

  async function createWorkspaceFromPopup(){
    var input = $('workspaceCreateInput');
    var name = input ? String(input.value || '').trim() : '';
    if(!name){
      setStatus('Yeni workspace adı gerekli.', 'error');
      return;
    }
    if(!state.bridgeOk){
      setStatus('Workspace oluşturmak için uygulama bağlantısı gerekli.', 'error');
      return;
    }
    setStatus('Yeni workspace oluşturuluyor...', '');
    try{
      var result = await bridgeFetch('/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
      });
      if(!(result && result.ok)){
        setStatus((result && result.error) || 'Workspace oluşturulamadı.', 'error');
        return;
      }
      state.targets = result.targets || state.targets;
      await fillTargets(state.targets);
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
    workspaceSel.innerHTML = '';
    workspaces.forEach(function(ws){
      var opt = document.createElement('option');
      opt.value = ws.id || '';
      opt.textContent = ws.name || 'Calisma Alani';
      workspaceSel.appendChild(opt);
    });
    var remembered = await loadRememberedSelection();
    var preferredWorkspace = (remembered && remembered[STORAGE_KEYS.workspace]) || (data && data.preferredWorkspaceId) || (data && data.activeWorkspaceId) || (workspaces[0] && workspaces[0].id) || '';
    if(preferredWorkspace) workspaceSel.value = preferredWorkspace;
    renderComparisons((remembered && remembered[STORAGE_KEYS.comparison]) || (data && data.preferredComparisonId) || '');
  }

  function renderComparisons(preferredComparisonId){
    var comparisonSel = $('comparisonSel');
    var workspaceSel = $('workspaceSel');
    if(!comparisonSel || !workspaceSel) return;
    var workspaces = (state.targets && Array.isArray(state.targets.workspaces)) ? state.targets.workspaces : [];
    var selectedWs = workspaces.find(function(ws){ return String(ws.id || '') === String(workspaceSel.value || ''); }) || workspaces[0] || null;
    var comparisons = selectedWs && Array.isArray(selectedWs.comparisons) ? selectedWs.comparisons : [{ id: '', name: 'Yok' }];
    comparisonSel.innerHTML = '';
    comparisons.forEach(function(item){
      var opt = document.createElement('option');
      opt.value = item.id || '';
      opt.textContent = item.name || 'Yok';
      comparisonSel.appendChild(opt);
    });
    if(preferredComparisonId && Array.prototype.some.call(comparisonSel.options, function(opt){ return String(opt.value || '') === String(preferredComparisonId || ''); })){
      comparisonSel.value = preferredComparisonId;
    }
  }

  function renderDetection(){
    var data = state.detection || {};
    var doiInfo = detectionEntry('doi');
    var pdfInfo = detectionEntry('pdfUrl');
    setText('detectedTitle', data.detectedTitle || data.pageTitle || 'Baslik algilanamadi');
    setText('doiBadge', doiInfo.found ? ('DOI tespit edildi: ' + data.doi) : 'DOI tespit edilemedi');
    setClass('doiBadge', 'badge ' + badgeTone(doiInfo));
    setText('pdfBadge', pdfInfo.found ? 'PDF baglantisi tespit edildi' : 'PDF baglantisi tespit edilemedi');
    setClass('pdfBadge', 'badge ' + badgeTone(pdfInfo));
    setText('authorSummary', summaryText((Array.isArray(data.detectedAuthors) ? data.detectedAuthors.join('; ') : ''), 'Algilanamadi'));
    setText('journalSummary', summaryText(data.detectedJournal, 'Algilanamadi'));
    setText('yearSummary', summaryText(data.detectedYear, 'Algilanamadi'));
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
    setStatus(state.bridgeOk ? 'Hazir.' : 'Uygulama baglantisi bekleniyor.', state.bridgeOk ? 'ok' : '');
  }

  function buildPayload(){
    var detection = state.detection || {};
    return {
      sourcePageUrl: detection.sourcePageUrl || '',
      pageTitle: detection.pageTitle || '',
      doi: detection.doi || '',
      pdfUrl: detection.pdfUrl || '',
      detectedTitle: detection.detectedTitle || detection.pageTitle || '',
      detectedAuthors: Array.isArray(detection.detectedAuthors) ? detection.detectedAuthors : [],
      detectedJournal: detection.detectedJournal || '',
      detectedYear: detection.detectedYear || '',
      detectedAbstract: detection.detectedAbstract || '',
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
      var response = await bridgeFetch('/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      persistSelection();
      setStatus(response && response.message ? response.message : 'Kaynak AcademiQ\'a gonderildi.', 'ok');
    }catch(_error){
      var protocolPayload = Object.assign({}, payload, {
        detectedAbstract: String(payload.detectedAbstract || '').slice(0, 600)
      });
      var deeplink = 'academiq://capture?payload=' + btoa(unescape(encodeURIComponent(JSON.stringify(protocolPayload))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
      try{
        await createTab(deeplink);
        persistSelection();
        setStatus('Uygulama kapalıysa açılacak; capture açılışta otomatik senkronize edilecek.', '');
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
      setStatus('AcademiQ acilmaya calisiliyor...', '');
    }catch(_e){
      setStatus('Uygulama acilamadi.', 'error');
    }
  }

  async function updateLookup(){
    if(!state.bridgeOk){
      setLookupStatus('Uygulama bagli degil; on kontrol yapilamiyor.', '');
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
        headers: { 'Content-Type': 'application/json' },
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
    try{
      await sendHello('popup');
      await loadTargets();
      await fillTargets(state.targets);
      setStatus('AcademiQ baglantisi hazir.', 'ok');
    }catch(_e){
      setStatus('Uygulama bridge baglantisi bulunamadi. Yine de uygulamayi acmayi deneyebilirsiniz.', '');
    }
    await refreshDetection();
  }

  document.addEventListener('DOMContentLoaded', function(){
    init().catch(function(error){
      setStatus(error && error.message ? error.message : 'Popup baslatilamadi.', 'error');
    });
  }, { once: true });
})();
