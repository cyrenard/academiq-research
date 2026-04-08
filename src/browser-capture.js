(function(root){
  'use strict';

  var pendingIncomingCaptures = [];
  var rendererReadySent = false;
  var pendingStateTimer = 0;

  function state(){ return typeof S !== 'undefined' ? S : (root.S || null); }
  function text(value, maxLen){
    if(value == null) return '';
    var out = String(value).trim();
    if(!maxLen || out.length <= maxLen) return out;
    return out.slice(0, maxLen);
  }
  function getElectron(){ return root.electronAPI || null; }
  function byId(id){ return document.getElementById(id); }
  function status(message, cls){
    if(typeof root.setDst === 'function') root.setDst(message || '', cls || '');
  }
  function formatDateTime(ts){
    var n = Number(ts);
    if(!(n > 0)) return 'Henuz yok';
    try{ return new Date(n).toLocaleString('tr-TR'); }catch(_e){ return 'Henuz yok'; }
  }
  function wsById(wsId){
    var st = state();
    return st && Array.isArray(st.wss) ? st.wss.find(function(ws){ return ws && String(ws.id || '') === String(wsId || ''); }) || null : null;
  }
  function currentWorkspaceId(){
    var st = state();
    return st && st.cur ? String(st.cur) : '';
  }
  function appStateReady(){
    var st = state();
    return !!(st && Array.isArray(st.wss) && Array.isArray(st.docs));
  }
  function normalizeDetectionEntry(value){
    var source = value && typeof value === 'object' ? value : {};
    return {
      value: text(source.value, 4096),
      source: text(source.source, 64).toLowerCase() || 'none',
      confidence: text(source.confidence, 16).toLowerCase() || 'none',
      found: !!source.found && !!text(source.value, 4096)
    };
  }
  function normalizePayload(payload){
    var source = payload && typeof payload === 'object' ? payload : {};
    return {
      sourcePageUrl: text(source.sourcePageUrl || source.url, 4096),
      pageTitle: text(source.pageTitle, 2048),
      doi: text(source.doi, 256),
      pdfUrl: text(source.pdfUrl, 4096),
      detectedTitle: text(source.detectedTitle || source.title, 2048),
      detectedAuthors: Array.isArray(source.detectedAuthors) ? source.detectedAuthors.map(function(item){ return text(item, 256); }).filter(Boolean).slice(0, 12) : [],
      detectedJournal: text(source.detectedJournal || source.journal, 1024),
      detectedYear: text(source.detectedYear || source.year, 32),
      detectedAbstract: text(source.detectedAbstract || source.abstract, 12000),
      selectedWorkspaceId: text(source.selectedWorkspaceId, 128),
      selectedComparisonId: text(source.selectedComparisonId, 128),
      queueId: text(source.queueId, 128),
      browserSource: text(source.browserSource, 64),
      timestamp: Number(source.timestamp) > 0 ? Number(source.timestamp) : Date.now(),
      detectionMeta: {
        doi: normalizeDetectionEntry(source.detectionMeta && source.detectionMeta.doi),
        pdfUrl: normalizeDetectionEntry(source.detectionMeta && source.detectionMeta.pdfUrl),
        title: normalizeDetectionEntry(source.detectionMeta && source.detectionMeta.title),
        authors: normalizeDetectionEntry(source.detectionMeta && source.detectionMeta.authors),
        journal: normalizeDetectionEntry(source.detectionMeta && source.detectionMeta.journal),
        year: normalizeDetectionEntry(source.detectionMeta && source.detectionMeta.year),
        abstract: normalizeDetectionEntry(source.detectionMeta && source.detectionMeta.abstract)
      }
    };
  }

  function buildCandidateRef(payload, targetWsId){
    var safe = normalizePayload(payload);
    var api = root.AQWebRelatedPapers || null;
    var ref = null;
    if(api && typeof api.buildWorkspaceReference === 'function'){
      try{
        ref = api.buildWorkspaceReference({
          title: safe.detectedTitle,
          authors: safe.detectedAuthors.slice(),
          year: safe.detectedYear,
          journal: safe.detectedJournal,
          doi: safe.doi,
          url: safe.sourcePageUrl,
          abstract: safe.detectedAbstract,
          pdfUrl: safe.pdfUrl,
          provider: 'browser-capture',
          providerLabel: safe.browserSource || 'Browser Capture',
          reasons: ['Tarayici yakalama']
        },{
          workspaceId: targetWsId,
          createId: typeof root.uid === 'function' ? root.uid : function(){ return 'ref_' + Date.now(); }
        });
      }catch(_e){}
    }
    if(!ref){
      ref = {
        id: typeof root.uid === 'function' ? root.uid() : ('ref_' + Date.now()),
        title: safe.detectedTitle,
        authors: safe.detectedAuthors.slice(),
        year: safe.detectedYear,
        journal: safe.detectedJournal,
        volume: '',
        issue: '',
        fp: '',
        lp: '',
        doi: safe.doi,
        url: safe.sourcePageUrl,
        abstract: safe.detectedAbstract,
        pdfData: null,
        pdfUrl: '',
        labels: [],
        wsId: targetWsId
      };
    }
    if(typeof root.normalizeRefRecord === 'function') root.normalizeRefRecord(ref);
    ref.wsId = targetWsId;
    ref.browserCaptureMeta = {
      sourcePageUrl: safe.sourcePageUrl,
      browserSource: safe.browserSource,
      capturedAt: safe.timestamp,
      detectedPdfUrl: safe.pdfUrl,
      detectionMeta: safe.detectionMeta
    };
    return ref;
  }

  function findEquivalentAcrossWorkspaces(candidateRef){
    var st = state();
    if(!st || !Array.isArray(st.wss)) return null;
    for(var wi = 0; wi < st.wss.length; wi += 1){
      var ws = st.wss[wi];
      var lib = ws && Array.isArray(ws.lib) ? ws.lib : [];
      for(var ri = 0; ri < lib.length; ri += 1){
        if(typeof root.refsLikelySame === 'function' && root.refsLikelySame(lib[ri], candidateRef)){
          return { wsId: ws.id, ref: lib[ri] };
        }
      }
    }
    return null;
  }

  function cloneReferenceForWorkspace(existingRef, candidateRef, targetWsId){
    var clone = JSON.parse(JSON.stringify(existingRef || {}));
    clone.id = typeof root.uid === 'function' ? root.uid() : ('ref_' + Date.now());
    clone.wsId = targetWsId;
    clone.collectionIds = [];
    if(typeof root.mergeRefFields === 'function') root.mergeRefFields(clone, candidateRef || {});
    if(typeof root.normalizeRefRecord === 'function') root.normalizeRefRecord(clone);
    return clone;
  }

  function persistRefInWorkspace(targetWsId, ref){
    var ws = wsById(targetWsId);
    if(!ws) return null;
    if(!Array.isArray(ws.lib)) ws.lib = [];
    ws.lib.push(ref);
    return ref;
  }

  function applyBrowserCaptureMeta(targetRef, safe){
    if(!targetRef) return;
    if(!targetRef.browserCaptureMeta || typeof targetRef.browserCaptureMeta !== 'object'){
      targetRef.browserCaptureMeta = {};
    }
    targetRef.browserCaptureMeta.sourcePageUrl = safe.sourcePageUrl || targetRef.browserCaptureMeta.sourcePageUrl || '';
    targetRef.browserCaptureMeta.browserSource = safe.browserSource || targetRef.browserCaptureMeta.browserSource || '';
    targetRef.browserCaptureMeta.capturedAt = safe.timestamp || targetRef.browserCaptureMeta.capturedAt || Date.now();
    targetRef.browserCaptureMeta.detectedPdfUrl = safe.pdfUrl || targetRef.browserCaptureMeta.detectedPdfUrl || '';
    targetRef.browserCaptureMeta.detectionMeta = safe.detectionMeta || targetRef.browserCaptureMeta.detectionMeta || {};
  }

  function resolveTargetWorkspaceId(safe, prefs){
    var requested = safe && safe.selectedWorkspaceId ? String(safe.selectedWorkspaceId) : '';
    if(requested && wsById(requested)){
      return { workspaceId: requested, fallback: false, reason: 'selected' };
    }
    if(currentWorkspaceId() && wsById(currentWorkspaceId())){
      return {
        workspaceId: currentWorkspaceId(),
        fallback: !!requested,
        reason: requested ? 'selected_missing_to_active' : 'active'
      };
    }
    var st = state();
    var firstWs = st && Array.isArray(st.wss) ? st.wss[0] : null;
    return {
      workspaceId: firstWs && firstWs.id ? String(firstWs.id) : '',
      fallback: !!requested,
      reason: requested ? 'selected_missing_to_first' : 'first'
    };
  }

  function maybeAttachPdfUrl(ref, payload, prefs){
    if(!ref) return { status: 'not_detected', detected: false, storedUrl: '' };
    var safe = normalizePayload(payload);
    if(!safe.pdfUrl) return { status: 'not_detected', detected: false, storedUrl: '' };
    if(!ref.browserCaptureMeta) ref.browserCaptureMeta = {};
    ref.browserCaptureMeta.detectedPdfUrl = safe.pdfUrl;
    if(prefs && prefs.autoAttachPdfUrl === false){
      ref.browserCaptureMeta.pdfCaptureStatus = 'detected_only';
      return { status: 'detected_only', detected: true, storedUrl: safe.pdfUrl };
    }
    if(ref.pdfData || ref.pdfUrl){
      ref.browserCaptureMeta.pdfCaptureStatus = 'already_present';
      return { status: 'already_present', detected: true, storedUrl: ref.pdfUrl || safe.pdfUrl };
    }
    ref.pdfUrl = safe.pdfUrl;
    ref.browserCaptureMeta.pdfCaptureStatus = 'url_stored';
    return { status: 'url_stored', detected: true, storedUrl: safe.pdfUrl };
  }

  function attachToComparisonIfNeeded(targetWsId, ref, comparisonId){
    if(String(comparisonId || '') !== 'literature-matrix'){
      return { requested: !!comparisonId, applied: false, comparisonId: '' };
    }
    var api = root.AQLiteratureMatrixState || null;
    var st = state();
    if(!(api && st && typeof api.ensureRowForReference === 'function')){
      return { requested: true, applied: false, comparisonId: 'literature-matrix' };
    }
    try{
      api.ensureRowForReference(st, targetWsId, ref, { uid: root.uid });
      return { requested: true, applied: true, comparisonId: 'literature-matrix' };
    }catch(_e){
      return { requested: true, applied: false, comparisonId: 'literature-matrix' };
    }
  }

  function refreshUI(targetWsId){
    if(typeof root.save === 'function') root.save();
    if(typeof root.rWS === 'function') root.rWS();
    if(String(targetWsId || '') === currentWorkspaceId()){
      if(typeof root.rLib === 'function') root.rLib();
      if(typeof root.rRefs === 'function') root.rRefs();
      if(root.AQLiteratureMatrix && typeof root.AQLiteratureMatrix.render === 'function'){
        try{ root.AQLiteratureMatrix.render(); }catch(_e){}
      }
    }
  }

  function maybeFocusImportedWorkspace(targetWsId, prefs){
    if(!(prefs && prefs.focusImportedWorkspace)) return false;
    if(!targetWsId || String(targetWsId) === currentWorkspaceId()) return false;
    if(typeof root.switchWs === 'function'){
      try{
        root.switchWs(targetWsId);
        return true;
      }catch(_e){}
    }
    return false;
  }

  function ensureInWorkspace(payload, prefs){
    var st = state();
    if(!st) return { ok: false, error: 'Uygulama durumu hazir degil' };
    var safe = normalizePayload(payload);
    var targetInfo = resolveTargetWorkspaceId(safe, prefs || {});
    var targetWsId = targetInfo.workspaceId;
    var targetWs = wsById(targetWsId);
    if(!targetWs) return { ok: false, error: 'Hedef workspace bulunamadi' };
    var candidateRef = buildCandidateRef(safe, targetWsId);
    var api = root.AQWebRelatedPapers || null;
    var decision = null;
    if(api && typeof api.decideAddToActiveWorkspace === 'function'){
      try{ decision = api.decideAddToActiveWorkspace(st.wss, targetWsId, candidateRef); }catch(_e){}
    }
    var resultRef = null;
    var mode = 'added_new';
    if(decision && decision.action === 'already_in_workspace' && decision.existingRef){
      resultRef = decision.existingRef;
      if(typeof root.mergeRefFields === 'function') root.mergeRefFields(resultRef, candidateRef);
      mode = 'already_in_workspace';
    }else if(decision && decision.action === 'attach_existing' && decision.existingRef){
      resultRef = cloneReferenceForWorkspace(decision.existingRef, candidateRef, targetWsId);
      persistRefInWorkspace(targetWsId, resultRef);
      mode = 'attached_existing_library';
    }else{
      var existingAny = findEquivalentAcrossWorkspaces(candidateRef);
      if(existingAny && String(existingAny.wsId || '') !== String(targetWsId)){
        resultRef = cloneReferenceForWorkspace(existingAny.ref, candidateRef, targetWsId);
        persistRefInWorkspace(targetWsId, resultRef);
        mode = 'attached_existing_library';
      }else{
        resultRef = candidateRef;
        persistRefInWorkspace(targetWsId, resultRef);
        mode = 'added_new';
      }
    }
    applyBrowserCaptureMeta(resultRef, safe);
    var pdfHandling = maybeAttachPdfUrl(resultRef, safe, prefs || {});
    var comparison = attachToComparisonIfNeeded(targetWsId, resultRef, safe.selectedComparisonId);
    refreshUI(targetWsId);
    var focusedWorkspace = maybeFocusImportedWorkspace(targetWsId, prefs || {});
    return {
      ok: true,
      mode: mode,
      ref: resultRef,
      workspace: targetWs,
      target: targetInfo,
      comparison: comparison,
      pdfHandling: pdfHandling,
      focusedWorkspace: focusedWorkspace
    };
  }

  function deriveSetupState(info){
    var source = info && typeof info === 'object' ? info : {};
    if(source.lifecycleState) return String(source.lifecycleState);
    if(String(source.browserFamily || '') === 'unknown') return 'browser_unknown';
    if(source.bridgeConnected) return 'connected';
    if(source.installDir && source.lastConnectedAt) return 'connection_failed';
    if(source.installDir) return 'setup_ready';
    return 'not_setup';
  }

  function compatibilityLabel(value){
    var raw = String(value || '').trim();
    if(raw === 'compatible') return 'Uyumlu';
    if(raw === 'outdated_extension') return 'Guncelleme gerekli';
    if(raw === 'protocol_mismatch') return 'Surum uyusmazligi';
    if(raw === 'preparing') return 'Hazirlaniyor';
    if(raw === 'pending_verification') return 'Dogrulama bekleniyor';
    if(raw === 'missing_browser_path') return 'Tarayici bulunamadi';
    if(raw === 'unsupported_browser') return 'Desteklenmiyor';
    return 'Bilinmiyor';
  }

  function installModeLabel(info){
    var strategy = info && info.installStrategy ? info.installStrategy : null;
    if(strategy && strategy.supported && strategy.id === 'managed_chromium_session'){
      return 'Uygulama yonetimli';
    }
    if(strategy && !strategy.supported){
      return 'Desteklenmiyor';
    }
    return 'Hazir degil';
  }

  function renderSettingsStatus(info){
    var statusEl = byId('browserCaptureStatusText');
    var detailEl = byId('browserCaptureDetailText');
    var browserEl = byId('browserCaptureDetectedBrowser');
    var modeEl = byId('browserCaptureInstallMode');
    var compatibilityEl = byId('browserCaptureCompatibility');
    var versionEl = byId('browserCaptureVersionInfo');
    var installEl = byId('browserCaptureInstallDir');
    var seenEl = byId('browserCaptureLastSeen');
    var autoPdfEl = byId('browserCaptureAutoPdf');
    var focusWsEl = byId('browserCaptureFocusWorkspace');
    var installBtn = byId('browserCaptureInstallBtn');
    var updateBtn = byId('browserCaptureUpdateBtn');
    var repairBtn = byId('browserCaptureRepairBtn');
    var launchBtn = byId('browserCaptureLaunchBtn');
    var setupState = deriveSetupState(info || {});

    if(statusEl){
      statusEl.textContent = setupState === 'connected' || setupState === 'ready'
        ? 'Browser Capture hazir'
        : (setupState === 'update_available'
          ? 'Browser Capture guncellemesi hazir'
          : (setupState === 'installed_not_verified'
            ? 'Kurulum tamamlandi, baglanti bekleniyor'
            : (setupState === 'repair_needed' || setupState === 'disconnected'
              ? 'Baglanti kaybedildi'
              : (setupState === 'unsupported' || setupState === 'unsupported_browser'
                ? 'Tarayici desteklenmiyor'
                : (setupState === 'installing' || setupState === 'setup_in_progress'
                  ? 'Browser Capture kuruluyor'
                  : 'Browser Capture kapali')))));
    }
    if(detailEl){
      detailEl.textContent = info && info.message
        ? String(info.message)
        : (setupState === 'ready'
          ? 'Uygulama yonetimli tarayici oturumu hazir. Capture eklemeden once DOI/PDF ozetini yine kontrol edin.'
          : (setupState === 'unsupported' || setupState === 'unsupported_browser'
            ? 'Bu tarayici ailesinde tam otomatik Browser Capture kurulumu sunulamiyor.'
            : 'Browser Capture uygulama icinden kurulur, dogrulanir ve gerekirse tek tikla onarilir.'));
    }
    if(browserEl) browserEl.textContent = info.defaultBrowserLabel || 'Bilinmiyor';
    if(modeEl) modeEl.textContent = installModeLabel(info || {});
    if(compatibilityEl) compatibilityEl.textContent = compatibilityLabel(info && info.compatibilityState);
    if(versionEl){
      var bundled = info && info.bundledExtensionVersion ? String(info.bundledExtensionVersion) : '-';
      var installed = info && info.installedExtensionVersion ? String(info.installedExtensionVersion) : '-';
      versionEl.textContent = installed + ' / ' + bundled;
    }
    if(installEl) installEl.textContent = info.managedProfileDir || info.installDir || 'Hazir degil';
    if(seenEl) seenEl.textContent = formatDateTime(info.lastConnectedAt);
    if(autoPdfEl) autoPdfEl.checked = info.autoAttachPdfUrl !== false;
    if(focusWsEl) focusWsEl.checked = !!info.focusImportedWorkspace;
    if(installBtn){
      installBtn.disabled = !!(info && info.installStrategy && !info.installStrategy.supported);
      installBtn.textContent = (setupState === 'ready' || setupState === 'connected') ? 'Yeniden Kur' : 'Browser Capture Kur';
    }
    if(updateBtn){
      updateBtn.disabled = !(info && info.updateAvailable);
    }
    if(repairBtn){
      repairBtn.disabled = !!(info && info.installStrategy && !info.installStrategy.supported);
    }
    if(launchBtn){
      launchBtn.disabled = !!(info && info.installStrategy && (!info.installStrategy.supported || !info.browserExecutablePath));
    }
  }

  async function refreshSettings(){
    var api = getElectron();
    if(!api || typeof api.getBrowserCaptureStatus !== 'function') return null;
    try{
      var info = await api.getBrowserCaptureStatus();
      renderSettingsStatus(info || {});
      return info;
    }catch(_e){
      renderSettingsStatus({});
      return null;
    }
  }

  function buildCaptureMessage(result){
    if(!result || !result.ok) return result && result.error ? result.error : 'Browser capture iceri aktarılamadi.';
    var parts = [];
    var wsName = result.workspace && result.workspace.name ? result.workspace.name : 'workspace';

    if(result.mode === 'already_in_workspace'){
      parts.push('Kaynak zaten "' + wsName + '" icinde vardi.');
    }else if(result.mode === 'attached_existing_library'){
      parts.push('Kaynak kutuphanede zaten vardi; "' + wsName + '" icine baglandi.');
    }else{
      parts.push('Yeni kaynak "' + wsName + '" icine eklendi.');
    }

    if(result.comparison && result.comparison.applied){
      parts.push('Literatur Matrisi de guncellendi.');
    }else if(result.comparison && result.comparison.requested){
      parts.push('Karsilastirma hedefi istendi ama uygulanamadi.');
    }

    if(result.pdfHandling){
      if(result.pdfHandling.status === 'url_stored'){
        parts.push('PDF baglantisi bulundu ve URL olarak kayda eklendi. PDF henuz indirilmedi.');
      }else if(result.pdfHandling.status === 'detected_only'){
        parts.push('PDF baglantisi bulundu; ayar geregi sadece tespit olarak saklandi.');
      }else if(result.pdfHandling.status === 'already_present'){
        parts.push('Kaynakta zaten bir PDF veya PDF URL bilgisi oldugu icin yeni baglanti eklenmedi.');
      }
    }

    if(result.target && result.target.fallback){
      parts.push('Secilen workspace bulunamadigi icin guvenli hedefe yonlendirildi.');
    }
    if(result.focusedWorkspace){
      parts.push('Hedef workspace acildi.');
    }

    var doiInfo = result.ref && result.ref.browserCaptureMeta && result.ref.browserCaptureMeta.detectionMeta
      ? result.ref.browserCaptureMeta.detectionMeta.doi
      : null;
    if(doiInfo && doiInfo.found && doiInfo.confidence === 'weak'){
      parts.push('DOI zayif kanitla algilandi; metadata health icinde kontrol etmeniz iyi olur.');
    }

    return parts.join(' ');
  }

  async function handleIncomingCapture(payload){
    var api = getElectron();
    if(!appStateReady()){
      pendingIncomingCaptures.push(payload);
      schedulePendingCaptureProcessing();
      return { ok:false, queued:true, error:'Uygulama durumu henüz hazır değil' };
    }
    var prefs = await refreshSettings() || {};
    var result = ensureInWorkspace(payload, prefs);
    if(api && typeof api.updateBrowserCapturePrefs === 'function'){
      try{
        var safe = normalizePayload(payload);
        await api.updateBrowserCapturePrefs({
          lastUsedWorkspaceId: safe.selectedWorkspaceId || '',
          lastUsedComparisonId: safe.selectedComparisonId || ''
        });
      }catch(_e){}
    }
    if(!result.ok){
      status(result.error || 'Browser capture iceri aktarilamadi.', 'er');
      return result;
    }
    if(api && typeof api.ackBrowserCapturePayload === 'function'){
      try{
        var queueId = normalizePayload(payload).queueId || String((payload && payload.queueId) || '');
        if(queueId) await api.ackBrowserCapturePayload(queueId);
      }catch(_e){}
    }
    status(buildCaptureMessage(result), 'ok');
    setTimeout(function(){ status('', ''); }, 5200);
    return result;
  }

  function processPendingCapturesNow(){
    if(!appStateReady() || !pendingIncomingCaptures.length) return;
    var queue = pendingIncomingCaptures.slice();
    pendingIncomingCaptures = [];
    queue.reduce(function(chain, payload){
      return chain.then(function(){ return handleIncomingCapture(payload); }).catch(function(){});
    }, Promise.resolve());
  }

  function reloadApplicationState(detail){
    if(typeof root.syncLoad !== 'function') return Promise.resolve(false);
    return Promise.resolve(root.syncLoad()).then(function(){
      try{ if(typeof root.rWS === 'function') root.rWS(); }catch(_e){}
      try{ if(typeof root.rNB === 'function') root.rNB(); }catch(_e){}
      try{ if(typeof root.rLib === 'function') root.rLib(); }catch(_e){}
      try{ if(typeof root.renderRelatedPapers === 'function') root.renderRelatedPapers(); }catch(_e){}
      try{ if(typeof root.rNotes === 'function') root.rNotes(); }catch(_e){}
      try{ if(typeof root.rRefs === 'function') root.rRefs(); }catch(_e){}
      try{ if(typeof root.uSt === 'function') root.uSt(); }catch(_e){}
      try{ if(typeof root.rDocTabs === 'function') root.rDocTabs(); }catch(_e){}
      if(detail && detail.focusWorkspace && detail.workspaceId && typeof root.switchWs === 'function'){
        try{ root.switchWs(String(detail.workspaceId)); }catch(_e){}
      }
      return true;
    }).catch(function(){ return false; });
  }

  function schedulePendingCaptureProcessing(){
    if(pendingStateTimer) clearTimeout(pendingStateTimer);
    pendingStateTimer = setTimeout(function(){
      pendingStateTimer = 0;
      if(!appStateReady()){
        schedulePendingCaptureProcessing();
        return;
      }
      if(!rendererReadySent){
        var api = getElectron();
        if(api && typeof api.browserCaptureRendererReady === 'function'){
          rendererReadySent = true;
          api.browserCaptureRendererReady().catch(function(){ rendererReadySent = false; });
        }
      }
      processPendingCapturesNow();
    }, 180);
  }

  function applyWorkspaceCreated(payload){
    if(!appStateReady()) return;
    var st = state();
    var source = payload && typeof payload === 'object' ? payload : {};
    var ws = source.workspace && typeof source.workspace === 'object' ? source.workspace : null;
    var doc = source.doc && typeof source.doc === 'object' ? source.doc : null;
    if(!ws || !ws.id) return;
    if(Array.isArray(st.wss) && st.wss.some(function(entry){ return entry && String(entry.id||'') === String(ws.id||''); })){
      return;
    }
    st.wss = Array.isArray(st.wss) ? st.wss : [];
    st.docs = Array.isArray(st.docs) ? st.docs : [];
    st.wss.push({
      id: String(ws.id||''),
      name: String(ws.name||'Çalışma Alanı'),
      lib: Array.isArray(ws.lib) ? ws.lib.slice() : [],
      docId: doc && doc.id ? String(doc.id) : String(ws.docId || '')
    });
    if(doc && doc.id){
      st.docs.push({
        id: String(doc.id),
        name: String(doc.name || ws.name || 'Belge'),
        content: String(doc.content || '<p></p>'),
        bibliographyHTML: String(doc.bibliographyHTML || ''),
        bibliographyManual: !!doc.bibliographyManual,
        coverHTML: String(doc.coverHTML || ''),
        tocHTML: String(doc.tocHTML || ''),
        citationStyle: String(doc.citationStyle || 'apa7')
      });
    }
    if(typeof root.rWS === 'function') root.rWS();
    if(typeof root.rDocTabs === 'function') root.rDocTabs();
    if(typeof root.save === 'function') root.save();
  }

  function bindSettingsButtons(){
    var installBtn = byId('browserCaptureInstallBtn');
    var updateBtn = byId('browserCaptureUpdateBtn');
    var repairBtn = byId('browserCaptureRepairBtn');
    var launchBtn = byId('browserCaptureLaunchBtn');
    var openDirBtn = byId('browserCaptureOpenDirBtn');
    var guideBtn = byId('browserCaptureGuideBtn');
    var testBtn = byId('browserCaptureTestBtn');
    var autoPdfEl = byId('browserCaptureAutoPdf');
    var focusWsEl = byId('browserCaptureFocusWorkspace');
    var api = getElectron();
    if(installBtn && !installBtn.__aqBound){
      installBtn.__aqBound = true;
      installBtn.addEventListener('click', async function(){
        if(!api || typeof api.runBrowserCaptureAction !== 'function') return;
        var info = await api.runBrowserCaptureAction('install');
        renderSettingsStatus(info || {});
        status(info && info.ok ? 'Browser Capture kurulumu baslatildi.' : ((info && info.error) || 'Kurulum baslatilamadi.'), info && info.ok ? 'ok' : 'er');
      });
    }
    if(updateBtn && !updateBtn.__aqBound){
      updateBtn.__aqBound = true;
      updateBtn.addEventListener('click', async function(){
        if(!api || typeof api.runBrowserCaptureAction !== 'function') return;
        var info = await api.runBrowserCaptureAction('update');
        renderSettingsStatus(info || {});
        status(info && info.ok ? 'Browser Capture guncellemesi baslatildi.' : ((info && info.error) || 'Guncelleme baslatilamadi.'), info && info.ok ? 'ok' : 'er');
      });
    }
    if(repairBtn && !repairBtn.__aqBound){
      repairBtn.__aqBound = true;
      repairBtn.addEventListener('click', async function(){
        if(!api || typeof api.runBrowserCaptureAction !== 'function') return;
        var info = await api.runBrowserCaptureAction('repair');
        renderSettingsStatus(info || {});
        status(info && info.ok ? 'Browser Capture onarimi baslatildi.' : ((info && info.error) || 'Onarim baslatilamadi.'), info && info.ok ? 'ok' : 'er');
      });
    }
    if(launchBtn && !launchBtn.__aqBound){
      launchBtn.__aqBound = true;
      launchBtn.addEventListener('click', async function(){
        if(!api || typeof api.runBrowserCaptureAction !== 'function') return;
        var info = await api.runBrowserCaptureAction('install');
        renderSettingsStatus(info || {});
        status(info && info.ok ? 'Tarayici Browser Capture ile acildi.' : ((info && info.error) || 'Tarayici acilamadi.'), info && info.ok ? 'ok' : 'er');
      });
    }
    if(openDirBtn && !openDirBtn.__aqBound){
      openDirBtn.__aqBound = true;
      openDirBtn.addEventListener('click', async function(){
        if(api && typeof api.openBrowserCaptureInstallDir === 'function') await api.openBrowserCaptureInstallDir();
      });
    }
    if(guideBtn && !guideBtn.__aqBound){
      guideBtn.__aqBound = true;
      guideBtn.addEventListener('click', async function(){
        if(api && typeof api.openBrowserCaptureGuide === 'function') await api.openBrowserCaptureGuide();
      });
    }
    if(testBtn && !testBtn.__aqBound){
      testBtn.__aqBound = true;
      testBtn.addEventListener('click', async function(){
        if(api && typeof api.testBrowserCaptureConnection === 'function'){
          var info = await api.testBrowserCaptureConnection();
          renderSettingsStatus(info || {});
          status(info && info.ok ? 'Baglanti aktif.' : ((info && info.message) || 'Uzanti henuz bagli gorunmuyor.'), info && info.ok ? 'ok' : 'er');
        }
      });
    }
    if(autoPdfEl && !autoPdfEl.__aqBound){
      autoPdfEl.__aqBound = true;
      autoPdfEl.addEventListener('change', function(){
        if(api && typeof api.updateBrowserCapturePrefs === 'function'){
          api.updateBrowserCapturePrefs({ autoAttachPdfUrl: !!autoPdfEl.checked });
        }
      });
    }
    if(focusWsEl && !focusWsEl.__aqBound){
      focusWsEl.__aqBound = true;
      focusWsEl.addEventListener('change', function(){
        if(api && typeof api.updateBrowserCapturePrefs === 'function'){
          api.updateBrowserCapturePrefs({ focusImportedWorkspace: !!focusWsEl.checked });
        }
      });
    }
  }

  async function maybePromptInstall(info){
    var api = getElectron();
    if(!api || typeof api.runBrowserCaptureAction !== 'function' || typeof api.updateBrowserCapturePrefs !== 'function') return;
    var source = info && typeof info === 'object' ? info : {};
    if(source.setupPromptSeen) return;
    if(source.installStrategy && source.installStrategy.supported === false) return;
    if(String(source.lifecycleState || '') === 'ready' || String(source.lifecycleState || '') === 'connected') return;
    await api.updateBrowserCapturePrefs({ setupPromptSeen: true });
    var accepted = false;
    try{
      accepted = !!root.confirm('Browser Capture etkinlestirilsin mi?\nTarayicidan buldugunuz makaleleri dogrudan AcademiQ\'a ekleyebilirsiniz.');
    }catch(_e){
      accepted = false;
    }
    if(!accepted){
      status('Browser Capture daha sonra Ayarlar icinden etkinlestirilebilir.', '');
      return;
    }
    var result = await api.runBrowserCaptureAction('install');
    renderSettingsStatus(result || {});
    status(result && result.ok ? 'Browser Capture kurulumu baslatildi.' : ((result && result.error) || 'Kurulum baslatilamadi.'), result && result.ok ? 'ok' : 'er');
  }

  function init(){
    bindSettingsButtons();
    refreshSettings().then(function(info){
      maybePromptInstall(info || {});
    });
    var api = getElectron();
    if(api && typeof api.onBrowserCaptureIncoming === 'function'){
      api.onBrowserCaptureIncoming(function(payload){
        pendingIncomingCaptures.push(payload);
        schedulePendingCaptureProcessing();
      });
    }
    if(api && typeof api.onBrowserCaptureWorkspaceCreated === 'function'){
      api.onBrowserCaptureWorkspaceCreated(function(payload){
        applyWorkspaceCreated(payload);
      });
    }
    if(api && typeof api.onBrowserCaptureStateChanged === 'function'){
      api.onBrowserCaptureStateChanged(function(detail){
        reloadApplicationState(detail || {});
      });
    }
    schedulePendingCaptureProcessing();
  }

  root.AQBrowserCapture = {
    refreshSettings: refreshSettings,
    handleIncomingCapture: handleIncomingCapture,
    ensureInWorkspace: ensureInWorkspace,
    buildCaptureMessage: buildCaptureMessage
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }else{
    setTimeout(init, 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
