(function(){
  'use strict';

  try {
    if (typeof importScripts === 'function') importScripts('config.js');
  } catch (_e) {}

  var config = globalThis.AQ_CAPTURE_CONFIG || {};
  var QUEUE_KEY = 'aqCaptureQueue';
  var QUEUE_MAP_KEY = 'aqWorkspaceIdMap';
  var TARGETS_KEY = 'aqCachedTargets';
  var VERSION_KEY = 'aqCaptureVersion';
  var READY_KEY = 'aqCaptureReady';
  var ALARM_NAME = 'aqCaptureSync';

  function apiRoot() {
    if (typeof browser !== 'undefined') return browser;
    if (typeof chrome !== 'undefined') return chrome;
    return null;
  }

  function runtimeApi() {
    var api = apiRoot();
    return api && api.runtime ? api.runtime : null;
  }

  function storageArea() {
    var api = apiRoot();
    return api && api.storage && api.storage.local ? api.storage.local : null;
  }

  function alarmsApi() {
    var api = apiRoot();
    return api && api.alarms ? api.alarms : null;
  }

  function bridgeUrl(path) {
    var base = String(config.bridgeBaseUrl || ('http://127.0.0.1:' + (config.port || 27183)));
    var rawPath = String(path || '/');
    var sep = rawPath.indexOf('?') >= 0 ? '&' : '?';
    return base + rawPath + sep + 'token=' + encodeURIComponent(String(config.token || ''));
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function createId(prefix){
    return String(prefix || 'aq') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function callMaybePromise(invoke){
    try{
      var result = invoke();
      if(result && typeof result.then === 'function') return result;
    }catch(_e){}
    return null;
  }

  function storageGet(keys){
    var area = storageArea();
    if(!area) return Promise.resolve({});
    var promise = callMaybePromise(function(){ return area.get(keys); });
    if(promise) return promise.catch(function(){ return {}; });
    return new Promise(function(resolve){
      try{
        area.get(keys, function(items){ resolve(items || {}); });
      }catch(_e){ resolve({}); }
    });
  }

  function storageSet(values){
    var area = storageArea();
    if(!area) return Promise.resolve();
    var promise = callMaybePromise(function(){ return area.set(values); });
    if(promise) return promise.catch(function(){});
    return new Promise(function(resolve){
      try{ area.set(values, function(){ resolve(); }); }catch(_e){ resolve(); }
    });
  }

  function runtimeSendResponse(sendResponse, payload){
    try { sendResponse(payload); } catch (_e) {}
  }

  async function loadQueueState(){
    var items = await storageGet([QUEUE_KEY, QUEUE_MAP_KEY]);
    var queue = asArray(items[QUEUE_KEY]).filter(function(entry){
      return entry && typeof entry === 'object' && entry.id && entry.type;
    }).slice(-50);
    var workspaceMap = items[QUEUE_MAP_KEY] && typeof items[QUEUE_MAP_KEY] === 'object' ? items[QUEUE_MAP_KEY] : {};
    return {
      queue: queue,
      workspaceMap: workspaceMap
    };
  }

  async function saveQueueState(queue, workspaceMap){
    await storageSet({
      aqCaptureQueue: asArray(queue).slice(-50),
      aqWorkspaceIdMap: workspaceMap && typeof workspaceMap === 'object' ? workspaceMap : {}
    });
  }

  async function loadCachedTargets(){
    var items = await storageGet([TARGETS_KEY]);
    var cached = items && items[TARGETS_KEY];
    if(cached && Array.isArray(cached.workspaces)) return cached;
    return { workspaces: [] };
  }

  async function saveCachedTargets(targets){
    var safeTargets = targets && typeof targets === 'object' ? targets : { workspaces: [] };
    var payload = {};
    payload[TARGETS_KEY] = safeTargets;
    await storageSet(payload);
    return safeTargets;
  }

  function normalizePayload(payload){
    var source = payload && typeof payload === 'object' ? payload : {};
    var type = String(source.referenceType || '').trim().toLowerCase();
    if(type !== 'book' && type !== 'website' && type !== 'article') type = 'article';
    var detectedPublishedDate = String(source.detectedPublishedDate || '').trim();
    var detectedYear = String(source.detectedYear || '').trim();
    if(!detectedYear && detectedPublishedDate){
      var yearMatch = detectedPublishedDate.match(/\b(19|20)\d{2}\b/);
      if(yearMatch && yearMatch[0]) detectedYear = yearMatch[0];
    }
    return {
      referenceType: type,
      sourcePageUrl: String(source.sourcePageUrl || '').trim(),
      pageTitle: String(source.pageTitle || '').trim(),
      doi: String(source.doi || '').trim(),
      pdfUrl: String(source.pdfUrl || '').trim(),
      detectedTitle: String(source.detectedTitle || '').trim(),
      detectedAuthors: Array.isArray(source.detectedAuthors) ? source.detectedAuthors.slice(0, 12) : [],
      detectedJournal: String(source.detectedJournal || '').trim(),
      detectedPublisher: String(source.detectedPublisher || '').trim(),
      detectedWebsiteName: String(source.detectedWebsiteName || '').trim(),
      detectedEdition: String(source.detectedEdition || '').trim(),
      detectedPublishedDate: detectedPublishedDate,
      detectedAccessedDate: String(source.detectedAccessedDate || '').trim(),
      detectedYear: detectedYear,
      detectedAbstract: String(source.detectedAbstract || '').trim(),
      detectionMeta: source.detectionMeta && typeof source.detectionMeta === 'object' ? source.detectionMeta : {},
      selectedWorkspaceId: String(source.selectedWorkspaceId || '').trim(),
      selectedComparisonId: String(source.selectedComparisonId || '').trim(),
      browserSource: String(source.browserSource || '').trim(),
      timestamp: Number(source.timestamp) > 0 ? Number(source.timestamp) : Date.now()
    };
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

  async function sendHello(reason) {
    var runtime = runtimeApi();
    var version = runtime && typeof runtime.getManifest === 'function'
      ? String((runtime.getManifest() || {}).version || '')
      : '';
    try {
      return await bridgeFetch('/hello', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8'
        },
        body: JSON.stringify({
          extensionVersion: version,
          protocolVersion: 1,
          browserFamily: String(config.browserFamily || ''),
          browserName: String(config.browserLabel || ''),
          reason: String(reason || ''),
          timestamp: Date.now()
        })
      });
    } catch (_e) {
      return null;
    }
  }

  async function refreshTargets(reason){
    var hello = await sendHello(reason || 'targets');
    if(!(hello && hello.ok)){
      return { ok: false, offline: true, targets: await loadCachedTargets() };
    }
    var targets = await bridgeFetch('/targets');
    await saveCachedTargets(targets);
    return { ok: true, targets: targets };
  }

  function markReady() {
    try {
      var runtime = runtimeApi();
      var version = runtime && typeof runtime.getManifest === 'function'
        ? String((runtime.getManifest() || {}).version || '')
        : '';
      storageSet((function(){
        var data = {};
        data[READY_KEY] = true;
        data[VERSION_KEY] = version;
        return data;
      })());
    } catch (_e) {}
  }

  function listPendingWorkspaces(queue){
    return asArray(queue).filter(function(entry){
      return entry && entry.type === 'workspace_create' && entry.clientWorkspaceId;
    }).map(function(entry){
      return {
        id: String(entry.clientWorkspaceId || ''),
        name: String(entry.name || 'Yeni Workspace'),
        pending: true
      };
    });
  }

  async function queueCapture(payload){
    var normalized = normalizePayload(payload);
    var state = await loadQueueState();
    state.queue.push({
      id: createId('cap'),
      type: 'capture',
      createdAt: Date.now(),
      attemptCount: 0,
      payload: normalized
    });
    await saveQueueState(state.queue, state.workspaceMap);
    scheduleSyncAlarm();
    flushQueue('queue-capture').catch(function(){});
    return {
      ok: true,
      queued: true,
      pendingCount: state.queue.length,
      message: 'Kaynak extension kuyruğuna alındı. AcademiQ açıldığında otomatik senkronize edilecek.'
    };
  }

  async function queueWorkspace(name){
    var trimmed = String(name || '').trim();
    if(!trimmed) return { ok: false, error: 'Workspace adı gerekli.' };
    var state = await loadQueueState();
    var existingPending = listPendingWorkspaces(state.queue).find(function(item){
      return String(item.name || '').toLowerCase() === trimmed.toLowerCase();
    });
    if(existingPending){
      return {
        ok: true,
        queued: true,
        workspace: existingPending,
        pendingCount: state.queue.length,
        message: 'Workspace zaten senkronizasyon kuyruğunda.'
      };
    }
    var clientWorkspaceId = createId('pending_ws');
    var workspace = { id: clientWorkspaceId, name: trimmed, pending: true };
    state.queue.push({
      id: createId('ws'),
      type: 'workspace_create',
      createdAt: Date.now(),
      attemptCount: 0,
      clientWorkspaceId: clientWorkspaceId,
      name: trimmed
    });
    await saveQueueState(state.queue, state.workspaceMap);
    scheduleSyncAlarm();
    flushQueue('queue-workspace').catch(function(){});
    return {
      ok: true,
      queued: true,
      workspace: workspace,
      pendingCount: state.queue.length,
      message: 'Workspace isteği kuyruğa alındı. AcademiQ açıldığında oluşturulacak.'
    };
  }

  async function getQueueState(){
    var state = await loadQueueState();
    return {
      ok: true,
      pendingCount: state.queue.length,
      pendingWorkspaces: listPendingWorkspaces(state.queue)
    };
  }

  async function flushQueue(reason){
    var queueState = await loadQueueState();
    var queue = queueState.queue.slice();
    var workspaceMap = Object.assign({}, queueState.workspaceMap || {});
    if(!queue.length) return { ok: true, flushed: 0 };
    var hello = await sendHello(reason || 'sync');
    if(!(hello && hello.ok)){
      scheduleSyncAlarm();
      return { ok: false, flushed: 0, offline: true };
    }
    var nextQueue = [];
    var flushed = 0;
    for(var index = 0; index < queue.length; index += 1){
      var entry = queue[index];
      if(!entry || !entry.type){
        continue;
      }
      try{
        if(entry.type === 'workspace_create'){
          var workspaceResult = await bridgeFetch('/workspace', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify({ name: String(entry.name || '') })
          });
          if(workspaceResult && workspaceResult.ok && workspaceResult.workspace && workspaceResult.workspace.id){
            workspaceMap[String(entry.clientWorkspaceId || '')] = String(workspaceResult.workspace.id || '');
            flushed += 1;
            continue;
          }
        } else if(entry.type === 'capture'){
          var payload = normalizePayload(entry.payload || {});
          if(payload.selectedWorkspaceId && workspaceMap[payload.selectedWorkspaceId]){
            payload.selectedWorkspaceId = workspaceMap[payload.selectedWorkspaceId];
          }
          var captureResult = await bridgeFetch('/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify(payload)
          });
          if(captureResult && captureResult.ok){
            flushed += 1;
            continue;
          }
        }
      }catch(_error){}
      entry.attemptCount = Number(entry.attemptCount || 0) + 1;
      nextQueue.push(entry);
    }
    await saveQueueState(nextQueue, workspaceMap);
    try { await refreshTargets('post-flush'); } catch (_e) {}
    if(nextQueue.length) {
      scheduleSyncAlarm();
    } else {
      clearSyncAlarm();
    }
    return { ok: true, flushed: flushed, remaining: nextQueue.length };
  }

  function scheduleSyncAlarm(){
    var alarms = alarmsApi();
    if(!alarms) return;
    try{
      alarms.create(ALARM_NAME, { delayInMinutes: 0.2, periodInMinutes: 1 });
    }catch(_e){}
  }

  function clearSyncAlarm(){
    var alarms = alarmsApi();
    if(!alarms || typeof alarms.clear !== 'function') return;
    try{ alarms.clear(ALARM_NAME); }catch(_e){}
  }

  function bindRuntimeMessages(){
    var runtime = runtimeApi();
    if(!runtime || !runtime.onMessage || typeof runtime.onMessage.addListener !== 'function') return;
    runtime.onMessage.addListener(function(message, _sender, sendResponse){
      var type = message && message.type ? String(message.type) : '';
      if(type === 'AQ_QUEUE_CAPTURE'){
        queueCapture(message.payload || {}).then(function(result){
          runtimeSendResponse(sendResponse, result);
        }).catch(function(error){
          runtimeSendResponse(sendResponse, { ok: false, error: error && error.message ? error.message : 'Queue failed' });
        });
        return true;
      }
      if(type === 'AQ_QUEUE_WORKSPACE'){
        queueWorkspace(message.name || '').then(function(result){
          runtimeSendResponse(sendResponse, result);
        }).catch(function(error){
          runtimeSendResponse(sendResponse, { ok: false, error: error && error.message ? error.message : 'Queue failed' });
        });
        return true;
      }
      if(type === 'AQ_GET_QUEUE_STATE'){
        getQueueState().then(function(result){
          runtimeSendResponse(sendResponse, result);
        }).catch(function(){
          runtimeSendResponse(sendResponse, { ok: false, pendingCount: 0, pendingWorkspaces: [] });
        });
        return true;
      }
      if(type === 'AQ_GET_TARGETS'){
        refreshTargets('popup-targets').then(function(result){
          if(result && result.ok){
            runtimeSendResponse(sendResponse, { ok: true, targets: result.targets || { workspaces: [] }, live: true });
            return;
          }
          loadCachedTargets().then(function(cached){
            runtimeSendResponse(sendResponse, { ok: true, targets: cached || { workspaces: [] }, live: false });
          });
        }).catch(function(){
          loadCachedTargets().then(function(cached){
            runtimeSendResponse(sendResponse, { ok: true, targets: cached || { workspaces: [] }, live: false });
          });
        });
        return true;
      }
      if(type === 'AQ_FLUSH_QUEUE'){
        flushQueue('manual').then(function(result){
          runtimeSendResponse(sendResponse, result);
        }).catch(function(error){
          runtimeSendResponse(sendResponse, { ok: false, error: error && error.message ? error.message : 'Flush failed' });
        });
        return true;
      }
      return false;
    });
  }

  function bindLifecycle(){
    var runtime = runtimeApi();
    if(runtime && runtime.onInstalled && typeof runtime.onInstalled.addListener === 'function'){
      try{
        runtime.onInstalled.addListener(function(){
          markReady();
          scheduleSyncAlarm();
          refreshTargets('installed').catch(function(){});
          flushQueue('installed').catch(function(){});
        });
      }catch(_e){}
    }
    if(runtime && runtime.onStartup && typeof runtime.onStartup.addListener === 'function'){
      try{
        runtime.onStartup.addListener(function(){
          markReady();
          scheduleSyncAlarm();
          refreshTargets('startup').catch(function(){});
          flushQueue('startup').catch(function(){});
        });
      }catch(_e){}
    }
    var alarms = alarmsApi();
    if(alarms && alarms.onAlarm && typeof alarms.onAlarm.addListener === 'function'){
      try{
        alarms.onAlarm.addListener(function(alarm){
          if(!alarm || alarm.name !== ALARM_NAME) return;
          refreshTargets('alarm').catch(function(){});
          flushQueue('alarm').catch(function(){});
        });
      }catch(_e){}
    }
  }

  bindRuntimeMessages();
  bindLifecycle();
  markReady();
  scheduleSyncAlarm();
  refreshTargets('background').catch(function(){});
  flushQueue('background').catch(function(){});
})();
