window.__aqLegacyRuntimePhase='start';
if(typeof pdfjsLib!=='undefined'&&pdfjsLib&&pdfjsLib.GlobalWorkerOptions){
  pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.min.js';
}

// ¦¦ TIPTAP EDITOR ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
var editor = null;

// ¦¦ STATE ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
var S={
  wss:[{id:'ws1',name:'Çalışma Alanı 1',lib:[],docId:'doc1'}],
  cur:'ws1',
  notebooks:[{id:'nb1',name:'Genel Notlar'}],
  curNb:'nb1',
  notes:[],  // {id, nbId, type, txt, q, src, rid, tag, dt, hlColor}
  doc:'',
  cm:'inline',
  docs:[{id:'doc1',name:'Çalışma Alanı 1',content:'',bibliographyHTML:'',bibliographyManual:false,coverHTML:'',tocHTML:''}],
  curDoc:'doc1',
  showPageNumbers:false,
  customLabels:[]
};
var defaultLabels=[
  {name:'Okudum',color:'#4caf50'},
  {name:'Önemli',color:'#f44336'},
  {name:'Metodoloji',color:'#2196f3'},
  {name:'Teori',color:'#9c27b0'},
  {name:'Sonra Oku',color:'#ff9800'},
  {name:'Tezde Kullan',color:'#e91e63'}
];
var activeLabelFilter=null;
var activeCollectionFilter='all';
var labelFilterPanelOpen=false;
var noteViewFilters={type:'all',usage:'all',tag:'',refId:'all'};

var pdfDoc=null,pdfPg=1,pdfTotal=0,pdfScale=0,curRef=null; // 0=auto
var pdfTabs=[],activeTabId=null; // {id,title,refId,pdfData,scrollPos,hlData,annots}
var pdfCompareMode=false;
var pdfCompareSecondaryTabId=null;
var pdfCompareSyncScroll=false;
var pdfCompareSyncTimer=null;
var pdfCompareSyncState={left:null,right:null,driver:''};
var pdfCompareBlobUrls={left:'',right:''};
var pdfOcrStateByTab={};
var pdfOcrProbeToken=0;
var pdfOcrRunToken=0;
var pdfOcrAutoTimer=0;
var trigOn=false,trigIdx=-1,savedRange=null;
var trigSelected=[]; // çoklu atıf seçim listesi
var editorTrigRange=null;
var hlColor='#fef08a';
var selText='',selPageNum=1,selRangeObj=null;
var hlData=[]; // [{page,color,rects}] — highlight kalıcı veri
var syncTimer=null,syncDirty=false,syncInFlight=null;
var editorDraftTimer=null,editorDraftInFlight=false,editorDraftQueued=false;
var citationBatchBusy=false;
var oaBatchBusy=false;
var addDoiBusy=false;
var workspaceMutationBusy=false;
var switchWsBusy=false;
var relatedPanelCollapsed=false;
var webRelatedRuntime={
  token:0,
  activeSeedKey:'',
  loadingSeedKey:'',
  items:[],
  error:'',
  statusText:'',
  resultMap:{},
  cache:null
};
var pdfRenderTokenId=0;
var currentPdfRenderToken=null;
var pdfFetchToken=0;
var duplicateReviewState={groups:[],dismissedByWs:{}};
var trackReviewBarRuntime={raf:0,bound:false};


// ¦¦ SYNC ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function setSL(msg,cls){
  var e=document.getElementById('synclbl');
  if(!e)return;
  if(!msg){
    e.textContent='';
    e.className='';
    e.removeAttribute('data-state');
    return;
  }
  var text=String(msg||'').trim();
  var parts=text.split('|').map(function(part){return String(part||'').trim();}).filter(Boolean);
  var main=parts[0]||text;
  var sub=parts.length>1?parts.slice(1).join(' | '):'';
  e.textContent='';
  e.className=(cls?String(cls):'')+' show'+(sub?' has-sub':'');
  e.setAttribute('data-state',cls?String(cls):'');
  var mainSpan=document.createElement('span');
  mainSpan.className='aq-sync-main';
  mainSpan.textContent=main;
  e.appendChild(mainSpan);
  if(sub){
    var subSpan=document.createElement('span');
    subSpan.className='aq-sync-sub';
    subSpan.textContent=sub;
    e.appendChild(subSpan);
  }
}
var autosaveState={
  dirty:false,
  saving:false,
  lastSavedAt:0,
  lastError:'',
  lastRecoveredAt:0
};
var lastAppInfoSnapshot=null;
var docHistoryRuntime={docId:'',docName:'',snapshots:[]};
var docOutlineRuntime={entries:[],filter:'all',query:'',activeId:''};
var docOutlineRefreshTimer=null;
var captionManagerRuntime={entries:[]};
function formatAutosaveTime(ts){
  var n=Number(ts||0);
  if(!(n>0))return '';
  try{return new Date(n).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});}catch(_e){return '';}
}
function formatAutosaveDateTime(ts){
  var n=Number(ts||0);
  if(!(n>0))return '';
  try{
    return new Date(n).toLocaleString('tr-TR',{
      day:'2-digit',
      month:'2-digit',
      year:'numeric',
      hour:'2-digit',
      minute:'2-digit'
    });
  }catch(_e){return '';}
}
function escapeHTML(text){
  return String(text||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function hideRecoveryBanner(){
  var el=document.getElementById('recoveryBanner');
  if(!el)return;
  el.classList.remove('show');
}
function showRecoveryBanner(message){
  var wrap=document.getElementById('recoveryBanner');
  var textEl=document.getElementById('recoveryBannerText');
  var closeBtn=document.getElementById('recoveryBannerClose');
  if(!wrap||!textEl)return;
  textEl.textContent=String(message||'Son guvenli kayit geri yuklendi.');
  wrap.classList.add('show');
  if(closeBtn&&!closeBtn.__aqBound){
    closeBtn.__aqBound=true;
    closeBtn.addEventListener('click',hideRecoveryBanner);
  }
}
function renderDataSafetySummary(info){
  var summaryEl=document.getElementById('dataSafetySummary');
  var detailEl=document.getElementById('dataSafetyDetail');
  if(!summaryEl||!detailEl)return;
  var appInfo=info&&typeof info==='object'?info:(lastAppInfoSnapshot||{});
  var session=appInfo&&appInfo.sessionState&&typeof appInfo.sessionState==='object'?appInfo.sessionState:{};
  var summary='Autosave hazir';
  var details=[];
  if(autosaveState.lastError){
    summary='Kaydetme hatasi algilandi';
    details.push('Son hata: '+String(autosaveState.lastError));
  }else if(autosaveState.saving){
    summary='Kaydediliyor...';
    details.push('Degisiklikler guvenli sekilde diske yaziliyor.');
  }else if(autosaveState.dirty){
    summary='Kaydedilmemis degisiklik var';
    details.push('Editor sessizlestiginde autosave devreye girecek.');
  }else if(autosaveState.lastSavedAt>0){
    summary='Son guvenli kayit '+formatAutosaveTime(autosaveState.lastSavedAt);
    details.push('Degisiklikler yerel recovery snapshot ile korunuyor.');
  }else if(Number(session.lastSavedAt||0)>0){
    summary='Son guvenli kayit '+formatAutosaveTime(session.lastSavedAt);
    details.push('Son kayit uygulama verisine yazildi.');
  }else{
    details.push('Autosave editor, kutuphane ve workspace degisikliklerini korur.');
  }
  if(autosaveState.lastRecoveredAt>0){
    details.unshift('Beklenmeyen kapanis sonrasi son guvenli kayit geri yuklendi.');
  }else if(session.previousCleanExit===false){
    details.unshift('Onceki oturum temiz kapanmadi; recovery snapshot hazir tutuldu.');
  }
  if(Number(session.lastSavedAt||0)>0 && autosaveState.lastSavedAt<=0){
    details.push('Diskteki son kayit: '+formatAutosaveTime(session.lastSavedAt));
  }
  var draft=appInfo&&appInfo.editorDraft&&typeof appInfo.editorDraft==='object'?appInfo.editorDraft:null;
  if(draft&&draft.exists){
    if(draft.valid&&draft.recoverableAfterUncleanShutdown){
      details.push('Crash recovery draft hazir: '+formatAutosaveDateTime(draft.updatedAt));
    }else if(draft.valid&&draft.isNewerThanLastSave){
      details.push('Son draft diskte hazir: '+formatAutosaveDateTime(draft.updatedAt));
    }else if(!draft.valid){
      details.push('Draft dosyasi gecersiz gorunuyor; normal autosave verisi korunuyor.');
    }
  }
  summaryEl.textContent=summary;
  detailEl.textContent=details.join(' ');
  var historyEl=document.getElementById('dataSafetyHistoryMeta');
  if(historyEl){
    var history=appInfo&&appInfo.documentHistory&&typeof appInfo.documentHistory==='object'?appInfo.documentHistory:{};
    var docCount=Number(history.docCount||0);
    var snapshotCount=Number(history.snapshotCount||0);
    var latestText=formatAutosaveDateTime(history.latestSnapshotAt||0);
    if(snapshotCount>0){
      historyEl.textContent='Belge gecmisi hazir: '+snapshotCount+' snapshot, '+docCount+' belge' + (latestText ? (' • Son snapshot '+latestText) : '');
    }else{
      historyEl.textContent='Belge gecmisi henuz olusmadi. Ilk snapshot autosave ile olusacak.';
    }
  }
}
function normalizeToolbarMenuButtonLabels(){
  var labels={
    tbInsertMenuBtn:'Ekle',
    tbExportMenuBtn:'Dışa Aktar',
    settingsBtn:'Ayarlar'
  };
  Object.keys(labels).forEach(function(id){
    var el=document.getElementById(id);
    if(!el)return;
    var expected=labels[id];
    if(el.textContent!==expected) el.textContent=expected;
    if(el.__aqLabelGuardInstalled)return;
    el.__aqLabelGuardInstalled=true;
    try{
      var observer=new MutationObserver(function(){
        if(el.textContent!==expected) el.textContent=expected;
      });
      observer.observe(el,{childList:true,characterData:true,subtree:true});
      el.__aqLabelObserver=observer;
    }catch(_e){}
  });
}
function resetTransientChrome(){
  try{
    document.querySelectorAll('.modal-bg.show').forEach(function(el){
      el.classList.remove('show');
    });
    document.querySelectorAll('.ddm.open').forEach(function(el){
      el.classList.remove('open');
    });
    var ids=['ctxmenu','ctxlabelpanel','trig','hltip'];
    ids.forEach(function(id){
      var el=document.getElementById(id);
      if(!el)return;
      el.classList.remove('show');
      if(el.style){
        if(id==='ctxmenu' || id==='ctxlabelpanel' || id==='trig' || id==='hltip'){
          el.style.display='none';
        }
      }
    });
    if(document.body && document.body.style){
      document.body.style.pointerEvents='';
    }
  }catch(_e){}
}
function setAutosaveDirty(){
  autosaveState.dirty=true;
  if(!autosaveState.saving)setSL('Kaydedilmedi','ld');
  renderDataSafetySummary();
}
function setAutosaveSaving(){
  autosaveState.saving=true;
  setSL('Kaydediliyor...','ld');
  renderDataSafetySummary();
}
function setAutosaveSaved(){
  autosaveState.dirty=false;
  autosaveState.saving=false;
  autosaveState.lastError='';
  autosaveState.lastSavedAt=Date.now();
  setSL('Kaydedildi | '+(formatAutosaveTime(autosaveState.lastSavedAt)||'simdi'),'ok');
  renderDataSafetySummary();
}
function setAutosaveError(message){
  autosaveState.saving=false;
  autosaveState.lastError=String(message||'Kaydetme hatasi');
  setSL('Kaydetme hatasi','er');
  renderDataSafetySummary();
}
function logStability(scope,error,meta){
  try{
    if(window.AQStability&&typeof window.AQStability.capture==='function'){
      window.AQStability.capture(scope,error,meta||null);
    }
  }catch(_e){}
}

async function syncLoad(){
  window.__aqLegacyRuntimePhase='syncLoad';
  var d=null;
  // Electron: dosyadan oku
  if(typeof window.electronAPI!=='undefined'){
    try{
      setSL('v yükleniyor...','ld');
      var res=await window.electronAPI.loadData();
      if(res.ok&&res.data)d=JSON.parse(res.data);
      if(res.dir)document.title='AcademiQ — '+res.dir;
      if(res.recoveredFromDraft){
        autosaveState.lastRecoveredAt=Date.now();
        showRecoveryBanner('Beklenmeyen kapanis sonrasi kaydedilmemis son draft geri yuklendi.');
        setSL('Beklenmeyen kapanış sonrası son draft yüklendi','ld');
        setTimeout(function(){if(!autosaveState.dirty&&!autosaveState.saving)setSL('Kaydedildi','ok');},4500);
      }else if(res.recoveredFromRecovery){
        autosaveState.lastRecoveredAt=Date.now();
        showRecoveryBanner('Beklenmeyen kapanis sonrasi son autosave yuklendi.');
        setSL('Beklenmeyen kapanış sonrası son autosave yüklendi','ld');
        setTimeout(function(){if(!autosaveState.dirty&&!autosaveState.saving)setSL('Kaydedildi','ok');},4500);
      }else if(res.restoredFromBackup){
        showRecoveryBanner('Ana veri dosyasi bozuldugu icin son yedek yuklendi.');
        setSL('Yedek veri dosyasi yuklendi','ld');
        setTimeout(function(){if(!autosaveState.dirty&&!autosaveState.saving)setSL('Kaydedildi','ok');},4000);
      }else if(res.uncleanShutdown){
        autosaveState.lastRecoveredAt=Date.now();
        showRecoveryBanner('Onceki oturum temiz kapanmadi. Son guvenli kayit geri yuklendi.');
        setSL('Beklenmeyen kapanış sonrası oturum geri yüklendi','ld');
        setTimeout(function(){if(!autosaveState.dirty&&!autosaveState.saving)setSL('Kaydedildi','ok');},3500);
      }else{
      setSL('Kaydedildi','ok');
      }
      renderDataSafetySummary();
    }catch(e){
      logStability('syncLoad.electron',e);
      setAutosaveError(e&&e.message?e.message:'Yukleme hatasi');
    }
  } else if(typeof window.storage!=='undefined'){
    try{setSL('v yükleniyor...','ld');var res2=await window.storage.get('aq_v2');if(res2&&res2.value)d=JSON.parse(res2.value);setSL('','');}catch(e){logStability('syncLoad.storage',e);setSL('','');}
  }
  if(!d){
    try{var ls=localStorage.getItem('aqR2');if(ls)d=JSON.parse(ls);}catch(e){logStability('syncLoad.localStorage',e);}
    // If we got data from Electron file but it was empty, don't fallback to stale localStorage
    if(typeof window.electronAPI!=='undefined' && d){
      try{localStorage.removeItem('aqR2');}catch(e){}
    }
  }
  if(d&&d.wss){
    if(window.AQStateSchema&&typeof window.AQStateSchema.hydrate==='function'){
      S=window.AQStateSchema.hydrate(d,{sanitize:sanitizeDocHTML});
    }else{
      S=d;
      normalizeLoadedState();
      if(!S.notebooks||!S.notebooks.length)S.notebooks=[{id:'nb1',name:'Genel Notlar'}];
      if(!S.curNb)S.curNb=S.notebooks[0].id;
    }
    // PDF'leri yükle
    if(typeof window.electronAPI!=='undefined'){
      try{await window.electronAPI.pdfSyncAll();}catch(e){logStability('syncLoad.pdfSyncAll',e);}
      // Electron: dosya sisteminden
      for(var wi=0;wi<S.wss.length;wi++){
        var lib=S.wss[wi].lib||[];
        for(var ri=0;ri<lib.length;ri++){
          var r=lib[ri];
          try{await hydrateRefPDF(r);}catch(e){logStability('syncLoad.hydrateRefPDF',e,{refId:r&&r.id?r.id:null});}
        }
      }
    } else {
      try{
        var pm=JSON.parse(localStorage.getItem('aqPDF2')||'{}');
        if(window.AQSyncState&&typeof window.AQSyncState.applyPDFCacheMap==='function'){
          window.AQSyncState.applyPDFCacheMap(S.wss,pm);
        }else{
          S.wss.forEach(function(ws){(ws.lib||[]).forEach(function(r){if(pm[r.id])r.pdfData=pm[r.id];});});
        }
      }catch(e){logStability('syncLoad.localPDFCache',e);}
    }
    S.wss.forEach(function(ws){
      (ws.lib||[]).forEach(function(ref){
        if(ref.pdfData||ref.pdfUrl)return;
        var eq=findEquivalentRef(ref);
        if(eq){
          if(eq.pdfData)ref.pdfData=eq.pdfData;
          if(eq.pdfUrl)ref.pdfUrl=eq.pdfUrl;
          if(eq.url&&!ref.url)ref.url=eq.url;
        }
      });
    });
  }
  if(!S.wss||!S.wss.length)S.wss=[{id:'ws1',name:'Çalışma Alanı 1',lib:[],docId:'doc1'}];
  if(!S.cur)S.cur=S.wss[0].id;
  if(!S.notebooks||!S.notebooks.length)S.notebooks=[{id:'nb1',name:'Genel Notlar'}];
  if(!S.curNb)S.curNb=S.notebooks[0].id;
  // Only run ensureWorkspaceDocs if hydrate was NOT used (hydrate already handles workspace-doc linking)
  if(!(window.AQStateSchema&&typeof window.AQStateSchema.hydrate==='function')){
    ensureWorkspaceDocs();
  }else{
    (S.docs||[]).forEach(ensureDocAuxFields);
  }
  var repairedArtifacts=repairWorkspaceScopedDocArtifacts();
  var scopedWs=(S.wss||[]).find(function(ws){return ws&&ws.id===S.cur;})||(S.wss&&S.wss[0])||null;
  if(scopedWs&&scopedWs.docId)S.curDoc=scopedWs.docId;
  if(typeof S.showPageNumbers==='undefined')S.showPageNumbers=false;
  if(!S.customLabels)S.customLabels=[];
  ensureStableState('syncLoad.after');
  // Load current doc content — clean legacy page-break elements BEFORE setting innerHTML
  var curD=S.docs.find(function(d){return d.id===S.curDoc;});
  var rawHTML=curD&&curD.content?curD.content:(S.doc||'');
  // Strip shell wrappers from saved content (legacy bug fix)
  rawHTML=sanitizeDocHTML(rawHTML);
  if(window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.prepareLoadedHTML==='function'){
    rawHTML=window.AQTipTapWordDocument.prepareLoadedHTML(rawHTML,'<p></p>');
  }else if(window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.stripLegacyEditorArtifacts==='function'){
    rawHTML=window.AQTipTapWordDocument.stripLegacyEditorArtifacts(rawHTML);
  }else{
    rawHTML=rawHTML.replace(/<div[^>]*class="page-break[^"]*"[^>]*>[\s\S]*?<\/div>/gi,'');
    rawHTML=rawHTML.replace(/<div[^>]*class="page-top-spacer[^"]*"[^>]*>[\s\S]*?<\/div>/gi,'');
    rawHTML=rawHTML.replace(/<div[^>]*class="aq-page-sheet[^"]*"[^>]*>[\s\S]*?<\/div>/gi,'');
    rawHTML=rawHTML.replace(/<div[^>]*class="page-break-overlay[^"]*"[^>]*>[\s\S]*?<\/div>/gi,'');
    rawHTML=rawHTML.replace(/<div[^>]*class="page-number[^"]*"[^>]*>[\s\S]*?<\/div>/gi,'');
    rawHTML=rawHTML.replace(/<hr[^>]*class="pg-spacer"[^>]*\/?>/gi,'');
    rawHTML=rawHTML.replace(/<div[^>]*class="pg-spacer"[^>]*>[\s\S]*?<\/div>/gi,'');
  }
  applyCurrentEditorHTML(rawHTML,{normalize:false,layout:true,syncChrome:false,refreshTrigger:false});
  syncAuxiliaryPages();
  if(repairedArtifacts){
    syncDirty=true;
    setTimeout(function(){
      if(suppressDocSave||__aqDocSwitching)return;
      try{syncSave();}catch(e){}
    },900);
  }
}

function uid(){return 'x'+Date.now().toString(36)+Math.random().toString(36).slice(2);}
function repairWorkspaceScopedDocArtifacts(){
  var changed=false;
  (S.docs||[]).forEach(function(doc){
    if(!doc||typeof doc!=='object')return;
    ensureDocAuxFields(doc);
    var content=String(doc.content||'');
    var hasCitation=/class=(["'])[^"'<>]*\bcit\b[^"'<>]*\1/i.test(content)||/data-ref=(["'])[^"']+\1/i.test(content);
    var hasExternalBibliographyRefs=Array.isArray(doc.bibliographyExtraRefIds)&&doc.bibliographyExtraRefIds.length>0;
    if(!doc.bibliographyManual&&!hasCitation&&!hasExternalBibliographyRefs&&String(doc.bibliographyHTML||'').trim()){
      doc.bibliographyHTML='';
      doc.bibliographyManual=false;
      changed=true;
    }
    var hasHeading=/<h[1-5]\b/i.test(content);
    if(!hasHeading&&String(doc.tocHTML||'').trim()){
      doc.tocHTML='';
      changed=true;
    }
  });
  return changed;
}
function ensureWorkspaceDocs(){
  if(window.AQDocTabsState&&typeof window.AQDocTabsState.ensureWorkspaceDocsState==='function'){
    window.AQDocTabsState.ensureWorkspaceDocsState(S,{uid:uid,sanitize:sanitizeDocHTML});
    (S.docs||[]).forEach(ensureDocAuxFields);
    return;
  }
  if(!S.wss||!S.wss.length)S.wss=[{id:'ws1',name:'Çalışma Alanı 1',lib:[],docId:'doc1'}];
  if(!S.docs||!S.docs.length)S.docs=[{id:'doc1',name:(S.wss[0]&&S.wss[0].name)||'Belge 1',content:'<p></p>',bibliographyHTML:'',bibliographyManual:false,coverHTML:'',tocHTML:''}];
  S.wss.forEach(function(ws,idx){
    if(!ws.docId||!S.docs.some(function(doc){return doc.id===ws.docId;})){
      var doc=S.docs[idx]||{id:uid(),name:ws.name,content:'<p></p>'};
      if(!S.docs.some(function(existing){return existing.id===doc.id;}))S.docs.push(doc);
      ws.docId=doc.id;
      doc.name=ws.name;
    }
  });
  (S.docs||[]).forEach(ensureDocAuxFields);
  if(!S.cur||!S.wss.some(function(ws){return ws.id===S.cur;}))S.cur=S.wss[0].id;
  var currentWs=S.wss.find(function(ws){return ws.id===S.cur;})||S.wss[0];
  var currentDoc=currentWs&&S.docs.find(function(doc){return doc.id===currentWs.docId;});
  if(currentWs&&currentDoc){
    S.curDoc=currentDoc.id;
    S.doc=sanitizeDocHTML(currentDoc.content||'<p></p>');
  }
}
function ensureStableState(reason){
  var scope='state.repair'+(reason?'.'+String(reason):'');
  try{
    if(window.AQStateSchema&&typeof window.AQStateSchema.hydrate==='function'){
      S=window.AQStateSchema.hydrate(S||{},{sanitize:sanitizeDocHTML});
    }else{
      if(!S||typeof S!=='object')S={};
      normalizeLoadedState();
      ensureWorkspaceDocs();
    }
    (S.docs||[]).forEach(ensureDocAuxFields);
    if(!Array.isArray(S.notes))S.notes=[];
    if(!Array.isArray(S.notebooks)||!S.notebooks.length)S.notebooks=[{id:'nb1',name:'Genel Notlar'}];
    if(!S.curNb)S.curNb=S.notebooks[0].id;
    if(!Array.isArray(S.customLabels))S.customLabels=[];
    return true;
  }catch(e){
    logStability(scope,e);
    S={
      wss:[{id:'ws1',name:'Çalışma Alanı 1',lib:[],docId:'doc1'}],
      cur:'ws1',
      doc:'<p></p>',
      cm:'author-year',
      notes:[],
      notebooks:[{id:'nb1',name:'Genel Notlar'}],
      curNb:'nb1',
      docs:[{id:'doc1',name:'Çalışma Alanı 1',content:'<p></p>',bibliographyHTML:'',bibliographyManual:false,coverHTML:'',tocHTML:''}],
      curDoc:'doc1',
      showPageNumbers:false,
      customLabels:[]
    };
    return false;
  }
}
function switchWs(wsId){
  if(switchWsBusy)return;
  switchWsBusy=true;
  try{
  ensureStableState('switchWs.before');
  // 1. Save current doc content to its record BEFORE changing curDoc
  var oldHtml=getCurrentEditorHTML();
  oldHtml=sanitizeDocHTML(oldHtml);
  var oldDoc=(S.docs||[]).find(function(d){return d.id===S.curDoc;});
  if(oldDoc)oldDoc.content=oldHtml;

  // 2. Switch workspace
  var next=(window.AQDocTabsState&&typeof window.AQDocTabsState.switchWorkspaceState==='function')
    ? window.AQDocTabsState.switchWorkspaceState(S,wsId,{sanitize:sanitizeDocHTML})
    : null;
  if(!next){
    var ws=(S.wss||[]).find(function(entry){return entry&&entry.id===wsId;});
    if(!ws)return;
    S.cur=ws.id;
    S.curDoc=ws.docId;
    var doc=(S.docs||[]).find(function(entry){return entry&&entry.id===ws.docId;});
    if(doc){
      doc.name=ws.name;
      doc.content=sanitizeDocHTML(doc.content||__aqBlankDocHTML());
      S.doc=doc.content;
    }
  }

  // 3. Load new doc into editor through the unified document loader
  var active=(S.docs||[]).find(function(doc){return doc.id===S.curDoc;});
  var newHtml=active&&active.content?active.content:__aqBlankDocHTML();
  S.doc=newHtml;
  __aqSetEditorDoc(newHtml,false);
  applyCurrentDocTrackChangesMode({source:'switch-workspace'});

  // 4. Save and update UI
  save();
  rWS();rLib();switchWsPdfTabs();rDocTabs();uSt();
  setTimeout(function(){save();},260);
  }catch(e){
    logStability('switchWs',e,{wsId:wsId});
  }finally{
    setTimeout(function(){switchWsBusy=false;},80);
  }
}
function curWs(){return S.wss.find(function(x){return x.id===S.cur;})||null;}
function cLib(){var w=curWs();return w?w.lib:[];}
function normalizeRefDoi(value){
  var raw=String(value||'').trim();
  if(!raw)return '';
  try{raw=decodeURIComponent(raw);}catch(e){}
  raw=raw
    .replace(/^doi:\s*/i,'')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i,'')
    .replace(/[\u200B-\u200D\uFEFF]/g,'')
    .replace(/\s+/g,'')
    .replace(/[)\].,;:]+$/g,'');
  var m=raw.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  var doi=(m&&m[0])?m[0]:raw;
  doi=doi
    .replace(/[)\].,;:]+$/g,'')
    .replace(/(?:\/|\.)(BIBTEX|RIS|ABSTRACT|FULLTEXT|FULL|PDF|XML|HTML|EPUB)$/i,'')
    .replace(/\/[A-Za-z]$/,'')
    .trim();
  if(!/^10\.\d{4,9}\//i.test(doi))return '';
  return doi.toLowerCase();
}
function normalizeRefRecord(ref){
  if(!ref||typeof ref!=='object')return ref;
  var type=String(ref.referenceType||'').trim().toLowerCase();
  ref.referenceType=(type==='book'||type==='website'||type==='article')?type:'article';
  ref.title=String(ref.title||'').replace(/\s+/g,' ').trim();
  var y=String(ref.year||'').trim();
  var yMatch=y.match(/\b(19|20)\d{2}\b/);
  ref.year=yMatch?yMatch[0]:y;
  if(!ref.year&&ref.publishedDate){
    var py=String(ref.publishedDate||'').match(/\b(19|20)\d{2}\b/);
    if(py&&py[0])ref.year=py[0];
  }
  ref.doi=normalizeRefDoi(ref.doi||ref.url||'');
  ref.journal=String(ref.journal||'').replace(/\s+/g,' ').trim();
  ref.publisher=String(ref.publisher||'').replace(/\s+/g,' ').trim();
  ref.edition=String(ref.edition||'').replace(/\s+/g,' ').trim();
  ref.websiteName=String(ref.websiteName||'').replace(/\s+/g,' ').trim();
  ref.publishedDate=String(ref.publishedDate||'').replace(/\s+/g,' ').trim();
  ref.accessedDate=String(ref.accessedDate||'').replace(/\s+/g,' ').trim();
  ref.volume=String(ref.volume||'').replace(/\s+/g,' ').trim();
  ref.issue=String(ref.issue||'').replace(/\s+/g,' ').trim();
  ref.fp=String(ref.fp||'').replace(/\s+/g,' ').trim();
  ref.lp=String(ref.lp||'').replace(/\s+/g,' ').trim();
  ref.url=String(ref.url||'').replace(/\s+/g,' ').trim();
  ref.pdfUrl=String(ref.pdfUrl||'').replace(/\s+/g,' ').trim();
  ref.abstract=String(ref.abstract||'').trim();
  if(Array.isArray(ref.authors)){
    ref.authors=ref.authors.map(function(a){return String(a||'').replace(/\s+/g,' ').trim();}).filter(Boolean);
  }else{
    ref.authors=[];
  }
  if(!Array.isArray(ref.collectionIds))ref.collectionIds=[];
  ref.collectionIds=ref.collectionIds.map(function(id){return String(id||'').trim();}).filter(Boolean);
  if(ref.pdfVerification&&window.AQPDFVerification&&typeof window.AQPDFVerification.normalizeStoredVerification==='function'){
    try{ref.pdfVerification=window.AQPDFVerification.normalizeStoredVerification(ref.pdfVerification);}catch(_e){}
  }
  sanitizeRefPdfData(ref);
  return ref;
}
function normalizePdfVerification(value){
  if(window.AQPDFVerification&&typeof window.AQPDFVerification.normalizeStoredVerification==='function'){
    try{return window.AQPDFVerification.normalizeStoredVerification(value||null);}catch(_e){}
  }
  return value&&typeof value==='object'?value:null;
}
function setRefPdfVerification(ref,verification,url){
  if(!ref||!verification)return;
  ref.pdfVerification=normalizePdfVerification(verification);
  if(ref.pdfVerification&&url&&!ref.pdfVerification.finalUrl)ref.pdfVerification.finalUrl=String(url||'');
}
function propagatePdfVerification(ref,verification,url){
  if(!ref||!verification)return;
  setRefPdfVerification(ref,verification,url);
  S.wss.forEach(function(ws){
    (ws.lib||[]).forEach(function(cand){
      if(!cand||cand.id===ref.id)return;
      normalizeRefRecord(cand);
      if(!refsLikelySame(cand,ref))return;
      setRefPdfVerification(cand,verification,url);
    });
  });
}
function pdfVerificationBadgeMeta(ref){
  var verification=normalizePdfVerification(ref&&ref.pdfVerification||null);
  if(window.AQPDFVerification&&typeof window.AQPDFVerification.getBadgeMeta==='function'&&verification){
    try{return window.AQPDFVerification.getBadgeMeta(verification);}catch(_e){}
  }
  return null;
}
function pdfVerificationBadgeHTML(ref){
  var meta=pdfVerificationBadgeMeta(ref);
  if(!meta)return '';
  return '<span class="lbadge '+__escHtml(meta.className||'')+'" title="'+__escHtml(meta.title||'')+'">'+__escHtml(meta.label||'PDF')+'</span>';
}
function pdfVerificationSummaryText(ref){
  var verification=normalizePdfVerification(ref&&ref.pdfVerification||null);
  if(!verification)return '';
  return String(verification.summary||'').trim();
}
function refKey(ref){
  if(!ref)return'';
  var doi=normalizeRefDoi(ref.doi||'');
  if(doi)return'doi:'+doi;
  var type=normalizeRefTypeValue(ref.referenceType||'article');
  var title=String(ref.title||'').trim().replace(/\s+/g,' ').toLowerCase();
  var year=(ref.year||'').trim().toLowerCase();
  var author=(ref.authors&&ref.authors[0]?ref.authors[0]:'').trim().replace(/\s+/g,' ').toLowerCase();
  // Zayıf metadata çakışmalarında yanlış PDF yayılımını önlemek için
  // meta-key'i yalnızca yeterli sinyal varsa üret.
  if(title.length<8)return'id:'+String(ref.id||'');
  if(!author&&!year)return'id:'+String(ref.id||'');
  return 'meta:'+type+'|'+author+'|'+year+'|'+title;
}
function isStrongMetaRefKey(key){
  return typeof key==='string'&&key.indexOf('meta:')===0;
}
function refsLikelySame(a,b){
  if(!a||!b)return false;
  normalizeRefRecord(a);
  normalizeRefRecord(b);
  var aDoi=normalizeRefDoi(a.doi||'');
  var bDoi=normalizeRefDoi(b.doi||'');
  if(aDoi&&bDoi)return aDoi===bDoi;
  var aKey=refKey(a);
  var bKey=refKey(b);
  if(!isStrongMetaRefKey(aKey)||!isStrongMetaRefKey(bKey))return false;
  return aKey===bKey;
}
function dedupeRefs(refs){
  var seen={};
  return (refs||[]).filter(function(ref){
    var key=refKey(ref)||('id:'+(ref&&ref.id||''));
    if(seen[key])return false;
    seen[key]=true;
    return true;
  });
}
function findRef(id,wsId){
  if(wsId){
    var ws=S.wss.find(function(x){return x.id===wsId;});
    if(!ws)return null;
    return (ws.lib||[]).find(function(x){return x.id===id;})||null;
  }
  var local=findRef(id,S.cur);
  if(local)return local;
  for(var i=0;i<S.wss.length;i++){var r=(S.wss[i].lib||[]).find(function(x){return x.id===id;});if(r)return r;}
  return null;
}
function findEquivalentRef(ref,wsId){
  if(!ref)return null;
  var pools=wsId?[S.wss.find(function(x){return x.id===wsId;})].filter(Boolean):S.wss;
  for(var i=0;i<pools.length;i++){
    var lib=(pools[i].lib||[]);
    for(var j=0;j<lib.length;j++){
      var cand=lib[j];
      if(cand&&cand.id!==ref.id&&refsLikelySame(cand,ref))return cand;
    }
  }
  return null;
}
function persistBorrowedPDF(ref){
  if(!ref||!ref.id||!ref.pdfData||typeof window.electronAPI==='undefined')return;
  try{window.electronAPI.savePDF(ref.id,ref.pdfData).catch(function(){});}catch(e){}
}
function getPdfBufferByteLength(buffer){
  try{
    if(!buffer)return 0;
    if(typeof buffer.byteLength==='number')return Number(buffer.byteLength)||0;
    if(typeof buffer.length==='number')return Number(buffer.length)||0;
    if(buffer.buffer&&typeof buffer.buffer.byteLength==='number'&&typeof buffer.byteOffset==='number'&&typeof buffer.byteLength==='number'){
      return Number(buffer.byteLength)||0;
    }
  }catch(_e){}
  return 0;
}
function isUsablePdfData(buffer){
  try{
    var len=getPdfBufferByteLength(buffer);
    if(len<=32)return false;
    var view=null;
    if(buffer instanceof ArrayBuffer)view=new Uint8Array(buffer,0,Math.min(len,8));
    else if(typeof Uint8Array!=='undefined'&&buffer instanceof Uint8Array)view=buffer.subarray(0,Math.min(buffer.byteLength||buffer.length||0,8));
    else if(buffer&&buffer.buffer instanceof ArrayBuffer&&typeof buffer.byteOffset==='number'&&typeof buffer.byteLength==='number'){
      view=new Uint8Array(buffer.buffer,buffer.byteOffset,Math.min(buffer.byteLength,8));
    }
    if(!view||!view.length)return len>32;
    var head='';
    for(var i=0;i<view.length;i++)head+=String.fromCharCode(view[i]);
    if(head.indexOf('%PDF-')===0)return true;
    return len>1024;
  }catch(_e){}
  return false;
}
function sanitizeRefPdfData(ref){
  if(!ref||typeof ref!=='object')return false;
  if(!ref.pdfData)return false;
  return isUsablePdfData(ref.pdfData);
}
async function hydrateRefPDF(ref){
  if(!ref)return false;
  if(sanitizeRefPdfData(ref))return true;
  if(typeof window.electronAPI==='undefined')return false;
  try{
    var direct=await window.electronAPI.loadPDF(ref.id);
    if(direct&&direct.ok&&isUsablePdfData(direct.buffer)){
      ref.pdfData=direct.buffer;
      persistBorrowedPDF(ref);
      return true;
    }
  }catch(e){}
  for(var wi=0;wi<S.wss.length;wi++){
    var lib=S.wss[wi].lib||[];
    for(var ri=0;ri<lib.length;ri++){
      var cand=lib[ri];
      if(!cand||cand.id===ref.id||!refsLikelySame(cand,ref))continue;
      if(sanitizeRefPdfData(cand)){
        ref.pdfData=cand.pdfData;
        if(cand.pdfUrl&&!ref.pdfUrl)ref.pdfUrl=cand.pdfUrl;
        if(cand.url&&!ref.url)ref.url=cand.url;
        persistBorrowedPDF(ref);
        return true;
      }
      try{
        var res=await window.electronAPI.loadPDF(cand.id);
        if(res&&res.ok&&isUsablePdfData(res.buffer)){
          cand.pdfData=res.buffer;
          ref.pdfData=res.buffer;
          if(cand.pdfUrl&&!ref.pdfUrl)ref.pdfUrl=cand.pdfUrl;
          if(cand.url&&!ref.url)ref.url=cand.url;
          persistBorrowedPDF(ref);
          return true;
        }
      }catch(e){}
    }
  }
  return false;
}
function normalizeLoadedState(){
  if(!S||!Array.isArray(S.wss))S.wss=[];
  S.wss=S.wss.map(function(ws,idx){
    ws=ws||{};
    if(!ws.id)ws.id='ws'+(idx+1);
    if(!ws.name)ws.name='Çalışma Alanı '+(idx+1);
    if(!Array.isArray(ws.lib))ws.lib=[];
    var seen={};
    ws.lib=ws.lib.map(function(ref){
      ref=ref||{};
      if(!ref.id)ref.id=uid();
      if(!Array.isArray(ref.authors))ref.authors=(ref.authors?[String(ref.authors)]:[]);
      if(!Array.isArray(ref.labels))ref.labels=[];
      if(typeof ref.title!=='string')ref.title=ref.title?String(ref.title):'';
      if(typeof ref.year!=='string')ref.year=ref.year?String(ref.year):'';
      if(typeof ref.journal!=='string')ref.journal=ref.journal?String(ref.journal):'';
      if(typeof ref.doi!=='string')ref.doi=ref.doi?String(ref.doi):'';
      if(typeof ref.url!=='string')ref.url=ref.url?String(ref.url):'';
      if(typeof ref.pdfUrl!=='string')ref.pdfUrl=ref.pdfUrl?String(ref.pdfUrl):'';
      sanitizeRefPdfData(ref);
      return ref;
    }).filter(function(ref){
      var key=refKey(ref)||('id:'+ref.id);
      if(seen[key]){
        var existing=seen[key];
        if(!existing.pdfData&&ref.pdfData)existing.pdfData=ref.pdfData;
        if(!existing.pdfUrl&&ref.pdfUrl)existing.pdfUrl=ref.pdfUrl;
        if(!existing.url&&ref.url)existing.url=ref.url;
        return false;
      }
      seen[key]=ref;
      return true;
    });
    return ws;
  });
  S.wss.forEach(function(ws){
    (ws.lib||[]).forEach(function(ref){
      var eq=findEquivalentRef(ref);
      if(eq){
        if(!ref.pdfData&&sanitizeRefPdfData(eq))ref.pdfData=eq.pdfData;
        if(!ref.pdfUrl&&eq.pdfUrl)ref.pdfUrl=eq.pdfUrl;
        if(!ref.url&&eq.url)ref.url=eq.url;
        if(ref.pdfData)persistBorrowedPDF(ref);
      }
    });
  });
}
function authorSearchText(authors){
  return (authors||[]).map(function(author){
    var raw=(author||'').trim();
    if(!raw)return'';
    if(raw.includes(',')){
      var parts=raw.split(',');
      return (parts[0]+' '+(parts[1]||'')).toLowerCase();
    }
    return raw.toLowerCase();
  }).join(' ');
}
function filterRefsForQuery(refs,q){
  q=(q||'').toLowerCase().trim();
  refs=dedupeRefs(refs||[]);
  if(!q)return sortLib(refs);
  var tokens=q.split(/\s+/).filter(Boolean);
  return sortLib(refs.filter(function(r){
    var authors=(r.authors||[]);
    var authorHay=authorSearchText(authors);
    var compactAuthors=authors.join(' ').toLowerCase().replace(/[,\.\s]+/g,' ');
    var initials=authors.map(function(author){
      return String(author||'').replace(/,/g,' ').split(/\s+/).filter(Boolean).map(function(part){return part.charAt(0).toLowerCase();}).join('');
    }).join(' ');
    var hay=[
      r.title||'',
      authorHay,
      compactAuthors,
      initials,
      r.year||'',
      r.doi||'',
      r.journal||'',
      r.publisher||'',
      r.websiteName||'',
      r.referenceType||'',
      r.volume||'',
      r.issue||''
    ].join(' ').toLowerCase();
    return tokens.every(function(token){return hay.indexOf(token)>=0;});
  }));
}
function defaultNoteType(note){
  if(!note||typeof note!=='object')return 'summary';
  if(note.noteType&&typeof note.noteType==='string'&&note.noteType.trim())return note.noteType;
  return note.type==='hl'?'direct_quote':'summary';
}
function normalizeResearchNote(note){
  if(!note||typeof note!=='object')return note;
  note.noteType=String(defaultNoteType(note)||'summary').trim()||'summary';
  if(typeof note.sourceExcerpt!=='string'){
    note.sourceExcerpt=note.q?String(note.q):'';
  }
  if(typeof note.comment!=='string'){
    note.comment=note.txt?String(note.txt):'';
  }
  if(typeof note.sourcePage!=='string'){
    note.sourcePage=String(note.tag||'').trim();
  }
  note.inserted=!!note.inserted;
  return note;
}
function noteMatchesFilters(note){
  if(!note)return false;
  var typeFilter=String(noteViewFilters.type||'all');
  if(typeFilter!=='all'&&String(note.noteType||defaultNoteType(note))!==typeFilter)return false;
  var usageFilter=String(noteViewFilters.usage||'all');
  if(usageFilter==='used'&&!note.inserted)return false;
  if(usageFilter==='unused'&&note.inserted)return false;
  var tagFilter=String(noteViewFilters.tag||'').trim().toLowerCase();
  if(tagFilter){
    var hay=(String(note.tag||'')+' '+String(note.noteType||'')+' '+String(note.txt||'')+' '+String(note.q||'')).toLowerCase();
    if(hay.indexOf(tagFilter)<0)return false;
  }
  var refFilter=String(noteViewFilters.refId||'all');
  if(refFilter!=='all'&&String(note.rid||'')!==refFilter)return false;
  return true;
}
function curNotes(options){
  options=options||{};
  var applyFilters=options.applyFilters!==false;
  var notebookIds={};
  (S.notebooks||[]).forEach(function(nb){
    if(nb&&nb.id)notebookIds[nb.id]=true;
  });
  var fallbackNotebookId=S.curNb||((S.notebooks&&S.notebooks[0]&&S.notebooks[0].id)?S.notebooks[0].id:'');
  var repaired=false;
  var result=(S.notes||[]).filter(function(n){
    if(!n||typeof n!=='object')return false;
    var noteNbId=n.nbId||n.notebookId||n.nb||'';
    if(!noteNbId||!notebookIds[noteNbId]){
      if(fallbackNotebookId){
        n.nbId=fallbackNotebookId;
        repaired=true;
      }else{
        return false;
      }
    }
    if(n.nbId!==S.curNb)return false;
    normalizeResearchNote(n);
    return applyFilters?noteMatchesFilters(n):true;
  });
  if(repaired&&typeof save==='function'){
    try{save();}catch(_e){}
  }
  return result;
}

function rThemes(){
  return;
  if(!groups.length){
    groupsEl.innerHTML='<div style="color:var(--txt3);font-size:11px;padding:4px;">Tema olusturmak icin notlara etiket ekleyin.</div>';
    detailEl.innerHTML='<div style="color:var(--txt3);font-size:11px;padding:6px;line-height:1.5;">Notlarinizi etiketleyin (ornek: metodoloji, teori, bulgu). Tema gorunumu notlari otomatik gruplar.</div>';
    return;
  }
  var selectedId=getSelectedThemeId();
  if(!selectedId||!notesThemeSnapshot.groupsById[selectedId]){
    selectedId=groups[0].id;
    setSelectedThemeId(selectedId);
  }
  groupsEl.innerHTML=groups.map(function(group){
    var on=(group.id===selectedId)?' on':'';
    return '<button class="thchip'+on+'" data-theme-id="'+escTheme(group.id)+'">'
      +'<span>'+escTheme(group.label)+'</span>'
      +'<span class="thcount">'+group.count+'</span>'
      +'</button>';
  }).join('');

  var selected=notesThemeSnapshot.groupsById[selectedId];
  if(!selected){
    detailEl.innerHTML='';
    return;
  }
  var sourcePreview=selected.sources.slice(0,3).join(', ');
  var meta=''+selected.count+' not';
  if(selected.sources.length)meta+=' · '+selected.sources.length+' kaynak';
  if(sourcePreview)meta+='<br>'+escTheme(sourcePreview)+(selected.sources.length>3?' ...':'');

  var notesHTML=selected.notes.map(function(note,index){
    var key='note-'+index+'-'+(note.id||'na');
    notesThemeSnapshot.noteByKey[key]=note;
    var body=String(note.noteText||'').trim();
    var quote=String(note.quoteText||'').trim();
    var location=String(note.location||'').trim();
    var sourceLine=escTheme(note.source||'Kaynak belirtilmemis')+(location?' · '+escTheme(location):'');
    var hasSource=!!note.sourceId;
    var copyText=body||quote;
    return '<div class="thnote">'
      +'<div class="thsrc">'+sourceLine+'</div>'
      +(body?'<div class="thtxt">'+escTheme(body)+'</div>':'')
      +(quote?'<div class="thquote">'+escTheme(quote)+'</div>':'')
      +'<div class="ncacts">'
      +'<button class="ncb" data-note-action="copy-note" data-note-key="'+escTheme(key)+'"'+(copyText?'':' disabled')+'>Kopyala</button>'
      +'<button class="ncb" data-note-action="insert-note" data-note-key="'+escTheme(key)+'">Belgeye Ekle</button>'
      +'<button class="ncb" data-note-action="open-source" data-note-key="'+escTheme(key)+'"'+(hasSource?'':' disabled')+'>Kaynaga Git</button>'
      +'</div>'
      +'</div>';
  }).join('');

  detailEl.innerHTML=''
    +'<div class="thhead">'
      +'<div>'
        +'<div class="thtitle">'+escTheme(selected.label)+'</div>'
        +'<div class="thmeta">'+meta+'</div>'
      +'</div>'
      +'<div class="thacts">'
        +'<button class="ncb" data-theme-action="copy">Temayi Kopyala</button>'
        +'<button class="ncb" data-theme-action="insert-outline">Ozet Iskeleti Ekle</button>'
      +'</div>'
    +'</div>'
    +notesHTML;
}

// ¦¦ DOCUMENT TABS ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function rDocTabs(){
  ensureWorkspaceDocs();
  var bar=document.getElementById('doctabs');if(!bar)return;
  bar.innerHTML='';
  S.wss.forEach(function(ws){
    var doc=(S.docs||[]).find(function(entry){return entry&&entry.id===ws.docId;});
    if(!doc)return;
    var btn=document.createElement('button');
    btn.className='doctab'+(doc.id===S.curDoc?' on':'');
    var lbl=document.createElement('span');
    lbl.textContent=doc.name;
    btn.appendChild(lbl);
    if(S.wss.length>1){
      var cl=document.createElement('span');
      cl.className='dtclose';
      cl.textContent='×';
      cl.onclick=function(e){e.stopPropagation();delWs(ws.id);};
      btn.appendChild(cl);
    }
    btn.onclick=function(){switchWs(ws.id);};
    btn.oncontextmenu=function(e){e.preventDefault();showWsMenu(e.clientX,e.clientY,ws.id);};
    btn.ondblclick=function(){renameWs(ws.id);};
    bar.appendChild(btn);
  });
  var add=document.createElement('button');
  add.id='doctab-add';
  add.textContent='+';
  add.title='Yeni çalışma alanı';
  add.onclick=function(){promptAddWs();};
  bar.appendChild(add);
}
function nextDocName(){
  var n=1;
  var existNames=S.docs.map(function(d){return d.name;});
  while(existNames.indexOf('Belge '+n)!==-1)n++;
  return 'Belge '+n;
}
function createDoc(){
  customPrompt('Belge adı:',nextDocName()).then(function(name){
    name=(name||'').trim();
    if(!name)return;
    __aqCommitActiveDoc();
    var nd=window.AQDocTabsState&&typeof window.AQDocTabsState.createDocState==='function'
      ? window.AQDocTabsState.createDocState(S,name,{uid:uid,sanitize:sanitizeDocHTML})
      : {id:uid(),name:name,content:__aqBlankDocHTML(),bibliographyHTML:'',bibliographyManual:false,coverHTML:'',tocHTML:''};
    if(!nd)return;
    ensureDocAuxFields(nd);
    if(!(window.AQDocTabsState&&typeof window.AQDocTabsState.createDocState==='function')){
      S.docs=(S.docs||[]).concat([nd]);
      S.curDoc=nd.id;
      S.doc=nd.content;
    }
    __aqSetEditorDoc(nd.content,true);
    applyCurrentDocTrackChangesMode({source:'create-doc'});
    save();
  });
}
function switchDoc(docId){
  if(S.curDoc===docId&&S.docs&&S.docs.length)return;
  __aqCommitActiveDoc();
  var next=window.AQDocTabsState&&typeof window.AQDocTabsState.switchDocState==='function'
    ? window.AQDocTabsState.switchDocState(S,docId,{sanitize:sanitizeDocHTML})
    : (S.docs||[]).find(function(d){return d.id===docId;});
  if(!next)return;
  if(!(window.AQDocTabsState&&typeof window.AQDocTabsState.switchDocState==='function')){
    S.curDoc=docId;
    next.content=sanitizeDocHTML(next.content||__aqBlankDocHTML());
    S.doc=next.content;
  }
  __aqSetEditorDoc(next.content,true);
  applyCurrentDocTrackChangesMode({source:'switch-doc'});
  save();
}
function renameDoc(docId){
  var ws=S.wss.find(function(entry){return entry&&entry.docId===docId;});
  if(ws)renameWs(ws.id);
}
function deleteDoc(docId){
  var ws=S.wss.find(function(entry){return entry&&entry.docId===docId;});
  if(ws)delWs(ws.id);
}
function showDocMenu(x,y,docId){
  var ws=S.wss.find(function(entry){return entry&&entry.docId===docId;});
  if(ws)return showWsMenu(x,y,ws.id);
}
function renameWs(wsId){
  var ws=S.wss.find(function(entry){return entry&&entry.id===wsId;});
  if(!ws)return;
  customPrompt('Çalışma alanı adı:',ws.name).then(function(n){
    n=(n||'').trim();
    if(!n)return;
    ws.name=n;
    var doc=(S.docs||[]).find(function(entry){return entry&&entry.id===ws.docId;});
    if(doc)doc.name=n;
    save();
    rWS();
    rDocTabs();
  });
}
function showWsMenu(x,y,wsId){
  var menu=document.getElementById('ctxmenu');
  var ws=S.wss.find(function(entry){return entry&&entry.id===wsId;});
  if(!menu||!ws)return;
  menu.innerHTML='';
  [{label:'Yeniden Adlandır',fn:function(){renameWs(wsId);}},
   {label:'Çalışma alanını sil',fn:function(){delWs(wsId);}}].forEach(function(item){
    var btn=document.createElement('button');
    btn.className='ctxi';
    btn.textContent=item.label;
    btn.onclick=function(){hideCtx();item.fn();};
    menu.appendChild(btn);
  });
  menu.style.left=Math.min(x,window.innerWidth-220)+'px';
  menu.style.top=Math.min(y,window.innerHeight-120)+'px';
  menu.classList.add('show');
}
// ¦¦ APA 7 ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function fa(r){if(!r)return'';r=r.trim();if(r.includes(',')){var p=r.split(',');var l=p[0].trim();var rest=(p[1]||'').trim();if(!rest)return l;return l+', '+rest.split(/\s+/).filter(Boolean).map(function(n){return n[0].toUpperCase()+'.'}).join(' ');}var p=r.split(/\s+/);if(p.length===1)return p[0];var l=p[p.length-1];return l+', '+p.slice(0,-1).map(function(n){return n[0].toUpperCase()+'.'}).join(' ');}
function fal(a){if(!a||!a.length)return'';var f=a.map(fa).filter(Boolean);if(f.length===1)return f[0];if(f.length<=20)return f.slice(0,-1).join(', ')+' & '+f[f.length-1];return f.slice(0,19).join(', ')+', . . . & '+f[f.length-1];}
function fT(t){if(!t)return'';return t.toLowerCase().replace(/(^|\.\s+|:\s*)([a-zçğıöşüâîû])/g,function(m,p,c){return p+c.toUpperCase();});}
function apa7(d){
  d=d||{};
  var type=normalizeRefTypeValue(d.referenceType||'');
  var c='';
  var a=fal(d.authors||[]);
  if(!a&&d.title)a=fT(d.title);
  if(a)c+=a+' ';
  if(type==='book'){
    c+='('+(d.year||'t.y.')+'). ';
    if(d.title)c+='<i>'+fT(d.title).replace(/[.]+$/,'')+'</i>. ';
    if(d.edition)c+='('+(String(d.edition||'').replace(/[.]+$/,'')+(/\bed\.?$/i.test(String(d.edition||''))?'':' ed.'))+'). ';
    if(d.publisher)c+=String(d.publisher||'').replace(/[.]+$/,'')+'. ';
    if(d.doi)c+='https://doi.org/'+d.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i,'');
    else if(d.url)c+=d.url;
    return c.trim();
  }
  if(type==='website'){
    var dateLabel=d.publishedDate||d.year||'t.y.';
    c+='('+dateLabel+'). ';
    if(d.title)c+=fT(d.title)+'. ';
    if(d.websiteName)c+=String(d.websiteName||'').replace(/[.]+$/,'')+'. ';
    if(d.accessedDate&&d.url)c+='Retrieved '+d.accessedDate+', from '+d.url;
    else if(d.url)c+=d.url;
    return c.trim();
  }
  c+='('+(d.year||'t.y.')+('). ');
  c+=fT(d.title||'')+'. ';
  if(d.journal){
    c+=d.journal;
    if(d.volume){
      c+=', '+d.volume;
      if(d.issue)c+='('+d.issue+')';
    }
    if(d.fp){
      c+=', '+d.fp;
      if(d.lp)c+='\u2013'+d.lp;
    }
    c+='. ';
  }
  if(d.doi)c+='https://doi.org/'+d.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i,'');
  else if(d.url)c+=d.url;
  return c.trim();
}
function inText(d,mode){var au=(d.authors||[]).map(fa).filter(Boolean);var ls=au.map(function(a){return a.split(',')[0].trim();});var ap=ls.length===0?'Bilinmeyen':ls.length===1?ls[0]:ls.length===2?ls[0]+' & '+ls[1]:ls[0]+' vd.';var yr=d.year||'t.y.';if(mode==='textual')return ap+' ('+yr+')';return mode==='footnote_explicit'?ap+', '+yr+'.':'('+ap+', '+yr+')';}
function getInlineCitationText(ref,options){
  options=options||{};
  var style=getCurrentCitationStyle();
  if(window.AQCitationStyles&&typeof window.AQCitationStyles.formatInlineCitation==='function'){
    return window.AQCitationStyles.formatInlineCitation(ref,{style:style});
  }
  if(window.AQCitationState&&typeof window.AQCitationState.getInlineCitationText==='function'){
    return window.AQCitationState.getInlineCitationText(ref,{
      formatAuthor:fa,
      sortReferences:sortLib,
      dedupeReferences:dedupeRefs,
      citationStyles:window.AQCitationStyles||null,
      styleId:style
    });
  }
  return inText(ref,'inline');
}
function getNarrativeCitationText(ref){
  var style=getCurrentCitationStyle();
  if(window.AQCitationStyles&&typeof window.AQCitationStyles.formatNarrativeCitation==='function'){
    return window.AQCitationStyles.formatNarrativeCitation(ref,{style:style});
  }
  return inText(ref,'textual');
}
function shortRef(d){var a=d.authors&&d.authors[0]?d.authors[0].split(',')[0]:'?';if(d.authors&&d.authors.length>1)a+=' vd.';return a+' ('+(d.year||'t.y.')+')';}
function apaSortKey(ref){
  ref=ref||{};
  var authors=(ref.authors||[]).map(function(a){return fa(String(a||''));}).filter(Boolean);
  var lead=authors[0]||'';
  var surname=lead?lead.split(',')[0].trim():'';
  var given=lead&&lead.indexOf(',')>=0?lead.split(',').slice(1).join(',').trim():'';
  var year=String(ref.year||'9999').trim().toLowerCase();
  var title=String(ref.title||'').trim().toLowerCase();
  var fullCitation=apa7(ref).toLowerCase();
  return [surname.toLowerCase(),given.toLowerCase(),year,title,fullCitation].join('||');
}
function sortLib(refs){
  var list=(refs||[]).slice();
  var styleApi=window.AQCitationStyles||null;
  if(styleApi&&typeof styleApi.sortReferences==='function'){
    return styleApi.sortReferences(list,{
      style:getCurrentCitationStyle(),
      locale:'tr',
      preserveOrder:false
    });
  }
  return list.sort(function(a,b){
    return apaSortKey(a).localeCompare(apaSortKey(b),'tr',{numeric:true,sensitivity:'base'});
  });
}
function getCurrentCitationStyle(){
  var doc=getCurrentDocRecord?getCurrentDocRecord():null;
  var raw=doc&&doc.citationStyle?doc.citationStyle:(S.citationStyle||'apa7');
  if(window.AQCitationStyles&&typeof window.AQCitationStyles.normalizeStyleId==='function'){
    return window.AQCitationStyles.normalizeStyleId(raw);
  }
  return String(raw||'apa7').trim().toLowerCase()||'apa7';
}
function setCitationStyle(styleId){
  var doc=getCurrentDocRecord?getCurrentDocRecord():null;
  if(!doc)return;
  if(window.AQCitationStyles&&typeof window.AQCitationStyles.normalizeStyleId==='function'){
    doc.citationStyle=window.AQCitationStyles.normalizeStyleId(styleId);
  }else{
    doc.citationStyle=String(styleId||'apa7').trim().toLowerCase()||'apa7';
  }
  save();
  updateCitationStyleSelector();
  // Re-sync inline citations + bibliography in one place to keep style switch deterministic.
  runEditorMutationEffects({
    target:editor&&editor.view?editor.view.dom:null,
    normalize:true,
    layout:false,
    syncChrome:true,
    syncRefs:true,
    refreshTrigger:false
  });
  rRefs();
  updateRefSection(true);
}
function updateCitationStyleSelector(){
  var sel=document.getElementById('citationStyleSel');
  if(!sel)return;
  var next=getCurrentCitationStyle();
  if(sel.value!==next)sel.value=next;
}
function formatRef(ref,options){
  options=options||{};
  var style=getCurrentCitationStyle();
  var indexById=options.indexById||null;
  var index=options.index||null;
  if(style==='ieee'&&index==null&&ref&&ref.id){
    try{
      var used=sortLib(dedupeRefs(getUsedRefs()||[]));
      var found=used.findIndex(function(item){return item&&item.id===ref.id;});
      if(found>=0)index=found+1;
    }catch(_e){}
  }
  if(window.AQCitationStyles&&typeof window.AQCitationStyles.formatReference==='function'){
    return window.AQCitationStyles.formatReference(ref,{
      style:style,
      indexById:indexById,
      index:index
    });
  }
  return apa7(ref);
}

// ¦¦ WORKSPACES ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function rWS(){
  var bar=document.getElementById('wsbar');
  if(bar)bar.style.display='none';
  var row=document.getElementById('wsrow');
  if(row)row.innerHTML='';
}
function delWs(id){
  if(workspaceMutationBusy)return;
  workspaceMutationBusy=true;
  refreshBusyControls();
  try{
  ensureStableState('delWs.before');
  if(S.wss.length<=1){alert('En az bir alan gerekli.');return;}
  var ws=(S.wss||[]).find(function(entry){return entry&&entry.id===id;});
  if(!ws)return;
  if(!confirm('"'+ws.name+'" alanı ve bağlı belgesi silinsin?'))return;
  var next=(window.AQDocTabsState&&typeof window.AQDocTabsState.deleteWorkspaceWithDocState==='function')
    ? window.AQDocTabsState.deleteWorkspaceWithDocState(S,id,{sanitize:sanitizeDocHTML})
    : null;
  if(!next){
    S.wss=S.wss.filter(function(entry){return entry&&entry.id!==id;});
    S.docs=(S.docs||[]).filter(function(doc){return doc&&doc.id!==ws.docId;});
    ensureWorkspaceDocs();
  }
  save();
  rWS();rLib();rRefs();rDocTabs();switchWsPdfTabs();uSt();
  var active=(S.docs||[]).find(function(doc){return doc.id===S.curDoc;});
  if(active)__aqSetEditorDoc(active.content||__aqBlankDocHTML(),false);
  }catch(e){
    logStability('delWs',e,{wsId:id});
  }finally{
    setTimeout(function(){
      workspaceMutationBusy=false;
      refreshBusyControls();
    },120);
  }
}
function promptAddWs(){
  customPrompt('Çalışma alanı adı:','').then(function(name){
    name=(name||'').trim();
    if(!name)return;
    var inp=document.getElementById('wsminp');
    if(inp)inp.value=name;
    doAddWs();
  });
}
function doAddWs(){
  if(workspaceMutationBusy)return;
  workspaceMutationBusy=true;
  refreshBusyControls();
  try{
  ensureStableState('doAddWs.before');
  var n=document.getElementById('wsminp').value.trim();
  if(!n)return;
  // Save current doc BEFORE changing curDoc
  var oldHtml=getCurrentEditorHTML();
  oldHtml=sanitizeDocHTML(oldHtml);
  var oldDoc=(S.docs||[]).find(function(d){return d.id===S.curDoc;});
  if(oldDoc)oldDoc.content=oldHtml;

  var created=(window.AQDocTabsState&&typeof window.AQDocTabsState.addWorkspaceWithDocState==='function')
    ? window.AQDocTabsState.addWorkspaceWithDocState(S,{id:uid(),name:n,lib:[]},{uid:uid,sanitize:sanitizeDocHTML})
    : null;
  if(!created){
    var doc={id:uid(),name:n,content:__aqBlankDocHTML(),bibliographyHTML:'',bibliographyManual:false,coverHTML:'',tocHTML:''};
    var ws={id:uid(),name:n,lib:[],docId:doc.id};
    S.docs=(S.docs||[]).concat([doc]);
    S.wss.push(ws);
    S.cur=ws.id;
    S.curDoc=doc.id;
    S.doc=doc.content;
  }
  // Set editor to blank through unified loader to avoid cross-doc sync leakage.
  __aqSetEditorDoc(__aqBlankDocHTML(),false);
  hideM('wsm');
  save();
  rWS();rLib();rDocTabs();switchWsPdfTabs();uSt();
  setTimeout(function(){save();},260);
  }catch(e){
    logStability('doAddWs',e);
    setDst('Çalışma alanı eklenemedi.','er');
  }finally{
    setTimeout(function(){
      workspaceMutationBusy=false;
      refreshBusyControls();
    },120);
  }
}

// ¦¦ NOTEBOOKS ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function rNB(){
  var bar=document.getElementById('nbtabs');bar.innerHTML='';
  var notebooks=(window.AQNotebookState&&typeof window.AQNotebookState.buildNotebookViewModel==='function')
    ? window.AQNotebookState.buildNotebookViewModel({notebooks:S.notebooks,currentNotebookId:S.curNb})
    : (S.notebooks||[]).map(function(nb){return{id:nb.id,name:nb.name,active:nb.id===S.curNb,deletable:(S.notebooks||[]).length>1};});
  notebooks.forEach(function(nb){
    var btn=document.createElement('button');btn.className='nbtab'+(nb.active?' on':'');
    btn.style.cssText='display:flex;align-items:center;gap:3px;';
    var lbl=document.createElement('span');lbl.textContent=nb.name;
    btn.appendChild(lbl);
    // Delete button (visible on hover)
    if(nb.deletable){
      var del=document.createElement('span');
      del.textContent='×';del.title='Sil';
      del.style.cssText='font-size:12px;color:var(--txt3);cursor:pointer;padding:0 2px;display:none;';
      btn.addEventListener('mouseenter',function(){del.style.display='inline';});
      btn.addEventListener('mouseleave',function(){del.style.display='none';});
      del.onclick=function(e){
        e.stopPropagation();
        if(!confirm('"'+nb.name+'" silinsin?'))return;
        var next=(window.AQNotebookState&&typeof window.AQNotebookState.deleteNotebook==='function')
          ? window.AQNotebookState.deleteNotebook({notebooks:S.notebooks,currentNotebookId:S.curNb},nb.id)
          : {notebooks:S.notebooks.filter(function(x){return x.id!==nb.id;}),currentNotebookId:(S.curNb===nb.id&&S.notebooks[0]?S.notebooks[0].id:S.curNb)};
        S.notebooks=next.notebooks;S.curNb=next.currentNotebookId;save();rNB();rNotes();
      };
      btn.appendChild(del);
    }
    btn.onclick=function(){
      var next=(window.AQNotebookState&&typeof window.AQNotebookState.selectNotebook==='function')
        ? window.AQNotebookState.selectNotebook({notebooks:S.notebooks,currentNotebookId:S.curNb},nb.id)
        : {notebooks:S.notebooks,currentNotebookId:nb.id};
      S.notebooks=next.notebooks;S.curNb=next.currentNotebookId;rNB();rNotes();
    };
    btn.ondblclick=function(){
      customPrompt('Not defteri adı:',nb.name).then(function(n){
        if(n&&n.trim()){
          var next=(window.AQNotebookState&&typeof window.AQNotebookState.renameNotebook==='function')
            ? window.AQNotebookState.renameNotebook({notebooks:S.notebooks,currentNotebookId:S.curNb},nb.id,n)
            : {notebooks:S.notebooks.map(function(x){return x.id===nb.id?Object.assign({},x,{name:n.trim()}):x;}),currentNotebookId:S.curNb};
          S.notebooks=next.notebooks;S.curNb=next.currentNotebookId;save();rNB();
        }
      });
    };
    bar.appendChild(btn);
  });
  var add=document.createElement('button');add.id='nb-add';add.textContent='+';add.title='Yeni not defteri';
  add.onclick=function(){showM('nbm');setTimeout(function(){document.getElementById('nbminp').focus();},50);};
  bar.appendChild(add);
}
function doAddNb(){
  var n=document.getElementById('nbminp').value.trim();
  if(!n)return;
  var next=(window.AQNotebookState&&typeof window.AQNotebookState.addNotebook==='function')
    ? window.AQNotebookState.addNotebook({notebooks:S.notebooks,currentNotebookId:S.curNb},{id:uid(),name:n})
    : {notebooks:(S.notebooks||[]).concat([{id:uid(),name:n}]),currentNotebookId:null};
  if(!next.createdNotebook&&next.currentNotebookId==null)return;
  S.notebooks=next.notebooks;S.curNb=next.currentNotebookId;
  hideM('nbm');save();rNB();rNotes();
}

// ¦¦ CROSSREF ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function __aqNetFetchJSON(url,timeoutMs){
  var ms=Math.max(2500,Math.min(parseInt(timeoutMs,10)||8000,30000));
  if(window.electronAPI&&typeof window.electronAPI.netFetchJSON==='function'){
    return window.electronAPI.netFetchJSON(url,{timeoutMs:ms}).then(function(res){
      if(res&&res.ok)return res.data||null;
      throw new Error((res&&res.error)||'Net fetch failed');
    });
  }
  return fetch(url).then(function(r){
    if(!r||!r.ok)throw new Error('HTTP '+(r&&r.status?r.status:'?'));
    return r.json();
  });
}
function __aqNetFetchText(url,timeoutMs,maxBytes){
  var ms=Math.max(2500,Math.min(parseInt(timeoutMs,10)||8000,30000));
  var max=Math.max(32*1024,Math.min(parseInt(maxBytes,10)|| (2*1024*1024), 10*1024*1024));
  if(window.electronAPI&&typeof window.electronAPI.netFetchText==='function'){
    return window.electronAPI.netFetchText(url,{timeoutMs:ms,maxBytes:max,allowAnyHost:true}).then(function(res){
      if(res&&res.ok)return res;
      throw new Error((res&&res.error)||'Net fetch failed');
    });
  }
  return fetch(url).then(function(r){
    if(!r||!r.ok)throw new Error('HTTP '+(r&&r.status?r.status:'?'));
    return r.text();
  }).then(function(text){
    return {ok:true,text:text,finalUrl:url};
  });
}
function __isProbablyUrl(value){
  return /^(https?:\/\/|www\.)/i.test(String(value||'').trim());
}
function __normalizeUrlInput(value){
  var raw=String(value||'').trim();
  if(/^www\./i.test(raw))return 'https://'+raw;
  return raw;
}
function __extractMetaFromHtml(html,sourceUrl){
  var out={
    title:'',
    authors:[],
    publishedDate:'',
    doi:'',
    websiteName:'',
    publisher:'',
    referenceType:'',
    url:sourceUrl||''
  };
  var doc=null;
  try{
    doc=new DOMParser().parseFromString(String(html||''),'text/html');
  }catch(e){}
  var metaMap={};
  var authorList=[];
  if(doc){
    Array.from(doc.getElementsByTagName('meta')).forEach(function(meta){
      var name=String(meta.getAttribute('name')||meta.getAttribute('property')||'').trim().toLowerCase();
      var content=String(meta.getAttribute('content')||'').trim();
      if(!name||!content)return;
      if(!metaMap[name])metaMap[name]=content;
      if(name==='citation_author'||name==='dc.creator'||name==='author'||name==='article:author'){
        authorList.push(content);
      }
    });
  }
  function pick(keys){
    for(var i=0;i<keys.length;i++){
      var key=keys[i];
      if(metaMap[key])return metaMap[key];
    }
    return '';
  }
  out.title=pick(['citation_title','citation_book_title','dc.title','og:title','twitter:title']) || (doc&&doc.title?doc.title:'');
  out.doi=normalizeRefDoi(pick(['citation_doi','dc.identifier','prism.doi','doi'])||'');
  out.isbn=pick(['citation_isbn','book:isbn','isbn']);
  out.publishedDate=pick(['citation_publication_date','article:published_time','dc.date','dc.date.issued','date','pubdate','prism.publicationdate']);
  out.websiteName=pick(['og:site_name','application-name','twitter:site','site_name']);
  out.publisher=pick(['publisher','dc.publisher']);
  if(!authorList.length){
    var author=pick(['author']);
    if(author)authorList=[author];
  }
  out.authors=authorList.filter(Boolean).slice(0,8);
  var ogType=pick(['og:type']);
  if(ogType&&/book/i.test(ogType))out.referenceType='book';
  if(ogType&&/article/i.test(ogType))out.referenceType='article';
  if(ogType&&/(website|webpage)/i.test(ogType))out.referenceType='website';
  if(doc){
    Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).forEach(function(script){
      var raw=String(script.textContent||'').trim();
      if(!raw)return;
      try{
        var parsed=JSON.parse(raw);
        var items=[];
        if(Array.isArray(parsed))items=parsed;
        else if(parsed&&Array.isArray(parsed['@graph']))items=parsed['@graph'];
        else items=[parsed];
        items.forEach(function(obj){
          if(!obj||typeof obj!=='object')return;
          var types=Array.isArray(obj['@type'])?obj['@type']:[obj['@type']];
          var typeList=types.map(function(t){return String(t||'').toLowerCase();});
          var isBook=typeList.some(function(t){return t.indexOf('book')>=0;});
          var isArticle=typeList.some(function(t){return t.indexOf('scholarlyarticle')>=0||t.indexOf('article')>=0;});
          var isWeb=typeList.some(function(t){return t.indexOf('webpage')>=0||t.indexOf('website')>=0;});
          if(isBook&&!out.referenceType)out.referenceType='book';
          if(isArticle&&!out.referenceType)out.referenceType='article';
          if(isWeb&&!out.referenceType)out.referenceType='website';
          if(!out.title&&obj.name)out.title=String(obj.name);
          if(!out.title&&obj.headline)out.title=String(obj.headline);
          if(!out.publishedDate&&obj.datePublished)out.publishedDate=String(obj.datePublished);
          if(!out.publisher&&obj.publisher){
            out.publisher=typeof obj.publisher==='string'?obj.publisher:(obj.publisher&&obj.publisher.name?obj.publisher.name:'');
          }
          if(!out.doi&&obj.identifier){
            var id=obj.identifier;
            var doiVal='';
            if(typeof id==='string')doiVal=id;
            else if(id&&typeof id==='object')doiVal=id.value||id['@id']||'';
            out.doi=normalizeRefDoi(doiVal);
          }
          if(!out.isbn&&obj.isbn)out.isbn=String(obj.isbn);
          if(!out.authors.length&&obj.author){
            var authors=Array.isArray(obj.author)?obj.author:[obj.author];
            out.authors=authors.map(function(a){
              if(!a)return '';
              if(typeof a==='string')return a;
              return a.name||'';
            }).filter(Boolean).slice(0,8);
          }
          if(isWeb&&!out.websiteName&&obj.name)out.websiteName=String(obj.name);
        });
      }catch(_e){}
    });
  }
  if(!out.websiteName&&out.url){
    try{out.websiteName=new URL(out.url).hostname.replace(/^www\./,'');}catch(e){}
  }
  if(!out.title&&out.websiteName)out.title=out.websiteName;
  if(!out.referenceType){
    if(out.isbn||out.publisher) out.referenceType='book';
    else if(out.doi) out.referenceType='article';
    else out.referenceType='website';
  }
  return out;
}
function fetchCR(doi,cb){
  var done=false;
  function finish(err,ref){
    if(done)return;
    done=true;
    cb(err,ref);
  }
  var clean=doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i,'').trim();
  __aqNetFetchJSON('https://api.crossref.org/works/'+encodeURIComponent(clean)+'?mailto=academiq@example.com',9000)
    .then(function(data){
      var w=data.message||{};
      var authors=(w.author||[]).map(function(a){return(a.family&&a.given)?a.family+', '+a.given:(a.family||a.name||'');}).filter(Boolean);
      var year='';var dp=w['published-print']||w['published-online']||w['created'];
      if(dp&&dp['date-parts']&&dp['date-parts'][0])year=String(dp['date-parts'][0][0]);
      var pages=w.page||'';var fp='',lp='';
      if(pages.includes('-')){fp=pages.split('-')[0];lp=pages.split('-').slice(1).join('-');}else fp=pages;
      var ref={id:uid(),title:(w.title&&w.title[0])||'',authors:authors,year:year,
        journal:(w['container-title']&&w['container-title'][0])||'',
        volume:w.volume||'',issue:w.issue||'',fp:fp,lp:lp,
        doi:clean,url:'',pdfData:null,pdfUrl:null,wsId:S.cur};
      setDst('? Metadata alındı, OA aranıyor...','ld');
      __aqNetFetchJSON('https://api.unpaywall.org/v2/'+encodeURIComponent(clean)+'?email=academiq@example.com',9000)
        .then(function(ua){
          return ua||null;
        })
        .then(function(ua){
          if(ua){
            var pdfUrl=null;
            if(ua.best_oa_location){
              pdfUrl=ua.best_oa_location.url_for_pdf||null;
              if(!pdfUrl) pdfUrl=ua.best_oa_location.url||null;
            }
            if(!pdfUrl&&ua.oa_locations&&ua.oa_locations.length){
              for(var i=0;i<ua.oa_locations.length;i++){
                if(ua.oa_locations[i].url_for_pdf){pdfUrl=ua.oa_locations[i].url_for_pdf;break;}
              }
              if(!pdfUrl){
                for(var j=0;j<ua.oa_locations.length;j++){
                  if(ua.oa_locations[j].url){pdfUrl=ua.oa_locations[j].url;break;}
                }
              }
            }
            ref.pdfUrl=pdfUrl;
          }
          finish(null,ref);
        })
        .catch(function(e){
          // Unpaywall başarısız — metadata ile devam
          finish(null,ref);
        });
    }).catch(function(e){finish(e);});
}

function addDOI(){
  if(addDoiBusy){
    setDst('DOI ekleme zaten çalışıyor.','ld');
    return;
  }
  addDoiBusy=true;
  refreshBusyControls();
  ensureStableState('addDOI.before');
  var input=document.getElementById('doiinp').value.trim();
  if(!input){setDst('DOI veya URL boş.','er');addDoiBusy=false;refreshBusyControls();return;}
  var isUrl=__isProbablyUrl(input);
  var urlInput=isUrl?__normalizeUrlInput(input):'';
  var normalizedDoi=normalizeRefDoi(input);
  if(!normalizedDoi&&isUrl){
    setDst('? URL metadata aranıyor...','ld');
    var urlTimed=false;
    var urlTimer=setTimeout(function(){
      urlTimed=true;
      addDoiBusy=false;
      refreshBusyControls();
      setDst('? URL zaman aşımına uğradı.','er');
    },15000);
    __aqNetFetchText(urlInput,12000,2*1024*1024).then(function(res){
      clearTimeout(urlTimer);
      if(urlTimed)return;
      var text=res&&res.text?res.text:String(res||'');
      var finalUrl=res&&res.finalUrl?res.finalUrl:urlInput;
      var meta=__extractMetaFromHtml(text,finalUrl);
      if(meta.doi){
        normalizedDoi=meta.doi;
      }else{
        var today=new Date().toISOString().substring(0,10);
        var ref={
          id:uid(),
          title:meta.title||meta.websiteName||finalUrl,
          authors:(meta.authors||[]).slice(),
          year:'',
          journal:'',
          volume:'',
          issue:'',
          fp:'',
          lp:'',
          doi:'',
          url:finalUrl,
          pdfData:null,
          pdfUrl:null,
          wsId:S.cur,
          referenceType:(meta.referenceType||(meta.publisher?'book':'website')),
          publisher:meta.publisher||'',
          websiteName:meta.websiteName||'',
          publishedDate:meta.publishedDate||'',
          accessedDate:(meta.referenceType==='website'||!meta.referenceType)?today:''
        };
        ref=addToLib(ref)||ref;
        document.getElementById('doiinp').value='';
        setDst(shortRef(ref)+' · Kaynak eklendi','ok');
        addDoiBusy=false;
        refreshBusyControls();
        return;
      }
      input=normalizedDoi;
      addDoiBusy=false;
      refreshBusyControls();
      document.getElementById('doiinp').value=normalizedDoi;
      addDOI();
    }).catch(function(e){
      clearTimeout(urlTimer);
      if(urlTimed)return;
      addDoiBusy=false;
      refreshBusyControls();
      setDst('URL okunamadı.','er');
    });
    return;
  }
  if(!normalizedDoi){
    setDst('DOI veya URL geçersiz.','er');
    addDoiBusy=false;
    refreshBusyControls();
    return;
  }
  var doi=normalizedDoi;
  setDst('? CrossRef sorgulanıyor...','ld');
  // Timeout: 15 saniye sonra hata
  var timedOut=false;
  var timer=setTimeout(function(){
    timedOut=true;
    addDoiBusy=false;
    refreshBusyControls();
    setDst('? Bağlantı zaman aşımı — ağ erişimi engellenmiş olabilir.','er');
  },15000);
  try{
  fetchCR(doi,async function(err,ref){
    clearTimeout(timer);
    if(timedOut)return;
    try{
    if(err){setDst('CrossRef hatasi: '+err.message,'er');return;}
    if(urlInput&&!ref.url)ref.url=urlInput;
    ref=addToLib(ref)||ref;
    document.getElementById('doiinp').value='';
    document.getElementById('pdfpanel').classList.add('open');
    document.getElementById('pdftitle').textContent=(ref.title||ref.doi).substring(0,55);
    // Multi-source OA arama
    var oaUrls=[];
    if(ref.pdfUrl)oaUrls.push(ref.pdfUrl);
    setDst('OA PDF araniyor (coklu kaynak)...','ld');
    try{
      var moreUrls=await fetchOAUrls(doi);
      moreUrls.forEach(function(u){if(oaUrls.indexOf(u)<0)oaUrls.push(u);});
    }catch(e){}
    if(oaUrls.length>0){
      ref.pdfUrl=oaUrls[0];save();rLib();
      setDst('OA PDF bulundu ('+oaUrls.length+' kaynak), indiriliyor...','ld');
      var allUrls=[];
      oaUrls.forEach(function(u){buildPDFUrls(u).forEach(function(v){if(allUrls.indexOf(v)<0)allUrls.push(v);});});
      tryFetch(allUrls[0],ref.id);
    }else{
      setDst(shortRef(ref)+' · OA PDF bulunamadi','er');
      showNoPDF(ref);
      setTimeout(function(){setDst('','');},5000);
    }
    // Fetch citation count in background
    fetchCitationCount(ref);
    }catch(e){
      logStability('addDOI.callback',e,{doi:doi});
      setDst('DOI işlenirken hata oluştu.','er');
    }finally{
      addDoiBusy=false;
      refreshBusyControls();
    }
  });
  }catch(e){
    clearTimeout(timer);
    addDoiBusy=false;
    refreshBusyControls();
    logStability('addDOI.dispatch',e,{doi:doi});
    setDst('DOI sorgusu başlatılamadı.','er');
  }
}
// ¦¦ CITATION COUNT ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
async function fetchCitationCount(ref){
  if(!ref.doi)return;
  try{
    var data=await __aqNetFetchJSON('https://api.semanticscholar.org/graph/v1/paper/DOI:'+encodeURIComponent(ref.doi)+'?fields=citationCount',8000);
    if(data&&typeof data.citationCount==='number'){
      ref.citationCount=data.citationCount;
      ref.citationFetchDate=new Date().toISOString().substring(0,10);
      save();rLib();
    }
  }catch(e){
    logStability('fetchCitationCount',e,{doi:ref&&ref.doi?ref.doi:null});
  }
}
async function batchFetchCitations(){
  if(citationBatchBusy){
    setDst('Atıf güncelleme zaten çalışıyor.','ld');
    return;
  }
  citationBatchBusy=true;
  refreshBusyControls();
  try{
  var ws=S.wss.find(function(x){return x.id===S.cur;});
  if(!ws||!ws.lib||!ws.lib.length){setDst('Kaynak yok.','er');return;}
  var refs=ws.lib.filter(function(r){return r.doi;});
  if(!refs.length){setDst('DOI olan kaynak yok.','er');return;}
  setDst('Atıf sayıları güncelleniyor (0/'+refs.length+')...','ld');
  for(var i=0;i<refs.length;i++){
    setDst('Atıf güncelleniyor ('+(i+1)+'/'+refs.length+')...','ld');
    await fetchCitationCount(refs[i]);
    if(i<refs.length-1)await new Promise(function(res){setTimeout(res,500);});
  }
  setDst('Atıf sayıları güncellendi.','ok');
  setTimeout(function(){setDst('','');},3000);
  }catch(e){
    logStability('batchFetchCitations',e);
    setDst('Atıf güncelleme hatası.','er');
  }finally{
    citationBatchBusy=false;
    refreshBusyControls();
  }
}
function setDst(m,c){var e=document.getElementById('dst');e.textContent=m;e.className=c;}
function classifyPdfDownloadFailureLocal(input){
  var text=typeof input==='string'?input:((input&&typeof input.error==='string')?input.error:'');
  var m=String(text||'').match(/\bHTTP\s+(\d{3})\b/i);
  var status=m?parseInt(m[1],10):0;
  var low=String(text||'').toLowerCase();
  if(status===401||status===403){
    return {
      type:'protected_access',
      statusCode:status,
      isProtectedAccess:true,
      userMessage:'PDF bağlantısı korumalı görünüyor. Referans kaydedildi; PDF için tarayıcıda açıp manuel erişim gerekebilir.'
    };
  }
  if(status===404){
    return {
      type:'not_found',
      statusCode:status,
      isProtectedAccess:false,
      userMessage:'PDF bağlantısı artık geçerli görünmüyor. Farklı bir PDF/OA kaynağı gerekebilir.'
    };
  }
  if(status===429){
    return {
      type:'rate_limited',
      statusCode:status,
      isProtectedAccess:false,
      userMessage:'PDF sunucusu istek sınırına takıldı. Biraz sonra yeniden deneyin.'
    };
  }
  if(low.indexOf('timeout')>=0){
    return {
      type:'timeout',
      statusCode:0,
      isProtectedAccess:false,
      userMessage:'PDF isteği zaman aşımına uğradı. Bağlantıyı tekrar deneyebilirsiniz.'
    };
  }
  if(low.indexOf('doi mismatch')>=0||low.indexOf('title mismatch')>=0||low.indexOf('güven skoru düşük')>=0||low.indexOf('guven skoru dusuk')>=0){
    return {
      type:'verification_failed',
      statusCode:0,
      isProtectedAccess:false,
      userMessage:'Bulunan dosya bu makaleyle güvenli biçimde eşleşmedi. Yanlış PDF indirilmedi.'
    };
  }
  return {
    type:'generic',
    statusCode:status,
    isProtectedAccess:false,
    userMessage:'PDF indirilemedi. Bağlantı saklandı; isterseniz tarayıcıda açıp manuel yükleyebilirsiniz.'
  };
}
function showPdfDownloadFallback(ref,failure){
  clearPDFView();
  var sc=document.getElementById('pdfscroll');
  var doi=(ref&&ref.doi)||'';
  var pdfUrl=(ref&&ref.pdfUrl)||'';
  var title=(ref&&ref.title)||'';
  var info=failure&&typeof failure==='object'?failure:classifyPdfDownloadFailureLocal(failure||'');
  var box=document.createElement('div');
  box.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:12px;text-align:center;width:100%;';
  var icon=document.createElement('div');
  icon.style.cssText='font-size:30px';
  icon.textContent='PDF';
  box.appendChild(icon);
  if(title){
    var titleEl=document.createElement('div');
    titleEl.style.cssText='font-size:11px;color:var(--txt2);max-width:380px;line-height:1.5';
    titleEl.textContent=String(title).substring(0,90);
    box.appendChild(titleEl);
  }
  var msg=document.createElement('div');
  msg.style.cssText='max-width:380px;font-size:11px;line-height:1.6;color:var(--txt2)';
  msg.textContent=String((info&&info.userMessage)||'PDF indirilemedi.');
  box.appendChild(msg);
  if(info&&info.statusCode){
    var statusEl=document.createElement('div');
    statusEl.style.cssText='font-family:var(--fm);font-size:10px;color:var(--txt3)';
    statusEl.textContent='HTTP '+info.statusCode;
    box.appendChild(statusEl);
  }
  var controls=document.createElement('div');
  controls.style.cssText='width:100%;max-width:320px;display:flex;flex-direction:column;gap:8px;margin-top:4px;';
  if(pdfUrl){
    var openLink=document.createElement('a');
    openLink.href=pdfUrl;
    openLink.target='_blank';
    openLink.rel='noreferrer noopener';
    openLink.style.cssText='background:rgba(255,255,255,.76);color:var(--txt2);border:1px solid rgba(186,169,143,.95);border-radius:10px;padding:10px 12px;font-size:12px;font-weight:600;text-decoration:none;display:block;';
    openLink.textContent='PDF bağlantısını tarayıcıda aç';
    controls.appendChild(openLink);
  }
  var uploadBtn=document.createElement('button');
  uploadBtn.style.cssText='background:var(--acc);color:#0d1117;border:none;border-radius:10px;padding:10px 12px;cursor:pointer;font-size:12px;font-weight:600;font-family:var(--f);';
  uploadBtn.textContent='PDF dosyasını manuel yükle';
  uploadBtn.addEventListener('click',function(){
    var input=document.getElementById('lfinp');
    if(input&&typeof input.click==='function')input.click();
  });
  controls.appendChild(uploadBtn);
  if(doi){
    var doiLink=document.createElement('a');
    doiLink.href='https://doi.org/'+doi;
    doiLink.target='_blank';
    doiLink.rel='noreferrer noopener';
    doiLink.style.cssText='color:var(--txt3);font-size:11px;text-decoration:none;';
    doiLink.textContent='Yayıncı sayfasını aç';
    controls.appendChild(doiLink);
  }
  box.appendChild(controls);
  var hint=document.createElement('div');
  hint.style.cssText='font-size:10px;color:var(--txt3);line-height:1.7;max-width:360px;';
  hint.textContent='Bu tür linkler bazen kurumsal erişim, oturum veya çerez gerektirir. Referans ve PDF bağlantısı korunur.';
  box.appendChild(hint);
  sc.appendChild(box);
}
function setBusyControl(id,busy,busyLabel){
  var el=document.getElementById(id);
  if(!el)return;
  if(!el.dataset.defaultLabel){
    el.dataset.defaultLabel=(el.textContent||'').trim();
  }
  if(busy){
    el.disabled=true;
    el.setAttribute('aria-busy','true');
    if(typeof busyLabel==='string'&&busyLabel)el.textContent=busyLabel;
  }else{
    el.disabled=false;
    el.removeAttribute('aria-busy');
    if(el.dataset.defaultLabel)el.textContent=el.dataset.defaultLabel;
  }
}
function refreshBusyControls(){
  setBusyControl('doiFetchBtn',!!addDoiBusy,'Bekle...');
  setBusyControl('batchOABtn',!!oaBatchBusy,'İndiriliyor...');
  setBusyControl('batchCiteBtn',!!citationBatchBusy,'Güncelleniyor...');
  setBusyControl('wsCreateBtn',!!workspaceMutationBusy,'Oluşturuluyor...');
  var wsAdd=document.getElementById('wsadd');
  if(wsAdd){
    wsAdd.disabled=!!workspaceMutationBusy;
    wsAdd.setAttribute('aria-busy',workspaceMutationBusy?'true':'false');
  }
  var doiInp=document.getElementById('doiinp');
  if(doiInp)doiInp.disabled=!!addDoiBusy;
}
function mergeRefFields(target,source){
  if(!target||!source||target===source)return target;
  normalizeRefRecord(source);
  [
    'referenceType','title','year','journal','volume','issue','fp','lp','doi','url','pdfUrl',
    'publisher','edition','websiteName','publishedDate','accessedDate',
    'booktitle','location','language','abstract','note'
  ].forEach(function(k){
    if(source[k]&&!target[k])target[k]=source[k];
  });
  if(source.referenceType&&source.referenceType!=='article'&&target.referenceType==='article'){
    target.referenceType=source.referenceType;
  }
  if((source.authors||[]).length&&!(target.authors||[]).length)target.authors=source.authors.slice();
  if((source.labels||[]).length){
    target.labels=Array.from(new Set([].concat(target.labels||[],source.labels||[]).filter(Boolean)));
  }
  if(source.pdfData&&!target.pdfData)target.pdfData=source.pdfData;
  if(source.pdfVerification&&!target.pdfVerification)target.pdfVerification=normalizePdfVerification(source.pdfVerification);
  if(source.citationCount!=null&&target.citationCount==null)target.citationCount=source.citationCount;
  if(source.citationFetchDate&&!target.citationFetchDate)target.citationFetchDate=source.citationFetchDate;
  normalizeRefRecord(target);
  return target;
}
function addToLib(ref){
  normalizeRefRecord(ref);
  if(!ref.id)ref.id=uid();if(!ref.wsId)ref.wsId=S.cur;
  var lib=cLib();
  var existing=lib.find(function(r){return refKey(r)===refKey(ref);});
  if(existing){
    mergeRefFields(existing,ref);
    if(existing.pdfData)persistBorrowedPDF(existing);
    save();rLib();rRefs();
    return existing;
  }
  lib.push(ref);
  if(ref.pdfData)persistBorrowedPDF(ref);
  save();rLib();rRefs();
  return ref;
}

// ¦¦ LIBRARY ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function deleteCustomLabel(name){
  var labelName=String(name||'').trim();
  if(!labelName)return;
  if(!(S.customLabels||[]).some(function(l){
    return (typeof l==='string'?l:(l&&l.name)||'')===labelName;
  }))return;
  if(!confirm('"'+labelName+'" etiketi silinsin?'))return;
  S.customLabels=(S.customLabels||[]).filter(function(l){
    return (typeof l==='string'?l:(l&&l.name)||'')!==labelName;
  });
  S.wss.forEach(function(ws){
    (ws.lib||[]).forEach(function(ref){
      ref.labels=(ref.labels||[]).filter(function(l){
        return (typeof l==='string'?l:(l&&l.name)||'')!==labelName;
      });
    });
  });
  if(activeLabelFilter===labelName)activeLabelFilter=null;
  save();
  rLabelFilter();
  rLib();
}
function downloadPDF(id,overrideUrl){
  var r=findRef(id);
  var eq=r?findEquivalentRef(r):null;
  if(r&&eq){
    if(!r.pdfUrl&&eq.pdfUrl)r.pdfUrl=eq.pdfUrl;
    if(!r.url&&eq.url)r.url=eq.url;
  }
  var fetchUrl=overrideUrl||( r&&r.pdfUrl)||null;
  if(!r||!fetchUrl){setDst('İndirilecek URL yok.','er');return;}
  if(!r.pdfUrl&&fetchUrl)r.pdfUrl=fetchUrl;
  setDst('PDF indiriliyor...','ld');
  document.getElementById('pdfpanel').classList.add('open');
  document.getElementById('pdftitle').textContent=(r&&(r.title||r.doi)||'PDF').substring(0,55);
  var sc=document.getElementById('pdfscroll');
  sc.innerHTML='<div style="color:var(--acc);font-size:12px;padding:20px;text-align:center;width:100%;">'+
    'PDF indiriliyor...<br/><span style="font-size:10px;color:var(--txt3);display:block;margin-top:6px;">'+
    fetchUrl.substring(0,60)+'...</span></div>';
  function propagatePDF(buffer,verification){
    if(!r)return;
    normalizeRefRecord(r);
    r.pdfData=buffer;
    if(fetchUrl&&!r.pdfUrl)r.pdfUrl=fetchUrl;
    if(verification)propagatePdfVerification(r,verification,fetchUrl);
    S.wss.forEach(function(ws){
      (ws.lib||[]).forEach(function(cand){
        if(!cand||cand.id===r.id)return;
        normalizeRefRecord(cand);
        if(!refsLikelySame(cand,r))return;
        if(buffer&&!cand.pdfData)cand.pdfData=buffer;
        if(fetchUrl&&!cand.pdfUrl)cand.pdfUrl=fetchUrl;
        if(r.url&&!cand.url)cand.url=r.url;
        if(verification)setRefPdfVerification(cand,verification,fetchUrl);
        if(cand.pdfData)persistBorrowedPDF(cand);
      });
    });
    persistBorrowedPDF(r);
    save();
  }
  // Electron: CORS bypass ile indir (Node.js üzerinden)
  if(typeof window.electronAPI!=='undefined'){
    var dlOptions={};
    if(r&&r.doi){
      dlOptions.expectedDoi=normalizeRefDoi(r.doi);
      dlOptions.requireDoiEvidence=true;
    }
    if(r&&r.title)dlOptions.expectedTitle=String(r.title||'');
    if(r&&Array.isArray(r.authors)&&r.authors.length)dlOptions.expectedAuthors=r.authors.slice(0,4);
    if(r&&r.year)dlOptions.expectedYear=String(r.year||'');
    window.electronAPI.downloadPDFfromURL(fetchUrl, r.id, dlOptions).then(function(res){
      if(res.ok){
        window.electronAPI.loadPDF(r.id).then(function(pr){
          if(pr.ok){
            propagatePDF(pr.buffer,res.verification||null);
            curRef=r;
            rLib();
            renderPDF(pr.buffer,activeTabId||null);
            var trust=pdfVerificationSummaryText(r);
            setDst(trust?('PDF indirildi · '+trust):'? PDF indirildi (Electron)','ok');
            setTimeout(function(){setDst('','');},3600);
          }
        });
      } else {
        var failure=(res&&res.failure)||classifyPdfDownloadFailureLocal(res||{error:(res&&res.error)||''});
        if(fetchUrl&&!r.pdfUrl)r.pdfUrl=fetchUrl;
        save();rLib();rRefs();
        setDst((failure&&failure.userMessage)||('PDF indirilemedi: '+((res&&res.error)||'Bilinmeyen hata')),'er');
        showPdfDownloadFallback(r,failure);
      }
    }).catch(function(e){
      var failure=classifyPdfDownloadFailureLocal((e&&e.message)?e.message:String(e));
      if(fetchUrl&&!r.pdfUrl)r.pdfUrl=fetchUrl;
      save();rLib();rRefs();
      setDst((failure&&failure.userMessage)||'PDF indirilemedi.','er');
      showPdfDownloadFallback(r,failure);
    });
    return;
  }
  // Tarayici: fetch (CORS acik kaynaklar icin)
  fetch(fetchUrl)
    .then(function(res){
      if(!res.ok)throw new Error('HTTP '+res.status);
      return res.arrayBuffer();
    })
    .then(function(buf){
      // Önbelleğe al (bu cihazda)
      propagatePDF(buf);
      // localStorage'a kaydet
      try{
        var pm=JSON.parse(localStorage.getItem('aqPDF2')||'{}');
        pm[r.id]=buf;
        localStorage.setItem('aqPDF2',JSON.stringify(pm));
      }catch(e){}
      curRef=r;
      rLib();rRefs();
      renderPDF(buf,activeTabId||null);
      setDst('? PDF indirildi ve önbelleğe alındı','ok');
      setTimeout(function(){setDst('','');},3000);
    })
    .catch(function(e){
      // CORS engeli veya bağlantı sorunu
      sc.innerHTML='';
      var d=document.createElement('div');
      d.style.cssText='padding:24px;text-align:center;display:flex;flex-direction:column;gap:10px;align-items:center;';
      d.innerHTML='<div style="font-size:24px">??</div>'+
        '<div style="color:var(--txt2);font-size:12px;">PDF doğrudan indirilemedi (CORS engeli).</div>'+
        '<a href="'+r.pdfUrl+'" target="_blank" download style="background:var(--acc);color:#0d1117;border:none;border-radius:6px;padding:10px 16px;font-size:12px;font-weight:600;text-decoration:none;display:block;">Tarayıcıdan İndir</a>'+
        (r.doi?'<a href="https://doi.org/'+r.doi+'" target="_blank" style="color:var(--txt3);font-size:11px;text-decoration:none;">Yayıncı sayfası ?</a>':'')+
        '<div style="font-size:10px;color:var(--txt3);">İndirilen PDF dosyasini surukle birak ile yukle.</div>';
      sc.appendChild(d);
      setDst('CORS engeli — tarayıcıdan indir','er');
      setTimeout(function(){setDst('','');},6000);
    });
}

async function openRef(id){
  var r=findRef(id);if(!r)return;
  var eq=findEquivalentRef(r);
  if(eq){
    if(!r.pdfData&&sanitizeRefPdfData(eq))r.pdfData=eq.pdfData;
    if(!r.pdfUrl&&eq.pdfUrl)r.pdfUrl=eq.pdfUrl;
    if(!r.url&&eq.url)r.url=eq.url;
    sanitizeRefPdfData(r);
    if(r.pdfData)persistBorrowedPDF(r);
  }
  curRef=r;rLib();renderRelatedPapers();
  document.getElementById('pdfpanel').classList.add('open');
  document.getElementById('pdftitle').textContent=(r.title||r.doi||'PDF').substring(0,55);
  if(sanitizeRefPdfData(r)){addPdfTab(r.title||r.doi||'PDF',r.pdfData,r.id);return;}
  if(typeof window.electronAPI!=='undefined'){
    try{
      var hydrated=await hydrateRefPDF(r);
      if(hydrated&&sanitizeRefPdfData(r)){
        save();
        rLib();
        addPdfTab(r.title||r.doi||'PDF',r.pdfData,r.id);
        return;
      }
    }catch(e){}
  }
  if(r.pdfUrl){tryFetch(r.pdfUrl,r.id);}
  else{showNoPDF(r);}
}
function dRefIn(id,wsId){
  var ref=findRef(id,wsId)||findRef(id);
  var eq=ref?findEquivalentRef(ref):null;
  var ws=S.wss.find(function(x){return x.id===wsId;});
  if(ws)ws.lib=ws.lib.filter(function(r){return r.id!==id;});
  if(eq&&curRef&&curRef.id===id)curRef=eq;
  else if(curRef&&curRef.id===id)curRef=null;
  save();rLib();rRefs();renderRelatedPapers();
}
function showLabelMenuLegacy(x,y,ref){
  var menu=document.getElementById('ctxmenu');
  menu.innerHTML='';
  var editBtn=document.createElement('button');editBtn.className='ctxi';editBtn.textContent='Künyeyi Düzenle';
  editBtn.onclick=function(){hideCtx();editRefMetadata(ref);};
  menu.appendChild(editBtn);
  var sepTop=document.createElement('div');sepTop.className='ctx-sep';menu.appendChild(sepTop);
  // Label section
  var lbl=document.createElement('div');lbl.className='ctx-label-title';lbl.textContent='Etiketler';
  menu.appendChild(lbl);
  var allLabels=defaultLabels.concat(S.customLabels||[]);
  if(!ref.labels)ref.labels=[];
  allLabels.forEach(function(l){
    var hasLabel=ref.labels.some(function(rl){return rl.name===l.name;});
    var btn=document.createElement('button');btn.className='ctxi';
    var check=document.createElement('span');
    check.className='ctx-label-check'+(hasLabel?'':' off');
    check.textContent='?';
    btn.appendChild(check);
    var dot=document.createElement('span');
    dot.className='ctx-label-dot';
    dot.style.background=String(l.color||'#9aa');
    btn.appendChild(dot);
    var txt=document.createElement('span');
    txt.textContent=String(l.name||'');
    btn.appendChild(txt);
    btn.onclick=function(){
      if(hasLabel){ref.labels=ref.labels.filter(function(rl){return rl.name!==l.name;});}
      else{ref.labels.push({name:l.name,color:l.color});}
      save();rLib();hideCtx();
    };
    menu.appendChild(btn);
  });
  // New label option
  var newBtn=document.createElement('button');newBtn.className='ctxi ctxi-new-label';newBtn.textContent='+ Yeni Etiket';
  newBtn.onclick=function(){
    customPrompt('Etiket adı:','').then(function(name){
      if(!name||!name.trim())return;
      var colors=['#4caf50','#f44336','#2196f3','#9c27b0','#ff9800','#e91e63','#00bcd4','#795548'];
      var color=colors[Math.floor(Math.random()*colors.length)];
      var newLabel={name:name.trim(),color:color};
      if(!S.customLabels)S.customLabels=[];
      if(!S.customLabels.some(function(l){return l.name===newLabel.name;}))S.customLabels.push(newLabel);
      if(!ref.labels)ref.labels=[];
      ref.labels.push(newLabel);
      save();rLib();hideCtx();
    });
  };
  menu.appendChild(newBtn);
  // Collections section
  var csep=document.createElement('div');csep.className='ctx-sep';menu.appendChild(csep);
  var ctitle=document.createElement('div');ctitle.className='ctx-label-title';ctitle.textContent='Koleksiyonlar';
  menu.appendChild(ctitle);
  var ws=currentWorkspaceForCollections();
  var collections=ensureWorkspaceCollections(ws);
  if(!Array.isArray(ref.collectionIds))ref.collectionIds=[];
  if(!collections.length){
    var empty=document.createElement('div');
    empty.className='ctxi';
    empty.style.opacity='.72';
    empty.textContent='Koleksiyon yok';
    menu.appendChild(empty);
  }else{
    collections.forEach(function(col){
      var has=(ref.collectionIds||[]).some(function(id){return String(id)===String(col.id);});
      var btn=document.createElement('button');btn.className='ctxi';
      var check=document.createElement('span');
      check.className='ctx-label-check'+(has?'':' off');
      check.textContent='✓';
      btn.appendChild(check);
      var txt=document.createElement('span');
      txt.textContent=String(col.name||'');
      btn.appendChild(txt);
      btn.onclick=function(){
        toggleReferenceCollection(ref,col.id);
        hideCtx();
      };
      menu.appendChild(btn);
    });
  }
  var manage=document.createElement('button');manage.className='ctxi ctxi-new-label';manage.textContent='Koleksiyonları Yönet';
  manage.onclick=function(){hideCtx();openCollectionManager();};
  menu.appendChild(manage);
  // Separator + workspace move options
  if(S.wss.length>1){
    var sep=document.createElement('div');sep.className='ctx-sep';menu.appendChild(sep);
    showMoveMenuItems(menu,ref,S.cur);
  }
  menu.style.top=Math.min(y,window.innerHeight-300)+'px';
  menu.style.left=Math.min(x,window.innerWidth-180)+'px';
  menu.classList.add('show');
}
function editRefMetadata(ref){
  if(!ref)return;
  var oldKey=refKey(ref)||'';
  var oldDoi=String(ref.doi||'').trim().toLowerCase();
  var oldTitle=String(ref.title||'').trim().toLowerCase();
  openRefMetadataModal(ref).then(function(updated){
    if(!updated)return;
    (cLib()||[]).forEach(function(other){
      if(!other)return;
      var otherKey=refKey(other)||'';
      var same=other.id===ref.id
        ||(oldKey&&otherKey===oldKey)
        ||(oldDoi&&String(other.doi||'').trim().toLowerCase()===oldDoi)
        ||(!oldDoi&&oldTitle&&String(other.title||'').trim().toLowerCase()===oldTitle);
      if(same){
        Object.keys(updated).forEach(function(k){other[k]=Array.isArray(updated[k])?updated[k].slice():updated[k];});
      }
    });
    if(curRef){
      Object.keys(updated).forEach(function(k){if(curRef)curRef[k]=Array.isArray(updated[k])?updated[k].slice():updated[k];});
    }
    rLib();
    rRefs();
    updateRefSection();
    save();
    if(curRef)openRef(curRef.id||ref.id);
  });
}
function addManualReference(referenceType){
  var type=normalizeRefTypeValue(referenceType);
  var today=(new Date()).toISOString().slice(0,10);
  var seed={
    referenceType:type,
    title:'',
    authors:[],
    year:'',
    journal:'',
    publisher:'',
    edition:'',
    websiteName:'',
    publishedDate:'',
    accessedDate:type==='website'?today:'',
    volume:'',
    issue:'',
    fp:'',
    lp:'',
    doi:'',
    url:'',
    abstract:'',
    labels:[],
    collectionIds:[],
    wsId:S.cur
  };
  openRefMetadataModal(seed).then(function(updated){
    if(!updated)return;
    var ref=Object.assign({},seed,updated);
    normalizeRefRecord(ref);
    var added=addToLib(ref);
    setDst('Kaynak eklendi.','ok');
    if(added&&added.id)openRef(added.id);
  });
}
function showMoveMenuItems(menu,ref,fromWsId){
  S.wss.forEach(function(ws){
    if(ws.id===fromWsId)return;
    var btn=document.createElement('button');btn.className='ctxi';
    btn.textContent='› '+ws.name;
    btn.onclick=function(){moveRefToWs(ref,fromWsId,ws.id);hideCtx();};
    menu.appendChild(btn);
  });
}
function showMoveMenu(x,y,ref,fromWsId){
  var menu=document.getElementById('ctxmenu');
  menu.innerHTML='';
  S.wss.forEach(function(ws){
    if(ws.id===fromWsId)return;
    var btn=document.createElement('button');btn.className='ctxi';
    btn.textContent='› '+ws.name+' alanına gönder';
    btn.onclick=function(){moveRefToWs(ref,fromWsId,ws.id);hideCtx();};
    menu.appendChild(btn);
  });
  // Copy option
  S.wss.forEach(function(ws){
    if(ws.id===fromWsId)return;
    var btn=document.createElement('button');btn.className='ctxi';
    btn.textContent='? '+ws.name+' alanına kopyala';
    btn.onclick=function(){copyRefToWs(ref,ws.id);hideCtx();};
    menu.appendChild(btn);
  });
  menu.style.top=Math.min(y,window.innerHeight-200)+'px';
  menu.style.left=Math.min(x,window.innerWidth-180)+'px';
  menu.classList.add('show');
}
function closeCtxLabelPanel(){
  var panel=document.getElementById('ctxlabelpanel');
  if(!panel)return;
  panel.classList.remove('show');
  panel.innerHTML='';
}
function openLabelPickerPanel(anchorBtn,ref){
  if(!anchorBtn||!ref)return;
  var panel=document.getElementById('ctxlabelpanel');
  if(!panel){
    panel=document.createElement('div');
    panel.id='ctxlabelpanel';
    document.body.appendChild(panel);
  }
  panel.innerHTML='';
  var title=document.createElement('div');
  title.className='ctx-label-title';
  title.textContent='Etiket Seç';
  panel.appendChild(title);
  var allLabels=defaultLabels.concat(S.customLabels||[]);
  if(!Array.isArray(ref.labels))ref.labels=[];
  allLabels.forEach(function(l){
    var hasLabel=ref.labels.some(function(rl){return rl&&rl.name===l.name;});
    var btn=document.createElement('button');
    btn.className='ctxi';
    var check=document.createElement('span');
    check.className='ctx-label-check'+(hasLabel?'':' off');
    check.textContent='✓';
    btn.appendChild(check);
    var dot=document.createElement('span');
    dot.className='ctx-label-dot';
    dot.style.background=String(l.color||'#9aa');
    btn.appendChild(dot);
    var txt=document.createElement('span');
    txt.textContent=String(l.name||'');
    btn.appendChild(txt);
    btn.onclick=function(){
      if(hasLabel)ref.labels=ref.labels.filter(function(rl){return rl&&rl.name!==l.name;});
      else ref.labels.push({name:l.name,color:l.color});
      save();
      rLib();
      hideCtx();
    };
    panel.appendChild(btn);
  });
  var customLabels=(S.customLabels||[]).filter(function(label){return label&&label.name;});
  if(customLabels.length){
    var delSep=document.createElement('div');
    delSep.className='ctx-sep';
    panel.appendChild(delSep);
    var delTitle=document.createElement('div');
    delTitle.className='ctx-label-title';
    delTitle.textContent='Etiket Sil';
    panel.appendChild(delTitle);
    customLabels.forEach(function(label){
      var delBtn=document.createElement('button');
      delBtn.className='ctxi ctxi-delete-label';
      var delDot=document.createElement('span');
      delDot.className='ctx-label-dot';
      delDot.style.background=String(label.color||'#9aa');
      delBtn.appendChild(delDot);
      var delTxt=document.createElement('span');
      delTxt.textContent=String(label.name||'');
      delBtn.appendChild(delTxt);
      var delX=document.createElement('span');
      delX.className='ctx-label-delete-x';
      delX.textContent='x';
      delBtn.appendChild(delX);
      delBtn.onclick=function(){
        if(!confirm('Bu ozel etiketi silmek istiyor musun?'))return;
        deleteCustomLabel(label.name);
        if(Array.isArray(ref.labels)){
          ref.labels=ref.labels.filter(function(rl){return rl&&rl.name!==label.name;});
        }
        save();
        rLib();
        openLabelPickerPanel(anchorBtn,ref);
      };
      panel.appendChild(delBtn);
    });
  }
  var sep=document.createElement('div');
  sep.className='ctx-sep';
  panel.appendChild(sep);
  var newBtn=document.createElement('button');
  newBtn.className='ctxi ctxi-new-label';
  newBtn.textContent='+ Yeni Etiket';
  newBtn.onclick=function(){
    customPrompt('Etiket adı:','').then(function(name){
      if(!name||!name.trim())return;
      var colors=['#4caf50','#f44336','#2196f3','#9c27b0','#ff9800','#e91e63','#00bcd4','#795548'];
      var color=colors[Math.floor(Math.random()*colors.length)];
      var newLabel={name:name.trim(),color:color};
      if(!S.customLabels)S.customLabels=[];
      if(!S.customLabels.some(function(label){return label&&label.name===newLabel.name;}))S.customLabels.push(newLabel);
      if(!Array.isArray(ref.labels))ref.labels=[];
      if(!ref.labels.some(function(label){return label&&label.name===newLabel.name;}))ref.labels.push(newLabel);
      save();
      rLib();
      hideCtx();
    });
  };
  panel.appendChild(newBtn);
  var rect=anchorBtn.getBoundingClientRect();
  panel.style.top=Math.min(rect.top,window.innerHeight-320)+'px';
  panel.style.left=Math.min(rect.right+6,window.innerWidth-250)+'px';
  panel.classList.add('show');
}
function showLabelMenu(x,y,ref){
  var menu=document.getElementById('ctxmenu');
  if(!menu||!ref)return;
  try{
  menu.innerHTML='';
  closeCtxLabelPanel();
  var editBtn=document.createElement('button');
  editBtn.className='ctxi';
  editBtn.textContent='Künyeyi Düzenle';
  editBtn.onclick=function(){hideCtx();editRefMetadata(ref);};
  menu.appendChild(editBtn);
  var labelBtn=document.createElement('button');
  labelBtn.className='ctxi has-arrow';
  labelBtn.innerHTML='<span>Etiket Ekle</span><span class="ctx-arrow">▸</span>';
  labelBtn.onclick=function(event){
    if(event){event.preventDefault();event.stopPropagation();}
    openLabelPickerPanel(labelBtn,ref);
  };
  menu.appendChild(labelBtn);
  var csep=document.createElement('div');
  csep.className='ctx-sep';
  menu.appendChild(csep);
  var ctitle=document.createElement('div');
  ctitle.className='ctx-label-title';
  ctitle.textContent='Koleksiyonlar';
  menu.appendChild(ctitle);
  var ws=currentWorkspaceForCollections();
  var collections=ensureWorkspaceCollections(ws);
  if(!Array.isArray(ref.collectionIds))ref.collectionIds=[];
  if(!collections.length){
    var empty=document.createElement('div');
    empty.className='ctxi';
    empty.style.opacity='.72';
    empty.textContent='Koleksiyon yok';
    menu.appendChild(empty);
  }else{
    collections.forEach(function(col){
      var has=(ref.collectionIds||[]).some(function(id){return String(id)===String(col.id);});
      var btn=document.createElement('button');
      btn.className='ctxi';
      var check=document.createElement('span');
      check.className='ctx-label-check'+(has?'':' off');
      check.textContent='✓';
      btn.appendChild(check);
      var txt=document.createElement('span');
      txt.textContent=String(col.name||'');
      btn.appendChild(txt);
      btn.onclick=function(){
        toggleReferenceCollection(ref,col.id);
        hideCtx();
      };
      menu.appendChild(btn);
    });
  }
  var manage=document.createElement('button');
  manage.className='ctxi ctxi-new-label';
  manage.textContent='Koleksiyonları Yönet';
  manage.onclick=function(){hideCtx();openCollectionManager();};
  menu.appendChild(manage);
  if(S.wss.length>1){
    var sep=document.createElement('div');
    sep.className='ctx-sep';
    menu.appendChild(sep);
    showMoveMenuItems(menu,ref,S.cur);
  }
  menu.style.top=Math.min(y,window.innerHeight-300)+'px';
  menu.style.left=Math.min(x,window.innerWidth-220)+'px';
  menu.classList.add('show');
  }catch(_err){
    menu.innerHTML='';
    closeCtxLabelPanel();
    var fallbackEdit=document.createElement('button');
    fallbackEdit.className='ctxi';
    fallbackEdit.textContent='KÃ¼nyeyi DÃ¼zenle';
    fallbackEdit.onclick=function(){hideCtx();editRefMetadata(ref);};
    menu.appendChild(fallbackEdit);
    var fallbackLabel=document.createElement('button');
    fallbackLabel.className='ctxi';
    fallbackLabel.textContent='Etiket Ekle';
    fallbackLabel.onclick=function(event){
      if(event){event.preventDefault();event.stopPropagation();}
      openLabelPickerPanel(fallbackLabel,ref);
    };
    menu.appendChild(fallbackLabel);
    menu.style.top=Math.min(y,window.innerHeight-220)+'px';
    menu.style.left=Math.min(x,window.innerWidth-220)+'px';
    menu.classList.add('show');
  }
}
function hideCtx(){
  var menu=document.getElementById('ctxmenu');
  if(menu)menu.classList.remove('show');
  closeCtxLabelPanel();
}
document.addEventListener('click',function(e){
  if(Date.now()-Number(window.__aqSidebarCtxAt||0)<380)return;
  if(!e.target.closest('#ctxmenu')&&!e.target.closest('#ctxlabelpanel'))hideCtx();
});
function moveRefToWs(ref,fromWsId,toWsId){
  var from=S.wss.find(function(w){return w.id===fromWsId;});
  var to=S.wss.find(function(w){return w.id===toWsId;});
  if(!from||!to)return;
  var existing=(to.lib||[]).find(function(r){return refKey(r)===refKey(ref);});
  from.lib=from.lib.filter(function(r){return r.id!==ref.id;});
  if(existing){
    if(!existing.pdfData&&ref.pdfData)existing.pdfData=ref.pdfData;
    if(!existing.pdfUrl&&ref.pdfUrl)existing.pdfUrl=ref.pdfUrl;
    if(!existing.url&&ref.url)existing.url=ref.url;
    if((ref.labels||[]).length){
      var seenLabels={};
      existing.labels=(existing.labels||[]).concat(ref.labels).filter(function(l){
        var k=(l&&l.name||'')+'|'+(l&&l.color||'');
        if(seenLabels[k])return false;
        seenLabels[k]=true;
        return !!(l&&l.name);
      });
    }
  }else{
    ref.wsId=toWsId;
    to.lib.push(ref);
  }
  save();rLib();rRefs();
}
function copyRefToWs(ref,toWsId){
  var to=S.wss.find(function(w){return w.id===toWsId;});
  if(!to)return;
  var existing=(to.lib||[]).find(function(r){return refKey(r)===refKey(ref);});
  if(existing){
    if(!existing.pdfData&&ref.pdfData)existing.pdfData=ref.pdfData;
    if(!existing.pdfUrl&&ref.pdfUrl)existing.pdfUrl=ref.pdfUrl;
    if(!existing.url&&ref.url)existing.url=ref.url;
    if((ref.labels||[]).length){
      var seenLabels={};
      existing.labels=(existing.labels||[]).concat(ref.labels).filter(function(l){
        var k=(l&&l.name||'')+'|'+(l&&l.color||'');
        if(seenLabels[k])return false;
        seenLabels[k]=true;
        return !!(l&&l.name);
      });
    }
    save();rLib();
    return;
  }
  var copy=JSON.parse(JSON.stringify(ref));
  copy.id=uid();copy.wsId=toWsId;copy.pdfData=ref.pdfData;
  to.lib.push(copy);
  save();rLib();
}

// ¦¦ PDF UPLOAD ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function hPDFs(e){
  var files=Array.from((e&&e.target&&e.target.files)||[]);
  files.forEach(pPF);
  try{if(e&&e.target)e.target.value='';}catch(_e){}
}
function hDrop(e){e.preventDefault();Array.from(e.dataTransfer.files).filter(function(f){return f.type==='application/pdf';}).forEach(pPF);}
function pPF(file){
  var maxBytes=120*1024*1024;
  if(file&&file.size>maxBytes){
    setDst('PDF boyutu cok buyuk (120MB siniri).','er');
    logStability('pPF.maxSize',new Error('PDF file too large'),{name:file.name,size:file.size});
    return;
  }
  var reader=new FileReader();
  reader.onerror=function(ev){
    logStability('pPF.read',reader.error||new Error('PDF read failed'),{name:file&&file.name?file.name:null});
    setDst('PDF okunamadi.','er');
  };
  reader.onload=function(ev){
    var orig=ev.target.result;
    var targetRef=(curRef&&document.getElementById('pdfpanel').classList.contains('open'))?curRef:null;
    setDst('PDF okunuyor...','ld');
    document.getElementById('pdfpanel').classList.add('open');
    document.getElementById('pdftitle').textContent=file.name;
    // Render immediately via tab
    addPdfTab(file.name,orig.slice(0),null);
    // Extract DOI in background
    pdfjsLib.getDocument({data:orig.slice(0)}).promise.then(function(pdf){
      pdf.getMetadata().then(function(meta){
        var info=meta.info||{};
        extractDOI(pdf,function(doi){
          var ref={id:uid(),title:(info.Title&&info.Title.trim())||file.name.replace(/\.pdf$/i,''),
            authors:[],year:'',journal:'',volume:'',issue:'',fp:'',lp:'',
            doi:doi||'',url:'',pdfData:orig,pdfUrl:null,wsId:S.cur};
          function finish(r){
            normalizeRefRecord(r);
            var allRefs=[];S.wss.forEach(function(ws){allRefs=allRefs.concat(ws.lib||[]);});
            var existing=(targetRef&&(!targetRef.pdfData||targetRef.id===r.id)?targetRef:null)||allRefs.find(function(x){return refsLikelySame(x,r);})||null;
            if(existing){
              normalizeRefRecord(existing);
              existing.pdfData=orig;
              setRefPdfVerification(existing,{status:'manual',summary:'PDF manuel eklendi'},'');
              if(r.doi&&!existing.doi)existing.doi=r.doi;
              if(r.title&&!existing.title)existing.title=r.title;
              if((r.authors||[]).length&&!(existing.authors||[]).length)existing.authors=r.authors.slice();
              if(r.year&&!existing.year)existing.year=r.year;
              if(r.journal&&!existing.journal)existing.journal=r.journal;
              if(r.volume&&!existing.volume)existing.volume=r.volume;
              if(r.issue&&!existing.issue)existing.issue=r.issue;
              if(r.fp&&!existing.fp)existing.fp=r.fp;
              if(r.lp&&!existing.lp)existing.lp=r.lp;
              curRef=existing;
            }else{
              setRefPdfVerification(r,{status:'manual',summary:'PDF manuel eklendi'},'');
              cLib().push(r);
              curRef=r;
            }
            // Update current tab with ref info
            if(activeTabId){var ct=pdfTabs.find(function(t){return t.id===activeTabId;});if(ct){ct.refId=curRef.id;ct.title=(curRef.title||file.name).substring(0,40);renderPdfTabs();}}
            document.getElementById('pdftitle').textContent=(curRef.title||file.name).substring(0,55);
            // Electron: PDF dosyasini kaydet
            if(typeof window.electronAPI!=='undefined'){
              window.electronAPI.savePDF(curRef.id,orig).catch(function(e){console.warn('PDF kayit:',e);});
            }
            save();rLib();rRefs();
            setDst('? PDF eklendi'+(curRef.doi?' + metadata':''),'ok');
            setTimeout(function(){setDst('','');},3000);
          }
          if(doi){setDst('DOI bulundu, metadata çekiliyor...','ld');fetchCR(doi,function(err,cr){if(!err){ref.title=cr.title||ref.title;ref.authors=cr.authors.length?cr.authors:[];ref.year=cr.year||'';ref.journal=cr.journal||'';ref.volume=cr.volume;ref.issue=cr.issue;ref.fp=cr.fp;ref.lp=cr.lp;}finish(ref);});}
          else{finish(ref);}
        });
      }).catch(function(){
        var ref={id:uid(),title:file.name.replace(/\.pdf$/i,''),authors:[],year:'',journal:'',volume:'',issue:'',fp:'',lp:'',doi:'',url:'',pdfData:orig,pdfUrl:null,wsId:S.cur};
        normalizeRefRecord(ref);
        var existing=(targetRef&&(!targetRef.pdfData)?targetRef:null)||(cLib()||[]).find(function(x){return refsLikelySame(x,ref);});
        if(existing){existing.pdfData=orig;setRefPdfVerification(existing,{status:'manual',summary:'PDF manuel eklendi'},'');curRef=existing;}
        else{setRefPdfVerification(ref,{status:'manual',summary:'PDF manuel eklendi'},'');cLib().push(ref);curRef=ref;}
        if(typeof window.electronAPI!=='undefined'){
          window.electronAPI.savePDF(curRef.id,orig).catch(function(e){console.warn('PDF kayit:',e);});
        }
        save();rLib();rRefs();
        setDst('? PDF eklendi','ok');setTimeout(function(){setDst('','');},3000);
      });
    }).catch(function(e){setDst('PDF açılamadı: '+e.message,'er');});
  };
  reader.readAsArrayBuffer(file);
}

function extractDOI(pdf,cb){
  var found='',checked=0,total=Math.min(pdf.numPages,3);
  if(!total){cb('');return;}
  for(var i=1;i<=total;i++){(function(n){
    pdf.getPage(n).then(function(page){
      page.getTextContent().then(function(tc){
        var text=tc.items.map(function(i){return i.str;}).join(' ');
        var m=text.match(/\b(10\.\d{4,9}\/[^\s"<>]+)/);
        if(m&&!found)found=m[1].replace(/[.,;)]+$/,'');
        if(++checked>=total)cb(found);
      }).catch(function(){if(++checked>=total)cb(found);});
    }).catch(function(){if(++checked>=total)cb(found);});
  })(i);}
}

// ¦¦ OA PDF URL helpers ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function buildPDFUrls(url){
  if(!url) return [];
  var urls=[url];
  // arXiv: /abs/ -> /pdf/
  if(url.match(/arxiv\.org\/abs\//i)){
    urls.unshift(url.replace(/\/abs\//,'/pdf/')+'.pdf');
    urls.unshift(url.replace(/\/abs\//,'/pdf/'));
  }
  if(url.match(/arxiv\.org\/pdf\//i)&&!url.endsWith('.pdf')){
    urls.unshift(url+'.pdf');
  }
  // PMC: europepmc veya ncbi pdf linki
  var pmcMatch=url.match(/PMC(\d+)/i);
  if(pmcMatch){
    urls.unshift('https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC'+pmcMatch[1]+'&blobtype=pdf');
    urls.unshift('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC'+pmcMatch[1]+'/pdf/');
  }
  // bioRxiv/medRxiv
  if(url.match(/(biorxiv|medrxiv)\.org\/content\//i)){
    if(!url.endsWith('.pdf')&&!url.endsWith('.full.pdf')){
      urls.unshift(url.replace(/\.full$/,'')+'.full.pdf');
      urls.unshift(url+'.full.pdf');
    }
  }
  // MDPI
  if(url.match(/mdpi\.com/i)&&!url.includes('/pdf')){
    urls.unshift(url.replace(/\/htm$/,'/pdf'));
  }
  // PeerJ
  if(url.match(/peerj\.com\/articles\//i)&&!url.endsWith('.pdf')){
    urls.unshift(url+'.pdf');
  }
  // PLOS
  if(url.match(/journals\.plos\.org/i)&&url.includes('article?id=')){
    var plosId=url.match(/id=([\w.\/]+)/);
    if(plosId) urls.unshift('https://journals.plos.org/plosone/article/file?id='+plosId[1]+'&type=printable');
  }
  // Frontiers
  if(url.match(/frontiersin\.org\/articles?\//i)&&!url.endsWith('/pdf')){
    urls.unshift(url.replace(/\/full$/,'')+'/pdf');
  }
  // Semantic Scholar - direct PDF
  if(url.match(/semanticscholar\.org/i)&&url.includes('/paper/')){
    // S2 URL'den PDF versiyonunu dene
    var s2Match=url.match(/\/paper\/.*?\/([a-f0-9]{40})/i);
    if(s2Match) urls.unshift('https://pdfs.semanticscholar.org/'+s2Match[1].substring(0,4)+'/'+s2Match[1]+'.pdf');
  }
  // DOI resolver: sci-hub alternatifleri yok, sadece OA
  // URL'deki .html -> .pdf degisimi
  if(url.endsWith('.html')){
    urls.push(url.replace(/\.html$/,'.pdf'));
  }
  // Tekrar eden URL'leri kaldir
  var seen={};return urls.filter(function(u){if(seen[u])return false;seen[u]=true;return true;});
}

function tryFetchChain(urls,idx,refId,fetchToken){
  if(!isPdfFetchTokenActive(fetchToken))return;
  if(idx>=urls.length){
    if(!isPdfFetchTokenActive(fetchToken))return;
    // Tüm URL'ler başarısız
    var ref=findRef(refId);
    showNoPDF(ref||{doi:'',pdfUrl:urls[0]||'',title:''});
    setDst('OA PDF açılamadı (CORS). PDF dosyasını indirip yükleyin.','er');
    setTimeout(function(){setDst('','');},7000);
    return;
  }
  var u=urls[idx];
  fetch(u,{redirect:'follow'})
    .then(function(r){
      if(!r.ok) throw new Error('HTTP '+r.status);
      var ct=(r.headers.get('content-type')||'').toLowerCase();
      if(ct.indexOf('pdf')<0&&ct.indexOf('octet')<0&&ct.indexOf('binary')<0) throw new Error('PDF değil: '+ct);
      return r.arrayBuffer();
    })
    .then(function(buf){
      if(!isPdfFetchTokenActive(fetchToken))return;
      if(!buf||buf.byteLength<1000) throw new Error('Çok küçük dosya');
      // İlk birkaç byte'ı kontrol et — PDF mi?
      var header=new Uint8Array(buf.slice(0,5));
      var sig=String.fromCharCode.apply(null,header);
      if(sig!=='%PDF-') throw new Error('PDF header yok');
      attachFetchedPDF(refId,buf.slice(0),u);
      var ref=findRef(refId);
      addPdfTab((ref&&ref.title)||'PDF',buf,refId);
      setDst('? OA PDF yüklendi','ok');
      setTimeout(function(){setDst('','');},3000);
    })
    .catch(function(err){
      if(!isPdfFetchTokenActive(fetchToken))return;
      // Sonraki URL'yi dene
      tryFetchChain(urls,idx+1,refId,fetchToken);
    });
}

function tryFetch(url,refId){
  if(!url){var ref=findRef(refId);showNoPDF(ref||{});return;}
  // Her iki modda da URL alternatifleri oluştur
  var urls=buildPDFUrls(url);
  // Electron: Node.js ile sırayla dene
  if(typeof window.electronAPI!=='undefined'){
    clearPDFView();
    var fetchToken=createPdfFetchToken();
    var scEl=document.getElementById('pdfscroll');
    scEl.innerHTML='<div style="color:var(--acc);font-size:12px;padding:20px;text-align:center;width:100%;min-height:100px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px"><div>PDF indiriliyor...</div><div id="trystatus" style="font-size:10px;color:var(--txt3);max-width:350px;word-break:break-all"></div></div>';
    electronFetchChain(urls,0,refId,fetchToken);
    return;
  }
  // Tarayici
  clearPDFView();
  var fetchToken=createPdfFetchToken();
  document.getElementById('pdfscroll').innerHTML='<div style="color:var(--acc);font-size:12px;padding:20px;text-align:center;width:100%">OA PDF deneniyor...</div>';
  tryFetchChain(urls,0,refId,fetchToken);
}
function attachFetchedPDF(refId,buffer,url,verification){
  var ref=findRef(refId);
  if(!ref)return;
  normalizeRefRecord(ref);
  ref.pdfData=buffer;
  if(url&&!ref.pdfUrl)ref.pdfUrl=url;
  if(url&&!ref.url)ref.url=url;
  if(verification)propagatePdfVerification(ref,verification,url);
  S.wss.forEach(function(ws){
    (ws.lib||[]).forEach(function(cand){
      if(!cand||cand.id===ref.id)return;
      normalizeRefRecord(cand);
      if(!refsLikelySame(cand,ref))return;
      if(!cand.pdfData)cand.pdfData=buffer;
      if(url&&!cand.pdfUrl)cand.pdfUrl=url;
      if(url&&!cand.url)cand.url=url;
      if(verification)setRefPdfVerification(cand,verification,url);
      persistBorrowedPDF(cand);
    });
  });
  persistBorrowedPDF(ref);
  save();
  rLib();
}

function electronFetchChain(urls,idx,refId,fetchToken){
  if(!isPdfFetchTokenActive(fetchToken))return;
  if(idx>=urls.length){
    if(!isPdfFetchTokenActive(fetchToken))return;
    var ref=findRef(refId);
    showNoPDF(ref||{doi:'',pdfUrl:urls[0]||'',title:''});
    setDst('PDF indirilemedi. Manuel yukleyin.','er');
    setTimeout(function(){setDst('','');},6000);
    return;
  }
  var u=urls[idx];
  var stEl=document.getElementById('trystatus');
  if(stEl) stEl.textContent='Deneniyor '+(idx+1)+'/'+urls.length+': '+u.substring(0,60)+'...';
  setDst('Deneniyor '+(idx+1)+'/'+urls.length+'...','ld');
  var ref=findRef(refId);
  var dlOptions={};
  if(ref&&ref.doi){
    dlOptions.expectedDoi=normalizeRefDoi(ref.doi);
    dlOptions.requireDoiEvidence=true;
  }
  if(ref&&ref.title)dlOptions.expectedTitle=ref.title;
  if(ref&&Array.isArray(ref.authors)&&ref.authors.length)dlOptions.expectedAuthors=ref.authors.slice(0,4);
  if(ref&&ref.year)dlOptions.expectedYear=String(ref.year||'');
  window.electronAPI.downloadPDFfromURL(u,refId,dlOptions)
    .then(function(res){
      if(!isPdfFetchTokenActive(fetchToken))return;
      if(res.ok){
        return window.electronAPI.loadPDF(refId).then(function(pr){
          if(!isPdfFetchTokenActive(fetchToken))return;
          if(pr.ok){
            attachFetchedPDF(refId,pr.buffer,u,res.verification||null);
            var refLoaded=findRef(refId);
            addPdfTab((refLoaded&&refLoaded.title)||'PDF',pr.buffer,refId);
            var trust=pdfVerificationSummaryText(refLoaded);
            setDst(trust?('PDF indirildi · '+trust):('PDF indirildi ('+Math.round(res.size/1024)+' KB)'),'ok');
            setTimeout(function(){setDst('','');},3000);
          } else {
            electronFetchChain(urls,idx+1,refId,fetchToken);
          }
        });
      } else {
        var failure=(res&&res.failure)||classifyPdfDownloadFailureLocal((res&&res.error)?String(res.error):'Indirme basarisiz');
        if(idx>=urls.length-1&&failure&&failure.isProtectedAccess){
          if(ref&&u&&!ref.pdfUrl)ref.pdfUrl=u;
          save();rLib();rRefs();
          setDst(failure.userMessage,'er');
          showPdfDownloadFallback(ref||{pdfUrl:u},failure);
          return;
        }
        // Bu URL basarisiz, sonrakini dene
        electronFetchChain(urls,idx+1,refId,fetchToken);
      }
    })
    .catch(function(e){
      if(!isPdfFetchTokenActive(fetchToken))return;
      var failure=classifyPdfDownloadFailureLocal((e&&e.message)?e.message:String(e));
      if(idx>=urls.length-1&&failure&&failure.isProtectedAccess){
        if(ref&&u&&!ref.pdfUrl)ref.pdfUrl=u;
        save();rLib();rRefs();
        setDst(failure.userMessage,'er');
        showPdfDownloadFallback(ref||{pdfUrl:u},failure);
        return;
      }
      electronFetchChain(urls,idx+1,refId,fetchToken);
    });
}

// ¦¦ PDF RENDER ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
var renderedPages={};
var lazyObserver=null;
function createPdfRenderToken(sourceTabId){
  pdfRenderTokenId++;
  currentPdfRenderToken={id:pdfRenderTokenId,tabId:sourceTabId||null};
  return currentPdfRenderToken;
}
function isPdfRenderTokenActive(token){
  if(!token||!currentPdfRenderToken)return false;
  if(token.id!==currentPdfRenderToken.id)return false;
  if(token.tabId&&activeTabId&&token.tabId!==activeTabId)return false;
  return true;
}
function createPdfFetchToken(){
  pdfFetchToken++;
  return pdfFetchToken;
}
function isPdfFetchTokenActive(token){
  return token===pdfFetchToken;
}

function getPdfOcrStateKey(tabId){
  return String(tabId||activeTabId||'__pdf__');
}

function ensurePdfOcrState(tabId){
  var key=getPdfOcrStateKey(tabId);
  if(!pdfOcrStateByTab[key]){
    pdfOcrStateByTab[key]={
      tabId:key,
      totalPages:0,
      samplePages:0,
      scannedPages:0,
      pagesWithText:0,
      pagesWithoutText:0,
      status:'idle',
      label:'',
      error:'',
      needsOCR:false,
      notifiedNeeded:false,
      ocrRunning:false,
      ocrTargetPages:0,
      ocrProcessedPages:0,
      ocrAppliedPages:0,
      ocrFailedPages:0,
      ocrSkippedPages:0,
      ocrCancelled:false,
      ocrLastAt:0,
      ocrPageItems:{},
      ocrPageMeta:{},
      ocrAutoQueued:false,
      updatedAt:0
    };
  }
  return pdfOcrStateByTab[key];
}

function resetPdfOcrState(tabId,totalPages,samplePages){
  var state=ensurePdfOcrState(tabId);
  var cachedItems=(state.ocrPageItems&&typeof state.ocrPageItems==='object')?state.ocrPageItems:{};
  var cachedMeta=(state.ocrPageMeta&&typeof state.ocrPageMeta==='object')?state.ocrPageMeta:{};
  var cachedApplied=0;
  Object.keys(cachedItems).forEach(function(key){
    if(hasPdfTextItems(cachedItems[key]))cachedApplied++;
  });
  state.totalPages=Math.max(0,parseInt(totalPages,10)||0);
  var sample=Math.max(0,parseInt(samplePages,10)||0);
  if(state.totalPages&&sample>state.totalPages)sample=state.totalPages;
  state.samplePages=sample;
  state.scannedPages=0;
  state.pagesWithText=0;
  state.pagesWithoutText=0;
  state.status=sample>0?'scanning':'idle';
  state.label=sample>0?('OCR tarama: sf 0/'+sample):'';
  state.error='';
  state.needsOCR=false;
  state.notifiedNeeded=false;
  state.ocrRunning=false;
  state.ocrTargetPages=0;
  state.ocrProcessedPages=0;
  state.ocrAppliedPages=cachedApplied;
  state.ocrFailedPages=0;
  state.ocrSkippedPages=0;
  state.ocrCancelled=false;
  state.ocrLastAt=0;
  state.ocrPageItems=cachedItems;
  state.ocrPageMeta=cachedMeta;
  state.ocrAutoQueued=false;
  state.updatedAt=Date.now();
  return state;
}

function summarizePdfOcrState(state){
  if(!state)return {status:'idle',label:'',needsOCR:false};
  if(window.AQPdfViewerState&&typeof window.AQPdfViewerState.buildPdfOcrProbeState==='function'){
    return window.AQPdfViewerState.buildPdfOcrProbeState({
      totalPages:state.totalPages,
      samplePages:state.samplePages,
      scannedPages:state.scannedPages,
      pagesWithText:state.pagesWithText,
      error:state.error,
      ocrRunning:state.ocrRunning,
      ocrTargetPages:state.ocrTargetPages,
      ocrProcessedPages:state.ocrProcessedPages,
      ocrAppliedPages:state.ocrAppliedPages,
      ocrFailedPages:state.ocrFailedPages,
      ocrSkippedPages:state.ocrSkippedPages,
      ocrCancelled:state.ocrCancelled,
      ocrAutoQueued:state.ocrAutoQueued
    });
  }
  if(state.ocrRunning){
    var labelRunning='OCR metni cikariliyor';
    if(state.ocrTargetPages>0){
      labelRunning+=': sf '+Math.min(state.ocrProcessedPages||0,state.ocrTargetPages)+'/'+state.ocrTargetPages;
      if((state.ocrSkippedPages||0)>0)labelRunning+=' ('+state.ocrSkippedPages+' atlandi)';
    }
    return {status:'ocr_running',label:labelRunning,needsOCR:false};
  }
  if(state.ocrCancelled){
    var labelCancelled='OCR iptal edildi';
    if(state.ocrTargetPages>0){
      labelCancelled+=': sf '+Math.min(state.ocrProcessedPages||0,state.ocrTargetPages)+'/'+state.ocrTargetPages;
    }
    return {status:'cancelled',label:labelCancelled,needsOCR:false};
  }
  if(state.ocrAutoQueued){
    return {status:'scanning',label:'OCR hazirlaniyor',needsOCR:true};
  }
  if((state.ocrAppliedPages||0)>0){
    var appliedLabel='OCR metni aktif: '+state.ocrAppliedPages+' sf';
    if((state.ocrFailedPages||0)>0)appliedLabel+=' ('+state.ocrFailedPages+' hata)';
    return {status:'ocr_applied',label:appliedLabel,needsOCR:false};
  }
  var needsOCR=state.samplePages>0&&state.scannedPages>=state.samplePages&&state.pagesWithText===0;
  return {
    status:needsOCR?'needed':(state.samplePages>0&&state.scannedPages<state.samplePages?'scanning':'ready'),
    label:needsOCR?'OCR gerekli (metin katmani yok)':'',
    needsOCR:needsOCR
  };
}

function getActivePdfOcrState(){
  return ensurePdfOcrState(activeTabId||null);
}

function getPdfOcrActivityLabel(){
  var summary=summarizePdfOcrState(getActivePdfOcrState());
  if(summary.status==='scanning')return summary.label||'OCR tarama';
  if(summary.status==='ocr_running')return summary.label||'OCR metni cikariliyor';
  if(summary.status==='ocr_applied')return summary.label||'OCR metni aktif';
  if(summary.status==='cancelled')return summary.label||'OCR iptal edildi';
  if(summary.status==='needed')return summary.label||'OCR gerekli';
  if(summary.status==='error')return summary.label||'OCR tarama hatasi';
  return '';
}

function notifyPdfOcrNeedOnce(state){
  if(!state||state.notifiedNeeded)return;
  state.notifiedNeeded=true;
  setDst('PDF metin katmani zayif. OCR gerekebilir.','ld');
  setTimeout(function(){setDst('','');},2800);
}

function hasPdfTextItems(items){
  if(!Array.isArray(items)||!items.length)return false;
  return items.some(function(item){
    return item&&typeof item.str==='string'&&item.str.trim().length>0;
  });
}

function getCachedOcrItemsForPage(pageNum,tabId){
  var state=ensurePdfOcrState(tabId||activeTabId||null);
  if(!state||!state.ocrPageItems)return [];
  var items=state.ocrPageItems[String(pageNum)];
  return Array.isArray(items)?items:[];
}

function getOcrPageMeta(state,pageNum){
  if(!state)return null;
  if(!state.ocrPageMeta||typeof state.ocrPageMeta!=='object')state.ocrPageMeta={};
  var key=String(pageNum);
  var entry=state.ocrPageMeta[key];
  if(!entry||typeof entry!=='object'){
    entry={status:'',attempts:0,failures:0,lastError:'',updatedAt:0};
    state.ocrPageMeta[key]=entry;
  }
  entry.attempts=Math.max(0,parseInt(entry.attempts,10)||0);
  entry.failures=Math.max(0,parseInt(entry.failures,10)||0);
  entry.status=String(entry.status||'').trim();
  entry.lastError=String(entry.lastError||'').trim();
  entry.updatedAt=Math.max(0,Number(entry.updatedAt)||0);
  return entry;
}

function markOcrPageMeta(state,pageNum,status,meta){
  var entry=getOcrPageMeta(state,pageNum);
  if(!entry)return;
  meta=meta||{};
  entry.status=String(status||'').trim();
  if(meta.bumpAttempts)entry.attempts=Math.max(0,entry.attempts+1);
  if(meta.bumpFailures)entry.failures=Math.max(0,entry.failures+1);
  if(typeof meta.lastError!=='undefined'){
    entry.lastError=String(meta.lastError||'').trim();
  }else if(entry.status==='success'){
    entry.lastError='';
    entry.failures=0;
  }
  entry.updatedAt=Date.now();
}

function countOcrAppliedPages(itemsMap){
  if(!itemsMap||typeof itemsMap!=='object')return 0;
  return Object.keys(itemsMap).filter(function(key){
    return hasPdfTextItems(itemsMap[key]);
  }).length;
}

function shouldRetryOcrErrorCode(code){
  var normalized=String(code||'').trim().toUpperCase();
  if(!normalized)return false;
  return normalized==='AI_TIMEOUT'
    || normalized==='AI_NETWORK_ERROR'
    || normalized==='AI_OVERLOADED'
    || normalized==='AI_PROVIDER_5XX'
    || normalized==='AI_RATE_LIMIT'
    || normalized==='ETIMEDOUT'
    || normalized==='ECONNRESET'
    || normalized==='EAI_AGAIN'
    || normalized==='ENOTFOUND';
}

function shouldAbortOcrRunForCode(code){
  var normalized=String(code||'').trim().toLowerCase();
  if(!normalized)return false;
  return normalized==='ai_not_configured'
    || normalized==='ai_auth_failed'
    || normalized==='ai_forbidden'
    || normalized==='ai_model_not_found'
    || normalized==='ai_insecure_endpoint'
    || normalized==='ai_invalid_url';
}

function cancelPdfOcrRun(options){
  options=options||{};
  var state=getActivePdfOcrState();
  var hadWork=!!(state.ocrRunning||state.ocrAutoQueued);
  clearPdfOcrAutoTimer();
  pdfOcrRunToken++;
  state.ocrRunning=false;
  state.ocrAutoQueued=false;
  state.ocrCancelled=true;
  state.status='cancelled';
  state.label='OCR iptal edildi';
  state.updatedAt=Date.now();
  updatePdfReaderStatus();
  if(hadWork&&!options.silent){
    setDst('OCR islemi iptal edildi.','ld');
    setTimeout(function(){setDst('','');},2200);
  }else if(!hadWork&&!options.silent){
    setDst('OCR calismiyor.','ld');
    setTimeout(function(){setDst('','');},2200);
  }
  return hadWork;
}

function clearPdfOcrAutoTimer(){
  if(pdfOcrAutoTimer){
    clearTimeout(pdfOcrAutoTimer);
    pdfOcrAutoTimer=0;
  }
}

function syncOcrCacheToTab(tabId){
  var id=String(tabId||activeTabId||'').trim();
  if(!id)return;
  var tab=pdfTabs.find(function(item){return item&&String(item.id||'')===id;});
  if(!tab)return;
  var state=ensurePdfOcrState(id);
  tab.ocrPageItems=Object.assign({},state.ocrPageItems||{});
  tab.ocrPageMeta=Object.assign({},state.ocrPageMeta||{});
  tab.ocrLastAt=Number(state.ocrLastAt||0);
}

function schedulePdfOcrAutoRun(options){
  options=options||{};
  var tabId=String(options.tabId||activeTabId||'').trim();
  if(!tabId)return false;
  var state=ensurePdfOcrState(tabId);
  if(state.ocrRunning||state.ocrAutoQueued)return false;
  clearPdfOcrAutoTimer();
  state.ocrAutoQueued=true;
  state.ocrCancelled=false;
  var delay=Math.max(300,parseInt(options.delayMs,10)||900);
  pdfOcrAutoTimer=setTimeout(function(){
    pdfOcrAutoTimer=0;
    var current=ensurePdfOcrState(tabId);
    current.ocrAutoQueued=false;
    if(String(activeTabId||'')!==tabId)return;
    runPdfOcrNow({
      manual:false,
      includeAllPages:true,
      maxPages:Math.max(2,Math.min(18,pdfTotal||1))
    }).catch(function(){});
  },delay);
  updatePdfReaderStatus();
  return true;
}

function normalizeOcrExtractedText(text){
  var raw=String(text||'')
    .replace(/\u00A0/g,' ')
    .replace(/\u200B/g,'')
    .replace(/\r\n?/g,'\n');
  var cleaned=raw
    .split('\n')
    .map(function(line){return line.replace(/\s+/g,' ').trim();})
    .join('\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
  return cleaned;
}

function buildSyntheticOcrItems(text,pageWidth,pageHeight){
  var normalized=normalizeOcrExtractedText(text);
  if(!normalized)return [];
  var width=Math.max(120,Number(pageWidth)||595);
  var height=Math.max(120,Number(pageHeight)||842);
  var fontSize=11;
  var lineHeight=Math.round(fontSize*1.42*1000)/1000;
  var leftMargin=36;
  var rightMargin=36;
  var usableWidth=Math.max(80,width-leftMargin-rightMargin);
  var maxChars=Math.max(18,Math.floor(usableWidth/(fontSize*0.56)));
  var lines=[];
  normalized.split('\n').forEach(function(rawLine){
    var line=String(rawLine||'').trim();
    if(!line){
      if(lines.length&&lines[lines.length-1]!=='')lines.push('');
      return;
    }
    var words=line.split(/\s+/).filter(Boolean);
    if(!words.length)return;
    var cur='';
    words.forEach(function(word){
      var next=cur?(cur+' '+word):word;
      if(next.length<=maxChars){
        cur=next;
        return;
      }
      if(cur)lines.push(cur);
      cur=word;
      if(cur.length>maxChars){
        while(cur.length>maxChars){
          lines.push(cur.slice(0,maxChars));
          cur=cur.slice(maxChars);
        }
      }
    });
    if(cur)lines.push(cur);
  });
  if(!lines.length)return [];
  var maxLines=Math.max(60,Math.floor((height-72)/lineHeight));
  if(lines.length>maxLines)lines=lines.slice(0,maxLines);
  var baseline=height-48;
  var items=[];
  for(var i=0;i<lines.length;i++){
    var lineText=String(lines[i]||'');
    if(!lineText){
      baseline-=lineHeight;
      continue;
    }
    if(baseline<=24)break;
    var estWidth=Math.max(fontSize*0.5,lineText.length*fontSize*0.56);
    items.push({
      str:lineText,
      transform:[fontSize,0,0,fontSize,leftMargin,baseline],
      width:estWidth,
      height:fontSize,
      aqOcrSynthetic:true
    });
    baseline-=lineHeight;
  }
  return items;
}

async function applyOcrItemsToRenderedPage(pageNum,items,renderToken){
  if(!Array.isArray(items)||!items.length)return false;
  if(renderToken&&!isPdfRenderTokenActive(renderToken))return false;
  var wrap=document.querySelector('.pdf-page-wrap[data-page="'+pageNum+'"]');
  if(!wrap)return false;
  var textDiv=wrap.querySelector('.textLayer');
  if(!textDiv)return false;
  if(!pdfDoc)return false;
  try{
    var page=await pdfDoc.getPage(pageNum);
    if(renderToken&&!isPdfRenderTokenActive(renderToken))return false;
    var vp=page.getViewport({scale:getScale()});
    textDiv.innerHTML='';
    manualTextLayer({items:items},textDiv,vp);
    var hlCanvas=wrap.querySelector('.hl-overlay');
    if(hlCanvas)paintHL(hlCanvas,pageNum);
    return true;
  }catch(_e){
    return false;
  }
}

async function runPdfOcrNow(options){
  options=options||{};
  clearPdfOcrAutoTimer();
  if(!pdfDoc){
    if(options.manual!==false){
      setDst('OCR icin acik PDF yok.','er');
      setTimeout(function(){setDst('','');},2600);
    }
    return {ok:false,code:'NO_PDF'};
  }
  if(!window.ocrAPI||typeof window.ocrAPI.recognize!=='function'){
    if(options.manual!==false){
      setDst('OCR modulu hazir degil.','er');
      setTimeout(function(){setDst('','');},3000);
    }
    return {ok:false,code:'OCR_BRIDGE_MISSING'};
  }
  function waitOcrRetryDelay(ms){
    return new Promise(function(resolve){
      setTimeout(resolve,Math.max(0,parseInt(ms,10)||0));
    });
  }
  var manualMode=options.manual!==false;
  var retryFailedOnly=!!options.retryFailedOnly;
  var ignoreRetryCap=!!options.ignoreRetryCap;
  var maxFailuresPerPage=Math.max(1,parseInt(options.maxFailuresPerPage,10)|| (manualMode?4:2));
  var maxAttemptsPerPage=Math.max(1,parseInt(options.maxAttemptsPerPage,10)|| (manualMode?2:1));
  var state=getActivePdfOcrState();
  if(state.ocrRunning){
    if(manualMode){
      setDst('OCR zaten calisiyor.','ld');
      setTimeout(function(){setDst('','');},2200);
    }
    return {ok:false,code:'OCR_ALREADY_RUNNING'};
  }
  var pages=[];
  var skippedByRetryCap=0;
  var maxPages=Math.max(1,parseInt(options.maxPages,10)||Math.min(8,Math.max(1,pdfTotal||1)));
  for(var p=1;p<=pdfTotal;p++){
    if(hasPdfTextItems(pdfTextCache[p]))continue;
    if(hasPdfTextItems(getCachedOcrItemsForPage(p,activeTabId||null))){
      pdfTextCache[p]=getCachedOcrItemsForPage(p,activeTabId||null);
      markOcrPageMeta(state,p,'success',{lastError:''});
      continue;
    }
    var pageMeta=getOcrPageMeta(state,p);
    if(retryFailedOnly&&(!pageMeta||pageMeta.failures<=0))continue;
    if(!manualMode&&!ignoreRetryCap&&pageMeta&&pageMeta.failures>=maxFailuresPerPage){
      skippedByRetryCap++;
      markOcrPageMeta(state,p,'skipped',{lastError:pageMeta.lastError||'retry_cap'});
      continue;
    }
    pages.push(p);
    markOcrPageMeta(state,p,'queued');
    if(pages.length>=maxPages&&!options.includeAllPages)break;
  }
  state.ocrSkippedPages=skippedByRetryCap;
  if(!pages.length){
    if(manualMode){
      if(retryFailedOnly){
        setDst('OCR: yeniden denenecek basarisiz sayfa yok.','ok');
      }else if(skippedByRetryCap>0){
        setDst('OCR: otomatik deneme limiti asilan sayfalar atlandi ('+skippedByRetryCap+').','ld');
      }else{
        setDst('OCR: metin katmani yeterli, ek cikarim gerekmiyor.','ok');
      }
      setTimeout(function(){setDst('','');},2800);
    }
    updatePdfReaderStatus();
    return {ok:true,applied:0,failed:0,total:0,skipped:skippedByRetryCap};
  }
  var appliedBaseline=countOcrAppliedPages(state.ocrPageItems||{});
  var runToken=++pdfOcrRunToken;
  var renderToken=currentPdfRenderToken;
  state.ocrRunning=true;
  state.ocrCancelled=false;
  state.ocrAutoQueued=false;
  state.ocrTargetPages=pages.length;
  state.ocrProcessedPages=0;
  state.ocrAppliedPages=appliedBaseline;
  state.ocrFailedPages=0;
  state.ocrSkippedPages=skippedByRetryCap;
  state.error='';
  state.updatedAt=Date.now();
  updatePdfReaderStatus();
  var interrupted=false;
  var interruptedReason='';
  for(var i=0;i<pages.length;i++){
    var pageNum=pages[i];
    if(runToken!==pdfOcrRunToken){
      interrupted=true;
      interruptedReason='cancelled';
      break;
    }
    if(renderToken&&!isPdfRenderTokenActive(renderToken)){
      interrupted=true;
      interruptedReason='render-token';
      break;
    }
    markOcrPageMeta(state,pageNum,'running',{bumpAttempts:true,lastError:''});
    try{
      var page=await pdfDoc.getPage(pageNum);
      if(runToken!==pdfOcrRunToken){
        interrupted=true;
        interruptedReason='cancelled';
        break;
      }
      if(renderToken&&!isPdfRenderTokenActive(renderToken)){
        interrupted=true;
        interruptedReason='render-token';
        break;
      }
      var ocrScale=Math.max(1.6,Math.min(2.2,getScale()+0.55));
      var ocrVp=page.getViewport({scale:ocrScale});
      var ocrCanvas=document.createElement('canvas');
      ocrCanvas.width=Math.max(1,Math.round(ocrVp.width));
      ocrCanvas.height=Math.max(1,Math.round(ocrVp.height));
      var ocrCtx=ocrCanvas.getContext('2d');
      await page.render({canvasContext:ocrCtx,viewport:ocrVp}).promise;
      var dataUrl=ocrCanvas.toDataURL('image/png');
      var ocrRes=null;
      var text='';
      var ocrCode='';
      for(var attempt=1;attempt<=maxAttemptsPerPage;attempt++){
        ocrRes=await window.ocrAPI.recognize({
          imageDataUrl:dataUrl,
          lang:'tur+eng',
          page:pageNum,
          contextLabel:(curRef&&curRef.title)||'PDF'
        });
        ocrCode=String(ocrRes&&ocrRes.code||'').trim();
        text=normalizeOcrExtractedText(ocrRes&&ocrRes.text||'');
        if(ocrRes&&ocrRes.ok&&text)break;
        if(attempt>=maxAttemptsPerPage)break;
        if(!shouldRetryOcrErrorCode(ocrCode))break;
        await waitOcrRetryDelay(220*attempt);
      }
      if(ocrRes&&ocrRes.ok&&text){
        var baseVp=page.getViewport({scale:1});
        var syntheticItems=buildSyntheticOcrItems(text,baseVp.width,baseVp.height);
        if(syntheticItems.length){
          state.ocrPageItems[String(pageNum)]=syntheticItems;
          pdfTextCache[pageNum]=syntheticItems;
          await applyOcrItemsToRenderedPage(pageNum,syntheticItems,renderToken);
          state.ocrAppliedPages=countOcrAppliedPages(state.ocrPageItems||{});
          state.pagesWithText=Math.max(state.pagesWithText,Math.min(state.samplePages||state.ocrAppliedPages,state.ocrAppliedPages));
          state.pagesWithoutText=Math.max(0,state.scannedPages-state.pagesWithText);
          markOcrPageMeta(state,pageNum,'success',{lastError:''});
          syncOcrCacheToTab(activeTabId||null);
        }else{
          state.ocrFailedPages++;
          markOcrPageMeta(state,pageNum,'failed',{bumpFailures:true,lastError:'ocr_empty_text'});
        }
      }else{
        state.ocrFailedPages++;
        var failureCode=ocrRes&&ocrRes.code?String(ocrRes.code).toLowerCase():'';
        markOcrPageMeta(state,pageNum,'failed',{bumpFailures:true,lastError:failureCode||'ocr_failed'});
        if(shouldAbortOcrRunForCode(failureCode)){
          state.error=failureCode;
          state.ocrProcessedPages=i+1;
          break;
        }
      }
    }catch(_e){
      state.ocrFailedPages++;
      markOcrPageMeta(state,pageNum,'failed',{bumpFailures:true,lastError:'ocr_exception'});
    }
    if(interrupted)break;
    state.ocrProcessedPages=i+1;
    state.ocrLastAt=Date.now();
    state.updatedAt=Date.now();
    updatePdfReaderStatus();
  }
  state.ocrRunning=false;
  state.ocrAutoQueued=false;
  state.ocrCancelled=interrupted&&interruptedReason==='cancelled';
  state.updatedAt=Date.now();
  if(!state.ocrCancelled&&!state.ocrAppliedPages&&state.ocrFailedPages>0&&!state.error)state.error='ocr_failed';
  var summary=summarizePdfOcrState(state);
  state.status=summary.status;
  state.label=summary.label;
  state.needsOCR=!!summary.needsOCR;
  syncOcrCacheToTab(activeTabId||null);
  updatePdfReaderStatus();
  var appliedDelta=Math.max(0,state.ocrAppliedPages-appliedBaseline);
  if(manualMode){
    if(state.ocrCancelled){
      setDst('OCR islemi iptal edildi.','ld');
    }else if(appliedDelta>0){
      setDst('OCR uygulandi: '+appliedDelta+' sayfada metin olusturuldu.','ok');
    }else if(state.error){
      setDst('OCR basarisiz: '+String(state.error)+'.','er');
    }else{
      setDst('OCR metin cikaramadi.'+(state.ocrSkippedPages?(' ('+state.ocrSkippedPages+' sayfa atlandi)'):''),'er');
    }
    setTimeout(function(){setDst('','');},3200);
  }
  return {
    ok:appliedDelta>0,
    applied:appliedDelta,
    appliedTotal:state.ocrAppliedPages,
    failed:state.ocrFailedPages,
    skipped:state.ocrSkippedPages,
    cancelled:state.ocrCancelled,
    total:state.ocrTargetPages,
    status:state.status,
    label:state.label
  };
}

// OCR detection pass (fast): checks sampled pages for missing text-layer risk.
async function scanPdfTextLayerForOcr(renderToken,options){
  options=options||{};
  if(!pdfDoc)return null;
  var tabId=options.tabId||activeTabId||null;
  var totalPages=Math.max(0,pdfTotal||pdfDoc.numPages||0);
  var samplePages=options.samplePages;
  if(samplePages==null)samplePages=Math.min(3,totalPages||0);
  var state=resetPdfOcrState(tabId,totalPages,samplePages);
  updatePdfReaderStatus();
  var localToken=++pdfOcrProbeToken;
  for(var n=1;n<=state.samplePages;n++){
    if(renderToken&&!isPdfRenderTokenActive(renderToken))return null;
    if(localToken!==pdfOcrProbeToken)return null;
    try{
      var page=await pdfDoc.getPage(n);
      var tc=await page.getTextContent({normalizeWhitespace:true});
      var items=(tc&&Array.isArray(tc.items))?tc.items:[];
      var hasText=items.some(function(item){
        return item&&typeof item.str==='string'&&item.str.trim().length>0;
      });
      if(hasText)state.pagesWithText++;
    }catch(_e){}
    state.scannedPages=n;
    state.pagesWithoutText=Math.max(0,state.scannedPages-state.pagesWithText);
    var interim=summarizePdfOcrState(state);
    state.status=interim.status;
    state.label=interim.label;
    state.needsOCR=!!interim.needsOCR;
    state.updatedAt=Date.now();
    updatePdfReaderStatus();
  }
  var summary=summarizePdfOcrState(state);
  state.status=summary.status;
  state.label=summary.label;
  state.needsOCR=!!summary.needsOCR;
  state.updatedAt=Date.now();
  if(state.needsOCR)notifyPdfOcrNeedOnce(state);
  if(state.needsOCR&&options.autoExtract!==false){
    schedulePdfOcrAutoRun({
      tabId:tabId||activeTabId||null,
      delayMs:options.autoDelayMs||900
    });
  }
  if(options.manual){
    if(state.needsOCR)setDst('OCR gerekli: metin katmani tespit edilemedi.','ld');
    else if(state.status==='error')setDst('OCR tarama hatasi.','er');
    else setDst('OCR kontrolu: metin katmani uygun.','ok');
    setTimeout(function(){setDst('','');},2600);
  }
  updatePdfReaderStatus();
  return summary;
}

function runPdfOcrNeedScan(){
  if(!pdfDoc){
    setDst('OCR tarama icin acik PDF yok.','er');
    return Promise.resolve(false);
  }
  return scanPdfTextLayerForOcr(currentPdfRenderToken,{
    tabId:activeTabId||null,
    samplePages:Math.min(5,Math.max(1,pdfTotal||1)),
    autoExtract:false,
    manual:true
  }).then(function(summary){return !!summary;}).catch(function(){
    setDst('OCR tarama basarisiz.','er');
    return false;
  });
}

function runPdfOcrExtractionNow(){
  if(!pdfDoc){
    setDst('OCR icin acik PDF yok.','er');
    return Promise.resolve(false);
  }
  return runPdfOcrNeedScan().then(function(){
    var state=getActivePdfOcrState();
    if(!state.needsOCR&&state.scannedPages>0&&state.pagesWithText>0){
      setDst('OCR gerekmiyor: metin katmani zaten mevcut.','ok');
      setTimeout(function(){setDst('','');},2600);
      return false;
    }
    return runPdfOcrNow({
      manual:true,
      maxPages:Math.max(2,Math.min(12,pdfTotal||1)),
      includeAllPages:true
    }).then(function(result){
      return !!(result&&result.ok);
    });
  }).catch(function(){
    setDst('OCR cikarimi basarisiz.','er');
    return false;
  });
}

function runPdfOcrRetryFailedNow(){
  if(!pdfDoc){
    setDst('OCR yeniden deneme icin acik PDF yok.','er');
    return Promise.resolve(false);
  }
  return runPdfOcrNow({
    manual:true,
    includeAllPages:true,
    maxPages:Math.max(2,Math.min(12,pdfTotal||1)),
    retryFailedOnly:true,
    ignoreRetryCap:true,
    maxAttemptsPerPage:2,
    maxFailuresPerPage:6
  }).then(function(result){
    return !!(result&&result.ok);
  }).catch(function(){
    setDst('OCR yeniden deneme basarisiz.','er');
    return false;
  });
}

function showPdfOcrStatus(){
  if(!pdfDoc){
    setDst('OCR: acik PDF yok.','er');
    return null;
  }
  var state=getActivePdfOcrState();
  var summary=summarizePdfOcrState(state);
  var msg='OCR: '+(summary.label||'durum yok');
  var cls=summary.needsOCR?'ld':(summary.status==='error'?'er':(summary.status==='cancelled'?'ld':'ok'));
  setDst(msg,cls);
  setTimeout(function(){setDst('','');},2600);
  return summary;
}
// Expose OCR controls globally for command palette/runtime bridges.
window.runPdfOcrNeedScan=runPdfOcrNeedScan;
window.runPdfOcrExtractionNow=runPdfOcrExtractionNow;
window.runPdfOcrRetryFailedNow=runPdfOcrRetryFailedNow;
window.cancelPdfOcrRun=cancelPdfOcrRun;
window.showPdfOcrStatus=showPdfOcrStatus;

function getScale(){
  var w=document.getElementById('pdfscroll').clientWidth||560;
  if(pdfScale>0)return pdfScale;
  return Math.max(0.6,Math.min((w-28)/595,2.2));
}

function getPdfAnnotationCount(){
  try{return document.querySelectorAll('.pdf-annot').length||0;}catch(_e){return 0;}
}

function updatePdfReaderStatus(){
  var ocrLabel=getPdfOcrActivityLabel();
  var stats=(window.AQPdfViewerState&&typeof window.AQPdfViewerState.buildReaderStats==='function')
    ? window.AQPdfViewerState.buildReaderStats({
        page:pdfPg,
        total:pdfTotal,
        highlightCount:Array.isArray(hlData)?hlData.length:0,
        annotationCount:getPdfAnnotationCount(),
        ocrLabel:ocrLabel
      })
    : {
        pageLabel:pdfTotal?(pdfPg+' / '+pdfTotal):'--',
        metaLabel:pdfTotal?('Sayfa '+pdfPg+' / '+pdfTotal):'PDF bekleniyor',
        activityLabel:(Array.isArray(hlData)?hlData.length:0)+' highlight · '+getPdfAnnotationCount()+' not',
        progress:pdfTotal?Math.round((pdfPg/pdfTotal)*100):0
      };
  if(false&&!(window.AQPdfViewerState&&typeof window.AQPdfViewerState.buildReaderStats==='function')&&ocrLabel&&stats&&stats.activityLabel){
    stats.activityLabel+=' Â· '+ocrLabel;
  }
  var meta=document.getElementById('pdfreadmeta');
  var activity=document.getElementById('pdfreadstats');
  var progress=document.getElementById('pdfprogressbar');
  if(meta)meta.textContent=stats.metaLabel;
  if(activity)activity.textContent=stats.activityLabel;
  if(progress)progress.style.width=Math.max(0,Math.min(100,stats.progress||0))+'%';
}

function updatePdfToolState(){
  var search=document.getElementById('pdfSearchToggleBtn');
  var thumbs=document.getElementById('pdfThumbsToggleBtn');
  var outline=document.getElementById('pdfOutlineToggleBtn');
  var annots=document.getElementById('pdfAnnotsToggleBtn');
  var related=document.getElementById('pdfRelatedToggleBtn');
  var annot=document.getElementById('annotbtn');
  var draw=document.getElementById('drawbtn');
  var searchBar=document.getElementById('pdfsearchbar');
  var thumbsPanel=document.getElementById('pdfthumbs');
  var outlinePanel=document.getElementById('pdfoutline');
  var annotsPanel=document.getElementById('pdfannots');
  var relatedPanel=document.getElementById('pdfrelated');
  if(search)search.classList.toggle('on',!!(searchBar&&searchBar.classList.contains('open')));
  if(thumbs)thumbs.classList.toggle('on',!!(thumbsPanel&&thumbsPanel.style.display!=='none'));
  if(outline)outline.classList.toggle('on',!!(outlinePanel&&outlinePanel.style.display!=='none'));
  if(annots)annots.classList.toggle('on',!!(annotsPanel&&annotsPanel.style.display!=='none'));
  if(related)related.classList.toggle('on',!!(relatedPanel&&relatedPanel.style.display!=='none'));
  if(annot)annot.classList.toggle('on',!!annotMode);
  if(draw)draw.classList.toggle('on',!!drawMode);
}

function getPdfTabById(tabId){
  return (pdfTabs||[]).find(function(tab){return tab&&tab.id===tabId;})||null;
}

function revokePdfCompareBlobUrls(){
  ['left','right'].forEach(function(side){
    var value=pdfCompareBlobUrls[side];
    if(value){
      try{URL.revokeObjectURL(value);}catch(_e){}
      pdfCompareBlobUrls[side]='';
    }
  });
}

function toPdfBufferForCompare(buffer){
  if(!isUsablePdfData(buffer))return null;
  try{
    if(buffer instanceof ArrayBuffer)return buffer.slice(0);
    if(typeof Uint8Array!=='undefined'&&buffer instanceof Uint8Array){
      var copy=new Uint8Array(buffer.byteLength);
      copy.set(buffer);
      return copy.buffer;
    }
    if(buffer&&buffer.buffer instanceof ArrayBuffer&&typeof buffer.byteOffset==='number'&&typeof buffer.byteLength==='number'){
      var view=new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength);
      var out=new Uint8Array(view.byteLength);
      out.set(view);
      return out.buffer;
    }
  }catch(_e){}
  return null;
}

function createPdfCompareBlobUrl(buffer){
  var safe=toPdfBufferForCompare(buffer);
  if(!safe)return '';
  try{
    var blob=new Blob([safe],{type:'application/pdf'});
    return URL.createObjectURL(blob);
  }catch(_e){}
  return '';
}

function ensurePdfCompareHost(){
  var body=document.getElementById('pdfbody');
  if(!body)return null;
  var host=document.getElementById('pdfcomparehost');
  if(host)return host;
  host=document.createElement('div');
  host.id='pdfcomparehost';
  host.style.cssText='display:none;flex:1;min-width:0;padding:10px;gap:10px;overflow:auto;background:rgba(255,255,255,.45);';
  host.innerHTML=''
    + '<div class="pdf-compare-col" style="flex:1;min-width:0;display:flex;flex-direction:column;border:1px solid rgba(172,188,196,.55);border-radius:10px;overflow:hidden;background:#fff;">'
    + '<div id="pdfCompareLeftTitle" style="padding:7px 10px;border-bottom:1px solid rgba(172,188,196,.45);font-family:var(--fm);font-size:10px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Aktif PDF</div>'
    + '<iframe id="pdfCompareLeftFrame" title="Karsilastirma sol PDF" style="border:0;flex:1;min-height:420px;width:100%;background:#fff;"></iframe>'
    + '</div>'
    + '<div class="pdf-compare-col" style="flex:1;min-width:0;display:flex;flex-direction:column;border:1px solid rgba(172,188,196,.55);border-radius:10px;overflow:hidden;background:#fff;">'
    + '<div id="pdfCompareRightTitle" style="padding:7px 10px;border-bottom:1px solid rgba(172,188,196,.45);font-family:var(--fm);font-size:10px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Karsilastirma PDF</div>'
    + '<iframe id="pdfCompareRightFrame" title="Karsilastirma sag PDF" style="border:0;flex:1;min-height:420px;width:100%;background:#fff;"></iframe>'
    + '</div>';
  body.appendChild(host);
  return host;
}

function setPdfCompareVisibility(open){
  var sc=document.getElementById('pdfscroll');
  var host=ensurePdfCompareHost();
  if(sc)sc.style.display=open?'none':'';
  if(host)host.style.display=open?'flex':'none';
}

function stopPdfCompareSyncLoop(){
  if(pdfCompareSyncTimer){
    clearInterval(pdfCompareSyncTimer);
    pdfCompareSyncTimer=null;
  }
  pdfCompareSyncState={left:null,right:null,driver:''};
}

function readPdfCompareFrameScroll(frame){
  try{
    if(!frame||!frame.contentWindow)return null;
    var doc=frame.contentDocument||frame.contentWindow.document;
    if(!doc)return null;
    var el=doc.scrollingElement||doc.documentElement||doc.body;
    if(!el)return null;
    var scrollHeight=Math.max(0,Number(el.scrollHeight)||0);
    var clientHeight=Math.max(0,Number(el.clientHeight)||0);
    var scrollTop=Math.max(0,Number(el.scrollTop)||0);
    var ratio=(window.AQPdfViewerState&&typeof window.AQPdfViewerState.normalizeScrollRatio==='function')
      ? window.AQPdfViewerState.normalizeScrollRatio({
          scrollTop:scrollTop,
          scrollHeight:scrollHeight,
          clientHeight:clientHeight
        })
      : (function(){
          var maxTop=Math.max(0,scrollHeight-clientHeight);
          if(!maxTop)return 0;
          return Math.max(0,Math.min(1,scrollTop/maxTop));
        })();
    return {
      ratio:Math.max(0,Math.min(1,Number(ratio)||0)),
      scrollTop:scrollTop,
      scrollHeight:scrollHeight,
      clientHeight:clientHeight
    };
  }catch(_e){}
  return null;
}

function applyPdfCompareFrameScrollRatio(frame,ratio){
  try{
    if(!frame||!frame.contentWindow)return false;
    var doc=frame.contentDocument||frame.contentWindow.document;
    if(!doc)return false;
    var el=doc.scrollingElement||doc.documentElement||doc.body;
    if(!el)return false;
    var next=(window.AQPdfViewerState&&typeof window.AQPdfViewerState.scrollTopFromRatio==='function')
      ? window.AQPdfViewerState.scrollTopFromRatio({
          ratio:ratio,
          scrollHeight:Number(el.scrollHeight)||0,
          clientHeight:Number(el.clientHeight)||0
        })
      : (function(){
          var maxTop=Math.max(0,(Number(el.scrollHeight)||0)-(Number(el.clientHeight)||0));
          return Math.round(Math.max(0,Math.min(1,Number(ratio)||0))*maxTop);
        })();
    el.scrollTop=Math.max(0,Number(next)||0);
    return true;
  }catch(_e){}
  return false;
}

function pollPdfCompareSync(){
  if(!pdfCompareMode||!pdfCompareSyncScroll)return;
  var leftFrame=document.getElementById('pdfCompareLeftFrame');
  var rightFrame=document.getElementById('pdfCompareRightFrame');
  var left=readPdfCompareFrameScroll(leftFrame);
  var right=readPdfCompareFrameScroll(rightFrame);
  if(!left||!right)return;
  var prevLeft=(pdfCompareSyncState.left==null)?left.ratio:pdfCompareSyncState.left;
  var prevRight=(pdfCompareSyncState.right==null)?right.ratio:pdfCompareSyncState.right;
  var deltaLeft=Math.abs(left.ratio-prevLeft);
  var deltaRight=Math.abs(right.ratio-prevRight);
  var changed=Math.max(deltaLeft,deltaRight)>=0.002;
  if(!changed){
    pdfCompareSyncState.left=left.ratio;
    pdfCompareSyncState.right=right.ratio;
    return;
  }
  var driver=(deltaRight>deltaLeft)?'right':'left';
  if(deltaLeft===deltaRight&&pdfCompareSyncState.driver==='left')driver='right';
  var sourceRatio=driver==='right'?right.ratio:left.ratio;
  var targetFrame=driver==='right'?leftFrame:rightFrame;
  var applied=applyPdfCompareFrameScrollRatio(targetFrame,sourceRatio);
  if(applied){
    pdfCompareSyncState.left=sourceRatio;
    pdfCompareSyncState.right=sourceRatio;
  }else{
    pdfCompareSyncState.left=left.ratio;
    pdfCompareSyncState.right=right.ratio;
  }
  pdfCompareSyncState.driver=driver;
}

function ensurePdfCompareSyncLoop(){
  stopPdfCompareSyncLoop();
  if(!pdfCompareMode||!pdfCompareSyncScroll)return false;
  pdfCompareSyncTimer=setInterval(pollPdfCompareSync,220);
  return true;
}

function renderPdfCompareView(){
  if(!pdfCompareMode){
    setPdfCompareVisibility(false);
    return false;
  }
  var activeTab=getPdfTabById(activeTabId);
  if(!activeTab||!isUsablePdfData(activeTab.pdfData)){
    setDst('Karsilastirma icin aktif PDF bulunamadi.','er');
    stopPdfCompareSyncLoop();
    pdfCompareMode=false;
    setPdfCompareVisibility(false);
    return false;
  }
  var wsTabs=getWsTabs();
  var fallbackCandidates=(wsTabs||[]).filter(function(tab){return tab&&tab.id!==activeTab.id;}).map(function(tab){
    return {id:tab.id,title:tab.title||'PDF'};
  });
  var candidates=(window.AQPdfViewerState&&typeof window.AQPdfViewerState.buildPdfCompareCandidates==='function')
    ? window.AQPdfViewerState.buildPdfCompareCandidates({
        tabs:wsTabs,
        activeTabId:activeTab.id,
        workspaceId:S.cur
      })
    : fallbackCandidates;
  if(!candidates.length){
    setDst('Karsilastirma icin ikinci PDF sekmesi acin.','er');
    stopPdfCompareSyncLoop();
    pdfCompareMode=false;
    setPdfCompareVisibility(false);
    return false;
  }
  if(!pdfCompareSecondaryTabId||!candidates.some(function(item){return item&&item.id===pdfCompareSecondaryTabId;})){
    pdfCompareSecondaryTabId=String(candidates[0].id||'');
  }
  var secondTab=getPdfTabById(pdfCompareSecondaryTabId);
  if(!secondTab||!isUsablePdfData(secondTab.pdfData)){
    setDst('Secilen ikinci PDF okunamadi.','er');
    stopPdfCompareSyncLoop();
    pdfCompareMode=false;
    setPdfCompareVisibility(false);
    return false;
  }
  var leftUrl=createPdfCompareBlobUrl(activeTab.pdfData);
  var rightUrl=createPdfCompareBlobUrl(secondTab.pdfData);
  if(!leftUrl||!rightUrl){
    if(leftUrl)try{URL.revokeObjectURL(leftUrl);}catch(_e){}
    if(rightUrl)try{URL.revokeObjectURL(rightUrl);}catch(_e){}
    setDst('Karsilastirma PDF gorunumu olusturulamadi.','er');
    stopPdfCompareSyncLoop();
    pdfCompareMode=false;
    setPdfCompareVisibility(false);
    return false;
  }
  revokePdfCompareBlobUrls();
  pdfCompareBlobUrls.left=leftUrl;
  pdfCompareBlobUrls.right=rightUrl;
  var host=ensurePdfCompareHost();
  if(!host){
    setDst('Karsilastirma alani baslatilamadi.','er');
    stopPdfCompareSyncLoop();
    pdfCompareMode=false;
    return false;
  }
  var leftFrame=document.getElementById('pdfCompareLeftFrame');
  var rightFrame=document.getElementById('pdfCompareRightFrame');
  var leftTitle=document.getElementById('pdfCompareLeftTitle');
  var rightTitle=document.getElementById('pdfCompareRightTitle');
  if(leftFrame)leftFrame.src=leftUrl+'#page='+Math.max(1,pdfPg||1)+'&zoom=page-fit';
  if(rightFrame)rightFrame.src=rightUrl+'#page=1&zoom=page-fit';
  if(leftTitle)leftTitle.textContent='Aktif: '+String(activeTab.title||'PDF');
  if(rightTitle)rightTitle.textContent='Karsilastirma: '+String(secondTab.title||'PDF');
  setPdfCompareVisibility(true);
  ensurePdfCompareSyncLoop();
  var status=(window.AQPdfViewerState&&typeof window.AQPdfViewerState.buildPdfCompareStatus==='function')
    ? window.AQPdfViewerState.buildPdfCompareStatus({
        enabled:true,
        leftTitle:activeTab.title,
        rightTitle:secondTab.title,
        syncScroll:pdfCompareSyncScroll
      })
    : 'Karsilastirma acik';
  setDst(status,'ok');
  return true;
}

function disablePdfCompareMode(options){
  options=options||{};
  pdfCompareMode=false;
  stopPdfCompareSyncLoop();
  revokePdfCompareBlobUrls();
  setPdfCompareVisibility(false);
  if(options.restoreActiveRender){
    var activeTab=getPdfTabById(activeTabId);
    if(activeTab&&isUsablePdfData(activeTab.pdfData)){
      renderPDF(activeTab.pdfData,activeTab.id);
      return true;
    }
  }
  return false;
}

function togglePdfCompareScrollSync(){
  pdfCompareSyncScroll=!pdfCompareSyncScroll;
  if(pdfCompareSyncScroll)ensurePdfCompareSyncLoop();
  else stopPdfCompareSyncLoop();
  if(pdfCompareMode){
    var left=getPdfTabById(activeTabId);
    var right=getPdfTabById(pdfCompareSecondaryTabId);
    var status=(window.AQPdfViewerState&&typeof window.AQPdfViewerState.buildPdfCompareStatus==='function')
      ? window.AQPdfViewerState.buildPdfCompareStatus({
          enabled:true,
          leftTitle:left&&left.title,
          rightTitle:right&&right.title,
          syncScroll:pdfCompareSyncScroll
        })
      : (pdfCompareSyncScroll?'Karsilastirma: scroll senkron acik':'Karsilastirma: scroll senkron kapali');
    setDst(status,'ok');
    setTimeout(function(){setDst('','');},2400);
  }else{
    setDst(pdfCompareSyncScroll?'PDF compare scroll senkron acik.':'PDF compare scroll senkron kapali.','ok');
    setTimeout(function(){setDst('','');},2200);
  }
  return pdfCompareSyncScroll;
}

function pickPdfCompareSecondaryTab(){
  var wsTabs=getWsTabs();
  var candidates=(window.AQPdfViewerState&&typeof window.AQPdfViewerState.buildPdfCompareCandidates==='function')
    ? window.AQPdfViewerState.buildPdfCompareCandidates({
        tabs:wsTabs,
        activeTabId:activeTabId,
        workspaceId:S.cur
      })
    : (wsTabs||[]).filter(function(tab){return tab&&tab.id!==activeTabId;}).map(function(tab,index){
        return {id:tab.id,index:index+1,title:tab.title||'PDF',label:(index+1)+'. '+(tab.title||'PDF')};
      });
  if(!candidates.length){
    setDst('Karsilastirma icin en az iki PDF sekmesi gerekli.','er');
    return Promise.resolve(false);
  }
  if(candidates.length===1){
    pdfCompareSecondaryTabId=String(candidates[0].id||'');
    return Promise.resolve(true);
  }
  var text='Karsilastirilacak ikinci PDF sec:\n'+candidates.map(function(item){return item.label||((item.index||'?')+'. '+(item.title||'PDF'));}).join('\n');
  var defaultValue=pdfCompareSecondaryTabId||String(candidates[0].id||'');
  var promptPromise=(typeof customPrompt==='function')
    ? customPrompt(text,defaultValue)
    : Promise.resolve(window.prompt?window.prompt(text,defaultValue):defaultValue);
  return Promise.resolve(promptPromise).then(function(value){
    if(value==null)return false;
    var raw=String(value||'').trim();
    if(!raw)return false;
    var resolved=(window.AQPdfViewerState&&typeof window.AQPdfViewerState.resolvePdfCompareSelection==='function')
      ? window.AQPdfViewerState.resolvePdfCompareSelection({candidates:candidates,selection:raw})
      : raw;
    if(!resolved||!candidates.some(function(item){return item&&String(item.id)===String(resolved);})){
      setDst('Gecersiz karsilastirma secimi.','er');
      return false;
    }
    pdfCompareSecondaryTabId=String(resolved);
    return true;
  });
}

function togglePdfCompareMode(){
  if(pdfCompareMode){
    disablePdfCompareMode({restoreActiveRender:true});
    setDst('PDF karsilastirma kapatildi.','ok');
    setTimeout(function(){setDst('','');},2200);
    return Promise.resolve(false);
  }
  return pickPdfCompareSecondaryTab().then(function(ok){
    if(!ok)return false;
    pdfCompareMode=true;
    var rendered=renderPdfCompareView();
    if(rendered){
      setTimeout(function(){setDst('','');},2600);
      return true;
    }
    return false;
  });
}

function selectPdfCompareSecondaryTab(){
  return pickPdfCompareSecondaryTab().then(function(ok){
    if(!ok)return false;
    if(pdfCompareMode)return renderPdfCompareView();
    setDst('Karsilastirma PDF secildi: '+String((getPdfTabById(pdfCompareSecondaryTabId)||{}).title||''),'ok');
    setTimeout(function(){setDst('','');},2200);
    return true;
  });
}

function renderPDF(buf,sourceTabId){
  clearPDFView();
  var renderToken=createPdfRenderToken(sourceTabId);
  loadHLData();
  if(getPdfBufferByteLength(buf)<=32){
    setDst('PDF indirilemedi veya bozuk kaydedildi. Baglantiyi yeniden deneyin.','er');
    showNoPDF(curRef||{});
    return;
  }
  var safeBuf;
  try{safeBuf=(buf instanceof ArrayBuffer)?buf.slice(0):(buf.slice?buf.slice(0):new Uint8Array(buf));}
  catch(e){console.error('PDF buffer error:',e);setDst('PDF verisi bozuk','er');return;}

  pdfjsLib.getDocument({data:safeBuf}).promise.then(function(pdf){
    if(!isPdfRenderTokenActive(renderToken))return;
    pdfDoc=pdf;pdfTotal=pdf.numPages;pdfPg=1;
    renderedPages={};pdfTextCache={};
    scanPdfTextLayerForOcr(renderToken,{
      tabId:sourceTabId||activeTabId||null,
      samplePages:Math.min(3,Math.max(1,pdf.numPages||1)),
      autoExtract:true
    }).catch(function(){
      var state=getActivePdfOcrState();
      state.status='error';
      state.error='scan_failed';
      state.label='OCR tarama hatasi';
      updatePdfReaderStatus();
    });
    updPgLabel();
    updatePdfReaderStatus();
    var sc=document.getElementById('pdfscroll');
    pdf.getPage(1).then(function(firstPage){
      if(!isPdfRenderTokenActive(renderToken))return;
      var scale=getScale();
      var vp=firstPage.getViewport({scale:scale});
      for(var n=1;n<=pdf.numPages;n++){
        var wrap=document.createElement('div');
        wrap.className='pdf-page-wrap';
        wrap.dataset.page=String(n);
        wrap.style.cssText='width:'+Math.round(vp.width)+'px;height:'+Math.round(vp.height)+'px;background:#e8e8e8;';
        var label=document.createElement('div');
        label.className='page-placeholder';
        label.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#999;font-size:16px;';
        label.textContent=n;
        wrap.appendChild(label);
        sc.appendChild(wrap);
      }
      setupLazyRendering(renderToken);
      setupPageTracking();
      if(document.getElementById('pdfthumbs').style.display!=='none'&&isPdfRenderTokenActive(renderToken))renderThumbnails();
      loadOutline();
      // Restore annotations and drawings from active tab
      if(activeTabId){var at=pdfTabs.find(function(t){return t.id===activeTabId;});
        if(at)setTimeout(function(){
          if(!isPdfRenderTokenActive(renderToken))return;
          if(at.annots&&at.annots.length)restoreAnnots(at.annots);
          if(at.drawings)restoreDrawings(at.drawings);
        },300);
      }
    });
  }).catch(function(e){
    if(!isPdfRenderTokenActive(renderToken))return;
    console.error('PDF render error:',e);
    setDst('PDF açılamadı: '+e.message,'er');
    var sc=document.getElementById('pdfscroll');
    if(sc)sc.innerHTML='<div style="color:var(--red);font-size:12px;padding:20px;text-align:center;width:100%;">PDF açılamadı: '+e.message+'</div>';
  });
}

function setupLazyRendering(renderToken){
  if(lazyObserver)lazyObserver.disconnect();
  var sc=document.getElementById('pdfscroll');
  lazyObserver=new IntersectionObserver(function(entries){
    if(!isPdfRenderTokenActive(renderToken))return;
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        var pgNum=parseInt(entry.target.dataset.page);
        if(pgNum&&!renderedPages[pgNum]){
          renderSinglePage(pgNum,renderToken);
          if(pgNum>1&&!renderedPages[pgNum-1])renderSinglePage(pgNum-1,renderToken);
          if(pgNum<pdfTotal&&!renderedPages[pgNum+1])renderSinglePage(pgNum+1,renderToken);
        }
      }
    });
  },{root:sc,rootMargin:'300px 0px'});
  sc.querySelectorAll('.pdf-page-wrap').forEach(function(w){lazyObserver.observe(w);});
}

function renderSinglePage(n,renderToken){
  if(!isPdfRenderTokenActive(renderToken))return;
  if(!pdfDoc||renderedPages[n])return;
  renderedPages[n]=true;
  pdfDoc.getPage(n).then(function(page){
    if(!isPdfRenderTokenActive(renderToken))return;
    var scale=getScale();
    var dpr=window.devicePixelRatio||1;
    var vp=page.getViewport({scale:scale});
    var wrap=document.querySelector('.pdf-page-wrap[data-page="'+n+'"]');
    if(!wrap)return;
    wrap.style.width=Math.round(vp.width)+'px';wrap.style.height=Math.round(vp.height)+'px';wrap.style.background='#fff';
    var ph=wrap.querySelector('.page-placeholder');if(ph)ph.remove();
    // Click to add annotation or draw when in annotation/draw mode
    if(!wrap._annotHandler){wrap._annotHandler=true;
      wrap.addEventListener('click',function(e){
        if(!annotMode||drawMode)return;
        if(e.target.closest('.pdf-annot'))return;
        var rect=wrap.getBoundingClientRect();
        addPdfAnnot(parseInt(wrap.dataset.page),e.clientX-rect.left,e.clientY-rect.top);
      });
      // Drawing support
      setupDrawOnPage(wrap);
    }
    // Canvas at dpr resolution
    var canvas=document.createElement('canvas');
    canvas.width=Math.round(vp.width*dpr);canvas.height=Math.round(vp.height*dpr);
    canvas.style.cssText='display:block;position:absolute;top:0;left:0;z-index:0;width:'+Math.round(vp.width)+'px;height:'+Math.round(vp.height)+'px;';
    wrap.appendChild(canvas);
    var ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
    // Text layer
    var textDiv=document.createElement('div');
    textDiv.className='textLayer';
    textDiv.style.cssText='width:'+Math.round(vp.width)+'px;height:'+Math.round(vp.height)+'px;';
    wrap.appendChild(textDiv);
    // Highlight overlay
    var hlc=document.createElement('canvas');
    hlc.className='hl-overlay';
    hlc.width=Math.round(vp.width);hlc.height=Math.round(vp.height);
    wrap.appendChild(hlc);
    // Render
    page.render({canvasContext:ctx,viewport:vp}).promise.then(function(){
      if(!isPdfRenderTokenActive(renderToken))return;
      page.getTextContent({normalizeWhitespace:true}).then(function(tc){
        if(!isPdfRenderTokenActive(renderToken))return;
        if(!tc||!tc.items||!tc.items.length){
          var ocrItems=getCachedOcrItemsForPage(n,activeTabId||null);
          if(hasPdfTextItems(ocrItems)){
            pdfTextCache[n]=ocrItems;
            manualTextLayer({items:ocrItems},textDiv,vp);
          }
          paintHL(hlc,n);
          return;
        }
        pdfTextCache[n]=tc.items;
        var done=false;
        if(typeof pdfjsLib.renderTextLayer==='function'){
          try{
            textDiv.style.setProperty('--scale-factor',String(scale));
            var task=pdfjsLib.renderTextLayer({container:textDiv,viewport:vp,textDivs:[],textContent:tc});
            if(task&&task.promise){done=true;task.promise.then(function(){if(isPdfRenderTokenActive(renderToken))paintHL(hlc,n);}).catch(function(){if(!isPdfRenderTokenActive(renderToken))return;textDiv.innerHTML='';manualTextLayer(tc,textDiv,vp);paintHL(hlc,n);});}
          }catch(e){console.warn('renderTextLayer error:',e);}
        }
        if(!done){manualTextLayer(tc,textDiv,vp);paintHL(hlc,n);}
      }).catch(function(){
        if(!isPdfRenderTokenActive(renderToken))return;
        paintHL(hlc,n);
      });
    });
  });
}

function manualTextLayer(tc,container,vp){
  var items=tc.items;if(!items||!items.length)return;
  for(var i=0;i<items.length;i++){
    var item=items[i];if(!item.str||!item.transform)continue;
    var tx=pdfjsLib.Util.transform(vp.transform,item.transform);
    var fontH=Math.sqrt(tx[2]*tx[2]+tx[3]*tx[3]);
    if(fontH<0.5)continue;
    var span=document.createElement('span');
    span.textContent=item.str;
    span.style.cssText='left:'+Math.round(tx[4]*10)/10+'px;top:'+Math.round((tx[5]-fontH)*10)/10+'px;font-size:'+Math.round(fontH*10)/10+'px;font-family:sans-serif;';
    container.appendChild(span);
    if(item.width>0){
      var expected=item.width*vp.scale;var actual=span.offsetWidth;
      if(actual>0){var scX=expected/actual;if(Math.abs(scX-1)>0.02)span.style.transform='scaleX('+scX.toFixed(4)+')';}
    }
  }
}

function clearPDFView(){
  clearPdfOcrAutoTimer();
  currentPdfRenderToken=null;
  pdfRenderTokenId++;
  pdfFetchToken++;
  pdfOcrProbeToken++;
  pdfOcrRunToken++;
  if(pageObserver)pageObserver.disconnect();
  if(lazyObserver)lazyObserver.disconnect();
  pdfDoc=null;pdfPg=1;pdfTotal=0;
  pdfTextCache={};renderedPages={};
  var ocrState=getActivePdfOcrState();
  if(ocrState){
    ocrState.status='idle';
    ocrState.label='';
    ocrState.error='';
    ocrState.needsOCR=false;
    ocrState.totalPages=0;
    ocrState.samplePages=0;
    ocrState.scannedPages=0;
    ocrState.pagesWithText=0;
    ocrState.pagesWithoutText=0;
    ocrState.ocrRunning=false;
    ocrState.ocrAutoQueued=false;
    ocrState.ocrTargetPages=0;
    ocrState.ocrProcessedPages=0;
    ocrState.ocrAppliedPages=0;
    ocrState.ocrFailedPages=0;
    ocrState.ocrSkippedPages=0;
    ocrState.ocrCancelled=false;
    ocrState.ocrLastAt=0;
    ocrState.ocrPageItems={};
    ocrState.ocrPageMeta={};
  }
  pdfSearchResults=[];pdfSearchIdx=-1;
  var pgEl=document.getElementById('pdfpg');if(pgEl)pgEl.textContent='--';
  var zmEl=document.getElementById('pdfzoom');if(zmEl)zmEl.textContent='--';
  var sc=document.getElementById('pdfscroll');if(sc)sc.innerHTML='';
  updatePdfReaderStatus();
}

// ¦¦ PDF TABS ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function addPdfTab(title,pdfData,refId){
  // Save current tab state before switching
  saveCurrentTabState();
  var next=(window.AQPdfTabsState&&typeof window.AQPdfTabsState.addPdfTab==='function')
    ? window.AQPdfTabsState.addPdfTab({
        tabs:pdfTabs,
        activeTabId:activeTabId
      },{
        title:title,
        pdfData:pdfData,
        refId:refId,
        workspaceId:S.cur
      },{
        createTabId:function(){return 'tab_'+Date.now();},
        getReferenceAnnots:function(id){var ref=id?findRef(id):null;return ref&&ref._annots?ref._annots:[];}
      })
    : null;
  if(next&&next.action==='switch-existing'){pdfTabs=next.tabs;activeTabId=next.activeTabId;switchPdfTab(next.activeTabId);return;}
  var tab=next&&next.activeTab?next.activeTab:{id:'tab_'+Date.now(),title:(title||'PDF').substring(0,40),refId:refId||null,wsId:S.cur,pdfData:pdfData,scrollPos:0,hlData:[],annots:[],ocrPageItems:{},ocrPageMeta:{},ocrLastAt:0};
  pdfTabs=next&&next.tabs?next.tabs:pdfTabs.concat([tab]);
  activeTabId=next&&next.activeTabId?next.activeTabId:tab.id;
  renderPdfTabs();
  renderPDF(pdfData,activeTabId||tab.id);
}
function saveCurrentTabState(){
  var sc=document.getElementById('pdfscroll');
  var next=(window.AQPdfTabsState&&typeof window.AQPdfTabsState.saveActiveTabState==='function')
    ? window.AQPdfTabsState.saveActiveTabState({
        tabs:pdfTabs,
        activeTabId:activeTabId
      },{
        scrollPos:sc?sc.scrollTop:0,
        hlData:hlData.slice(),
        annots:collectAnnotsFromDOM(),
        ocrPageItems:Object.assign({},(getActivePdfOcrState().ocrPageItems||{})),
        ocrPageMeta:Object.assign({},(getActivePdfOcrState().ocrPageMeta||{})),
        ocrLastAt:Number(getActivePdfOcrState().ocrLastAt||0)
      })
    : null;
  if(next&&next.tabs)pdfTabs=next.tabs;
}
function collectAnnotsFromDOM(){
  if(window.AQAnnotationState&&typeof window.AQAnnotationState.collectAnnotationsFromElements==='function'){
    return window.AQAnnotationState.collectAnnotationsFromElements(document.querySelectorAll('.pdf-annot'));
  }
  var annots=[];
  document.querySelectorAll('.pdf-annot').forEach(function(el){
    var body=el.querySelector('.pdf-annot-body');
    annots.push({page:parseInt(el.dataset.page)||1,x:parseFloat(el.style.left)||0,y:parseFloat(el.style.top)||0,w:el.offsetWidth,h:el.offsetHeight,text:(body?body.value:el.innerText)||''});
  });
  return annots;
}

function getPdfAnnotationItems(){
  var items=[];
  (Array.isArray(hlData)?hlData:[]).forEach(function(h,index){
    if(!h)return;
    items.push({
      kind:'highlight',
      id:'hl_'+index,
      index:index,
      page:parseInt(h.page)||1,
      color:h.color||hlColor,
      text:String(h.text||'').trim()
    });
  });
  collectAnnotsFromDOM().forEach(function(a,index){
    items.push({
      kind:'note',
      id:a.id||('annot_dom_'+index),
      index:index,
      page:parseInt(a.page)||1,
      text:String(a.text||'').trim()
    });
  });
  items.sort(function(a,b){return (a.page-b.page)||(a.kind>b.kind?1:-1)||(a.index-b.index);});
  return items;
}

function escapePdfPanelText(text){
  return String(text||'').replace(/[&<>"']/g,function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}

function renderPdfAnnotationPanel(){
  var panel=document.getElementById('pdfannots');
  if(!panel)return;
  var allItems=getPdfAnnotationItems();
  var items=(window.AQAnnotationState&&typeof window.AQAnnotationState.filterAnnotationSummaries==='function')
    ? window.AQAnnotationState.filterAnnotationSummaries(allItems,{filter:pdfAnnotFilter,query:pdfAnnotQuery})
    : allItems.filter(function(item){
        if(pdfAnnotFilter==='highlight'&&item.kind!=='highlight')return false;
        if(pdfAnnotFilter==='note'&&item.kind!=='note')return false;
        return !pdfAnnotQuery||String(item.text||'').toLowerCase().indexOf(pdfAnnotQuery.toLowerCase())!==-1;
      });
  var html='<div class="pdf-annots-head"><span>Notlar</span><span>'+items.length+'/'+allItems.length+'</span></div>';
  html+='<div class="pdf-annots-controls">';
  html+='<div class="pdf-annots-filter">';
  html+='<button data-pdf-annot-filter="all" class="'+(pdfAnnotFilter==='all'?'on':'')+'">Tümü</button>';
  html+='<button data-pdf-annot-filter="highlight" class="'+(pdfAnnotFilter==='highlight'?'on':'')+'">Highlight</button>';
  html+='<button data-pdf-annot-filter="note" class="'+(pdfAnnotFilter==='note'?'on':'')+'">Not</button>';
  html+='</div>';
  html+='<input class="pdf-annots-search" id="pdfAnnotSearch" value="'+escapePdfPanelText(pdfAnnotQuery)+'" placeholder="Notlarda ara..."/>';
  html+='<div class="pdf-annots-bulk">';
  html+='<button data-pdf-annot-bulk="copy">Özeti Kopyala</button>';
  html+='<button data-pdf-annot-bulk="notes">Tümünü Notlara Aktar</button>';
  html+='<button data-pdf-annot-bulk="doc">Belgeye Özet Ekle</button>';
  html+='<button class="primary" data-pdf-annot-bulk="export">Annotationlı PDF</button>';
  html+='</div>';
  html+='</div>';
  if(!items.length){
    html+='<div class="pdf-annots-empty">PDF metni seçince Highlight, Özet Not, Alıntı Notu veya Metne + Atıf kullan. Not kalemi açıkken sayfaya tıklayarak serbest not ekleyebilirsin.</div>';
    panel.innerHTML=html;
    return;
  }
  html+='<div class="pdf-annots-list">';
  items.forEach(function(item){
    var label=item.kind==='highlight'?'Highlight':'Not';
    var preview=item.text||'(boş not)';
    if(window.AQAnnotationState&&typeof window.AQAnnotationState.buildAnnotationSummary==='function'){
      preview=window.AQAnnotationState.buildAnnotationSummary(item).preview||preview;
    }else if(preview.length>120){preview=preview.slice(0,117)+'...';}
    html+='<div class="pdf-annot-card" data-kind="'+item.kind+'" data-index="'+item.index+'" data-id="'+escapePdfPanelText(item.id)+'">';
    html+='<div class="pdf-annot-card-title"><span class="pdf-annot-card-type">'+label+'</span><span class="pdf-annot-card-page">s. '+item.page+'</span></div>';
    html+='<div class="pdf-annot-card-text">'+escapePdfPanelText(preview)+'</div>';
    html+='<div class="pdf-annot-card-actions">';
    html+='<button class="pdf-annot-action" data-act="jump">Git</button>';
    if(item.kind==='note')html+='<button class="pdf-annot-action" data-act="edit">Düzenle</button>';
    html+='<button class="pdf-annot-action" data-act="note">Notlara Aktar</button>';
    html+='<button class="pdf-annot-action" data-act="doc">Metne Aktar</button>';
    html+='<button class="pdf-annot-action" data-act="delete">Sil</button>';
    html+='</div></div>';
  });
  html+='</div>';
  panel.innerHTML=html;
}
function switchPdfTab(tabId){
  if(tabId===activeTabId)return;
  saveCurrentTabState();
  var next=(window.AQPdfTabsState&&typeof window.AQPdfTabsState.switchPdfTab==='function')
    ? window.AQPdfTabsState.switchPdfTab({
        tabs:pdfTabs,
        activeTabId:activeTabId
      },tabId)
    : null;
  if(next&&next.tabs)pdfTabs=next.tabs;
  var tab=next&&next.activeTab?next.activeTab:pdfTabs.find(function(t){return t.id===tabId;});
  if(!tab)return;
  activeTabId=next&&next.activeTabId?next.activeTabId:tabId;
  var ocrState=ensurePdfOcrState(activeTabId||null);
  ocrState.ocrPageItems=Object.assign({},(tab&&tab.ocrPageItems)||{});
  ocrState.ocrPageMeta=Object.assign({},(tab&&tab.ocrPageMeta)||{});
  ocrState.ocrLastAt=Number(tab&&tab.ocrLastAt||0);
  ocrState.ocrAppliedPages=countOcrAppliedPages(ocrState.ocrPageItems||{});
  ocrState.ocrFailedPages=0;
  ocrState.ocrSkippedPages=0;
  ocrState.ocrCancelled=false;
  ocrState.ocrRunning=false;
  ocrState.ocrAutoQueued=false;
  // Update curRef
  if(tab.refId){var ref=findRef(tab.refId);if(ref)curRef=ref;}else{curRef=null;}
  hlData=tab.hlData?tab.hlData.slice():[];
  renderPdfTabs();
  renderPDF(tab.pdfData,activeTabId||tab.id);
  if(pdfCompareMode)renderPdfCompareView();
  // Restore scroll position after render
  setTimeout(function(){
    var sc=document.getElementById('pdfscroll');
    if(sc&&tab.scrollPos)sc.scrollTop=tab.scrollPos;
    // Restore annotations
    restoreAnnots(tab.annots);
  },200);
}
function closePdfTab(tabId){
  clearPdfOcrAutoTimer();
  pdfOcrRunToken++;
  var next=(window.AQPdfTabsState&&typeof window.AQPdfTabsState.closePdfTab==='function')
    ? window.AQPdfTabsState.closePdfTab({
        tabs:pdfTabs,
        activeTabId:activeTabId,
        workspaceId:S.cur
      },tabId)
    : null;
  var idx=pdfTabs.findIndex(function(t){return t.id===tabId;});
  if(idx===-1)return;
  var tab=next&&next.closedTab?next.closedTab:pdfTabs[idx];
  if(tab.refId){
    if(tabId===activeTabId){tab.annots=collectAnnotsFromDOM();}
    var ref=findRef(tab.refId);if(ref){ref._annots=tab.annots;save();}
  }
  pdfTabs=next&&next.tabs?next.tabs:pdfTabs.filter(function(t){return t.id!==tabId;});
  if(pdfCompareSecondaryTabId===tabId)pdfCompareSecondaryTabId='';
  delete pdfOcrStateByTab[getPdfOcrStateKey(tabId)];
  var wsTabs=next&&next.workspaceTabs?next.workspaceTabs:getWsTabs();
  if(wsTabs.length===0){
    disablePdfCompareMode({restoreActiveRender:false});
    activeTabId=null;curRef=null;clearPDFView();
    document.getElementById('pdftitle').textContent='PDF Okuyucu';
    renderPdfTabs();
    showNoPDF({});
    return;
  }
  if(tabId===activeTabId){
    activeTabId=null;
    switchPdfTab(next&&next.nextTabId?next.nextTabId:wsTabs[0].id);
  }else{
    renderPdfTabs();
    if(pdfCompareMode)renderPdfCompareView();
  }
}
function getWsTabs(){
  if(window.AQPdfTabsState&&typeof window.AQPdfTabsState.getWorkspaceTabs==='function'){
    return window.AQPdfTabsState.getWorkspaceTabs(pdfTabs,S.cur);
  }
  return pdfTabs.filter(function(t){return !t.wsId||t.wsId===S.cur;});
}
function renderPdfTabs(){
  var bar=document.getElementById('pdftabs');
  if(!bar)return;
  bar.innerHTML='';
  var wsTabs=getWsTabs();
  if(wsTabs.length<=1){bar.style.display='none';return;}
  bar.style.display='flex';
  wsTabs.forEach(function(tab){
    var el=document.createElement('div');
    el.className='pdftab'+(tab.id===activeTabId?' on':'');
    el.title=tab.title;
    var span=document.createElement('span');
    span.textContent=tab.title;
    span.style.cssText='overflow:hidden;text-overflow:ellipsis;flex:1;';
    el.appendChild(span);
    var close=document.createElement('span');
    close.className='tabclose';
    close.innerHTML='&times;';
    close.onclick=function(e){e.stopPropagation();closePdfTab(tab.id);};
    el.appendChild(close);
    el.onclick=function(){switchPdfTab(tab.id);};
    bar.appendChild(el);
  });
}
function switchWsPdfTabs(){
  clearPdfOcrAutoTimer();
  saveCurrentTabState();
  var next=(window.AQPdfTabsState&&typeof window.AQPdfTabsState.switchWorkspaceTabs==='function')
    ? window.AQPdfTabsState.switchWorkspaceTabs({
        tabs:pdfTabs,
        activeTabId:activeTabId,
        workspaceId:S.cur
      })
    : null;
  var wsTabs=next&&next.workspaceTabs?next.workspaceTabs:getWsTabs();
  if(wsTabs.length>0){
    if(next&&next.action==='switch-first'&&next.nextTabId){activeTabId=null;switchPdfTab(next.nextTabId);}
    else{renderPdfTabs();}
  } else {
    // No tabs in this workspace
    activeTabId=null;curRef=null;clearPDFView();
    document.getElementById('pdftitle').textContent='PDF Okuyucu';
    renderPdfTabs();
    showNoPDF({});
  }
}

// ¦¦ PDF ANNOTATIONS ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function addPdfAnnot(pageNum,x,y){
  var wrap=document.querySelector('.pdf-page-wrap[data-page="'+pageNum+'"]');
  if(!wrap)return;
  var model=(window.AQAnnotationState&&typeof window.AQAnnotationState.createAnnotation==='function')
    ? window.AQAnnotationState.createAnnotation({page:pageNum,x:x,y:y})
    : {page:pageNum,x:x,y:y,w:140,h:30,text:''};
  var el=document.createElement('div');
  el.className='pdf-annot';
  el.tabIndex=0;
  el.dataset.page=String(model.page);
  if(model.id)el.dataset.annotId=String(model.id);
  el.style.left=model.x+'px';
  el.style.top=model.y+'px';
  el.style.width=model.w+'px';
  el.style.minHeight=model.h+'px';
  var body=document.createElement('textarea');
  body.className='pdf-annot-body';
  body.spellcheck=true;
  body.rows=3;
  el.appendChild(body);
  el.setAttribute('placeholder','Not yazın...');
  // Delete button
  var del=document.createElement('span');
  del.className='pdf-annot-del';
  del.textContent='×';
  del.onclick=function(e){e.stopPropagation();el.remove();saveAnnotsToTab();};
  el.appendChild(del);
  // Drag support
  makeDraggable(el,wrap);
  // Save on blur
  body.addEventListener('blur',function(){saveAnnotsToTab();});
  el.addEventListener('mousedown',function(e){
    if(e.target.className==='pdf-annot-del')return;
    if(e.target.closest('.pdf-annot-body'))return;
    setTimeout(function(){body.focus();},0);
  });
  wrap.appendChild(el);
  body.focus();
  updatePdfReaderStatus();
  renderPdfAnnotationPanel();
}
function makeDraggable(el,container){
  var dragging=false,mayDrag=false,startX,startY,origX,origY;
  el.addEventListener('mousedown',function(e){
    if(e.target.className==='pdf-annot-del')return;
    if(e.target.closest('.pdf-annot-body'))return;
    // If already focused (editing mode), allow text selection — don't drag
    var body=el.querySelector('.pdf-annot-body');
    if(body&&document.activeElement===body)return;
    // Record potential drag start, but DON'T preventDefault — allow natural focus
    mayDrag=true;startX=e.clientX;startY=e.clientY;
    origX=parseInt(el.style.left)||0;origY=parseInt(el.style.top)||0;
  });
  el.addEventListener('click',function(e){
    var body=el.querySelector('.pdf-annot-body');
    if(!dragging&&body&&e.target.closest('.pdf-annot-body')){body.focus();}
    mayDrag=false;
  });
  document.addEventListener('mousemove',function(e){
    if(!mayDrag&&!dragging)return;
    // Only start drag after 5px movement threshold
    if(mayDrag&&!dragging){
      if(Math.abs(e.clientX-startX)>5||Math.abs(e.clientY-startY)>5){
        dragging=true;mayDrag=false;
      }else return;
    }
    if(!dragging)return;
    el.style.left=Math.max(0,origX+(e.clientX-startX))+'px';
    el.style.top=Math.max(0,origY+(e.clientY-startY))+'px';
  });
  document.addEventListener('mouseup',function(){
    if(dragging){dragging=false;saveAnnotsToTab();}
    mayDrag=false;
  });
}
function saveAnnotsToTab(){
  if(!activeTabId)return;
  var tab=pdfTabs.find(function(t){return t.id===activeTabId;});
  if(!tab)return;
  var annots=collectAnnotsFromDOM();
  tab.annots=(window.AQAnnotationState&&typeof window.AQAnnotationState.persistTabAnnotations==='function')
    ? window.AQAnnotationState.persistTabAnnotations(tab,annots)
    : annots;
  // Also save to ref
  if(tab.refId){
    var ref=findRef(tab.refId);
    if(ref){
      if(window.AQAnnotationState&&typeof window.AQAnnotationState.persistReferenceAnnotations==='function'){
        window.AQAnnotationState.persistReferenceAnnotations(ref,tab.annots);
      }else{
        ref._annots=tab.annots;
      }
      save();
    }
  }
  updatePdfReaderStatus();
  renderPdfAnnotationPanel();
}
function restoreAnnots(annots){
  if(!annots||!annots.length)return;
  annots.forEach(function(a){
    if(window.AQAnnotationState&&typeof window.AQAnnotationState.normalizeAnnotation==='function'){
      a=window.AQAnnotationState.normalizeAnnotation(a);
    }
    var wrap=document.querySelector('.pdf-page-wrap[data-page="'+a.page+'"]');
    if(!wrap)return;
    var el=document.createElement('div');
    el.className='pdf-annot';
    el.tabIndex=0;
    el.dataset.page=String(a.page);
    if(a.id)el.dataset.annotId=String(a.id);
    el.style.left=a.x+'px';
    el.style.top=a.y+'px';
    if(a.w)el.style.width=a.w+'px';
    if(a.h)el.style.minHeight=a.h+'px';
    var body=document.createElement('div');
    body.className='pdf-annot-body';
    body.contentEditable='true';
    body.spellcheck=true;
    body.innerText=a.text||'';
    el.appendChild(body);
    var del=document.createElement('span');
    del.className='pdf-annot-del';
    del.textContent='×';
    del.onclick=function(e){e.stopPropagation();el.remove();saveAnnotsToTab();};
    el.appendChild(del);
    makeDraggable(el,wrap);
    body.addEventListener('blur',function(){saveAnnotsToTab();});
    el.addEventListener('mousedown',function(e){
      if(e.target.className==='pdf-annot-del')return;
      if(e.target.closest('.pdf-annot-body'))return;
      setTimeout(function(){body.focus();},0);
    });
    wrap.appendChild(el);
  });
  updatePdfReaderStatus();
  renderPdfAnnotationPanel();
}

// Delete key removes focused PDF annotation (only if empty or Shift+Delete)
document.addEventListener('keydown',function(e){
  if(e.key==='Delete'||e.key==='Backspace'){
    var active=document.activeElement;
    var annot=active&&active.closest?active.closest('.pdf-annot'):null;
    if(annot){
      var text=(active.innerText||'').replace(/×/g,'').trim();
      // Delete if annotation is empty, or if user presses Shift+Delete
      if(!text||e.shiftKey){
        e.preventDefault();
        active.remove();
        saveAnnotsToTab();
      }
    }
  }
});
document.addEventListener('keydown',function(e){
  var active=document.activeElement;
  var annot=active&&active.closest?active.closest('.pdf-annot'):null;
  if(!annot)return;
  var body=annot.querySelector('.pdf-annot-body');
  if(!body)return;
  if((e.key==='Delete'||e.key==='Backspace')&&e.shiftKey&&body.innerText.trim()){
    e.preventDefault();
    annot.remove();
    saveAnnotsToTab();
  }
});

// ¦¦ PDF DRAWING ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function setupDrawOnPage(wrap){
  var drawCanvas=document.createElement('canvas');
  drawCanvas.className='draw-overlay';
  drawCanvas.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;z-index:4;pointer-events:none;';
  wrap.appendChild(drawCanvas);
  var drawing=false,lastX,lastY;
  wrap.addEventListener('mousedown',function(e){
    if(!drawMode)return;
    if(e.target.closest('.pdf-annot'))return;
    drawing=true;
    drawCanvas.width=wrap.offsetWidth;drawCanvas.height=wrap.offsetHeight;
    drawCanvas.style.pointerEvents='auto';
    var rect=wrap.getBoundingClientRect();
    lastX=e.clientX-rect.left;lastY=e.clientY-rect.top;
    e.preventDefault();
  });
  wrap.addEventListener('mousemove',function(e){
    if(!drawing)return;
    var ctx=drawCanvas.getContext('2d');
    var rect=wrap.getBoundingClientRect();
    var x=e.clientX-rect.left,y=e.clientY-rect.top;
    ctx.strokeStyle=pdfDrawColor||hlColor||'#c9453e';
    ctx.lineWidth=pdfDrawWidth||2.5;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(lastX,lastY);ctx.lineTo(x,y);ctx.stroke();
    lastX=x;lastY=y;
  });
  document.addEventListener('mouseup',function(){
    if(drawing){drawing=false;drawCanvas.style.pointerEvents='none';saveDrawToTab(wrap);}
  });
}
function saveDrawToTab(wrap){
  if(!activeTabId)return;
  var tab=pdfTabs.find(function(t){return t.id===activeTabId;});
  if(!tab)return;
  if(!tab.drawings)tab.drawings={};
  var pg=wrap.dataset.page;
  var dc=wrap.querySelector('.draw-overlay');
  if(dc)tab.drawings[pg]=dc.toDataURL();
  if(tab.refId){var ref=findRef(tab.refId);if(ref){if(!ref._drawings)ref._drawings={};ref._drawings[pg]=tab.drawings[pg];save();}}
}

function restoreDrawings(drawings){
  if(!drawings)return;
  Object.keys(drawings).forEach(function(pg){
    var wrap=document.querySelector('.pdf-page-wrap[data-page="'+pg+'"]');
    if(!wrap)return;
    var dc=wrap.querySelector('.draw-overlay');
    if(!dc)return;
    dc.width=wrap.offsetWidth;dc.height=wrap.offsetHeight;
    var img=new Image();
    img.onload=function(){dc.getContext('2d').drawImage(img,0,0,dc.width,dc.height);};
    img.src=drawings[pg];
  });
}

var annotMode=false;
var drawMode=false;
var pdfDrawColor='#c9453e';
var pdfDrawWidth=2.5;
var pdfAnnotFilter='all';
var pdfAnnotQuery='';
function toggleAnnotMode(){
  annotMode=!annotMode;
  if(!annotMode)drawMode=false;
  var btn=document.getElementById('annotbtn');
  if(btn){btn.style.color=annotMode?'var(--acc)':'';btn.style.background=annotMode?'var(--acc-g)':'';}
  var dbtn=document.getElementById('drawbtn');
  if(dbtn){dbtn.style.color=drawMode?'var(--acc)':'';dbtn.style.background=drawMode?'var(--acc-g)':'';}
  // Change cursor on PDF pages
  document.querySelectorAll('.pdf-page-wrap').forEach(function(w){w.style.cursor=annotMode?'crosshair':'';});
  updatePdfToolState();
}
function toggleDrawMode(){
  drawMode=!drawMode;
  if(drawMode&&!annotMode){annotMode=true;var btn=document.getElementById('annotbtn');if(btn){btn.style.color='var(--acc)';btn.style.background='var(--acc-g)';}}
  var dbtn=document.getElementById('drawbtn');
  if(dbtn){dbtn.style.color=drawMode?'var(--acc)':'';dbtn.style.background=drawMode?'var(--acc-g)':'';}
  document.querySelectorAll('.pdf-page-wrap').forEach(function(w){w.style.cursor=drawMode?'crosshair':(annotMode?'crosshair':'');});
  updatePdfToolState();
}

function setPdfDrawColor(value){
  pdfDrawColor=String(value||'#c9453e');
  var input=document.getElementById('pdfDrawColor');
  if(input&&input.value!==pdfDrawColor)input.value=pdfDrawColor;
}

function setPdfDrawWidth(value){
  var n=parseFloat(value);
  pdfDrawWidth=Number.isFinite(n)?Math.max(1,Math.min(12,n)):2.5;
  var input=document.getElementById('pdfDrawWidth');
  if(input&&String(input.value)!==String(value))input.value=String(pdfDrawWidth);
}

function clearPdfDrawingPage(){
  var wrap=document.querySelector('.pdf-page-wrap[data-page="'+pdfPg+'"]');
  if(!wrap)return false;
  var dc=wrap.querySelector('.draw-overlay');
  if(!dc)return false;
  var ctx=dc.getContext('2d');
  ctx.clearRect(0,0,dc.width||wrap.offsetWidth,dc.height||wrap.offsetHeight);
  var tab=pdfTabs.find(function(t){return t.id===activeTabId;});
  if(tab&&tab.drawings)delete tab.drawings[String(pdfPg)];
  if(tab&&tab.refId){var ref=findRef(tab.refId);if(ref&&ref._drawings){delete ref._drawings[String(pdfPg)];save();}}
  return true;
}

function setPdfAnnotationFilter(filter){
  pdfAnnotFilter=String(filter||'all');
  if(['all','highlight','note'].indexOf(pdfAnnotFilter)===-1)pdfAnnotFilter='all';
  renderPdfAnnotationPanel();
}

function setPdfAnnotationQuery(query){
  pdfAnnotQuery=String(query||'').trim();
  renderPdfAnnotationPanel();
}

// Page tracking
var pageObserver=null;
function setupPageTracking(){
  if(pageObserver)pageObserver.disconnect();
  var sc=document.getElementById('pdfscroll');
  pageObserver=new IntersectionObserver(function(entries){
    var best=null,bestR=0;
    entries.forEach(function(e){if(e.isIntersecting&&e.intersectionRatio>bestR){bestR=e.intersectionRatio;best=e.target;}});
    if(best&&best.dataset&&best.dataset.page){var pg=parseInt(best.dataset.page);if(pg&&pg!==pdfPg){pdfPg=pg;updPgLabel();updateThumbHL();updatePdfReaderStatus();}}
  },{root:sc,threshold:[0,0.25,0.5,0.75,1]});
  sc.querySelectorAll('.pdf-page-wrap').forEach(function(w){pageObserver.observe(w);});
}

function showNoPDF(ref){
  if(pdfCompareMode)disablePdfCompareMode({restoreActiveRender:false});
  clearPDFView();
  var sc=document.getElementById('pdfscroll');
  var doi=(ref&&ref.doi)||'';var oaUrl=(ref&&ref.pdfUrl)||'';var title=(ref&&ref.title)||'';
  var d=document.createElement('div');
  d.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:10px;text-align:center;width:100%;';
  var icon=document.createElement('div');
  icon.style.cssText='font-size:28px';
  icon.textContent='PDF';
  d.appendChild(icon);
  if(title){
    var titleEl=document.createElement('div');
    titleEl.style.cssText='font-size:11px;color:var(--txt2);max-width:360px;line-height:1.5';
    titleEl.textContent=String(title).substring(0,80);
    d.appendChild(titleEl);
  }
  if(doi){
    var doiEl=document.createElement('div');
    doiEl.style.cssText='font-family:var(--fm);font-size:10px;color:var(--txt3)';
    doiEl.textContent='DOI: '+doi;
    d.appendChild(doiEl);
  }
  var controls=document.createElement('div');
  controls.style.cssText='width:100%;max-width:320px;display:flex;flex-direction:column;gap:7px;margin-top:8px;';
  var uploadBtn=document.createElement('button');
  uploadBtn.style.cssText='background:var(--acc);color:#0d1117;border:none;border-radius:6px;padding:10px;cursor:pointer;font-size:12px;font-weight:600;font-family:var(--f);';
  uploadBtn.textContent='+ PDF Dosyası Yükle';
  uploadBtn.addEventListener('click',function(){
    var input=document.getElementById('lfinp');
    if(input&&typeof input.click==='function')input.click();
  });
  controls.appendChild(uploadBtn);
  if(oaUrl){
    var oaBtn=document.createElement('button');
    oaBtn.style.cssText='background:var(--bg3);color:var(--blue);border:1px solid var(--b);border-radius:6px;padding:9px;font-size:11px;cursor:pointer;font-family:var(--f);display:block;width:100%;';
    oaBtn.textContent='OA PDF Otomatik İndir';
    oaBtn.addEventListener('click',function(){downloadPDF(((ref&&ref.id)||''),oaUrl);});
    controls.appendChild(oaBtn);
  }else{
    var noOA=document.createElement('div');
    noOA.style.cssText='font-size:11px;color:var(--txt3)';
    noOA.textContent='Açık erişim PDF yok';
    controls.appendChild(noOA);
  }
  if(doi){
    var doiLink=document.createElement('a');
    doiLink.href='https://doi.org/'+doi;
    doiLink.target='_blank';
    doiLink.rel='noreferrer noopener';
    doiLink.style.cssText='color:var(--txt3);font-size:11px;text-decoration:none;';
    doiLink.textContent='Yayıncı sayfası ?';
    controls.appendChild(doiLink);
  }
  d.appendChild(controls);
  var hint=document.createElement('div');
  hint.style.cssText='font-size:10px;color:var(--txt3);margin-top:6px;line-height:1.7';
  hint.textContent='PDF indirip "PDF Yükle" butonuna tıklayın.';
  d.appendChild(hint);
  sc.appendChild(d);
}

function pPrev(){if(pdfPg>1){pdfPg--;scrollToPage(pdfPg);}}
function pNext(){if(pdfPg<pdfTotal){pdfPg++;scrollToPage(pdfPg);}}
function scrollToPage(n){
  if(pdfTotal&&window.AQPdfViewerState&&typeof window.AQPdfViewerState.clampPage==='function')n=window.AQPdfViewerState.clampPage(n,pdfTotal);
  var w=document.querySelector('.pdf-page-wrap[data-page="'+n+'"]');
  if(w)w.scrollIntoView({behavior:'smooth',block:'start'});
  pdfPg=n||pdfPg;
  updPgLabel();
}
function updPgLabel(){
  var pgEl=document.getElementById('pdfpg');
  var zmEl=document.getElementById('pdfzoom');
  var stats=(window.AQPdfViewerState&&typeof window.AQPdfViewerState.buildReaderStats==='function')
    ? window.AQPdfViewerState.buildReaderStats({page:pdfPg,total:pdfTotal,highlightCount:Array.isArray(hlData)?hlData.length:0,annotationCount:getPdfAnnotationCount()})
    : {pageLabel:pdfTotal?(pdfPg+'/'+pdfTotal):'--'};
  if(pgEl) pgEl.textContent=stats.pageLabel;
  if(zmEl) zmEl.textContent=(window.AQPdfViewerState&&typeof window.AQPdfViewerState.getZoomLabel==='function')
    ? window.AQPdfViewerState.getZoomLabel(pdfScale,getScale())
    : Math.round((pdfScale||getScale())*100)+'%';
  updatePdfReaderStatus();
}
function pZI(){pdfScale=(window.AQPdfViewerState&&typeof window.AQPdfViewerState.getNextZoom==='function')?window.AQPdfViewerState.getNextZoom(pdfScale,0.15,{autoScale:getScale()}):Math.min(((pdfScale||getScale())+0.15),4);if(curRef&&curRef.pdfData)renderPDF(curRef.pdfData,activeTabId||null);updPgLabel();}
function pZO(){pdfScale=(window.AQPdfViewerState&&typeof window.AQPdfViewerState.getNextZoom==='function')?window.AQPdfViewerState.getNextZoom(pdfScale,-0.15,{autoScale:getScale()}):Math.max(((pdfScale||getScale())-0.15),0.3);if(curRef&&curRef.pdfData)renderPDF(curRef.pdfData,activeTabId||null);updPgLabel();}
function pZFit(){pdfScale=0;if(curRef&&curRef.pdfData)renderPDF(curRef.pdfData,activeTabId||null);updPgLabel();}
function togglePDF(){
  var p=document.getElementById('pdfpanel');
  if(!p)return;
  if(p.classList.contains('fullscreen')){
    p.classList.remove('fullscreen');
    var fullBtn=document.getElementById('pdffullbtn');
    if(fullBtn)fullBtn.innerHTML='&#x26F6;';
  }
  var willClose=p.classList.contains('open');
  p.classList.toggle('open');
  if(willClose&&pdfCompareMode)disablePdfCompareMode({restoreActiveRender:false});
}
function togglePdfFullscreen(){
  var p=document.getElementById('pdfpanel');
  if(!p)return;
  p.classList.toggle('fullscreen');
  var fullBtn=document.getElementById('pdffullbtn');
  if(fullBtn)fullBtn.innerHTML=p.classList.contains('fullscreen')?'&#x2716;':'&#x26F6;';
  var resizeHandle=document.getElementById('pdfresize');
  if(resizeHandle)resizeHandle.style.display=p.classList.contains('fullscreen')?'none':'';
  if(pdfCompareMode){
    renderPdfCompareView();
    return;
  }
  if(pdfDoc&&curRef&&curRef.pdfData){pdfScale=0;renderPDF(curRef.pdfData,activeTabId||null);}
}
function goToPage(){if(!pdfTotal)return;customPrompt('Sayfa numarası (1-'+pdfTotal+'):',pdfPg).then(function(v){var n=parseInt(v);if(n>=1&&n<=pdfTotal){pdfPg=n;scrollToPage(n);}});}

// ¦¦ SCROLL PAGE TRACKING ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
// PDFViewer handles page tracking via 'pagechanging' event on the eventBus
var pageObserver=null;

// ¦¦ PANEL RESIZE ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
(function(){
  var handle=document.getElementById('pdfresize');
  var panel=document.getElementById('pdfpanel');
  if(!handle||!panel) return;
  var dragging=false;
  handle.addEventListener('mousedown',function(e){dragging=true;e.preventDefault();document.body.style.cursor='col-resize';document.body.style.userSelect='none';});
  document.addEventListener('mousemove',function(e){
    if(!dragging)return;
    var w=window.innerWidth-e.clientX;
    w=Math.max(350,Math.min(w,window.innerWidth-300));
    panel.style.width=w+'px';
  });
  document.addEventListener('mouseup',function(){
    if(!dragging)return;
    dragging=false;document.body.style.cursor='';document.body.style.userSelect='';
    // Refit if auto-scale
    if(pdfScale===0&&curRef&&curRef.pdfData)renderPDF(curRef.pdfData,activeTabId||null);
  });
})();

// ¦¦ PDF SEARCH ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
var pdfSearchResults=[];  // [{page,itemIdx,text}]
var pdfSearchIdx=-1;
var pdfTextCache={};  // {pageNum: [{str,transform,...}]}

function togglePdfSearch(){
  var bar=document.getElementById('pdfsearchbar');
  if(!bar) return;
  bar.classList.toggle('open');
  if(bar.classList.contains('open')){
    var inp=document.getElementById('pdfsearchinp');
    if(inp){inp.focus();inp.select();}
  } else {
    clearSearchHL();
    pdfSearchResults=[];pdfSearchIdx=-1;
    var cnt=document.getElementById('pdfsearchcount');
    if(cnt) cnt.textContent='--';
  }
  updatePdfToolState();
}

async function pdfSearchExec(){
  var inp=document.getElementById('pdfsearchinp');
  var q=inp?(inp.value||'').toLowerCase().trim():'';
  clearSearchHL();
  pdfSearchResults=[];pdfSearchIdx=-1;
  var cnt=document.getElementById('pdfsearchcount');
  if(!q||!pdfDoc){if(cnt)cnt.textContent='--';return;}
  if(cnt)cnt.textContent='...';
  // Pre-fetch text content for all pages not yet cached
  for(var p=1;p<=pdfTotal;p++){
    if(!hasPdfTextItems(pdfTextCache[p])){
      try{
        var page=await pdfDoc.getPage(p);
        var tc=await page.getTextContent({normalizeWhitespace:true});
        if(hasPdfTextItems(tc&&tc.items?tc.items:[])){
          pdfTextCache[p]=tc.items;
        }else{
          var fallbackItems=getCachedOcrItemsForPage(p,activeTabId||null);
          if(hasPdfTextItems(fallbackItems))pdfTextCache[p]=fallbackItems;
        }
      }catch(e){}
    }
  }
  var keys=Object.keys(pdfTextCache).map(Number).sort(function(a,b){return a-b;});
  keys.forEach(function(pgNum){
    var items=pdfTextCache[pgNum]||[];
    var fullText=items.map(function(it){return it.str;}).join(' ').toLowerCase();
    var idx=0;
    while(true){
      var pos=fullText.indexOf(q,idx);
      if(pos<0) break;
      pdfSearchResults.push({page:pgNum,pos:pos,len:q.length});
      idx=pos+1;
    }
  });
  if(cnt) cnt.textContent=pdfSearchResults.length>0?'0/'+pdfSearchResults.length:'yok';
  if(pdfSearchResults.length>0) pdfSearchGoTo(0);
}

function getPdfFullTextForRef(refId){
  if(!curRef||String(curRef.id||'')!==String(refId||'')) return '';
  if(!Object.keys(pdfTextCache).length) return '';
  var keys=Object.keys(pdfTextCache).map(Number).sort(function(a,b){return a-b;});
  var parts=[];
  keys.forEach(function(pgNum){
    var items=pdfTextCache[pgNum]||[];
    parts.push(items.map(function(it){return it.str;}).join(' '));
  });
  return parts.join('\n');
}

async function extractPdfFullTextForRef(refId){
  if(!pdfDoc||!curRef||String(curRef.id||'')!==String(refId||'')) return '';
  for(var p=1;p<=pdfTotal;p++){
    if(!hasPdfTextItems(pdfTextCache[p])){
      try{
        var page=await pdfDoc.getPage(p);
        var tc=await page.getTextContent({normalizeWhitespace:true});
        if(hasPdfTextItems(tc&&tc.items?tc.items:[])){
          pdfTextCache[p]=tc.items;
        }else{
          var fallbackItems=getCachedOcrItemsForPage(p,activeTabId||null);
          if(hasPdfTextItems(fallbackItems))pdfTextCache[p]=fallbackItems;
        }
      }catch(e){}
    }
  }
  return getPdfFullTextForRef(refId);
}

function pdfSearchNext(){
  if(!pdfSearchResults.length){pdfSearchExec();return;}
  pdfSearchGoTo((pdfSearchIdx+1)%pdfSearchResults.length);
}
function pdfSearchPrev(){
  if(!pdfSearchResults.length)return;
  pdfSearchGoTo((pdfSearchIdx-1+pdfSearchResults.length)%pdfSearchResults.length);
}

function pdfSearchGoTo(idx){
  pdfSearchIdx=idx;
  var cnt=document.getElementById('pdfsearchcount');
  if(cnt) cnt.textContent=(idx+1)+'/'+pdfSearchResults.length;
  var r=pdfSearchResults[idx];
  if(!r) return;
  if(!renderedPages[r.page])renderSinglePage(r.page,currentPdfRenderToken);
  setTimeout(function(){highlightSearchOnPage(r.page,r.pos,r.len,true);scrollToPage(r.page);},100);
  updatePdfReaderStatus();
}

function highlightSearchOnPage(pgNum,pos,len,isActive){
  clearSearchHL();
  var wrap=document.querySelector('.pdf-page-wrap[data-page="'+pgNum+'"]');
  if(!wrap) return;
  var spans=wrap.querySelectorAll('.textLayer span');
  var charCount=0;
  spans.forEach(function(sp){
    var txt=sp.textContent||'';
    var spanStart=charCount;
    var spanEnd=charCount+txt.length;
    // +1 for space between items
    if(spanStart<=pos+len&&spanEnd>=pos){
      sp.style.background=isActive?'rgba(255,100,0,.4)':'rgba(255,165,0,.3)';
      sp.style.borderRadius='2px';
      sp.classList.add('search-marked');
      if(isActive) sp.scrollIntoView({behavior:'smooth',block:'center'});
    }
    charCount=spanEnd+1; // +1 for join space
  });
}

function clearSearchHL(){
  document.querySelectorAll('.search-marked').forEach(function(sp){
    sp.style.background='';sp.style.borderRadius='';sp.classList.remove('search-marked');
  });
}

// Search input debounce
var searchTimer=null;
(function(){
  var sinp=document.getElementById('pdfsearchinp');
  if(sinp) sinp.addEventListener('input',function(){
    clearTimeout(searchTimer);
    searchTimer=setTimeout(pdfSearchExec,300);
  });
})();

// ¦¦ FIND & REPLACE ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
var findState={matches:[],index:-1};
function getToolbarFindInput(){return document.getElementById('toolbarFindInp');}
function getToolbarFindCount(){return document.getElementById('toolbarFindCount');}
function getToolbarFindPreview(){return document.getElementById('toolbarFindPreview');}
function getToolbarReplaceFindInput(){return document.getElementById('toolbarReplaceFindInp');}
function getToolbarReplaceInput(){return document.getElementById('toolbarReplaceInp');}
function getToolbarFindRegex(){return document.getElementById('toolbarFindRegex');}
function getToolbarFindCase(){return document.getElementById('toolbarFindCase');}
function getLegacyFindInput(){return document.getElementById('findinp');}
function getLegacyFindCount(){return document.getElementById('findcount');}
function getLegacyReplaceInput(){return document.getElementById('replaceinp');}
function getLegacyFindRegex(){return document.getElementById('findregex');}
function getLegacyFindCase(){return document.getElementById('findcase');}
function getFindInputEl(){return getToolbarFindInput()||getLegacyFindInput();}
function getFindCountEl(){return getToolbarFindCount()||getLegacyFindCount();}
function getReplaceInputEl(){return getToolbarReplaceInput()||getLegacyReplaceInput();}
function getFindRegexEl(){return getToolbarFindRegex()||getLegacyFindRegex();}
function getFindCaseEl(){return getToolbarFindCase()||getLegacyFindCase();}
function getActiveFindPreviewText(){
  var queryEl=getFindInputEl();
  var query=queryEl?String(queryEl.value||'').trim():'';
  if(!query) return '';
  var index=findState&&typeof findState.index==='number'?findState.index:-1;
  var range=(findState&&Array.isArray(findState.editorRanges)&&index>=0)?findState.editorRanges[index]:null;
  if(range&&editor&&editor.state&&editor.state.doc&&typeof editor.state.doc.textBetween==='function'){
    try{
      var from=Math.max(0,range.from-24);
      var to=Math.max(range.to,range.to+24);
      var excerpt=String(editor.state.doc.textBetween(from,to,' ',' ')||'').replace(/\s+/g,' ').trim();
      if(excerpt) return excerpt;
    }catch(_e){}
  }
  if(findState&&Array.isArray(findState.matches)&&index>=0){
    var match=findState.matches[index];
    if(match&&typeof match.textContent==='string'&&match.textContent.trim()) return match.textContent.trim();
  }
  if(findState&&Array.isArray(findState.editorRanges)&&findState.editorRanges.length){
    return 'Bulundu';
  }
  return query ? 'Bulunamadı' : '';
}
function syncToolbarFindUI(){
  var toolbarInp=getToolbarFindInput();
  var toolbarCount=getToolbarFindCount();
  var toolbarPreview=getToolbarFindPreview();
  var toolbarReplaceFind=getToolbarReplaceFindInput();
  var toolbarReplace=getToolbarReplaceInput();
  var toolbarRegex=getToolbarFindRegex();
  var toolbarCase=getToolbarFindCase();
  var legacyInp=getLegacyFindInput();
  var legacyCount=getLegacyFindCount();
  var legacyReplace=getLegacyReplaceInput();
  var legacyRegex=getLegacyFindRegex();
  var legacyCase=getLegacyFindCase();
  if(toolbarInp&&legacyInp&&toolbarInp.value!==legacyInp.value)toolbarInp.value=legacyInp.value;
  if(toolbarReplaceFind&&legacyInp&&toolbarReplaceFind.value!==legacyInp.value)toolbarReplaceFind.value=legacyInp.value;
  if(toolbarCount&&legacyCount)toolbarCount.textContent=legacyCount.textContent||'--';
  if(toolbarReplace&&legacyReplace&&toolbarReplace.value!==legacyReplace.value)toolbarReplace.value=legacyReplace.value;
  if(toolbarRegex&&legacyRegex)toolbarRegex.checked=!!legacyRegex.checked;
  if(toolbarCase&&legacyCase)toolbarCase.checked=!!legacyCase.checked;
  if(toolbarPreview){
    var previewText=getActiveFindPreviewText();
    toolbarPreview.textContent=previewText;
    toolbarPreview.title=previewText||'';
    toolbarPreview.classList.toggle('is-visible',!!previewText);
  }
}
function syncToolbarFindQuery(value){
  var next=String(value||'');
  var toolbarInp=getToolbarFindInput();
  var toolbarReplaceFind=getToolbarReplaceFindInput();
  var legacyInp=getLegacyFindInput();
  if(toolbarInp&&toolbarInp.value!==next)toolbarInp.value=next;
  if(toolbarReplaceFind&&toolbarReplaceFind.value!==next)toolbarReplaceFind.value=next;
  if(legacyInp&&legacyInp.value!==next)legacyInp.value=next;
}
function syncToolbarReplaceQuery(value){
  var next=String(value||'');
  var toolbarReplace=getToolbarReplaceInput();
  var legacyReplace=getLegacyReplaceInput();
  if(toolbarReplace&&toolbarReplace.value!==next)toolbarReplace.value=next;
  if(legacyReplace&&legacyReplace.value!==next)legacyReplace.value=next;
}
function syncToolbarFindOptions(kind,value){
  var checked=!!value;
  if(kind==='regex'){
    var toolbarRegex=getToolbarFindRegex();
    var legacyRegex=getLegacyFindRegex();
    if(toolbarRegex)toolbarRegex.checked=checked;
    if(legacyRegex)legacyRegex.checked=checked;
  }else if(kind==='case'){
    var toolbarCase=getToolbarFindCase();
    var legacyCase=getLegacyFindCase();
    if(toolbarCase)toolbarCase.checked=checked;
    if(legacyCase)legacyCase.checked=checked;
  }
}
function toggleFindBar(){
  var inp=getFindInputEl();
  syncToolbarFindUI();
  if(inp){
    try{inp.focus();}catch(_e){}
    try{inp.select();}catch(_e){}
  }
}
function closeFindBar(){
  var bar=document.getElementById('findbar');
  if(bar)bar.style.display='none';
  hideM('findReplaceQuickMenuModal');
  clearFindHL();
  findState.matches=[];findState.index=-1;
  var countEl=getLegacyFindCount();
  if(countEl)countEl.textContent='--';
  syncToolbarFindUI();
}
function clearFindHL(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.clearHighlights==='function'){
    if(window.AQTipTapWordFind.clearHighlights({host:document.getElementById('apaed')}))return;
  }
  var ed=document.getElementById('apaed');
  ed.querySelectorAll('.find-hl').forEach(function(m){
    var parent=m.parentNode;
    while(m.firstChild)parent.insertBefore(m.firstChild,m);
    parent.removeChild(m);
    parent.normalize();
  });
}
function clearFindSelection(){
  try{
    var sel=window.getSelection&&window.getSelection();
    if(sel&&typeof sel.removeAllRanges==='function')sel.removeAllRanges();
  }catch(_e){}
}
function stopFindSearch(){
  syncToolbarFindQuery('');
  syncToolbarReplaceQuery('');
  purgeFindHighlightsFromEditor();
  clearFindSelection();
  if(findState){
    findState.matches=[];
    findState.index=-1;
    findState.editorRanges=[];
  }
  var countEl=getLegacyFindCount();
  if(countEl)countEl.textContent='--';
  syncToolbarFindUI();
}
function purgeFindHighlightsFromEditor(){
  clearFindHL();
  clearFindSelection();
}
function findExec(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.executeSearchWithState==='function'){
    var queryEl=getFindInputEl();
    var regexEl=getFindRegexEl();
    var caseEl=getFindCaseEl();
    var query=queryEl?String(queryEl.value||''):'';
    if(!query.trim()){
      stopFindSearch();
      return;
    }
    window.AQTipTapWordFind.executeSearchWithState({
      doc:document,
      host:document.getElementById('apaed'),
      state:findState,
      editor:editor||null,
      countEl:getLegacyFindCount(),
      query:query,
      useRegex:!!(regexEl&&regexEl.checked),
      caseSensitive:!!(caseEl&&caseEl.checked)
    });
    syncToolbarFindUI();
    return;
  }
}
function highlightActive(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.highlightActive==='function'){
    if(window.AQTipTapWordFind.highlightActive({
      state:findState,
      countEl:getLegacyFindCount()
    }))return;
  }
  syncToolbarFindUI();
}
function findNext(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.navigateSearch==='function'){
    if(window.AQTipTapWordFind.navigateSearch({
      doc:document,
      state:findState,
      countEl:getLegacyFindCount(),
      forward:true
    })){syncToolbarFindUI();return;}
  }
}
function findPrev(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.navigateSearch==='function'){
    if(window.AQTipTapWordFind.navigateSearch({
      doc:document,
      state:findState,
      countEl:getLegacyFindCount(),
      forward:false
    })){syncToolbarFindUI();return;}
  }
}
function aqBuildFindRegex(query,useRegex,caseSensitive){
  var source=String(query||'');
  if(!source)return null;
  var flags=caseSensitive?'g':'gi';
  return useRegex ? new RegExp(source,flags) : new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),flags);
}
function aqCollectEditorFindRanges(query,useRegex,caseSensitive){
  if(!editor||!editor.state||!editor.state.doc||typeof editor.state.doc.descendants!=='function')return [];
  var segments=[],offset=0;
  editor.state.doc.descendants(function(node,pos){
    if(!node||!node.isText||typeof node.text!=='string'||!node.text)return;
    var text=String(node.text||'');
    segments.push({ text:text, start:offset, end:offset+text.length, from:pos, to:pos+text.length });
    offset+=text.length;
  });
  var text=segments.map(function(seg){ return seg.text; }).join('');
  var re;
  try{ re=aqBuildFindRegex(query,useRegex,caseSensitive); }catch(_e){ return []; }
  if(!re)return [];
  re.lastIndex=0;
  var matches=[],match;
  while((match=re.exec(text))!==null){
    if(!match[0]||!match[0].length){
      re.lastIndex++;
      continue;
    }
    matches.push({ start:match.index, end:match.index+match[0].length });
  }
  function locate(absoluteOffset){
    for(var i=0;i<segments.length;i++){
      var seg=segments[i];
      if(absoluteOffset<seg.end)return { seg:seg, offset:Math.max(0,absoluteOffset-seg.start) };
    }
    return null;
  }
  return matches.map(function(item){
    var start=locate(item.start);
    var end=locate(Math.max(item.start,item.end-1));
    if(!start||!end)return null;
    return { from:start.seg.from+start.offset, to:end.seg.from+end.offset+1 };
  }).filter(Boolean);
}
function aqDispatchReplaceRanges(ranges,replacement){
  if(!editor||!editor.view||!editor.state||!editor.state.tr||!Array.isArray(ranges)||!ranges.length)return false;
  try{
    var tr=editor.state.tr;
    ranges.slice().sort(function(a,b){ return b.from-a.from; }).forEach(function(range){
      if(!range||typeof range.from!=='number'||typeof range.to!=='number'||range.to<range.from)return;
      tr=tr.insertText(String(replacement||''),range.from,range.to);
    });
    if(!tr.docChanged)return false;
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  }catch(_e){
    return false;
  }
}
function replaceCurrent(){
  var queryEl=getFindInputEl();
  var regexEl=getFindRegexEl();
  var caseEl=getFindCaseEl();
  var query=queryEl?queryEl.value:'';
  var useRegex=!!(regexEl&&regexEl.checked);
  var caseSensitive=!!(caseEl&&caseEl.checked);
  var replacement=(getReplaceInputEl()||{}).value||'';
  try{if(window.AQ_DEBUG_FIND) console.info('[aq-find] legacy.replaceCurrent', {query:queryEl?queryEl.value:'', replacement:(getReplaceInputEl()||{}).value||''});}catch(_e){}
  function finishReplace(){
    closeFindBar();
    purgeFindHighlightsFromEditor();
    syncToolbarFindQuery('');
    syncToolbarReplaceQuery('');
    clearFindSelection();
  }
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.replaceSearchWithState==='function'){
    if(window.AQTipTapWordFind.replaceSearchWithState({
      doc:document,
      host:document.getElementById('apaed'),
      state:findState,
      editor:editor||null,
      query:query,
      useRegex:useRegex,
      caseSensitive:caseSensitive,
      replacement:replacement,
      countEl:getLegacyFindCount(),
      onMutate:function(){
        runEditorMutationEffects({
          target:editor&&editor.view?editor.view.dom:null,
          normalize:false,
          layout:true,
          syncChrome:true,
          syncTOC:true,
          refreshTrigger:false
        });
      },
      onAfterReplace:function(){
        finishReplace();
      }
    })){finishReplace();return;}
  }
  var ranges=aqCollectEditorFindRanges(query,useRegex,caseSensitive);
  var targetIndex=(findState&&typeof findState.index==='number'&&findState.index>=0)?findState.index:0;
  var targetRange=ranges[targetIndex]||ranges[0]||null;
  if(targetRange&&aqDispatchReplaceRanges([targetRange],replacement)){
    runEditorMutationEffects({
      target:editor&&editor.view?editor.view.dom:null,
      normalize:false,
      layout:true,
      syncChrome:true,
      syncTOC:true,
      refreshTrigger:false
    });
    finishReplace();
    return;
  }
}
function replaceAll(){
  var queryEl=getFindInputEl();
  var regexEl=getFindRegexEl();
  var caseEl=getFindCaseEl();
  var query=queryEl?queryEl.value:'';
  var useRegex=!!(regexEl&&regexEl.checked);
  var caseSensitive=!!(caseEl&&caseEl.checked);
  var replacement=(getReplaceInputEl()||{}).value||'';
  try{if(window.AQ_DEBUG_FIND) console.info('[aq-find] legacy.replaceAll', {query:queryEl?queryEl.value:'', replacement:(getReplaceInputEl()||{}).value||''});}catch(_e){}
  function finishReplace(){
    closeFindBar();
    purgeFindHighlightsFromEditor();
    syncToolbarFindQuery('');
    syncToolbarReplaceQuery('');
    clearFindSelection();
  }
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.replaceSearchWithState==='function'){
    var count=window.AQTipTapWordFind.replaceSearchWithState({
      doc:document,
      host:document.getElementById('apaed'),
      state:findState,
      editor:editor||null,
      query:query,
      useRegex:useRegex,
      caseSensitive:caseSensitive,
      replacement:replacement,
      countEl:getLegacyFindCount(),
      all:true,
      onMutate:function(){
        runEditorMutationEffects({
          target:editor&&editor.view?editor.view.dom:null,
          normalize:false,
          layout:true,
          syncChrome:true,
          syncTOC:true,
          refreshTrigger:false
        });
      },
      onAfterReplace:function(){
        finishReplace();
      }
    });
    if(count){finishReplace();return;}
  }
  var ranges=aqCollectEditorFindRanges(query,useRegex,caseSensitive);
  if(ranges.length&&aqDispatchReplaceRanges(ranges,replacement)){
    runEditorMutationEffects({
      target:editor&&editor.view?editor.view.dom:null,
      normalize:false,
      layout:true,
      syncChrome:true,
      syncTOC:true,
      refreshTrigger:false
    });
    finishReplace();
    return;
  }
}
(function(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.bindSearchUI==='function'){
    window.AQTipTapWordFind.bindSearchUI({
      doc:document,
      host:document.getElementById('apaed'),
      state:findState,
      delay:200,
    });
    syncToolbarFindUI();
    return;
  }
  var fi=getLegacyFindInput();
  if(fi){
    fi.addEventListener('input',function(){clearTimeout(_findTimer);_findTimer=setTimeout(findExec,200);});
    fi.addEventListener('keydown',function(e){
      if(e.key==='Enter'){e.preventDefault();if(e.shiftKey)findPrev();else findNext();}
      if(e.key==='Escape'){e.preventDefault();closeFindBar();}
    });
  }
  var ri=getLegacyReplaceInput();
  if(ri){ri.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();closeFindBar();}});}
  syncToolbarFindUI();
})();

// ¦¦ KEYBOARD SHORTCUTS (Word-like) ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
document.addEventListener('keydown',function(e){
  var shortcuts=window.AQTipTapWordShortcuts||null;
  if(shortcuts&&typeof shortcuts.handleAppDocumentShortcut==='function'){
    if(shortcuts.handleAppDocumentShortcut(e,{
      doc:document,
      host:document.getElementById('apaed'),
      chromeApi:window.AQTipTapWordChrome||null,
      isInList:function(){
        return isEditorInListContextFallback(editor||window.editor||null);
      },
      actions:{
      toggleFindBar:function(){e.preventDefault();toggleFindBar();},
      toggleZenMode:function(){e.preventDefault();toggleZenMode();},
      toggleTrackChanges:function(){e.preventDefault();toggleTrackChangesMode();},
      save:function(){e.preventDefault();syncSave();setSL('Kaydedildi','ok');setTimeout(function(){setSL('','');},2000);},
      editorZoom:function(delta){e.preventDefault();editorZoom(delta);},
      resetEditorZoom:function(){
        e.preventDefault();
        if(window.AQTipTapWordLayout&&typeof window.AQTipTapWordLayout.resetZoomWithFallback==='function'){
          window.AQTipTapWordLayout.resetZoomWithFallback({
            doc:document,
            applyManual:function(){
              document.getElementById('zoomLbl').textContent='100%';
              editorZoom(0);
            }
          });
        }else{
          document.getElementById('zoomLbl').textContent='100%';
          editorZoom(0);
        }
      },
      selectAll:function(){
        e.preventDefault();
        if(editor&&editor.commands&&typeof editor.commands.selectAll==='function')editor.commands.selectAll();
        else document.execCommand('selectAll');
      },
      exportDoc:function(){e.preventDefault();expDOC();},
      printDoc:function(){e.preventDefault();expPDF();},
      undo:function(){
        e.preventDefault();
        var handled=false;
        try{
          if(editor&&editor.commands&&typeof editor.commands.undo==='function'){
            handled=!!editor.commands.undo();
          }else if(editor&&editor.chain){
            handled=!!editor.chain().focus().undo().run();
          }
        }catch(_e){}
        if(!handled){
          try{
            if(typeof document.execCommand==='function')handled=!!document.execCommand('undo');
          }catch(_e){}
        }
        setTimeout(function(){runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});},50);
      },
      redo:function(){
        e.preventDefault();
        var handled=false;
        try{
          if(editor&&editor.commands&&typeof editor.commands.redo==='function'){
            handled=!!editor.commands.redo();
          }else if(editor&&editor.chain){
            handled=!!editor.chain().focus().redo().run();
          }
        }catch(_e){}
        if(!handled){
          try{
            if(typeof document.execCommand==='function')handled=!!document.execCommand('redo');
          }catch(_e){}
        }
        setTimeout(function(){runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});},50);
      },
      undoRedoSync:function(){setTimeout(function(){runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});},50);},
      execCommand:function(cmd,val){e.preventDefault();ec(cmd,val);},
      increaseFontSize:function(){
        e.preventDefault();
        var sel=document.getElementById('sizesel');
        var i=sel.selectedIndex;
        if(i<sel.options.length-1){sel.selectedIndex=i+1;applyFontSize(sel.value);}
      },
      decreaseFontSize:function(){
        e.preventDefault();
        var sel=document.getElementById('sizesel');
        var i=sel.selectedIndex;
        if(i>0){sel.selectedIndex=i-1;applyFontSize(sel.value);}
      },
      insertBlockquote:function(){e.preventDefault();insBlkQ();},
      indent:function(){e.preventDefault();ec('indent');},
      outdent:function(){e.preventDefault();ec('outdent');},
      focusPdfSearch:function(){
        e.preventDefault();
        var bar=document.getElementById('pdfsearchbar');
        if(!bar.classList.contains('open'))togglePdfSearch();
        else document.getElementById('pdfsearchinp').focus();
      },
      togglePdfFullscreen:function(){e.preventDefault();togglePdfFullscreen();},
      goToPage:function(){e.preventDefault();goToPage();},
      zoomInPdf:function(){e.preventDefault();pZI();},
      zoomOutPdf:function(){e.preventDefault();pZO();},
      resetPdfZoom:function(){e.preventDefault();pZFit();},
      prevPdfPage:function(){e.preventDefault();pPrev();},
      nextPdfPage:function(){e.preventDefault();pNext();},
      scrollPdfUp:function(){e.preventDefault();document.getElementById('pdfscroll').scrollBy(0,-100);},
      scrollPdfDown:function(){e.preventDefault();document.getElementById('pdfscroll').scrollBy(0,100);},
      firstPdfPage:function(){e.preventDefault();pdfPg=1;scrollToPage(1);},
      lastPdfPage:function(){e.preventDefault();if(pdfTotal){pdfPg=pdfTotal;scrollToPage(pdfTotal);}}
    }})) return;
  }
});

// Keep Word-like list enter/tab behavior stable even if command modules fail to load.
document.addEventListener('keydown',function(e){
  if(!e || e.defaultPrevented) return;
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  var key=String(e.key||'');
  if(key!=='Enter' && key!=='Tab') return;
  var activeEditor=window.editor||editor||null;
  if(window.editor&&window.editor!==editor) editor=window.editor;
  if(!activeEditor) return;
  var target=e.target;
  if(!target) return;
  if(target.tagName==='INPUT' || target.tagName==='TEXTAREA') return;
  var targetEl=target.nodeType===1?target:(target.parentElement||null);
  var inEditorSurface=!!(targetEl&&targetEl.closest&&targetEl.closest('.ProseMirror'));
  if(!inEditorSurface){
    var focused=document.activeElement;
    var focusedEl=focused&&focused.nodeType===1?focused:null;
    inEditorSurface=!!(focusedEl&&focusedEl.closest&&focusedEl.closest('.ProseMirror'));
  }
  if(!inEditorSurface) return;
  if(key==='Tab' && !isEditorInListContextFallback(activeEditor)) return;
  var handled=false;
  if(key==='Enter'){
    handled=handleListEnterFallback(activeEditor);
  }else{
    handled=handleListIndentFallback(activeEditor, !!e.shiftKey);
  }
  if(!handled) return;
  if(typeof e.preventDefault==='function') e.preventDefault();
  if(typeof e.stopImmediatePropagation==='function') e.stopImmediatePropagation();
  if(typeof e.stopPropagation==='function') e.stopPropagation();
  runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});
  try{updateFmtState();}catch(_e){}
}, true);

// Ctrl+scroll zoom in PDF
(function(){
  var psc=document.getElementById('pdfscroll');
  if(psc) psc.addEventListener('wheel',function(e){
    if(!e.ctrlKey&&!e.metaKey) return;
    e.preventDefault();
    if(e.deltaY<0) pZI(); else pZO();
  },{passive:false});
})();

// ¦¦ HIGHLIGHT PERSISTENCE ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
// hlData per-ref: save in ref object, restore on open
function saveHLData(){
  if(!curRef) return;
  if(window.AQHighlightState&&typeof window.AQHighlightState.persistHighlights==='function'){
    hlData=window.AQHighlightState.persistHighlights(curRef,hlData)||[];
  }else{
    curRef._hlData=hlData.slice();
  }
  save();
  updatePdfReaderStatus();
  renderPdfAnnotationPanel();
}
function loadHLData(){
  hlData=(window.AQHighlightState&&typeof window.AQHighlightState.loadHighlights==='function')
    ? window.AQHighlightState.loadHighlights(curRef)
    : ((curRef&&curRef._hlData)?curRef._hlData.slice():[]);
}

// ¦¦ HIGHLIGHT — works on text layer ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function setHLC(el){document.querySelectorAll('.hlc').forEach(function(e){e.classList.remove('on');});el.classList.add('on');hlColor=el.dataset.c;}

// Listen for text selection AND highlight clicks in PDF panel
(function(){
var psc=document.getElementById('pdfscroll');
if(!psc) return;
psc.addEventListener('mouseup',function(e){
  var hltipEl=document.getElementById('hltip');
  if(hltipEl&&hltipEl.contains(e.target)) return;
  setTimeout(function(){
    var sel=window.getSelection();
    var hasSelection=sel&&!sel.isCollapsed&&sel.toString().trim();

    if(hasSelection){
      selText=sel.toString().trim();
      try{selRangeObj=sel.getRangeAt(0).cloneRange();}catch(ex){return;}
      var node=sel.anchorNode;
      while(node&&node.nodeType!==1) node=node.parentNode;
      while(node&&!(node.dataset&&node.dataset.page)) node=node.parentNode;
      selPageNum=(node&&node.dataset&&node.dataset.page)?parseInt(node.dataset.page):pdfPg;
      try {
        var rect=selRangeObj.getBoundingClientRect();
        showHLtip(rect.bottom+8, rect.left, 'selection');
      } catch(ex){}
    } else {
      var clickedHL=findHLAtPoint(e.clientX, e.clientY);
      if(clickedHL){
        selText=clickedHL.text||'';
        selPageNum=clickedHL.page;
        clickedHLIdx=clickedHL.idx;
        // Auto-select the highlighted text in text layer
        selectHLText(clickedHL);
        showHLtip(e.clientY+10, e.clientX, 'highlight');
      } else {
        var hltipEl2=document.getElementById('hltip');
        if(hltipEl2&&!hltipEl2.matches(':hover')) hideHLtip();
      }
    }
  },80);
});

})();

var clickedHLIdx=-1; // tiklanan highlight'in hlData index'i

function selectHLText(hl){
  if(!hl||!hlData[hl.idx])return;
  var hd=hlData[hl.idx];
  var wrap=document.querySelector('.pdf-page-wrap[data-page="'+hd.page+'"]');
  if(!wrap)return;
  var textLayer=wrap.querySelector('.textLayer');
  if(!textLayer)return;
  var spans=textLayer.querySelectorAll('span');
  if(!spans.length)return;
  var ww=wrap.offsetWidth,wh=wrap.offsetHeight;
  var wr=wrap.getBoundingClientRect();
  var matched=[];
  spans.forEach(function(sp){
    var sr=sp.getBoundingClientRect();
    var sx=(sr.left-wr.left)/ww,sy=(sr.top-wr.top)/wh;
    var sw=sr.width/ww,sh=sr.height/wh;
    if(sw<0.001)return;
    for(var ri=0;ri<hd.rects.length;ri++){
      var r=hd.rects[ri];
      if(sx+sw>r.x&&sx<r.x+r.w&&sy+sh>r.y&&sy<r.y+r.h){
        var oL=Math.max(sx,r.x),oR=Math.min(sx+sw,r.x+r.w);
        var frac0=Math.max(0,(oL-sx)/sw),frac1=Math.min(1,(oR-sx)/sw);
        var txt=sp.textContent||'';
        var c0=Math.round(frac0*txt.length),c1=Math.round(frac1*txt.length);
        matched.push({span:sp,c0:c0,c1:c1});
        break;
      }
    }
  });
  if(!matched.length)return;
  try{
    var first=matched[0],last=matched[matched.length-1];
    var fn=first.span.firstChild||first.span;
    var ln=last.span.firstChild||last.span;
    var range=document.createRange();
    range.setStart(fn,Math.min(first.c0,fn.length||0));
    range.setEnd(ln,Math.min(last.c1,ln.length||0));
    var sel=window.getSelection();
    sel.removeAllRanges();sel.addRange(range);
  }catch(ex){}
}

function findHLAtPoint(cx,cy){
  var wraps=document.querySelectorAll('.pdf-page-wrap');
  for(var wi=0;wi<wraps.length;wi++){
    var wrap=wraps[wi];
    var wRect=wrap.getBoundingClientRect();
    var px=(cx-wRect.left)/wRect.width;
    var py=(cy-wRect.top)/wRect.height;
    if(px<0||px>1||py<0||py>1) continue;
    var pgNum=parseInt(wrap.dataset.pageNumber||wrap.dataset.page);
    for(var hi=0;hi<hlData.length;hi++){
      var hd=hlData[hi];
      if(hd.page!==pgNum) continue;
      for(var ri=0;ri<hd.rects.length;ri++){
        var r=hd.rects[ri];
        if(px>=r.x&&px<=r.x+r.w&&py>=r.y&&py<=r.y+r.h){
          return {idx:hi, page:pgNum, text:hd.text||'', color:hd.color};
        }
      }
    }
  }
  return null;
}

function showHLtip(top,left,mode){
  var tip=document.getElementById('hltip');
  // Butonlari moda gore ayarla
  tip.innerHTML='';
  function addTipButton(label,handler){
    var btn=document.createElement('button');
    btn.className='htb';
    btn.textContent=label;
    btn.addEventListener('click',function(e){
      if(e&&typeof e.preventDefault==='function')e.preventDefault();
      try{handler();}catch(_e){}
    });
    tip.appendChild(btn);
  }
  if(mode==='selection'){
    addTipButton('Kopyala',function(){cpSelText();});
    addTipButton('Highlight',function(){doHL(false);});
    addTipButton('Özet Not',function(){doHL(true,'summary');});
    addTipButton('Alıntı Notu',function(){doHL(true,'direct_quote');});
    addTipButton('Parafraz Notu',function(){doHL(true,'paraphrase');});
    addTipButton('Metne + Atıf',function(){insertSelectionIntoDocumentWithCitation();});
    addTipButton('Tablo',function(){extractTableFromSelection();});
    addTipButton('x',function(){hideHLtip();});
  } else {
    addTipButton('Nota Ekle',function(){hlToNote();});
    addTipButton('Sil',function(){hlRemove();});
    addTipButton('x',function(){hideHLtip();});
  }
  tip.style.top=Math.min(top, window.innerHeight-60)+'px';
  tip.style.left=Math.max(Math.min(left, window.innerWidth-220), 8)+'px';
  tip.classList.add('show');
}
// hltip butonlarinda mousedown'da secimi korumak icin preventDefault
(function(){
  var htip=document.getElementById('hltip');
  if(htip) htip.addEventListener('mousedown',function(e){ e.preventDefault(); });
})();

document.addEventListener('mousedown',function(e){
  var htip=document.getElementById('hltip');
  var psc=document.getElementById('pdfscroll');
  if(htip&&!htip.contains(e.target)&&psc&&!psc.contains(e.target))hideHLtip();
});

function hideHLtip(){var t=document.getElementById('hltip');if(t)t.classList.remove('show');clickedHLIdx=-1;}

function saveSelectionAsStructuredNote(noteType, quoteText, pageNum, color){
  var tag='s.'+pageNum;
  var note=createStructuredPdfNote(noteType,quoteText,{
    source:curRef?shortRef(curRef):'',
    referenceId:curRef?curRef.id:'',
    pageTag:tag,
    dateText:new Date().toLocaleDateString('tr-TR'),
    highlightColor:color||hlColor
  });
  if(noteType==='summary'){
    note.txt=String(quoteText||'').trim();
    note.q='';
    note.comment=note.txt;
  }else if(noteType==='paraphrase'){
    note.txt='Parafraz taslağı: '+String(quoteText||'').trim();
    note.q='';
    note.comment=note.txt;
  }
  normalizeResearchNote(note);
  S.notes.unshift(note);
  save();
  rNotes();
  swR('notes',document.querySelectorAll('.rtab')[0]);
  return note;
}
function doHL(saveToNote,noteType){
  if(!selText||!selRangeObj){hideHLtip();return;}
  drawHL();
  saveHLData();  // Persist highlights
  hideHLtip();
  var note=null;
  if(saveToNote){
    note=saveSelectionAsStructuredNote(noteType||'direct_quote',selText,selPageNum,hlColor);
  }
  window.getSelection().removeAllRanges();
  selRangeObj=null;selText='';
  renderPdfAnnotationPanel();
  return note;
}
function insertSelectionIntoDocumentWithCitation(){
  var note=doHL(true,'direct_quote');
  if(!note)return false;
  var inserted=false;
  if(window.AQCitationRuntime&&typeof window.AQCitationRuntime.insertNoteCitation==='function'){
    try{inserted=!!window.AQCitationRuntime.insertNoteCitation(note.id);}catch(_e){}
  }
  if(!inserted&&typeof insCiteNote==='function'){
    try{inserted=!!insCiteNote(note.id);}catch(_e){}
  }
  if(inserted)markNoteInserted(note.id);
  return inserted;
}

// Tiklanan highlight'i nota ekle
function hlToNote(){
  if(clickedHLIdx<0||!hlData[clickedHLIdx]){hideHLtip();return;}
  var hd=hlData[clickedHLIdx];
  saveSelectionAsStructuredNote('direct_quote',hd.text,hd.page,hd.color);
  hideHLtip();
}

// Tiklanan highlight'i sil
function hlRemove(){
  if(clickedHLIdx<0||!hlData[clickedHLIdx]){hideHLtip();return;}
  var res=(window.AQHighlightState&&typeof window.AQHighlightState.removeHighlightAt==='function')
    ? window.AQHighlightState.removeHighlightAt(hlData,clickedHLIdx)
    : {highlights:(function(){var next=hlData.slice();var removed=next[clickedHLIdx];next.splice(clickedHLIdx,1);return next;})(),removed:hlData[clickedHLIdx]};
  var pgNum=res.removed.page;
  hlData=res.highlights;
  // Sayfayi tekrar boya
  var wrap=document.querySelector('.pdf-page-wrap[data-page="'+pgNum+'"]');
  if(wrap){var hlc=wrap.querySelector('.hl-overlay');if(hlc)paintHL(hlc,pgNum);}
  saveHLData();  // Persist
  hideHLtip();
}

function drawHL(){
  if(!selRangeObj) return;
  // Seçili sayfanın wrap div'ini bul
  var wrap=document.querySelector('.pdf-page-wrap[data-page="'+selPageNum+'"]');
  if(!wrap) return;
  var hlCanvas=wrap.querySelector('.hl-overlay');
  if(!hlCanvas) return;
  var wRect=wrap.getBoundingClientRect();
  var rects=Array.from(selRangeObj.getClientRects());
  var saved=[];
  rects.forEach(function(r){
    if(r.width<2||r.height<2) return;
    // viewport › canvas koordinatı (normalize 0-1)
    var x=(r.left-wRect.left)/wRect.width;
    var y=(r.top-wRect.top)/wRect.height;
    var w=r.width/wRect.width;
    var hh=r.height/wRect.height;
    // Sınır kontrolü
    if(x>1||y>1||x+w<0||y+hh<0) return;
    saved.push({x:x,y:y,w:w,h:hh});
  });
  if(saved.length){
    hlData=(window.AQHighlightState&&typeof window.AQHighlightState.addHighlight==='function')
      ? window.AQHighlightState.addHighlight(hlData,{page:selPageNum,color:hlColor,rects:saved,text:selText||''})
      : hlData.concat([{page:selPageNum,color:hlColor,rects:saved,text:selText||''}]);
    paintHL(hlCanvas,selPageNum);
  }
}

function paintHL(hlCanvas,pageNum){
  var ctx=hlCanvas.getContext('2d');
  var cw=hlCanvas.width;
  var ch=hlCanvas.height;
  ctx.clearRect(0,0,cw,ch);
  hlData.filter(function(hd){return hd.page===pageNum;}).forEach(function(hd){
    ctx.fillStyle=hd.color;
    ctx.globalAlpha=0.38;
    hd.rects.forEach(function(r){
      ctx.fillRect(r.x*cw,r.y*ch,r.w*cw,r.h*ch);
    });
    ctx.globalAlpha=1;
  });
}

// ¦¦ NOTES ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function noteTypeLabel(noteType){
  var map={
    summary:'Özet',
    direct_quote:'Doğrudan Alıntı',
    paraphrase:'Parafraz',
    personal_insight:'Kişisel İçgörü',
    methodology:'Metodoloji',
    finding:'Bulgular',
    limitation:'Sınırlılık'
  };
  var key=String(noteType||'summary').trim();
  return map[key]||'Not';
}
function syncNoteFilterReferenceOptions(){
  var sel=document.getElementById('noteFilterRef');
  if(!sel)return;
  var ws=S.wss.find(function(x){return x&&x.id===S.cur;});
  var refs=(ws&&ws.lib)||[];
  var prev=String(noteViewFilters.refId||'all');
  var html='<option value="all">Tüm Kaynaklar</option>';
  html+=refs.map(function(ref){
    var title=String(ref&&ref.title||'Başlıksız').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return '<option value="'+String(ref.id||'')+'">'+title.substring(0,64)+'</option>';
  }).join('');
  sel.innerHTML=html;
  if(Array.from(sel.options).some(function(opt){return opt.value===prev;})){
    sel.value=prev;
  }else{
    sel.value='all';
    noteViewFilters.refId='all';
  }
}
function setNoteFilterType(value){
  noteViewFilters.type=String(value||'all').trim()||'all';
  rNotes();
}
function setNoteFilterUsage(value){
  noteViewFilters.usage=String(value||'all').trim()||'all';
  rNotes();
}
function setNoteFilterTag(value){
  noteViewFilters.tag=String(value||'').trim();
  rNotes();
}
function setNoteFilterRef(value){
  noteViewFilters.refId=String(value||'all').trim()||'all';
  rNotes();
}
function markNoteInserted(noteId){
  var note=(S.notes||[]).find(function(item){return item&&String(item.id)===String(noteId);});
  if(!note)return;
  normalizeResearchNote(note);
  note.inserted=true;
  save();
  rNotes();
}
function createStructuredPdfNote(noteType, quoteText, options){
  options=options||{};
  var note=(window.AQNotesState&&typeof window.AQNotesState.createHighlightNote==='function')
    ? window.AQNotesState.createHighlightNote({
        id:uid(),
        notebookId:S.curNb,
        quoteText:String(quoteText||'').trim(),
        source:options.source||'',
        referenceId:options.referenceId||'',
        pageTag:options.pageTag||'',
        dateText:options.dateText||'',
        highlightColor:options.highlightColor||'',
        noteType:noteType||'direct_quote'
      })
    : {id:uid(),nbId:S.curNb,type:'hl',txt:'',q:String(quoteText||'').trim()||'(metin yok)',src:options.source||'',rid:options.referenceId||'',tag:options.pageTag||'',dt:options.dateText||'',hlColor:options.highlightColor||'',noteType:noteType||'direct_quote',sourceExcerpt:String(quoteText||'').trim(),comment:'',sourcePage:options.pageTag||'',inserted:false};
  normalizeResearchNote(note);
  return note;
}
function rNotes(){
  var el=document.getElementById('notelist');
  var notes=curNotes();
  if(!el)return;
  syncNoteFilterReferenceOptions();
  var cardStyle='background:rgba(255,248,236,.98);border:1px solid rgba(110,91,60,.34);color:#2d2419;box-shadow:none;';
  var srcStyle='color:#6a563d;';
  var txtStyle='color:#2d2419;';
  var quoteStyle='color:#5f4e38;background:rgba(255,250,241,.82);';
  var btnStyle='color:#6a563d;border-color:rgba(110,91,60,.34);background:rgba(255,251,244,.95);';
  var delStyle='color:#6a563d;';
  if(window.AQNotesState&&typeof window.AQNotesState.renderNotesHTML==='function'){
    el.innerHTML=window.AQNotesState.renderNotesHTML(notes,{
      cardStyle:cardStyle,
      srcStyle:srcStyle,
      txtStyle:txtStyle,
      quoteStyle:quoteStyle,
      btnStyle:btnStyle,
      delStyle:delStyle,
      noteTypeLabel:noteTypeLabel
    });
    return;
  }
  if(!notes.length){
    el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:14px;text-align:center;">PDF\'ten metin seç › Nota Kaydet<br/>veya aşağıdan yaz.</div>';
    return;
  }
}
function dNote(id){
  var removed=(S.notes||[]).find(function(n){return n&&n.id==id;})||null;
  S.notes=(window.AQNotesState&&typeof window.AQNotesState.deleteNote==='function')
    ? window.AQNotesState.deleteNote(S.notes,id)
    : S.notes.filter(function(n){return n.id!=id;});
  if(removed&&window.AQLiteratureMatrixState&&typeof window.AQLiteratureMatrixState.removeLinkedNoteFromRows==='function'){
    try{
      window.AQLiteratureMatrixState.removeLinkedNoteFromRows(S,S.cur,removed.id);
    }catch(_e){}
  }
  save();rNotes();
}
function saveNote(){
  var txt=document.getElementById('noteta').value.trim();
  if(!txt)return;
  var tag=document.getElementById('notetag').value.trim()||'genel';
  var noteTypeEl=document.getElementById('notetype');
  var noteType=noteTypeEl?String(noteTypeEl.value||'summary'):'summary';
  var note=(window.AQNotesState&&typeof window.AQNotesState.createManualNote==='function')
    ? window.AQNotesState.createManualNote({
        id:uid(),
        notebookId:S.curNb,
        text:txt,
        source:curRef?shortRef(curRef):'',
        referenceId:curRef?curRef.id:'',
        tag:tag,
        dateText:new Date().toLocaleDateString('tr-TR'),
        noteType:noteType
      })
    : {id:uid(),nbId:S.curNb,type:'m',txt:txt,q:'',src:curRef?shortRef(curRef):'',rid:curRef?curRef.id:'',tag:tag,dt:new Date().toLocaleDateString('tr-TR'),noteType:noteType,sourceExcerpt:'',comment:txt,sourcePage:tag,inserted:false};
  if(!note)return;
  normalizeResearchNote(note);
  S.notes.unshift(note);save();rNotes();document.getElementById('noteta').value='';document.getElementById('notetag').value='';
}

// ¦¦ REFS ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function getUsedRefs(){
  if(window.AQTipTapWordCitation&&typeof window.AQTipTapWordCitation.collectUsedReferences==='function'){
    return window.AQTipTapWordCitation.collectUsedReferences(editor?editor.view.dom:document.getElementById('apaed'),{
      findReference:function(id){return findRef(id,S.cur);},
      dedupeReferences:dedupeRefs,
      sortReferences:sortLib
    });
  }
  var edEl=editor?editor.view.dom:document.getElementById('apaed');
  var rawIds=Array.from(edEl.querySelectorAll('.cit')).map(function(c){return c.dataset.ref;}).filter(Boolean);
  var refs=[];
  rawIds.forEach(function(rid){
    rid.split(',').forEach(function(id){
      id=id.trim();
      if(!id)return;
      var ref=findRef(id,S.cur);
      if(ref)refs.push(ref);
    });
  });
  return sortLib(dedupeRefs(refs));
}
function getBibliographyExtraRefs(doc){
  doc=doc||(typeof getCurrentDocRecord==='function'?getCurrentDocRecord():null);
  var ids=doc&&Array.isArray(doc.bibliographyExtraRefIds)?doc.bibliographyExtraRefIds:[];
  return ids.map(function(id){return findRef(id,S.cur)||findRef(id);}).filter(Boolean);
}
function markRefsForBibliographyPage(refIds){
  var doc=typeof getCurrentDocRecord==='function'?getCurrentDocRecord():null;
  if(!doc)return;
  if(!Array.isArray(doc.bibliographyExtraRefIds))doc.bibliographyExtraRefIds=[];
  (refIds||[]).forEach(function(id){
    id=String(id||'').trim();
    if(id&&doc.bibliographyExtraRefIds.indexOf(id)<0)doc.bibliographyExtraRefIds.push(id);
  });
  doc.bibliographyManual=false;
}
function getBibliographyPageRefs(baseRefs){
  return sortLib(dedupeRefs((baseRefs||getUsedRefs()||[]).concat(getBibliographyExtraRefs())));
}
var _refUpdating=false;
function applyTextAlignFallback(activeEditor, align){
  if(!activeEditor) return false;
  var nextAlign = String(align || 'left').toLowerCase();
  var commandApplied = false;
  try{
    if(activeEditor.commands && typeof activeEditor.commands.setTextAlign === 'function'){
      commandApplied = !!activeEditor.commands.setTextAlign(nextAlign);
    }
  }catch(_e){}
  try{
    var chain = activeEditor.chain && activeEditor.chain().focus();
    if(chain && typeof chain.setTextAlign === 'function'){
      commandApplied = !!chain.setTextAlign(nextAlign).run() || commandApplied;
    }
  }catch(_e){}
  try{
    if(!activeEditor.state || !activeEditor.view || !activeEditor.state.selection) return commandApplied;
    var state = activeEditor.state;
    var tr = state.tr;
    var changed = false;
    var touched = {};
    var livePositions = [];
    function applyLiveTextAlign(){
      try{
        if(!activeEditor || !activeEditor.view || typeof activeEditor.view.nodeDOM !== 'function') return;
        livePositions.forEach(function(pos){
          var el = activeEditor.view.nodeDOM(pos);
          if(!el || !el.style) return;
          if(typeof el.style.setProperty === 'function') el.style.setProperty('text-align', nextAlign || 'left', 'important');
          else el.style.textAlign = nextAlign || 'left';
          if(typeof el.setAttribute === 'function') el.setAttribute('data-text-align', nextAlign || 'left');
        });
      }catch(_e){}
    }
    function applyAlignToNode(node, pos){
      if(!node || !node.type) return;
      var typeName = node.type.name;
      if(typeName !== 'paragraph' && typeName !== 'heading') return;
      if(touched[pos]) return;
      touched[pos] = true;
      livePositions.push(pos);
      var attrs = Object.assign({}, node.attrs || {}, { textAlign:nextAlign });
      var style = String(attrs.style || '');
      style = style.replace(/(?:^|;)\s*text-align\s*:\s*[^;]+;?/i, ';').replace(/;;+/g, ';').replace(/^;|;$/g, '').trim();
      if(nextAlign) style = (style ? style + ';' : '') + 'text-align:' + nextAlign + ' !important';
      attrs.style = style || null;
      attrs['data-text-align'] = nextAlign || 'left';
      tr = tr.setNodeMarkup(pos, undefined, attrs, node.marks);
      changed = true;
    }
    state.doc.nodesBetween(state.selection.from, state.selection.to, applyAlignToNode);
    if(!changed && state.selection.$from){
      var $from = state.selection.$from;
      for(var depth = $from.depth; depth >= 0; depth--){
        var node = $from.node(depth);
        if(!node || !node.type) continue;
        var typeName = node.type.name;
        if(typeName !== 'paragraph' && typeName !== 'heading') continue;
        // Empty cursor selections do not always visit the block node in nodesBetween.
        // Resolve the active block directly so toolbar alignment behaves like Word.
        var pos = depth > 0 && typeof $from.before === 'function' ? $from.before(depth) : 0;
        applyAlignToNode(node, pos);
        break;
      }
    }
    if(changed){
      activeEditor.view.dispatch(tr);
      applyLiveTextAlign();
      return true;
    }
  }catch(_e){}
  return commandApplied;
}
function syncActiveListStyleFallback(activeEditor, listType, style){
  if(!activeEditor || !activeEditor.chain) return false;
  var nodeType = listType === 'orderedList' ? 'orderedList' : 'bulletList';
  var nextStyle = String(style || (nodeType === 'orderedList' ? 'decimal' : 'disc')).toLowerCase();
  try{
    var chain = activeEditor.chain().focus();
    if(typeof chain.updateAttributes !== 'function') return false;
    chain.updateAttributes(nodeType, { listStyleType:nextStyle });
    return !!chain.run();
  }catch(_e){}
  return false;
}
function toggleListFallback(activeEditor, listType, style){
  if(!activeEditor) return false;
  var isOrdered = String(listType || '').toLowerCase() === 'orderedlist';
  var toggled = false;
  try{
    if(isOrdered){
      if(activeEditor.commands && typeof activeEditor.commands.toggleOrderedList === 'function'){
        toggled = !!activeEditor.commands.toggleOrderedList();
      }
      if(!toggled && activeEditor.chain){
        var orderedChain = activeEditor.chain().focus();
        if(typeof orderedChain.toggleOrderedList === 'function'){
          toggled = !!orderedChain.toggleOrderedList().run();
        }
      }
    }else{
      if(activeEditor.commands && typeof activeEditor.commands.toggleBulletList === 'function'){
        toggled = !!activeEditor.commands.toggleBulletList();
      }
      if(!toggled && activeEditor.chain){
        var bulletChain = activeEditor.chain().focus();
        if(typeof bulletChain.toggleBulletList === 'function'){
          toggled = !!bulletChain.toggleBulletList().run();
        }
      }
    }
  }catch(_e){}
  if(!toggled) return false;
  try{
    if(typeof activeEditor.isActive === 'function' && activeEditor.isActive(isOrdered ? 'orderedList' : 'bulletList')){
      syncActiveListStyleFallback(activeEditor, isOrdered ? 'orderedList' : 'bulletList', style);
    }
  }catch(_e){}
  return true;
}
function handleListIndentFallback(activeEditor, outdent){
  if(!activeEditor) return false;
  try{
    if(window.AQTipTapWordEditor && typeof window.AQTipTapWordEditor.handleWordListTab === 'function'){
      if(window.AQTipTapWordEditor.handleWordListTab(activeEditor, !!outdent)) return true;
    }
  }catch(_e){}
  try{
    var inList = isEditorInListContextFallback(activeEditor);
    if(inList){
      if(outdent){
        if(activeEditor.commands && typeof activeEditor.commands.liftListItem === 'function'){
          if(activeEditor.commands.liftListItem('listItem')) return true;
        }
        if(activeEditor.chain){
          var liftChain = activeEditor.chain().focus();
          if(typeof liftChain.liftListItem === 'function' && liftChain.liftListItem('listItem').run()) return true;
        }
      }else{
        if(activeEditor.commands && typeof activeEditor.commands.sinkListItem === 'function'){
          if(activeEditor.commands.sinkListItem('listItem')) return true;
        }
        if(activeEditor.chain){
          var sinkChain = activeEditor.chain().focus();
          if(typeof sinkChain.sinkListItem === 'function' && sinkChain.sinkListItem('listItem').run()) return true;
        }
      }
      return false;
    }
    // Word-like fallback: indent outside lists starts a bullet list mode.
    if(!outdent) return toggleListFallback(activeEditor, 'bulletList', 'disc');
    return true;
  }catch(_e){}
  return false;
}
function isEditorInListContextFallback(activeEditor){
  if(!activeEditor) return false;
  try{
    if(typeof activeEditor.isActive === 'function'
      && (activeEditor.isActive('bulletList') || activeEditor.isActive('orderedList') || activeEditor.isActive('listItem'))){
      return true;
    }
  }catch(_e){}
  try{
    var $from = activeEditor && activeEditor.state && activeEditor.state.selection && activeEditor.state.selection.$from;
    if(!$from || typeof $from.depth !== 'number' || typeof $from.node !== 'function') return false;
    for(var depth = $from.depth; depth >= 0; depth--){
      var node = $from.node(depth);
      if(!node || !node.type) continue;
      var typeName = node.type.name;
      if(typeName === 'bulletList' || typeName === 'orderedList' || typeName === 'listItem') return true;
    }
  }catch(_e){}
  return false;
}
function getActiveListItemNodeFallback(activeEditor){
  if(!activeEditor || !activeEditor.state || !activeEditor.state.selection || !activeEditor.state.selection.$from) return null;
  try{
    var $from = activeEditor.state.selection.$from;
    for(var depth = $from.depth; depth >= 0; depth--){
      var node = $from.node(depth);
      if(node && node.type && node.type.name === 'listItem') return node;
    }
  }catch(_e){}
  return null;
}
function isCurrentListItemEmptyFallback(activeEditor){
  var node = getActiveListItemNodeFallback(activeEditor);
  if(!node) return false;
  return !String(node.textContent || '').replace(/\u00a0/g, ' ').trim();
}
function handleListEnterFallback(activeEditor){
  if(!activeEditor) return false;
  try{
    if(window.AQTipTapWordEditor && typeof window.AQTipTapWordEditor.handleWordListEnter === 'function'){
      if(window.AQTipTapWordEditor.handleWordListEnter(activeEditor)) return true;
    }
  }catch(_e){}
  if(!isEditorInListContextFallback(activeEditor)) return false;
  try{
    if(isCurrentListItemEmptyFallback(activeEditor)){
      if(activeEditor.commands && typeof activeEditor.commands.liftListItem === 'function'){
        if(activeEditor.commands.liftListItem('listItem')) return true;
      }
      if(activeEditor.chain){
        var liftChain = activeEditor.chain().focus();
        if(typeof liftChain.liftListItem === 'function' && liftChain.liftListItem('listItem').run()) return true;
      }
      if(activeEditor.commands && typeof activeEditor.commands.clearNodes === 'function'){
        var clearChain = activeEditor.chain && activeEditor.chain().focus();
        if(clearChain && typeof clearChain.clearNodes === 'function'){
          if(clearChain.clearNodes().run()) return true;
        }
      }
      return false;
    }
    if(activeEditor.commands && typeof activeEditor.commands.splitListItem === 'function'){
      if(activeEditor.commands.splitListItem('listItem')) return true;
    }
    if(activeEditor.chain){
      var splitChain = activeEditor.chain().focus();
      if(typeof splitChain.splitListItem === 'function' && splitChain.splitListItem('listItem').run()) return true;
    }
  }catch(_e){}
  return false;
}
function runEditorCommandFallback(cmd,val){
  var activeEditor=window.editor||editor||null;
  if(window.editor&&window.editor!==editor) editor=window.editor;
  if(!activeEditor||!activeEditor.chain) return false;
  try{
    var chain=activeEditor.chain().focus();
    var nextCmd=String(cmd||'').trim();
    switch(nextCmd){
      case 'bold': if(typeof chain.toggleBold!=='function') return false; chain.toggleBold(); break;
      case 'italic': if(typeof chain.toggleItalic!=='function') return false; chain.toggleItalic(); break;
      case 'underline': if(typeof chain.toggleUnderline!=='function') return false; chain.toggleUnderline(); break;
      case 'strike':
      case 'strikeThrough': if(typeof chain.toggleStrike!=='function') return false; chain.toggleStrike(); break;
      case 'superscript': if(typeof chain.toggleSuperscript!=='function') return false; chain.toggleSuperscript(); break;
      case 'subscript': if(typeof chain.toggleSubscript!=='function') return false; chain.toggleSubscript(); break;
      case 'fontName': if(typeof chain.setFontFamily!=='function') return false; chain.setFontFamily(String(val||'Times New Roman')); break;
      case 'foreColor': if(typeof chain.setColor!=='function') return false; chain.setColor(String(val||'#000000')); break;
      case 'hiliteColor':
        if(typeof chain.setHighlight==='function') chain.setHighlight({ color:String(val||'#ffff00') });
        else if(typeof chain.toggleHighlight==='function') chain.toggleHighlight({ color:String(val||'#ffff00') });
        else return false;
        break;
      case 'formatBlock':{
        var tag=String(val||'p').toLowerCase();
        if(tag==='p'){
          if(typeof chain.setParagraph!=='function') return false;
          chain.setParagraph();
        }else if(/^h[1-6]$/.test(tag)){
          var level=parseInt(tag.slice(1),10);
          if(typeof chain.setHeading==='function') chain.setHeading({ level:level });
          else if(typeof chain.toggleHeading==='function') chain.toggleHeading({ level:level });
          else return false;
          if(typeof chain.updateAttributes === 'function'){
            var headingAttrs = {
              1:{ textAlign:'center', style:'text-align:center !important;text-indent:0' },
              2:{ textAlign:'left', style:'text-align:left !important;text-indent:0' },
              3:{ textAlign:'left', style:'text-align:left !important;text-indent:0' },
              4:{ textAlign:'left', style:'text-align:left !important;text-indent:.5in' },
              5:{ textAlign:'left', style:'text-align:left !important;text-indent:.5in' }
            };
            chain.updateAttributes('heading', headingAttrs[level] || headingAttrs[2]);
          }
        }else{
          return false;
        }
        break;
      }
      case 'justifyLeft': return applyTextAlignFallback(activeEditor, 'left');
      case 'justifyCenter': return applyTextAlignFallback(activeEditor, 'center');
      case 'justifyRight': return applyTextAlignFallback(activeEditor, 'right');
      case 'justifyFull': return applyTextAlignFallback(activeEditor, 'justify');
      case 'insertUnorderedList': return toggleListFallback(activeEditor, 'bulletList', 'disc');
      case 'insertOrderedList': return toggleListFallback(activeEditor, 'orderedList', 'decimal');
      case 'applyMultiLevelList':
        if(String(val||'number').toLowerCase()==='bullet'){
          return toggleListFallback(activeEditor, 'bulletList', 'disc');
        }
        return toggleListFallback(activeEditor, 'orderedList', 'decimal');
      case 'indent': return handleListIndentFallback(activeEditor, false);
      case 'outdent': return handleListIndentFallback(activeEditor, true);
      case 'insertPageBreak':
        if(typeof chain.insertContent!=='function') return false;
        chain.insertContent('<p class="aq-page-break" data-indent-mode="none"><br></p><p><br></p>');
        break;
      default: return false;
    }
    return !!chain.run();
  }catch(_e){
    return false;
  }
}
function ec(cmd,val){
  var activeEditor=(typeof window!=='undefined'&&window.editor)?window.editor:(editor||null);
  if(activeEditor&&activeEditor!==editor) editor=activeEditor;
  if(window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.runEditorCommand==='function'){
    try{
      var handled=window.AQTipTapWordCommands.runEditorCommand({
        editor:activeEditor||null,
        cmd:cmd,
        val:val,
        onFallback:function(){
          uSt();updateFmtState();
        },
        warn:function(kind,nextCmd){
          if(kind==='unknown') console.warn('Unknown TipTap command ignored:',nextCmd);
          else console.warn('TipTap editor not ready, command ignored:',nextCmd);
        }
      });
      if(handled!==false) return;
    }catch(_e){}
  }
  if(runEditorCommandFallback(cmd,val)){
    try{
      runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});
    }catch(_e){}
    try{
      updateFmtState();
    }catch(_e){}
    return;
  }
  console.warn('TipTap editor not ready, command ignored:',cmd);
}
function isTrackChangesEnabled(){
  try{
    if(window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.isTrackChangesEnabled==='function'){
      return !!window.AQTipTapWordCommands.isTrackChangesEnabled();
    }
  }catch(_e){}
  return !!(window.__aqTrackChangesState&&window.__aqTrackChangesState.enabled);
}
function getTrackChangesSummaryRuntime(){
  var empty={insertCount:0,deleteCount:0,total:0,insertChars:0,deleteChars:0};
  try{
    var activeEditor=(typeof window!=='undefined'&&window.editor)?window.editor:(editor||null);
    if(!activeEditor||!activeEditor.state) return empty;
    if(window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.summarizeTrackChanges==='function'){
      var summary=window.AQTipTapWordCommands.summarizeTrackChanges(activeEditor);
      if(summary&&typeof summary==='object') return Object.assign({},empty,summary);
    }
    if(window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.collectMarkRanges==='function'){
      var inserts=window.AQTipTapWordCommands.collectMarkRanges(activeEditor.state,'trackInsert')||[];
      var deletes=window.AQTipTapWordCommands.collectMarkRanges(activeEditor.state,'trackDelete')||[];
      var insertChars=inserts.reduce(function(total,range){
        return total+Math.max(0,Number(range&&range.to||0)-Number(range&&range.from||0));
      },0);
      var deleteChars=deletes.reduce(function(total,range){
        return total+Math.max(0,Number(range&&range.to||0)-Number(range&&range.from||0));
      },0);
      return {
        insertCount:inserts.length,
        deleteCount:deletes.length,
        total:inserts.length+deletes.length,
        insertChars:insertChars,
        deleteChars:deleteChars
      };
    }
  }catch(_e){}
  return empty;
}
function ensureTrackReviewBar(){
  var bar=document.getElementById('aqTrackReviewBar');
  if(bar) return bar;
  var etb=document.getElementById('etb');
  if(!etb) return null;
  bar=document.createElement('div');
  bar.id='aqTrackReviewBar';
  bar.className='aq-track-review-bar';
  bar.hidden=true;
  bar.innerHTML=''
    + '<div class="aq-track-review-main">'
    +   '<span class="aq-track-review-title">Inceleme modu</span>'
    +   '<span class="aq-track-review-summary" id="aqTrackReviewSummary">0 oneri</span>'
    + '</div>'
    + '<div class="aq-track-review-actions">'
    +   '<button type="button" class="efmt aq-track-review-btn" id="aqTrackReviewPrev" title="Onceki oneri">◀</button>'
    +   '<button type="button" class="efmt aq-track-review-btn" id="aqTrackReviewNext" title="Sonraki oneri">▶</button>'
    +   '<button type="button" class="efmt aq-track-review-btn" id="aqTrackReviewAcceptOne">Bu oneriyi kabul et</button>'
    +   '<button type="button" class="efmt aq-track-review-btn" id="aqTrackReviewRejectOne">Bu oneriyi geri al</button>'
    +   '<button type="button" class="efmt aq-track-review-btn" id="aqTrackReviewAccept">Tumunu kabul</button>'
    +   '<button type="button" class="efmt aq-track-review-btn" id="aqTrackReviewReject">Tumunu geri al</button>'
    +   '<button type="button" class="efmt aq-track-review-btn" id="aqTrackReviewToggle">Kapat</button>'
    + '</div>';
  var pager=document.getElementById('etbPager');
  if(pager&&pager.parentNode===etb) etb.insertBefore(bar,pager);
  else etb.appendChild(bar);
  return bar;
}
function updateTrackReviewBar(){
  var bar=ensureTrackReviewBar();
  if(!bar) return;
  var summary=getTrackChangesSummaryRuntime();
  var enabled=isTrackChangesEnabled();
  var visible=enabled||summary.total>0;
  bar.hidden=!visible;
  bar.classList.toggle('is-active',enabled);
  if(!visible) return;
  var summaryEl=document.getElementById('aqTrackReviewSummary');
  if(summaryEl){
    var prefix=enabled?'Açık':'Kapalı';
    var detail=summary.total>0
      ? (summary.total+' oneri · +'+summary.insertCount+' / -'+summary.deleteCount)
      : 'Oneri yok';
    summaryEl.textContent=prefix+' · '+detail;
  }
  var acceptBtn=document.getElementById('aqTrackReviewAccept');
  var rejectBtn=document.getElementById('aqTrackReviewReject');
  var acceptOneBtn=document.getElementById('aqTrackReviewAcceptOne');
  var rejectOneBtn=document.getElementById('aqTrackReviewRejectOne');
  var prevBtn=document.getElementById('aqTrackReviewPrev');
  var nextBtn=document.getElementById('aqTrackReviewNext');
  var toggleBtn=document.getElementById('aqTrackReviewToggle');
  if(acceptBtn) acceptBtn.disabled=summary.total<1;
  if(rejectBtn) rejectBtn.disabled=summary.total<1;
  if(acceptOneBtn) acceptOneBtn.disabled=summary.total<1;
  if(rejectOneBtn) rejectOneBtn.disabled=summary.total<1;
  if(prevBtn) prevBtn.disabled=summary.total<1;
  if(nextBtn) nextBtn.disabled=summary.total<1;
  if(toggleBtn) toggleBtn.textContent=enabled?'Kapat':'Ac';
}
function scheduleTrackReviewBarUpdate(){
  if(trackReviewBarRuntime.raf) return;
  var rafFn=(typeof window!=='undefined'&&typeof window.requestAnimationFrame==='function')
    ? window.requestAnimationFrame.bind(window)
    : function(cb){ return setTimeout(cb,16); };
  trackReviewBarRuntime.raf=rafFn(function(){
    trackReviewBarRuntime.raf=0;
    updateTrackReviewBar();
  });
}
function initTrackReviewBarRuntime(){
  if(trackReviewBarRuntime.bound) return;
  var bar=ensureTrackReviewBar();
  if(!bar) return;
  var acceptBtn=document.getElementById('aqTrackReviewAccept');
  var rejectBtn=document.getElementById('aqTrackReviewReject');
  var acceptOneBtn=document.getElementById('aqTrackReviewAcceptOne');
  var rejectOneBtn=document.getElementById('aqTrackReviewRejectOne');
  var prevBtn=document.getElementById('aqTrackReviewPrev');
  var nextBtn=document.getElementById('aqTrackReviewNext');
  var toggleBtn=document.getElementById('aqTrackReviewToggle');
  if(acceptBtn&&!acceptBtn.__aqBound){
    acceptBtn.__aqBound=true;
    acceptBtn.addEventListener('click',function(){ acceptTrackedChanges(); });
  }
  if(rejectBtn&&!rejectBtn.__aqBound){
    rejectBtn.__aqBound=true;
    rejectBtn.addEventListener('click',function(){ rejectTrackedChanges(); });
  }
  if(acceptOneBtn&&!acceptOneBtn.__aqBound){
    acceptOneBtn.__aqBound=true;
    acceptOneBtn.addEventListener('click',function(){ acceptCurrentTrackedChange(); });
  }
  if(rejectOneBtn&&!rejectOneBtn.__aqBound){
    rejectOneBtn.__aqBound=true;
    rejectOneBtn.addEventListener('click',function(){ rejectCurrentTrackedChange(); });
  }
  if(prevBtn&&!prevBtn.__aqBound){
    prevBtn.__aqBound=true;
    prevBtn.addEventListener('click',function(){ focusPrevTrackedChange(); });
  }
  if(nextBtn&&!nextBtn.__aqBound){
    nextBtn.__aqBound=true;
    nextBtn.addEventListener('click',function(){ focusNextTrackedChange(); });
  }
  if(toggleBtn&&!toggleBtn.__aqBound){
    toggleBtn.__aqBound=true;
    toggleBtn.addEventListener('click',function(){ toggleTrackChangesMode(); });
  }
  if(typeof window!=='undefined'&&typeof window.addEventListener==='function'){
    window.addEventListener('aq:track-changes-toggle',scheduleTrackReviewBarUpdate);
  }
  trackReviewBarRuntime.bound=true;
  scheduleTrackReviewBarUpdate();
}
function setTrackChangesMode(enabled, source){
  var options=(source&&typeof source==='object')?source:{source:source};
  if(!options||typeof options!=='object')options={};
  var sourceTag=options.source||'runtime';
  var persistDoc=options.persistDoc!==false;
  var saveState=options.saveState!==false;
  var silent=!!options.silent;
  var next=!!enabled;
  try{
    if(window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.setTrackChangesEnabled==='function'){
      next=!!window.AQTipTapWordCommands.setTrackChangesEnabled(next,{source:sourceTag});
    }else{
      window.__aqTrackChangesState=window.__aqTrackChangesState||{};
      window.__aqTrackChangesState.enabled=next;
      if(document&&document.body&&document.body.classList){
        document.body.classList.toggle('aq-track-changes-on',next);
      }
    }
  }catch(_e){}
  if(persistDoc){
    var currentDoc=ensureDocAuxFields(getCurrentDocRecord());
    if(currentDoc&&!!currentDoc.trackChangesEnabled!==next){
      currentDoc.trackChangesEnabled=next;
      if(saveState) save();
    }
  }
  if(!silent){
    setSL(next?'Inceleme modu acik':'Inceleme modu kapali',next?'warn':'ok');
    setTimeout(function(){setSL('','');},1600);
  }
  try{updateFmtState();}catch(_e){}
  scheduleTrackReviewBarUpdate();
  return next;
}
function toggleTrackChangesMode(){
  return setTrackChangesMode(!isTrackChangesEnabled(),{source:'shortcut'});
}
function focusNextTrackedChange(){
  ec('focusNextTrackChange');
  scheduleTrackReviewBarUpdate();
}
function focusPrevTrackedChange(){
  ec('focusPrevTrackChange');
  scheduleTrackReviewBarUpdate();
}
function acceptCurrentTrackedChange(){
  ec('acceptCurrentTrackChange');
  setSL('Oneri kabul edildi','ok');
  setTimeout(function(){setSL('','');},1200);
  scheduleTrackReviewBarUpdate();
}
function rejectCurrentTrackedChange(){
  ec('rejectCurrentTrackChange');
  setSL('Oneri geri alindi','warn');
  setTimeout(function(){setSL('','');},1200);
  scheduleTrackReviewBarUpdate();
}
function acceptTrackedChanges(){
  ec('acceptTrackChanges');
  setSL('Tum oneriler kabul edildi','ok');
  setTimeout(function(){setSL('','');},1600);
  scheduleTrackReviewBarUpdate();
}
function rejectTrackedChanges(){
  ec('rejectTrackChanges');
  setSL('Tum oneriler geri alindi','warn');
  setTimeout(function(){setSL('','');},1600);
  scheduleTrackReviewBarUpdate();
}
window.toggleTrackChangesMode=toggleTrackChangesMode;
window.focusNextTrackedChange=focusNextTrackedChange;
window.focusPrevTrackedChange=focusPrevTrackedChange;
window.acceptCurrentTrackedChange=acceptCurrentTrackedChange;
window.rejectCurrentTrackedChange=rejectCurrentTrackedChange;
window.acceptTrackedChanges=acceptTrackedChanges;
window.rejectTrackedChanges=rejectTrackedChanges;
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',initTrackReviewBarRuntime);
}else{
  setTimeout(initTrackReviewBarRuntime,0);
}
// ¦¦ LINE SPACING ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function setLineSpacing(val){
  var parsed=parseFloat(String(val==null?'2':val).replace(',','.'));
  if(!(parsed>0))parsed=2;
  parsed=Math.max(1,Math.min(parsed,3));
  var normalized=String(Math.round(parsed*100)/100);
  try{
    document.documentElement.style.setProperty('--aq-line-spacing',normalized);
    var forceStyle=document.getElementById('aq-editor-line-spacing-force');
    if(!forceStyle){
      forceStyle=document.createElement('style');
      forceStyle.id='aq-editor-line-spacing-force';
      if(document.head)document.head.appendChild(forceStyle);
    }
    if(forceStyle){
      forceStyle.textContent=
        '#aq-tiptap-content .ProseMirror,#apaed{line-height:'+normalized+' !important;}' +
        '#aq-tiptap-content .ProseMirror *,#apaed *{line-height:'+normalized+' !important;}' +
        '#aq-tiptap-content .ProseMirror p,#aq-tiptap-content .ProseMirror li,#aq-tiptap-content .ProseMirror h1,#aq-tiptap-content .ProseMirror h2,#aq-tiptap-content .ProseMirror h3,#aq-tiptap-content .ProseMirror h4,#aq-tiptap-content .ProseMirror h5,#aq-tiptap-content .ProseMirror h6,#apaed p,#apaed li,#apaed h1,#apaed h2,#apaed h3,#apaed h4,#apaed h5,#apaed h6{margin-top:0 !important;margin-bottom:0 !important;}';
    }
  }catch(_e){}
  if(window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.runLineSpacing==='function'){
    window.AQTipTapWordCommands.runLineSpacing({
      value:normalized,
      onMutated:function(){
        runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});
      }
    });
    return;
  }
  runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});
}
function editorZoom(delta){
  if(window.AQTipTapWordLayout&&typeof window.AQTipTapWordLayout.runEditorZoom==='function'){
    window.AQTipTapWordLayout.runEditorZoom({
      doc:document,
      delta:delta
    });
    return;
  }
  if(window.AQTipTapWordLayout&&typeof window.AQTipTapWordLayout.changeZoomWithFallback==='function'){
    window.AQTipTapWordLayout.changeZoomWithFallback({
      doc:document,
      delta:delta,
      currentZoom:parseInt((document.getElementById('zoomLbl')||{}).textContent,10)||100,
      applyManual:function(next){
        var page=document.getElementById('apapage');
        if(page){
          page.style.transform='scale('+(next/100)+')';
          page.style.transformOrigin='top center';
        }
        var label=document.getElementById('zoomLbl');
        if(label)label.textContent=next+'%';
      }
    });
    return;
  }
}
// ¦¦ FORMATTING STATE FEEDBACK ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function updateFmtState(){
  try{
    if(window.AQTipTapWordToolbar&&typeof window.AQTipTapWordToolbar.syncFormatUI==='function'){
      window.AQTipTapWordToolbar.syncFormatUI({
        editor:editor||null,
        doc:document,
        queryState:function(cmd){
          return document.queryCommandState(cmd);
        }
      });
      return;
    }
    if(window.AQTipTapWordToolbar&&typeof window.AQTipTapWordToolbar.syncFormatState==='function'){
      window.AQTipTapWordToolbar.syncFormatState({
        editor:editor||null,
        doc:document,
        queryState:function(cmd){
          return document.queryCommandState(cmd);
        }
      });
    }
  }catch(e){}
  try{
    if(editor){
      ['H1','H2','H3','H4','H5'].forEach(function(h){
        var btn=document.getElementById('btn'+h);
        if(btn)btn.classList.remove('heading-active');
      });
      for(var _lvl=1;_lvl<=5;_lvl++){
        if(editor.isActive('heading',{level:_lvl})){
          var _btn=document.getElementById('btnH'+_lvl);
          if(_btn)_btn.classList.add('heading-active');
          break;
        }
      }
    }
  }catch(e){}
}
function uSt(){
  updateCitationStyleSelector();
  if(window.AQTipTapWordToolbar&&typeof window.AQTipTapWordToolbar.syncStatusUI==='function'){
    window.AQTipTapWordToolbar.syncStatusUI({
      doc:document,
      editor:editor||null,
      getHost:function(){
        var surface=window.AQTipTapWordSurface||null;
        return surface&&typeof surface.getHost==='function'?surface.getHost():document.getElementById('apaed');
      },
      getRefs:function(){ return getUsedRefs().length; },
      wordGoal:S.wordGoal||0
    });
    return;
  }
}
function setWordGoal(){
  if(window.AQTipTapWordChrome&&typeof window.AQTipTapWordChrome.setWordGoal==='function'){
    window.AQTipTapWordChrome.setWordGoal({
      currentGoal:S.wordGoal||'',
      prompt:customPrompt,
      setGoal:function(value){ S.wordGoal=value; },
      save:save,
      syncStatus:uSt
    });
    return;
  }
  customPrompt('Kelime hedefi:',S.wordGoal||'').then(function(g){if(g===null)return;S.wordGoal=parseInt(g)||0;save();uSt();});
}
// ¦¦ APA PASTE FORMATTING ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function cleanPastedHTML(html){
  if(window.AQTipTapWordPaste&&typeof window.AQTipTapWordPaste.cleanPastedHTML==='function'){
    return window.AQTipTapWordPaste.cleanPastedHTML(html);
  }
  var div=document.createElement('div');div.innerHTML=html;
  return div.innerHTML;
}
function formatPlainTextAPA(text){
  if(window.AQTipTapWordPaste&&typeof window.AQTipTapWordPaste.formatPlainTextAPA==='function'){
    return window.AQTipTapWordPaste.formatPlainTextAPA(text);
  }
  if(!text)return'';
  return '<p>'+String(text).replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</p>';
}

var _refTimer=null;

// ¦¦ PAGE HEIGHT AUTO-ADJUST WITH PAGE BREAKS ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
var _pgTimer=null;
function updatePageHeight(){
  if(window.AQTipTapWordLayout&&typeof window.AQTipTapWordLayout.schedulePageSync==='function'){
    window.AQTipTapWordLayout.schedulePageSync({
      delay:300,
      page:document.getElementById('apapage'),
      editorDom:editor?editor.view.dom:document.getElementById('apaed'),
      editorView:editor?editor.view:null,
      scrollEl:document.getElementById('escroll'),
      showPageNumbers:S.showPageNumbers
    });
    return;
  }
  clearTimeout(_pgTimer);
  _pgTimer=setTimeout(_doUpdatePageHeight,300);
}
function _doUpdatePageHeight(){
  var page=document.getElementById('apapage');
  var ed=editor?editor.view.dom:document.getElementById('apaed');
  if(!page||!ed)return;
  if(window.AQTipTapWordLayout&&typeof window.AQTipTapWordLayout.syncPageMetrics==='function'){
    window.AQTipTapWordLayout.syncPageMetrics({
      page:page,
      editorDom:ed,
      editorView:editor?editor.view:null,
      showPageNumbers:S.showPageNumbers
    });
    return;
  }
  page.querySelectorAll('.page-break-overlay,.page-number').forEach(function(pb){pb.remove();});
  ed.querySelectorAll('.pg-spacer').forEach(function(s){s.remove();});
  Array.from(ed.children||[]).forEach(function(child){
    if(child&&child.classList)child.classList.remove('aq-page-gap');
    if(child&&child.style)child.style.removeProperty('--aq-page-gap');
  });
  var contentH=Math.max(ed.scrollHeight||0,ed.offsetHeight||0,864);
  page.style.minHeight=Math.max(1056,contentH+192)+'px';
  var numPages=Math.max(1,Math.ceil(contentH/864));
  var _pageH=1123,_pageGap=32,_pageTotalH=1155;
  for(var g=0;g<numPages-1;g++){
    var ov=document.createElement('div');
    ov.className='page-break-overlay';
    ov.style.top=(g*_pageTotalH+_pageH)+'px';
    ov.style.height=_pageGap+'px';
    page.appendChild(ov);
  }
  if(!S.showPageNumbers)return;
  for(var p=0;p<numPages;p++){
    var pn=document.createElement('div');
    pn.className='page-number';
    pn.textContent=String(p+1);
    pn.style.top=(48+p*1056)+'px';
    page.appendChild(pn);
  }
}

function toggleTrigSel(id){
  var ref=findRef(id,S.cur);
  var key=refKey(ref)||('id:'+id);
  var existingIdx=-1;
  for(var i=0;i<trigSelected.length;i++){
    var existingRef=findRef(trigSelected[i],S.cur);
    if((refKey(existingRef)||('id:'+trigSelected[i]))===key){
      existingIdx=i;
      break;
    }
  }
  if(existingIdx>=0){
    if(trigSelected[existingIdx]===id)trigSelected.splice(existingIdx,1);
    else trigSelected[existingIdx]=id;
  }else{
    trigSelected.push(id);
  }
  renderTrig(document.getElementById('tgs').value);
}
function setCM(m,btn){
  if(window.AQTipTapWordChrome&&typeof window.AQTipTapWordChrome.setCitationMode==='function'){
    window.AQTipTapWordChrome.setCitationMode({
      mode:m,
      button:btn,
      doc:document,
      setMode:function(value){ S.cm=value; },
      getSearchValue:function(){
        var input=document.getElementById('tgs');
        return input?input.value:'';
      },
      renderTrigger:renderTrig,
      renderReferences:rRefs
    });
    return;
  }
  S.cm=m;document.querySelectorAll('.tgm').forEach(function(b){b.classList.remove('on');});btn.classList.add('on');renderTrig(document.getElementById('tgs').value);rRefs();
}
document.addEventListener('click',function(e){
  if(e.target.closest('.dd')||e.target.closest('.tbdd'))return;
  if(e.target.closest('#tocMenuBtn')||e.target.closest('#editorInsertMenuBtn'))return;
  if(e.target.closest('.quick-menu-modal .modal'))return;
  cdd();
});

// ¦¦ INSERT HELPERS ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function insCover(){showM('covermodal');}
function doCover(){
  var t=(document.getElementById('cvtitle').value||'').trim();
  if(!t){document.getElementById('cvtitle').focus();return;}
  var a=document.getElementById('cvauthor').value.trim();
  var af=document.getElementById('cvinst').value.trim();
  var ders=document.getElementById('cvcourse').value.trim();
  var ogr=document.getElementById('cvprof').value.trim();
  var dt=new Date().toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'});
  hideM('covermodal');
  var coverHTML=window.AQTipTapWordTemplates&&typeof window.AQTipTapWordTemplates.buildCoverHTML==='function'
    ? window.AQTipTapWordTemplates.buildCoverHTML({
        title:t,
        author:a,
        institution:af,
        course:ders,
        professor:ogr,
        dateText:dt
      })
    : '<div style="text-align:center;padding-top:192px;font-family:Times New Roman,serif;font-size:12pt;line-height:2;"><p style="text-indent:0;font-weight:bold;">'+t.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</p></div><p><br></p>';
  var doc=getCurrentDocRecord();
  if(doc){
    ensureDocAuxFields(doc);
    doc.coverHTML=sanitizeAuxPageHTML(coverHTML);
    syncAuxiliaryPages();
    save();
    var coverPage=document.getElementById('coverpage');
    if(coverPage&&coverPage.style.display!=='none'&&typeof coverPage.scrollIntoView==='function'){
      setTimeout(function(){coverPage.scrollIntoView({behavior:'smooth',block:'start'});},0);
    }
  }
  // Clear inputs
  ['cvtitle','cvauthor','cvinst','cvcourse','cvprof'].forEach(function(id){document.getElementById(id).value='';});
}
function insAbstract(){
  if(window.AQTipTapWordContent&&typeof window.AQTipTapWordContent.insertCommandBuiltBlockWithBridge==='function'){
    if(window.AQTipTapWordContent.insertCommandBuiltBlockWithBridge({
      builderName:'buildAbstractHTML',
      editor:editor||null,
      host:document.getElementById('apaed'),
      bridgeApi:window.AQTipTapWordBridge||null,
      documentApi:window.AQTipTapWordDocument||null,
      runtimeApi:window.AQEditorRuntime||null,
      sanitizeHTML:sanitizeDocHTML,
      getSavedRange:function(){ return editorSavedRange; },
      setSavedRange:function(v){ editorSavedRange=v; }
    })) return;
  }
  var html=window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.buildAbstractHTML==='function'
    ? window.AQTipTapWordCommands.buildAbstractHTML()
    : '<h1>Abstract</h1><p class="ni">Ozet metni (150-250 kelime).</p><p class="ni"><em>Keywords:</em> kelime1, kelime2</p><p><br></p>';
  iHTML(html);
}
function insImage(){if(!editor)saveEditorSelection();document.getElementById('imginp').click();}
function handleImgUpload(e){
  if(window.AQTipTapWordContent&&typeof window.AQTipTapWordContent.insertImageFromEvent==='function'){
    if(window.AQTipTapWordContent.insertImageFromEvent({
      event:e,
      editor:editor||null,
      host:document.getElementById('apaed'),
      getSavedRange:function(){ return editorSavedRange; },
      setSavedRange:function(v){ editorSavedRange=v; }
    })){
      return;
    }
  }
  var file=e.target.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(ev){
    var html=window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.buildImageHTML==='function'
      ? window.AQTipTapWordDocument.buildImageHTML(ev.target.result,file.name)
      : '<img src="'+ev.target.result+'" data-width="70%" data-align="left" style="display:block;float:left;width:70%;max-width:100%;height:auto;text-indent:0;margin-left:0;margin-right:14px;margin-top:2px;margin-bottom:10px;" alt="'+file.name+'"/><p><br></p>';
    if(window.AQTipTapWordContent&&typeof window.AQTipTapWordContent.insertImageWithState==='function'){
      window.AQTipTapWordContent.insertImageWithState({
        editor:editor||null,
        src:ev.target.result,
        alt:file.name,
        html:html,
        host:document.getElementById('apaed'),
        getSavedRange:function(){ return editorSavedRange; },
        setSavedRange:function(v){ editorSavedRange=v; }
      });
      return;
    }
  };
  reader.readAsDataURL(file);
  e.target.value='';
}
// ¦¦ İÇİNDEKİLER (TABLE OF CONTENTS) ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function insBlkQ(){
  if(window.AQTipTapWordContent&&typeof window.AQTipTapWordContent.insertCommandBuiltBlockWithBridge==='function'){
    if(window.AQTipTapWordContent.insertCommandBuiltBlockWithBridge({
      builderName:'buildBlockquoteHTML',
      editor:editor||null,
      host:document.getElementById('apaed'),
      bridgeApi:window.AQTipTapWordBridge||null,
      documentApi:window.AQTipTapWordDocument||null,
      runtimeApi:window.AQEditorRuntime||null,
      sanitizeHTML:sanitizeDocHTML,
      getSavedRange:function(){ return editorSavedRange; },
      setSavedRange:function(v){ editorSavedRange=v; }
    })) return;
  }
  var html=window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.buildBlockquoteHTML==='function'
    ? window.AQTipTapWordCommands.buildBlockquoteHTML()
    : '<blockquote>Alinti metni (40+ kelime). (Yazar, Yil, s. XX)</blockquote><p><br></p>';
  iHTML(html);
}
function getNextAcademicObjectNumber(type){
  if(window.AQAcademicObjects&&typeof window.AQAcademicObjects.getNextNumber==='function'){
    try{return window.AQAcademicObjects.getNextNumber(type,{root:document.getElementById('apaed')});}catch(_e){}
  }
  return 1;
}
function openTableWizard(){
  var numberInput=document.getElementById('wtn');
  if(numberInput){
    numberInput.value=String(getNextAcademicObjectNumber('table'));
    numberInput.readOnly=true;
  }
  var titleInput=document.getElementById('wtt');
  var noteInput=document.getElementById('wtn2');
  if(titleInput)titleInput.value='';
  if(noteInput)noteInput.value='';
  showM('wiz');
  setTimeout(function(){
    try{if(titleInput)titleInput.focus();}catch(_e){}
  },20);
}
function insFig(){var n=String(getNextAcademicObjectNumber('figure'));customPrompt('Şekil başlığı:','').then(function(t){if(t===null)return;t=t||'';if(window.AQTipTapWordContent&&typeof window.AQTipTapWordContent.insertCommandBuiltBlockWithBridge==='function'){if(window.AQTipTapWordContent.insertCommandBuiltBlockWithBridge({builderName:'buildFigureHTML',builderArgs:[n,t],editor:editor||null,host:document.getElementById('apaed'),bridgeApi:window.AQTipTapWordBridge||null,documentApi:window.AQTipTapWordDocument||null,runtimeApi:window.AQEditorRuntime||null,sanitizeHTML:sanitizeDocHTML,getSavedRange:function(){ return editorSavedRange; },setSavedRange:function(v){ editorSavedRange=v; }}))return; }var html=window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.buildFigureHTML==='function'?window.AQTipTapWordCommands.buildFigureHTML(n,t):'<p style="text-align:center;text-indent:0">[Şekil '+n+']</p><p style="text-align:center;text-indent:0;font-style:italic">Şekil '+n+(t?' - '+t:'')+'</p><p><br></p>';iHTML(html);});
}
function doTable(){
  try{
    var tableOptions={
      number:document.getElementById('wtn').value||'1',
      cols:document.getElementById('wtc').value,
      rows:document.getElementById('wtr').value,
      title:document.getElementById('wtt').value||'',
      note:document.getElementById('wtn2').value||''
    };
    if(window.AQTipTapWordContent&&typeof window.AQTipTapWordContent.insertCommandBuiltBlockWithBridge==='function'){
      if(window.AQTipTapWordContent.insertCommandBuiltBlockWithBridge({
        builderName:'buildTableHTML',
        builderValue:tableOptions,
        editor:editor||null,
        host:document.getElementById('apaed'),
        bridgeApi:window.AQTipTapWordBridge||null,
        documentApi:window.AQTipTapWordDocument||null,
        runtimeApi:window.AQEditorRuntime||null,
        sanitizeHTML:sanitizeDocHTML,
        getSavedRange:function(){ return editorSavedRange; },
        setSavedRange:function(v){ editorSavedRange=v; }
      })){
        hideM('wiz');
        return;
      }
    }
    var html=window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.buildTableHTML==='function'
      ? window.AQTipTapWordCommands.buildTableHTML(tableOptions)
      : '<p class="ni"><strong>Tablo 1</strong></p><table><thead><tr><th>Baslik 1</th><th>Baslik 2</th><th>Baslik 3</th></tr></thead><tbody><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>';
    iHTML(html);
    hideM('wiz');
  }catch(err){alert('Tablo hatasi: '+err.message);}
}

// ¦¦ EXPORT ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function normalizeExportLineSpacing(value){
  var num=parseFloat(String(value==null?'':value).replace(',','.'));
  if(!isFinite(num)||num<=0)return '2';
  num=Math.max(1,Math.min(num,3));
  return String(Math.round(num*100)/100);
}
function getSelectedExportLineSpacing(){
  var lineSel=document.getElementById('lineSpacing');
  if(lineSel&&lineSel.value)return normalizeExportLineSpacing(lineSel.value);
  var host=document.getElementById('apaed');
  if(host&&host.style){
    var cssVar=String(host.style.getPropertyValue('--aq-line-spacing')||'').trim();
    if(cssVar)return normalizeExportLineSpacing(cssVar);
    if(host.style.lineHeight)return normalizeExportLineSpacing(host.style.lineHeight);
  }
  return '2';
}
function applyLineSpacingForExportHTML(html,lineSpacing){
  var source=String(html||'');
  if(!source.trim())return '';
  var normalized=normalizeExportLineSpacing(lineSpacing);
  try{
    var holder=document.createElement('div');
    holder.innerHTML=source;
    holder.querySelectorAll('p,li,blockquote,h1,h2,h3,h4,h5,h6,ul,ol,th,td,.refe,.aq-ref-entry').forEach(function(node){
      if(node&&node.style)node.style.lineHeight=normalized;
    });
    return holder.innerHTML.trim();
  }catch(_e){
    return source;
  }
}
function getCompositeExportBodyHTML(){
  var edHTML=sanitizeDocHTML(getCurrentEditorHTML());
  if(window.AQNoteLinking&&typeof window.AQNoteLinking.stripNoteLinkAttributes==='function'){
    try{edHTML=window.AQNoteLinking.stripNoteLinkAttributes(edHTML);}catch(_e){}
  }
  var lineSpacing=getSelectedExportLineSpacing();
  var doc=ensureDocAuxFields(getCurrentDocRecord());
  var coverHTML=doc?sanitizeAuxPageHTML(String(doc.coverHTML||'')):'';
  var tocHTML=doc?sanitizeAuxPageHTML(String(doc.tocHTML||'')):'';
  var bibBody=document.getElementById('bibbody');
  var bibSource=doc&&String(doc.bibliographyHTML||'').trim()
    ? String(doc.bibliographyHTML||'')
    : (bibBody?String(bibBody.innerHTML||''):'');
  var bibHTML=sanitizeAuxPageHTML(bibSource);
  var contentHTML=applyLineSpacingForExportHTML(edHTML,lineSpacing);
  var bibliographyHTML=applyLineSpacingForExportHTML(bibHTML,lineSpacing);
  var sections=[];
  if(coverHTML)sections.push('<section class="aq-export-cover aq-export-page">'+coverHTML+'</section>');
  if(tocHTML)sections.push('<section class="aq-export-toc aq-export-page aq-export-page-break-before">'+tocHTML+'</section>');
  sections.push('<section class="aq-export-main aq-export-page'+(sections.length?' aq-export-page-break-before':'')+'">'+contentHTML+'</section>');
  if(bibliographyHTML)sections.push('<section class="aq-export-bib aq-export-page aq-export-page-break-before">'+bibliographyHTML+'</section>');
  return '<div class="aq-export-composite" style="--aq-line-spacing:'+lineSpacing+'">'+sections.join('')+'</div>';
}
function refreshExportAuxSections(){
  try{updateRefSection(false);}catch(_e){}
  try{syncAuxiliaryPages();}catch(_e){}
}
function getExportDocHTML(){
  var edHTML=getCompositeExportBodyHTML();
  if(window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.buildExportDocHTML==='function'){
    return window.AQTipTapWordDocument.buildExportDocHTML(edHTML);
  }
  return '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><meta name="ProgId" content="Word.Document"><meta name="Generator" content="AcademiQ Research"><style>@page WordSection1{size:595pt 842pt;margin:72pt 72pt 72pt 72pt;}div.WordSection1{page:WordSection1;}body{font-family:"Times New Roman",serif;font-size:12pt;line-height:2;margin:0;}h1{font-size:12pt;font-weight:bold;text-align:center;margin:0;text-indent:0;}h2{font-size:12pt;font-weight:bold;text-align:left;margin:0;text-indent:0;}h3{font-size:12pt;font-weight:bold;font-style:italic;margin:0;text-indent:0;}h4{font-size:12pt;font-weight:bold;margin:0;text-indent:.5in;}h5{font-size:12pt;font-weight:bold;font-style:italic;margin:0;text-indent:.5in;}p{margin:0;text-indent:.5in;mso-pagination:none;}.ni{text-indent:0;}.cit{color:#000;border:none;white-space:normal;}.cit-gap{display:none!important;}.refe{text-indent:-.5in;padding-left:.5in;margin:0;}blockquote{padding-left:.5in;text-indent:0;margin:0;}table{width:100%;border-collapse:collapse;font-size:12pt;page-break-inside:auto;}thead{display:table-header-group;}tr,img{page-break-inside:avoid;}.aq-export-page-break-before{page-break-before:always;}th{border-top:1.5px solid #000;border-bottom:1px solid #000;padding:4px 8px;}td{padding:4px 8px;}.toc-delete,.img-toolbar,.img-resize-handle,.aq-page-sheet,.page-break-overlay,.page-number{display:none!important;}</style></head><body><div class="WordSection1">'+edHTML+'</div></body></html>';
}
function getExportPDFHTML(){
  var edHTML=getCompositeExportBodyHTML();
  if(window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.buildExportPDFHTML==='function'){
    return window.AQTipTapWordDocument.buildExportPDFHTML(edHTML);
  }
  return getExportDocHTML();
}
function getExportPreviewHTML(){
  var edHTML=getCompositeExportBodyHTML();
  if(window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.buildExportPreviewHTML==='function'){
    return window.AQTipTapWordDocument.buildExportPreviewHTML(edHTML);
  }
  return getExportPDFHTML();
}
function refreshExportPreview(){
  var frame=document.getElementById('exportPreviewFrame');
  var meta=document.getElementById('exportPreviewMeta');
  if(!frame)return;
  refreshExportAuxSections();
  var html=getExportPreviewHTML();
  frame.srcdoc=html;
  if(meta){
    meta.textContent='Önizleme temiz export yüzeyinden üretildi. Araç çubukları ve yardımcı katmanlar bu görünümde yer almaz.';
  }
}
function openExportPreview(){
  showM('exportPreviewModal');
  refreshExportPreview();
}
function expDOC(){
  refreshExportAuxSections();
  var exportHTML=getExportDocHTML();
  if(window.electronAPI&&typeof window.electronAPI.exportDOCX==='function'){
    window.electronAPI.exportDOCX({
      defaultPath:'makale.docx',
      exportHTML:exportHTML
    }).then(function(result){
      if(!result||result.ok||result.canceled)return;
      alert('DOCX dışa aktarma hatası: '+(result.error||'Bilinmeyen hata'));
    }).catch(function(err){
      alert('DOCX dışa aktarma hatası: '+(err&&err.message?err.message:'Bilinmeyen hata'));
    });
    return;
  }
  alert('DOCX dışa aktarımı masaüstü uygulama içinde desteklenir. Lütfen AcademiQ masaüstü uygulamasından tekrar deneyin.');
}
function expPDF(){
  refreshExportAuxSections();
  if(window.electronAPI&&typeof window.electronAPI.exportPDF==='function'){
    window.electronAPI.exportPDF({
      defaultPath:'makale.pdf',
      exportHTML:getExportPDFHTML()
    }).then(function(result){
      if(!result||result.ok||result.canceled)return;
      alert('PDF dışa aktarma hatası: '+(result.error||'Bilinmeyen hata'));
    }).catch(function(err){
      alert('PDF dışa aktarma hatası: '+(err&&err.message?err.message:'Bilinmeyen hata'));
    });
    return;
  }
  var page=document.getElementById('apapage');
  if(!page)return;
  if(window.html2pdf){
    var wrapper=document.createElement('div');
    wrapper.innerHTML=getExportPDFHTML();
    var clone=(wrapper.querySelector&&wrapper.querySelector('.aq-export-root'))||wrapper;
    var opt=window.AQTipTapWordIO&&typeof window.AQTipTapWordIO.buildPDFExportOptions==='function'
      ? window.AQTipTapWordIO.buildPDFExportOptions()
      : {
        margin:[0,0,0,0],
        filename:'makale.pdf',
        image:{type:'jpeg',quality:0.99},
        html2canvas:{scale:3,useCORS:true,backgroundColor:'#ffffff',letterRendering:true,scrollX:0,scrollY:0},
        jsPDF:{unit:'pt',format:'a4',orientation:'portrait'},
        pagebreak:{mode:['css','legacy'],avoid:['blockquote','table','tr','img','h1','h2','h3','h4','h5','.toc-container']}
      };
    html2pdf().set(opt).from(clone).save();
    return;
  }
  alert('PDF dışa aktarma bu ortamda desteklenmiyor. Lütfen masaüstü uygulamasında tekrar deneyin.');
}
function importWordFile(e){
  var file=e.target.files[0];
  if(!file)return;
  function applyImportedHTML(html){
    if(window.AQTipTapWordIO&&typeof window.AQTipTapWordIO.applyImportedHTML==='function'){
      window.AQTipTapWordIO.applyImportedHTML({
        editor:editor||null,
        html:html||'',
        cleanPastedHTML:cleanPastedHTML,
        setCurrentEditorHTML:setCurrentEditorHTML,
        afterEditorImport:function(){
          if(window.AQEditorRuntime&&typeof window.AQEditorRuntime.runContentApplyEffects==='function')return;
          runEditorMutationEffects({target:editor&&editor.view?editor.view.dom:null,normalize:true,layout:true,syncChrome:true});
        },
        afterDomImport:function(){
          if(window.AQEditorRuntime&&typeof window.AQEditorRuntime.runContentApplyEffects==='function')return;
          runEditorMutationEffects({layout:true,syncChrome:true});
        }
      });
      return;
    }
    html=cleanPastedHTML(html||'');
    applyCurrentEditorHTML(html||'<p></p>',{
      normalize:true,
      layout:true,
      syncChrome:true,
      refreshTrigger:false
    });
  }
  if(/\.(doc|docx)$/i.test(file.name)){
    var fallbackImport=function(){
      return file.arrayBuffer().then(function(buf){
        var bytes=new Uint8Array(buf||new ArrayBuffer(0));
        var isZip=bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4B&&bytes[2]===0x03&&bytes[3]===0x04;
        if(isZip&&window.mammoth&&typeof window.mammoth.convertToHtml==='function'){
          return window.mammoth.convertToHtml({arrayBuffer:buf}).then(function(result){
            applyImportedHTML(result&&result.value?result.value:'');
            return true;
          });
        }
        var decoded='';
        try{decoded=new TextDecoder('utf-8').decode(bytes);}catch(_e){}
        if(!decoded||decoded.indexOf('{\\rtf')!==0){
          try{decoded=new TextDecoder('windows-1254').decode(bytes);}catch(_e2){}
        }
        if(decoded&&decoded.indexOf('{\\rtf')===0){
          if(window.AQTipTapWordIO&&typeof window.AQTipTapWordIO.normalizeImportHTML==='function'){
            applyImportedHTML(window.AQTipTapWordIO.normalizeImportHTML(decoded,formatPlainTextAPA));
          }else{
            applyImportedHTML(formatPlainTextAPA(decoded));
          }
          return true;
        }
        if(/\.doc$/i.test(file.name)){
          alert('Eski .doc biçimi sınırlı destekleniyor. En iyi sonuç için dosyayı Word’de .docx olarak kaydedip yeniden içe aktarın.');
          return false;
        }
        throw new Error('Word dosyasi okunamadi.');
      });
    };
    var nativePath=(file&&typeof file.path==='string')?file.path.trim():'';
    if(nativePath&&window.electronAPI&&typeof window.electronAPI.wordToHtml==='function'){
      window.electronAPI.wordToHtml(nativePath).then(function(res){
        if(res&&res.ok&&res.html){
          applyImportedHTML(res.html);
          return;
        }
        return fallbackImport();
      }).catch(function(){
        return fallbackImport();
      }).catch(function(){
        alert('Word dosyasi okunamadi.');
      }).finally(function(){e.target.value='';});
      return;
    }
    fallbackImport().catch(function(){
      alert('Word dosyasi okunamadi.');
    }).finally(function(){e.target.value='';});
    return;
  }
  var reader=new FileReader();
  reader.onload=function(ev){
    var text=String(ev.target.result||'');
    if(window.AQTipTapWordIO&&typeof window.AQTipTapWordIO.normalizeImportHTML==='function'){
      applyImportedHTML(window.AQTipTapWordIO.normalizeImportHTML(text,formatPlainTextAPA));
    }else if(/<\/?[a-z][\s\S]*>/i.test(text))applyImportedHTML(text);
    else applyImportedHTML(formatPlainTextAPA(text||''));
    e.target.value='';
  };
  reader.readAsText(file);
}
function expBIB(){
  var rows=sortLib(dedupeRefs(cLib())).map(function(r,idx){
    var key=(r.authors&&r.authors[0]?r.authors[0].split(',')[0].replace(/\W+/g,'').toLowerCase():'ref')+(r.year||'ty')+(idx+1);
    var fields=[
      '  title = {'+(r.title||'')+'}',
      '  author = {'+((r.authors||[]).join(' and '))+'}',
      '  year = {'+(r.year||'')+'}'
    ];
    if(r.journal)fields.push('  journal = {'+r.journal+'}');
    if(r.volume)fields.push('  volume = {'+r.volume+'}');
    if(r.issue)fields.push('  number = {'+r.issue+'}');
    if(r.fp||r.lp)fields.push('  pages = {'+((r.fp||'')+(r.lp?('--'+r.lp):''))+'}');
    if(r.doi)fields.push('  doi = {'+r.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i,'')+'}');
    if(r.url)fields.push('  url = {'+r.url+'}');
    return '@article{'+key+',\n'+fields.join(',\n')+'\n}';
  }).join('\n\n');
  saveAs(new Blob([rows],{type:'application/x-bibtex;charset=utf-8'}),'kaynakca.bib');
}
function expRIS(){
  var rows=sortLib(dedupeRefs(cLib())).map(function(r){
    var out=['TY  - JOUR'];
    (r.authors||[]).forEach(function(a){out.push('AU  - '+a);});
    if(r.title)out.push('TI  - '+r.title);
    if(r.journal)out.push('JO  - '+r.journal);
    if(r.year)out.push('PY  - '+r.year);
    if(r.volume)out.push('VL  - '+r.volume);
    if(r.issue)out.push('IS  - '+r.issue);
    if(r.fp)out.push('SP  - '+r.fp);
    if(r.lp)out.push('EP  - '+r.lp);
    if(r.doi)out.push('DO  - '+r.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i,''));
    if(r.url)out.push('UR  - '+r.url);
    out.push('ER  - ');
    return out.join('\n');
  }).join('\n\n');
  saveAs(new Blob([rows],{type:'application/x-research-info-systems;charset=utf-8'}),'kaynakca.ris');
}
function getBibliographyExportApi(){
  return window.AQBibliographyExport||null;
}
function getExportReadyReferences(){
  return sortLib(dedupeRefs(cLib()));
}
function expBibliographyPlain(styleId,filename){
  var refs=getExportReadyReferences();
  var api=getBibliographyExportApi();
  var text='';
  if(api&&typeof api.buildPlainBibliographyText==='function'){
    text=api.buildPlainBibliographyText(refs,{
      style:styleId,
      citationStyles:window.AQCitationStyles||null,
      fallbackSort:sortLib,
      fallbackFormat:apa7
    });
  }else{
    text=refs.map(function(ref){return apa7(ref);}).join('\n');
  }
  saveAs(new Blob([String(text||'')],{type:'text/plain;charset=utf-8'}),filename||'kaynakca.txt');
}
function expBibliographyAPA(){
  expBibliographyPlain('apa7','kaynakca-apa7.txt');
}
function expBibliographyChicago(){
  expBibliographyPlain('chicago-author-date','kaynakca-chicago.txt');
}
function expBibliographyVancouver(){
  // Vancouver output currently uses IEEE numeric bibliography rendering as fallback.
  expBibliographyPlain('vancouver','kaynakca-vancouver.txt');
}
function expCSLJSON(){
  var refs=getExportReadyReferences();
  var api=getBibliographyExportApi();
  var items=[];
  if(api&&typeof api.buildCslJsonItems==='function'){
    items=api.buildCslJsonItems(refs);
  }else{
    items=refs.map(function(ref,idx){
      return {
        id:String(ref&&ref.id||('ref-'+(idx+1))),
        type:(ref&&ref.journal)?'article-journal':'article',
        title:String(ref&&ref.title||'Untitled')
      };
    });
  }
  saveAs(new Blob([JSON.stringify(items,null,2)],{type:'application/vnd.citationstyles.csl+json;charset=utf-8'}),'kaynakca-csl.json');
}
function transformSelectedText(mode){
  if(window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.runTextTransform==='function'){
    if(window.AQTipTapWordCommands.runTextTransform({
      editor:editor||null,
      mode:mode,
      onMutated:function(){
        runEditorMutationEffects({
          target:editor&&editor.view?editor.view.dom:null,
          normalize:false,
          layout:true,
          syncChrome:true,
          refreshTrigger:false
        });
      }
    }))return;
  }
  var transform=function(text){
    if(window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.transformText==='function'){
      return window.AQTipTapWordCommands.transformText(text,mode);
    }
    if(mode==='upper')return text.toLocaleUpperCase('tr-TR');
    if(mode==='lower')return text.toLocaleLowerCase('tr-TR');
    if(mode==='title')return text.toLocaleLowerCase('tr-TR').replace(/\b(\p{L})/gu,function(m){return m.toLocaleUpperCase('tr-TR');});
    return text;
  };
  if(editor){
    var state=editor.state;
    var from=state.selection.from,to=state.selection.to;
    if(from===to)return;
    var txt=state.doc.textBetween(from,to,' ');
    editor.chain().focus().insertContentAt({from:from,to:to},transform(txt)).run();
    runEditorMutationEffects({
      target:editor&&editor.view?editor.view.dom:null,
      normalize:false,
      layout:true,
      syncChrome:true,
      refreshTrigger:false
    });
    return;
  }
  var sel=window.getSelection();
  if(!sel||sel.isCollapsed)return;
  var txt2=sel.toString();
  document.execCommand('insertText',false,transform(txt2));
  runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});
}
function expNotes(){var t=S.notes.map(function(n,i){var nb=S.notebooks.find(function(x){return x.id===n.nbId;});return (i+1)+'. ['+(nb?nb.name:'?')+'] '+(n.src?'('+n.src+') ':'')+'\n'+(n.txt||'')+(n.q?'\nAlıntı: "'+n.q+'"':'');}).join('\n\n');saveAs(new Blob([t],{type:'text/plain;charset=utf-8'}),'notlar.txt');}
function expLib(){var c=[];S.wss.forEach(function(ws){(ws.lib||[]).forEach(function(r){var x=Object.assign({},r);delete x.pdfData;c.push(x);});});saveAs(new Blob([JSON.stringify(c,null,2)],{type:'application/json'}),'kutuphane.json');}

// ¦¦ UI ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function enhanceMenus(){
  var insertMenu=document.getElementById('ddins');
  if(insertMenu&&!insertMenu.querySelector('[data-aq="word-import"]')){
    var wbtn=document.createElement('button');
    wbtn.className='ddi';
    wbtn.dataset.aq='word-import';
    wbtn.textContent='Word İçe Aktar';
    wbtn.onclick=function(){document.getElementById('wordinp').click();cdd();};
    insertMenu.appendChild(document.createElement('div')).className='dds';
    insertMenu.appendChild(wbtn);
  }
  var exportMenu=document.getElementById('ddexp');
  if(exportMenu&&exportMenu.children[0])exportMenu.children[0].onclick=function(){expPDF();cdd();};
  if(exportMenu){
    function ensureExportBtn(id,label,handler,insertBeforeId){
      var btn=exportMenu.querySelector('#'+id);
      if(!btn){
        btn=document.createElement('button');
        btn.className='ddi';
        btn.id=id;
        var refNode=insertBeforeId?exportMenu.querySelector('#'+insertBeforeId):null;
        if(refNode)exportMenu.insertBefore(btn,refNode);
        else exportMenu.appendChild(btn);
      }
      btn.textContent=label;
      btn.onclick=function(){handler();cdd();};
      return btn;
    }
    ensureExportBtn('ddExpBibBtn','BIB',expBIB,'ddExpNotesBtn');
    ensureExportBtn('ddExpRisBtn','RIS',expRIS,'ddExpNotesBtn');
    ensureExportBtn('ddExpApaTxtBtn','APA TXT',expBibliographyAPA,'ddExpNotesBtn');
    ensureExportBtn('ddExpChicagoTxtBtn','Chicago TXT',expBibliographyChicago,'ddExpNotesBtn');
    ensureExportBtn('ddExpVancouverTxtBtn','Vancouver TXT',expBibliographyVancouver,'ddExpNotesBtn');
    ensureExportBtn('ddExpCslJsonBtn','CSL-JSON',expCSLJSON,'ddExpNotesBtn');
  }
}
function enhanceToolbar(){
  var tb=document.getElementById('etb');
  var toolsGroup=document.getElementById('editorTransformGroup');
  if(!tb||!toolsGroup||toolsGroup.querySelector('[data-aq="sup"]'))return;
  ['txtColor','hlColor'].forEach(function(id){
    var inp=document.getElementById(id);
    if(inp)inp.style.cssText+=';appearance:none;-webkit-appearance:none;background:transparent;overflow:hidden;width:26px;height:26px;padding:0;border-radius:6px;border:1px solid var(--b);cursor:pointer;';
  });
  var mk=function(label,title,fn,key){
    var b=document.createElement('button');
    b.className='efmt efmt-state';
    b.dataset.aq=key;
    if(key==='sup') b.id='btnSuperscript';
    if(key==='sub') b.id='btnSubscript';
    b.textContent=label;
    b.title=title;
    b.onclick=fn;
    return b;
  };
  toolsGroup.appendChild(mk('X²','Üst simge',function(){ec('superscript');},'sup'));
  toolsGroup.appendChild(mk('X₂','Alt simge',function(){ec('subscript');},'sub'));
  toolsGroup.appendChild(mk('AA','Tümünü büyük harf',function(){transformSelectedText('upper');},'upper'));
  toolsGroup.appendChild(mk('Aa','Kelime başlarını büyüt',function(){transformSelectedText('title');},'title'));
  toolsGroup.appendChild(mk('aa','Tümünü küçük harf',function(){transformSelectedText('lower');},'lower'));
}
function tSB(side){var el=document.getElementById(side);var btn=document.getElementById('btn'+side);el.classList.toggle('closed');btn.classList.toggle('on');}
function swR(name,btn){
  document.querySelectorAll('.rtab').forEach(function(t){t.classList.remove('on');});
  document.querySelectorAll('.rpnl').forEach(function(p){p.classList.remove('on');});
  if(btn)btn.classList.add('on');
  var el=document.getElementById('rp'+name);
  if(el)el.classList.add('on');
  if(name==='notes'&&typeof rNotes==='function'){
    // Re-render notes when panel becomes visible; avoids stale empty view after async load.
    try{rNotes();}catch(_e){}
  }
}
function showM(id){document.getElementById(id).classList.add('show');}
function hideM(id){
  var el=document.getElementById(id);
  if(!el)return;
  el.classList.remove('show');
  if(el.style){
    el.style.padding='';
  }
  var modal=el.querySelector('.modal');
  if(modal&&modal.style){
    modal.style.marginTop='';
    modal.style.marginLeft='';
  }
  var inp=document.querySelector('#'+id+' .minp');if(inp)inp.value='';
}
function openQuickToolbarMenu(id,anchor){
  var wrap=document.getElementById(id);
  if(!wrap)return false;
  var modal=wrap.querySelector('.modal');
  if(!modal)return false;
  var btn=anchor&&anchor.getBoundingClientRect?anchor:null;
  cdd();
  wrap.classList.add('show');
  wrap.style.padding='0';
  modal.style.marginTop='';
  modal.style.marginLeft='';
  if(btn){
    var rect=btn.getBoundingClientRect();
    var left=Math.max(12,Math.min(rect.left,window.innerWidth-modal.offsetWidth-12));
    var top=Math.min(rect.bottom+8,window.innerHeight-modal.offsetHeight-12);
    wrap.style.padding=top+'px 0 0 '+left+'px';
  }
  return false;
}
// ¦¦ CUSTOM PROMPT (Electron-compatible) ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
var _promptResolve=null;
function customPrompt(title,defaultVal){
  return new Promise(function(resolve){
    _promptResolve=resolve;
    document.getElementById('promptTitle').textContent=title||'Giriş';
    var inp=document.getElementById('promptInput');
    inp.value=defaultVal||'';
    showM('promptModal');
    // Focus input — retry a few times to override TipTap focus capture
    var attempts=0;
    function tryFocus(){
      inp.focus();inp.select();
      if(document.activeElement!==inp&&attempts<5){
        attempts++;setTimeout(tryFocus,60);
      }
    }
    setTimeout(tryFocus,50);
  });
}
function resolvePrompt(ok){
  if(_promptResolve){
    var val=ok?document.getElementById('promptInput').value:null;
    hideM('promptModal');
    _promptResolve(val);
    _promptResolve=null;
  }else{
    hideM('promptModal');
  }
}
var _refMetaResolve=null;
function normalizeRefTypeValue(value){
  var raw=String(value||'').trim().toLowerCase();
  if(raw==='book'||raw==='website'||raw==='article')return raw;
  return 'article';
}
function openRefMetadataModal(ref){
  return new Promise(function(resolve){
    _refMetaResolve=resolve;
    document.getElementById('refMetaType').value=normalizeRefTypeValue(ref&&ref.referenceType||'');
    document.getElementById('refMetaTitle').value=ref&&ref.title||'';
    document.getElementById('refMetaAuthors').value=((ref&&ref.authors)||[]).join('; ');
    document.getElementById('refMetaYear').value=ref&&ref.year||'';
    document.getElementById('refMetaJournal').value=ref&&ref.journal||'';
    document.getElementById('refMetaPublisher').value=ref&&ref.publisher||'';
    document.getElementById('refMetaEdition').value=ref&&ref.edition||'';
    document.getElementById('refMetaWebsiteName').value=ref&&ref.websiteName||'';
    document.getElementById('refMetaPublishedDate').value=ref&&ref.publishedDate||'';
    document.getElementById('refMetaAccessedDate').value=ref&&ref.accessedDate||'';
    document.getElementById('refMetaVolume').value=ref&&ref.volume||'';
    document.getElementById('refMetaIssue').value=ref&&ref.issue||'';
    document.getElementById('refMetaFp').value=ref&&ref.fp||'';
    document.getElementById('refMetaLp').value=ref&&ref.lp||'';
    document.getElementById('refMetaDoi').value=ref&&ref.doi||'';
    document.getElementById('refMetaUrl').value=ref&&ref.url||'';
    showM('refMetaModal');
    setTimeout(function(){
      var inp=document.getElementById('refMetaTitle');
      if(inp){inp.focus();inp.select();}
    },0);
  });
}
function closeRefMetadataModal(ok){
  var resolve=_refMetaResolve;
  _refMetaResolve=null;
  if(!ok){
    hideM('refMetaModal');
    if(resolve)resolve(null);
    return;
  }
  var payload={
    referenceType:normalizeRefTypeValue(document.getElementById('refMetaType').value||''),
    title:(document.getElementById('refMetaTitle').value||'').trim(),
    authors:(document.getElementById('refMetaAuthors').value||'').split(';').map(function(a){return a.trim();}).filter(Boolean),
    year:(document.getElementById('refMetaYear').value||'').trim(),
    journal:(document.getElementById('refMetaJournal').value||'').trim(),
    publisher:(document.getElementById('refMetaPublisher').value||'').trim(),
    edition:(document.getElementById('refMetaEdition').value||'').trim(),
    websiteName:(document.getElementById('refMetaWebsiteName').value||'').trim(),
    publishedDate:(document.getElementById('refMetaPublishedDate').value||'').trim(),
    accessedDate:(document.getElementById('refMetaAccessedDate').value||'').trim(),
    volume:(document.getElementById('refMetaVolume').value||'').trim(),
    issue:(document.getElementById('refMetaIssue').value||'').trim(),
    fp:(document.getElementById('refMetaFp').value||'').trim(),
    lp:(document.getElementById('refMetaLp').value||'').trim(),
    doi:(document.getElementById('refMetaDoi').value||'').trim(),
    url:(document.getElementById('refMetaUrl').value||'').trim()
  };
  hideM('refMetaModal');
  if(resolve)resolve(payload);
}
document.getElementById('refMetaModal').addEventListener('keydown',function(e){
  if(e.key==='Escape'){e.preventDefault();closeRefMetadataModal(false);}
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();closeRefMetadataModal(true);}
});
function opdd(id,btn){
  if(!editor)saveEditorSelection();
  cdd();
  var m=document.getElementById(id);
  if(!m)return;
  m.style.top='';
  m.style.left='';
  m.style.right='';
  if(btn&&btn.closest&&btn.closest('.dd')){
    var wrap=btn.closest('.dd');
    var wrapRect=wrap.getBoundingClientRect();
    if(wrapRect.right>window.innerWidth-24){
      m.style.left='auto';
      m.style.right='0';
    }
  }
  m.classList.add('open');
}
function toggleToolbarMenu(id,btn,e){
  if(e){
    if(typeof e.preventDefault==='function')e.preventDefault();
    if(typeof e.stopPropagation==='function')e.stopPropagation();
  }
  var m=document.getElementById(id);
  if(!m)return false;
  var wasOpen=m.classList.contains('open');
  cdd();
  if(wasOpen)return false;
  m.style.top='';
  m.style.left='';
  m.style.right='';
  if(btn&&btn.closest&&btn.closest('.dd')){
    var wrap=btn.closest('.dd');
    var wrapRect=wrap.getBoundingClientRect();
    if(wrapRect.right>window.innerWidth-24){
      m.style.left='auto';
      m.style.right='0';
    }
  }
  m.classList.add('open');
  return false;
}
function cdd(){
  document.querySelectorAll('.ddm').forEach(function(m){
    m.classList.remove('open');
    if(m.style){
      m.style.display='';
      m.style.pointerEvents='';
    }
  });
  document.querySelectorAll('.dd.open').forEach(function(el){el.classList.remove('open');});
  document.querySelectorAll('details.tbdd[open]').forEach(function(el){el.removeAttribute('open');});
  ['tocQuickMenuModal','editorInsertQuickMenuModal'].forEach(function(id){
    var el=document.getElementById(id);
    if(!el)return;
    el.classList.remove('show');
    if(el.style)el.style.padding='';
    var modal=el.querySelector('.modal');
    if(modal&&modal.style){
      modal.style.marginTop='';
      modal.style.marginLeft='';
    }
  });
}
function cpStr(s){var ta=document.createElement('textarea');ta.value=s;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);}
// Close modals on bg click
document.querySelectorAll('.modal-bg').forEach(function(bg){bg.addEventListener('click',function(e){if(e.target===bg)bg.classList.remove('show');});});

// ¦¦ SYNC SETTINGS UI ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
async function showSyncSettings(){
  window.__aqLegacyRuntimePhase='showSyncSettings';
  showM('syncmodal');
  // Update preference checkboxes
  var pnCb=document.getElementById('prefPageNum');if(pnCb)pnCb.checked=!!S.showPageNumbers;
  var dirEl=document.getElementById('syncdirshow');
  var infoEl=document.getElementById('syncappinfo');
  if(typeof window.electronAPI!=='undefined'){
    try{
      var info=await window.electronAPI.getAppInfo();
      lastAppInfoSnapshot=info||null;
      dirEl.innerHTML='<span style="color:var(--green)">'+info.appDir+'</span>';
      infoEl.innerHTML='PDF: '+info.pdfDir+' ('+info.pdfCount+' dosya)<br/>Surum: v'+info.version;
      renderDataSafetySummary(info);
    }catch(e){dirEl.textContent='Bilgi alinamadi';infoEl.textContent='';}
  } else {
    dirEl.innerHTML='<span style="color:var(--txt3)">Tarayici modu - localStorage kullaniliyor</span>';
    infoEl.innerHTML='';
    renderDataSafetySummary(null);
  }
  if(window.AQBrowserCapture&&typeof window.AQBrowserCapture.refreshSettings==='function'){
    try{ await window.AQBrowserCapture.refreshSettings(); }catch(_e){}
  }
}
async function doClearSyncDir(){
  if(typeof window.electronAPI==='undefined')return;
  try{
    await window.electronAPI.clearSyncDir();
    document.getElementById('syncdirshow').innerHTML='<span style="color:var(--txt3)">Yerel mod</span>';
    setSL('Yerel moda gecildi','ok');
    setTimeout(function(){setSL('','');},3000);
  }catch(e){}
}

function renderDocumentHistory(result){
  var summaryEl=document.getElementById('docHistorySummary');
  var listEl=document.getElementById('docHistoryList');
  if(!summaryEl||!listEl)return;
  var payload=result&&typeof result==='object'?result:{};
  var snapshots=Array.isArray(payload.snapshots)?payload.snapshots:[];
  docHistoryRuntime.docId=String(payload.docId||'');
  docHistoryRuntime.docName=String(payload.docName||'');
  docHistoryRuntime.snapshots=snapshots.slice();
  summaryEl.textContent=snapshots.length
    ? ((payload.docName||'Belge')+' • '+snapshots.length+' snapshot')
    : ((payload.docName||'Belge')+' için snapshot bulunmuyor.');
  if(!snapshots.length){
    listEl.innerHTML='<div class="doc-history-empty">Henüz belge geçmişi oluşmadı. Düzenleme yapıp autosave çalıştığında ilk snapshot burada görünecek.</div>';
    return;
  }
  listEl.innerHTML=snapshots.map(function(snapshot){
    var createdAt=formatAutosaveDateTime(snapshot&&snapshot.createdAt||0)||'Bilinmeyen zaman';
    var metaParts=[createdAt];
    if(Number(snapshot&&snapshot.wordCount||0)>0)metaParts.push(String(snapshot.wordCount)+' kelime');
    if(snapshot&&snapshot.source)metaParts.push(String(snapshot.source));
    return ''+
      '<div class="doc-history-item" data-doc-history-id="'+escapeHTML(snapshot&&snapshot.id||'')+'">'+
        '<div class="doc-history-head">'+
          '<div class="doc-history-title">'+escapeHTML(snapshot&&snapshot.docName||payload.docName||'Belge')+'</div>'+
          '<div class="doc-history-meta">'+escapeHTML(metaParts.join(' • '))+'</div>'+
        '</div>'+
        '<div class="doc-history-excerpt">'+escapeHTML(snapshot&&snapshot.excerpt||'Onizleme yok')+'</div>'+
        '<div class="doc-history-actions">'+
          '<button class="mbtn s" data-doc-history-restore="'+escapeHTML(snapshot&&snapshot.id||'')+'">Bu Surume Don</button>'+
        '</div>'+
      '</div>';
  }).join('');
}

async function refreshDocumentHistory(){
  var currentDoc=getCurrentDocRecord();
  var docId=currentDoc&&currentDoc.id?String(currentDoc.id):'';
  var summaryEl=document.getElementById('docHistorySummary');
  var listEl=document.getElementById('docHistoryList');
  if(summaryEl)summaryEl.textContent='Belge gecmisi yukleniyor...';
  if(listEl)listEl.innerHTML='';
  if(typeof window.electronAPI==='undefined'||typeof window.electronAPI.getDocumentHistory!=='function'){
    renderDocumentHistory({docId:docId,docName:currentDoc&&currentDoc.name?currentDoc.name:'Belge',snapshots:[]});
    return;
  }
  try{
    var result=await window.electronAPI.getDocumentHistory(docId,20);
    renderDocumentHistory(result||{docId:docId,docName:currentDoc&&currentDoc.name?currentDoc.name:'Belge',snapshots:[]});
  }catch(e){
    if(summaryEl)summaryEl.textContent='Belge gecmisi yuklenemedi.';
    if(listEl)listEl.innerHTML='<div class="doc-history-empty">Belge geçmişi okunamadı.</div>';
  }
}

async function openDocumentHistory(){
  showM('docHistoryModal');
  await refreshDocumentHistory();
}

function renderDocumentOutline(){
  var summaryEl=document.getElementById('docOutlineSummary');
  var listEl=document.getElementById('docOutlineList');
  if(!summaryEl||!listEl)return;
  var outlineApi=window.AQDocumentOutline||null;
  if(!outlineApi||typeof outlineApi.filterEntries!=='function'||typeof outlineApi.buildSummary!=='function'){
    summaryEl.textContent='Belge anahati kullanilamiyor.';
    listEl.innerHTML='<div class="doc-outline-empty">Anahat modulu yuklenemedi.</div>';
    return;
  }
  var filtered=outlineApi.filterEntries(docOutlineRuntime.entries,{
    type:docOutlineRuntime.filter,
    query:docOutlineRuntime.query
  });
  var summary=outlineApi.buildSummary(docOutlineRuntime.entries);
  var summaryParts=[
    String(summary.total||0)+' oge',
    String(summary.headings||0)+' baslik',
    String(summary.tables||0)+' tablo',
    String(summary.figures||0)+' sekil'
  ];
  if(docOutlineRuntime.query)summaryParts.push('filtre: '+docOutlineRuntime.query);
  var activeEntry=(docOutlineRuntime.activeId?docOutlineRuntime.entries.find(function(entry){ return entry&&entry.id===docOutlineRuntime.activeId; }):null)||null;
  if(activeEntry)summaryParts.unshift('Konum: '+(activeEntry.label||'Belgede'));
  summaryEl.textContent=summaryParts.join(' • ');
  var searchEl=document.getElementById('docOutlineSearch');
  if(searchEl&&searchEl.value!==docOutlineRuntime.query)searchEl.value=docOutlineRuntime.query;
  var filterEl=document.getElementById('docOutlineFilter');
  if(filterEl&&filterEl.value!==docOutlineRuntime.filter)filterEl.value=docOutlineRuntime.filter;
  if(!filtered.length){
    listEl.innerHTML='<div class="doc-outline-empty">Bu filtreyle gorunur bir baslik, tablo veya sekil bulunamadi.</div>';
    return;
  }
  listEl.innerHTML=filtered.map(function(entry){
    var badgeText=entry.type==='heading'?'Baslik':(entry.type==='table'?'Tablo':'Sekil');
    var metaParts=[];
    if(entry.type==='heading')metaParts.push('Seviye '+String(entry.level||1));
    if(entry.title&&entry.title!==entry.label)metaParts.push(entry.title);
    var indent=Math.max(0,((Number(entry.level||1)-1)*14));
    return ''+
      '<div class="doc-outline-item'+(docOutlineRuntime.activeId===entry.id?' active':'')+'" data-outline-id="'+escapeHTML(entry.id||'')+'">'+
        '<div class="doc-outline-copy">'+
          '<div class="doc-outline-label" data-outline-type="'+escapeHTML(entry.type||'heading')+'" style="padding-left:'+indent+'px">'+escapeHTML(entry.label||'Adsiz oge')+'</div>'+
          '<div class="doc-outline-meta">'+escapeHTML(metaParts.join(' • ')||'Belgede konuma gitmek icin acin')+'</div>'+
        '</div>'+
        '<div class="doc-outline-actions">'+
          '<span class="doc-outline-badge '+escapeHTML(entry.type||'heading')+'">'+escapeHTML(badgeText)+'</span>'+
          '<button class="mbtn s" data-outline-jump="'+escapeHTML(entry.id||'')+'">Git</button>'+
        '</div>'+
      '</div>';
  }).join('');
}

function refreshDocumentOutline(){
  var summaryEl=document.getElementById('docOutlineSummary');
  var listEl=document.getElementById('docOutlineList');
  if(summaryEl)summaryEl.textContent='Belge anahati yukleniyor...';
  if(listEl)listEl.innerHTML='';
  var outlineApi=window.AQDocumentOutline||null;
  if(!outlineApi||typeof outlineApi.collectEntries!=='function'){
    docOutlineRuntime.entries=[];
    renderDocumentOutline();
    return;
  }
  var rootEl=(editor&&editor.view&&editor.view.dom)?editor.view.dom:document.getElementById('apaed');
  try{
    docOutlineRuntime.entries=outlineApi.collectEntries({
      root:rootEl,
      academicApi:window.AQAcademicObjects||null,
      document:document
    });
  }catch(_e){
    docOutlineRuntime.entries=[];
  }
  refreshDocumentOutlineActive();
  renderDocumentOutline();
}

function refreshDocumentOutlineActive(){
  var outlineApi=window.AQDocumentOutline||null;
  if(!outlineApi||typeof outlineApi.findActiveEntry!=='function'){
    docOutlineRuntime.activeId='';
    return;
  }
  var rootEl=(editor&&editor.view&&editor.view.dom)?editor.view.dom:document.getElementById('apaed');
  var scrollEl=document.getElementById('escroll');
  var active=null;
  try{
    active=outlineApi.findActiveEntry(docOutlineRuntime.entries,{
      root:rootEl,
      document:document,
      scrollEl:scrollEl
    });
  }catch(_e){
    active=null;
  }
  docOutlineRuntime.activeId=active&&active.id?String(active.id):'';
}

function scheduleDocumentOutlineRefresh(){
  clearTimeout(docOutlineRefreshTimer);
  docOutlineRefreshTimer=setTimeout(function(){
    docOutlineRefreshTimer=null;
    var modal=document.getElementById('docOutlineModal');
    if(!modal||!modal.classList||!modal.classList.contains('show'))return;
    refreshDocumentOutlineActive();
    renderDocumentOutline();
  },220);
}

function refreshDocumentOutlineIfOpen(){
  scheduleDocumentOutlineRefresh();
}

async function openDocumentOutline(){
  showM('docOutlineModal');
  refreshDocumentOutline();
  setTimeout(function(){
    var input=document.getElementById('docOutlineSearch');
    if(input&&typeof input.focus==='function')input.focus();
  },30);
}

function jumpToDocumentOutlineTarget(targetId){
  var outlineApi=window.AQDocumentOutline||null;
  if(!outlineApi||typeof outlineApi.scrollToEntry!=='function')return false;
  var rootEl=(editor&&editor.view&&editor.view.dom)?editor.view.dom:document.getElementById('apaed');
  hideM('docOutlineModal');
  return !!outlineApi.scrollToEntry({
    root:rootEl,
    document:document,
    id:String(targetId||'')
  });
}

function jumpToCurrentDocumentOutlineTarget(){
  refreshDocumentOutlineActive();
  if(!docOutlineRuntime.activeId){
    refreshDocumentOutline();
  }
  if(!docOutlineRuntime.activeId)return false;
  return jumpToDocumentOutlineTarget(docOutlineRuntime.activeId);
}

function renderCaptionManager(){
  var summaryEl=document.getElementById('captionManagerSummary');
  var listEl=document.getElementById('captionManagerList');
  if(!summaryEl||!listEl)return;
  var entries=Array.isArray(captionManagerRuntime.entries)?captionManagerRuntime.entries:[];
  summaryEl.textContent=entries.length
    ? (String(entries.length)+' nesne basligi bulundu. Tablo ve sekilleri buradan duzenleyebilirsiniz.')
    : 'Belgede tablo veya sekil bulunamadi.';
  if(!entries.length){
    listEl.innerHTML='<div class="caption-manager-empty">Duzenlenebilir tablo veya sekil bulunamadi.</div>';
    return;
  }
  listEl.innerHTML=entries.map(function(entry){
    var badge=entry.type==='table'?'Tablo':'Sekil';
    return ''+
      '<div class="caption-manager-item" data-caption-id="'+escapeHTML(entry.id||'')+'" data-caption-type="'+escapeHTML(entry.type||'table')+'">'+
        '<div class="caption-manager-head">'+
          '<div class="caption-manager-title">'+escapeHTML(entry.label||badge)+'</div>'+
          '<span class="caption-manager-badge '+escapeHTML(entry.type||'table')+'">'+escapeHTML(badge)+'</span>'+
        '</div>'+
        '<div class="caption-manager-meta">'+escapeHTML(entry.type==='table'?'Tablo basligi ve notu':'Sekil basligi')+'</div>'+
        '<div class="caption-manager-fields">'+
          '<div class="caption-manager-field">'+
            '<label>Baslik</label>'+
            '<input type="text" data-caption-title="'+escapeHTML(entry.id||'')+'" value="'+escapeHTML(entry.title||'')+'" placeholder="'+escapeHTML(badge+' basligi')+'"/>'+
          '</div>'+
          (entry.type==='table'
            ? ('<div class="caption-manager-field"><label>Not</label><input type="text" data-caption-note="'+escapeHTML(entry.id||'')+'" value="'+escapeHTML(entry.note||'')+'" placeholder="Not. n = 120."/></div>')
            : '')+
        '</div>'+
        '<div class="caption-manager-actions">'+
          '<button class="mbtn s" data-caption-jump="'+escapeHTML(entry.id||'')+'">Git</button>'+
          '<button class="mbtn p" data-caption-save="'+escapeHTML(entry.id||'')+'">Kaydet</button>'+
        '</div>'+
      '</div>';
  }).join('');
}

function refreshCaptionManager(){
  var summaryEl=document.getElementById('captionManagerSummary');
  var listEl=document.getElementById('captionManagerList');
  if(summaryEl)summaryEl.textContent='Basliklar yukleniyor...';
  if(listEl)listEl.innerHTML='';
  var api=window.AQAcademicObjects||null;
  if(!api||typeof api.getCaptionManagerEntries!=='function'){
    captionManagerRuntime.entries=[];
    renderCaptionManager();
    return;
  }
  var rootEl=(editor&&editor.view&&editor.view.dom)?editor.view.dom:document.getElementById('apaed');
  try{
    captionManagerRuntime.entries=api.getCaptionManagerEntries({root:rootEl});
  }catch(_e){
    captionManagerRuntime.entries=[];
  }
  renderCaptionManager();
}

function refreshCaptionManagerIfOpen(){
  var modal=document.getElementById('captionManagerModal');
  if(!modal||!modal.classList||!modal.classList.contains('show'))return;
  refreshCaptionManager();
}

async function openCaptionManager(){
  showM('captionManagerModal');
  refreshCaptionManager();
}

function saveCaptionManagerEntry(objectId){
  var id=String(objectId||'').trim();
  if(!id)return false;
  var item=(captionManagerRuntime.entries||[]).find(function(entry){ return entry&&entry.id===id; })||null;
  if(!item)return false;
  var api=window.AQAcademicObjects||null;
  if(!api||typeof api.updateCaption!=='function')return false;
  var titleInput=document.querySelector('[data-caption-title="'+id.replace(/"/g,'\\"')+'"]');
  var noteInput=document.querySelector('[data-caption-note="'+id.replace(/"/g,'\\"')+'"]');
  var title=titleInput?String(titleInput.value||'').trim():'';
  var note=noteInput?String(noteInput.value||'').trim():'';
  var rootEl=(editor&&editor.view&&editor.view.dom)?editor.view.dom:document.getElementById('apaed');
  var updated=false;
  try{
    updated=!!api.updateCaption({
      root:rootEl,
      id:id,
      type:item.type,
      title:title,
      note:note
    });
  }catch(_e){
    updated=false;
  }
  if(!updated)return false;
  runEditorMutationEffects({
    target:rootEl,
    normalize:false,
    layout:true,
    syncChrome:true,
    syncTOC:true,
    syncRefs:true,
    refreshTrigger:true
  });
  refreshCaptionManager();
  setSL((item.type==='table'?'Tablo':'Sekil')+' basligi guncellendi','ok');
  setTimeout(function(){ if(!autosaveState.dirty&&!autosaveState.saving)setSL('Kaydedildi','ok'); },2000);
  return true;
}

async function restoreDocumentHistoryVersion(snapshotId){
  var versionId=String(snapshotId||'').trim();
  if(!versionId||typeof window.electronAPI==='undefined'||typeof window.electronAPI.restoreDocumentHistorySnapshot!=='function')return;
  var currentDoc=getCurrentDocRecord();
  var docId=currentDoc&&currentDoc.id?String(currentDoc.id):docHistoryRuntime.docId;
  if(!docId)return;
  if(!confirm('Bu belgeyi seçilen snapshot sürümüne döndürmek istiyor musunuz? Mevcut içerik kaybolmaz; yeni bir autosave snapshot olarak korunur.'))return;
  try{
    setSL('Belge surumu geri yukleniyor...','ld');
    await window.electronAPI.restoreDocumentHistorySnapshot(docId,versionId);
    await syncLoad();
    rWS();rNB();rLib();renderRelatedPapers();rNotes();rRefs();applyCurrentDocTrackChangesMode({source:'history-restore'});uSt();rDocTabs();
    setSL('Belge surumu geri yuklendi','ok');
    setTimeout(function(){if(!autosaveState.dirty&&!autosaveState.saving)setSL('Kaydedildi','ok');},2200);
    refreshDocumentHistory().catch(function(){});
    if(typeof showSyncSettings==='function'){
      try{ showSyncSettings(); }catch(_e){}
    }
  }catch(e){
    setAutosaveError(e&&e.message?e.message:'Belge gecmisi geri yuklenemedi');
    alert('Belge gecmisi geri yuklenemedi: '+(e&&e.message?e.message:'Bilinmeyen hata'));
  }
}

// ¦¦ UPDATE FUNCTIONS ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
var latestUpdateUrl='';

async function checkForUpdate(){
  if(typeof window.electronAPI==='undefined'){
    document.getElementById('updatestatus').innerHTML='<span style="color:var(--txt3)">Guncelleme yalnizca Electron uygulamasinda calisir.</span>';
    return;
  }
  document.getElementById('updatestatus').innerHTML='<span style="color:var(--acc)">Kontrol ediliyor...</span>';
  try{
    var res=await window.electronAPI.checkUpdate();
    if(res.error){
      document.getElementById('updatestatus').innerHTML='<span style="color:var(--red)">Hata: '+res.error+'</span><br/><span style="color:var(--txt3)">Mevcut: v'+res.current+'</span>';
      return;
    }
    if(res.available){
      latestUpdateUrl=res.downloadUrl||'';
      document.getElementById('updatestatus').innerHTML=
        '<span style="color:var(--green);font-weight:600;">Yeni surum: v'+res.remote+'</span>'+
        '<br/><span style="color:var(--txt3)">Mevcut: v'+res.current+'</span>'+
        (res.notes?'<br/><span style="color:var(--txt2);font-size:10px;">'+res.notes.substring(0,200)+'</span>':'')+
        (res.publishedAt?'<br/><span style="color:var(--txt3);font-size:9px;">'+res.publishedAt.substring(0,10)+'</span>':'');
      document.getElementById('btnDoUpdate').style.display='inline-block';
    } else {
      document.getElementById('updatestatus').innerHTML=
        '<span style="color:var(--green)">Guncel! v'+res.current+'</span>';
      document.getElementById('btnDoUpdate').style.display='none';
    }
  }catch(e){
    document.getElementById('updatestatus').innerHTML='<span style="color:var(--red)">Kontrol hatasi: '+e.message+'</span>';
  }
}

async function doUpdate(){
  if(!latestUpdateUrl){alert('Indirme URL bulunamadi.');return;}
  document.getElementById('updatestatus').innerHTML='<span style="color:var(--acc)">Indiriliyor...</span>';
  try{
    var res=await window.electronAPI.downloadUpdate(latestUpdateUrl);
    if(res.ok){
      document.getElementById('updatestatus').innerHTML=
        '<span style="color:var(--green);font-weight:600;">Guncelleme indirildi!</span>'+
        '<br/><span style="color:var(--txt2)">Uygulama yeniden baslatilacak.</span>';
      document.getElementById('btnDoUpdate').style.display='none';
      // 2 saniye sonra yeniden baslat
      setTimeout(function(){
        window.electronAPI.restartApp();
      },2000);
    } else {
      document.getElementById('updatestatus').innerHTML='<span style="color:var(--red)">Indirme hatasi: '+res.error+'</span>';
    }
  }catch(e){
    document.getElementById('updatestatus').innerHTML='<span style="color:var(--red)">Hata: '+e.message+'</span>';
  }
}

async function saveUpdateUrl(){
  var url=(document.getElementById('updateurlinp').value||'').trim();
  if(typeof window.electronAPI!=='undefined'){
    await window.electronAPI.setUpdateUrl(url);
    document.getElementById('updatestatus').innerHTML='<span style="color:var(--green)">URL kaydedildi.</span>';
  }
}

// ¦¦ PDF SYNC ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
async function doPdfSync(){
  if(typeof window.electronAPI==='undefined'){document.getElementById('pdfsyncstatus').innerHTML='<span style="color:var(--txt3)">Electron gerekli.</span>';return;}
  document.getElementById('pdfsyncstatus').innerHTML='<span style="color:var(--acc)">Senkronize ediliyor...</span>';
  try{
    var res=await window.electronAPI.pdfSyncAll();
    if(res.ok){
      document.getElementById('pdfsyncstatus').innerHTML='<span style="color:var(--green)">Tamamlandi! '+res.copied+' PDF kopyalandi.</span>';
      // Reload PDFs that were synced
      if(res.copied>0){
        for(var wi=0;wi<S.wss.length;wi++){
          var lib=S.wss[wi].lib||[];
          for(var ri=0;ri<lib.length;ri++){
            var r=lib[ri];
            if(!r.pdfData){try{await hydrateRefPDF(r);}catch(e){}}
          }
        }
        rLib();
      }
    }else{
      document.getElementById('pdfsyncstatus').innerHTML='<span style="color:var(--red)">Hata: '+(res.error||'bilinmeyen')+'</span>';
    }
  }catch(e){document.getElementById('pdfsyncstatus').innerHTML='<span style="color:var(--red)">Hata: '+e.message+'</span>';}
}

// ¦¦ MULTI-SOURCE OA PDF FETCH ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
var __oaUrlCache={};
function __oaCleanDoi(doi){
  return (doi||'').replace(/^https?:\/\/(dx\.)?doi\.org\//i,'').trim();
}
function __oaBuildDoiVariants(doi){
  var raw=__oaCleanDoi(doi);
  var variants=[];
  function push(v){
    if(typeof v!=='string')return;
    v=v.trim();
    if(!v)return;
    if(!/^10\.\d{4,9}\//i.test(v))return;
    if(variants.indexOf(v)<0)variants.push(v);
  }
  var compact=raw
    .replace(/^doi:\s*/i,'')
    .replace(/\s+/g,'')
    .replace(/[\u200B-\u200D\uFEFF]/g,'');
  push(compact);
  push(compact.replace(/[?#].*$/,''));
  var extracted=(compact.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i)||[])[0]||'';
  push(extracted);
  var seed=variants.slice(0);
  seed.forEach(function(v){
    push(v.replace(/[)\].,;:]+$/g,''));
    // OCR/import gürültüsü: DOI sonuna tek harf segment yapışabiliyor (örn. /B)
    push(v.replace(/\/[A-Za-z]$/,''));
    // Sık görülen dışa aktarım sonekleri (örn. /BIBTEX, .RIS)
    push(v.replace(/(?:\/|\.)(BIBTEX|RIS|ABSTRACT|FULLTEXT|FULL|PDF|XML|HTML|EPUB)$/i,''));
    push(v.replace(/(?:\/|\.)(BIBTEX|RIS|ABSTRACT|FULLTEXT|FULL|PDF|XML|HTML|EPUB)$/i,'').replace(/[)\].,;:]+$/g,''));
  });
  return __oaDedup(variants).sort(function(a,b){
    function score(v){
      var s=0;
      if(!/\/[A-Za-z]$/.test(v))s+=3;
      if(!/[)\].,;:]$/.test(v))s+=2;
      if(!/\s/.test(v))s+=1;
      s-=Math.max(0,v.length-32)*0.01;
      return s;
    }
    return score(b)-score(a);
  });
}
function __oaPushUrl(urls,u){
  if(typeof u!=='string')return;
  u=u.trim();
  if(!u||!/^https?:\/\//i.test(u))return;
  urls.push(u);
}
function __oaDedup(urls){
  var seen={};
  return (urls||[]).filter(function(u){
    var key=(u||'').trim();
    if(!key||seen[key])return false;
    seen[key]=true;
    return true;
  });
}
function __oaUrlMentionsDoi(url,doi){
  var expected=__oaCleanDoi(doi||'');
  if(!expected)return false;
  var raw=String(url||'').toLowerCase();
  if(!raw)return false;
  if(raw.indexOf(expected)>=0)return true;
  if(raw.indexOf(expected.replace(/\//g,'%2f'))>=0)return true;
  try{
    var dec=decodeURIComponent(raw);
    if(dec.indexOf(expected)>=0)return true;
  }catch(e){}
  return false;
}
function __oaUrlHasDifferentDoi(url,doi){
  var expected=__oaCleanDoi(doi||'');
  if(!expected)return false;
  var raw=String(url||'');
  try{raw=decodeURIComponent(raw);}catch(e){}
  var m=raw.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  if(!m||!m[0])return false;
  return __oaCleanDoi(m[0])!==expected;
}
function __oaPdfScore(url){
  var u=(url||'').toLowerCase();
  if(!u)return -999;
  var score=0;
  if(/\.pdf($|[?#])/i.test(u))score+=9;
  if(/\/pdf(\/|$|[?#])/i.test(u))score+=7;
  if(/blobtype=pdf|content[-_]?type=application%2fpdf|type=printable|download=1/i.test(u))score+=5;
  if(/https?:\/\/(dx\.)?doi\.org\/10\./i.test(u))score+=8;
  if(/(europepmc|ncbi\.nlm\.nih\.gov\/pmc|arxiv|biorxiv|medrxiv|plos|mdpi|frontiersin)/i.test(u))score+=2;
  if(/scholar\.google|semanticscholar\.org\/search|dergipark\.org\.tr\/.*search/i.test(u))score-=12;
  return score;
}
function __oaSortUrlsByPdfLikely(urls){
  return (urls||[])
    .map(function(u,idx){return {u:u,idx:idx,score:__oaPdfScore(u)};})
    .sort(function(a,b){
      if(b.score!==a.score)return b.score-a.score;
      return a.idx-b.idx;
    })
    .map(function(item){return item.u;});
}
function __oaBuildHeuristicUrlsForDoi(doi){
  var variants=__oaBuildDoiVariants(doi);
  var urls=[];
  variants.forEach(function(v){
    var lower=v.toLowerCase();
    __oaPushUrl(urls,'https://doi.org/'+v);
    __oaPushUrl(urls,'https://dx.doi.org/'+v);
    // Frontiers DOI pattern fallback
    if(/^10\.3389\/[a-z0-9.]+$/i.test(lower)){
      __oaPushUrl(urls,'https://www.frontiersin.org/articles/'+v+'/pdf');
      __oaPushUrl(urls,'https://www.frontiersin.org/articles/'+v+'/full');
    }
    // DergiPark fallback (search pages - HTML parser may discover direct pdf links)
    __oaPushUrl(urls,'https://dergipark.org.tr/tr/search?q='+encodeURIComponent(v));
    __oaPushUrl(urls,'https://dergipark.org.tr/en/search?q='+encodeURIComponent(v));
    // Scholar-like discovery fallbacks
    __oaPushUrl(urls,'https://www.semanticscholar.org/search?q='+encodeURIComponent(v));
  });
  return __oaSortUrlsByPdfLikely(__oaDedup(urls));
}
function __oaFetchJSON(url,options,timeoutMs){
  var ms=Math.max(2500,Math.min(parseInt(timeoutMs,10)||7000,20000));
  if(window.electronAPI&&typeof window.electronAPI.netFetchJSON==='function'){
    return window.electronAPI.netFetchJSON(url,{timeoutMs:ms}).then(function(res){
      if(res&&res.ok)return res.data||null;
      return null;
    }).catch(function(){return null;});
  }
  var opts=Object.assign({},options||{});
  var controller=(typeof AbortController!=='undefined')?new AbortController():null;
  if(controller)opts.signal=controller.signal;
  return new Promise(function(resolve){
    var done=false;
    var timer=setTimeout(function(){
      if(done)return;
      done=true;
      try{if(controller)controller.abort();}catch(e){}
      resolve(null);
    },ms);
    fetch(url,opts)
      .then(function(r){
        if(done)return;
        if(!r||!r.ok){done=true;clearTimeout(timer);resolve(null);return;}
        r.json().then(function(data){
          if(done)return;
          done=true;
          clearTimeout(timer);
          resolve(data||null);
        }).catch(function(){
          if(done)return;
          done=true;
          clearTimeout(timer);
          resolve(null);
        });
      })
      .catch(function(){
        if(done)return;
        done=true;
        clearTimeout(timer);
        resolve(null);
      });
  });
}
function __oaFetchText(url,options,timeoutMs){
  var ms=Math.max(2500,Math.min(parseInt(timeoutMs,10)||7000,20000));
  if(window.electronAPI&&typeof window.electronAPI.netFetchText==='function'){
    return window.electronAPI.netFetchText(url,{timeoutMs:ms,maxBytes:4*1024*1024}).then(function(res){
      if(res&&res.ok)return res.text||'';
      return '';
    }).catch(function(){return '';});
  }
  var opts=Object.assign({},options||{});
  var controller=(typeof AbortController!=='undefined')?new AbortController():null;
  if(controller)opts.signal=controller.signal;
  return new Promise(function(resolve){
    var done=false;
    var timer=setTimeout(function(){
      if(done)return;
      done=true;
      try{if(controller)controller.abort();}catch(e){}
      resolve('');
    },ms);
    fetch(url,opts)
      .then(function(r){
        if(done)return;
        if(!r||!r.ok){done=true;clearTimeout(timer);resolve('');return;}
        r.text().then(function(txt){
          if(done)return;
          done=true;
          clearTimeout(timer);
          resolve(txt||'');
        }).catch(function(){
          if(done)return;
          done=true;
          clearTimeout(timer);
          resolve('');
        });
      })
      .catch(function(){
        if(done)return;
        done=true;
        clearTimeout(timer);
        resolve('');
      });
  });
}
function __oaExtractHttpUrls(text,baseUrl){
  if(typeof text!=='string'||!text.trim())return [];
  var urls=[];
  var seen={};
  function push(u){
    if(!u||typeof u!=='string')return;
    var val=u.replace(/&amp;/g,'&').trim();
    try{val=new URL(val,baseUrl||'https://example.com').href;}catch(e){return;}
    if(!/^https?:\/\//i.test(val))return;
    if(seen[val])return;
    seen[val]=true;
    urls.push(val);
  }
  var absRe=/https?:\/\/[^\s"'<>\\]+/ig;
  var m;
  while((m=absRe.exec(text)))push(m[0]);
  var hrefRe=/href\s*=\s*["']([^"']+)["']/ig;
  while((m=hrefRe.exec(text)))push(m[1]);
  var xmlUrlRe=/<url[^>]*>([^<]+)<\/url>/ig;
  while((m=xmlUrlRe.exec(text)))push(m[1]);
  return urls;
}
async function fetchOAUrls(doi){
  var clean=__oaCleanDoi(doi);
  if(!clean)return [];
  if(__oaUrlCache[clean])return __oaUrlCache[clean].slice(0);
  var urls=[];
  __oaBuildHeuristicUrlsForDoi(clean).forEach(function(u){__oaPushUrl(urls,u);});
  var primary=[];
  // 1. Unpaywall
  primary.push(__oaFetchJSON('https://api.unpaywall.org/v2/'+encodeURIComponent(clean)+'?email=academiq@example.com',null,7000).then(function(ua){
    if(!ua)return;
    if(ua.best_oa_location){
      __oaPushUrl(urls,ua.best_oa_location.url_for_pdf);
      __oaPushUrl(urls,ua.best_oa_location.url);
    }
    (ua.oa_locations||[]).forEach(function(loc){
      __oaPushUrl(urls,loc&&loc.url_for_pdf);
      __oaPushUrl(urls,loc&&loc.url);
    });
  }));
  // 2. Semantic Scholar
  primary.push(__oaFetchJSON('https://api.semanticscholar.org/graph/v1/paper/DOI:'+encodeURIComponent(clean)+'?fields=openAccessPdf',null,7000).then(function(s2){
    __oaPushUrl(urls,s2&&s2.openAccessPdf&&s2.openAccessPdf.url);
  }));
  // 3. OpenAlex
  primary.push(__oaFetchJSON('https://api.openalex.org/works/doi:'+encodeURIComponent(clean),{headers:{'Accept':'application/json','User-Agent':'AcademiQ/2.0 (mailto:academiq@example.com)'}},7000).then(function(oa){
    if(!oa)return;
    __oaPushUrl(urls,oa.open_access&&oa.open_access.oa_url);
    (oa.locations||[]).forEach(function(loc){
      __oaPushUrl(urls,loc&&loc.pdf_url);
      __oaPushUrl(urls,loc&&loc.landing_page_url);
    });
  }));
  // 4. Crossref
  primary.push(__oaFetchJSON('https://api.crossref.org/works/'+encodeURIComponent(clean)+'?mailto=academiq@example.com',null,7000).then(function(cr){
    var links=(cr&&cr.message&&cr.message.link)||[];
    links.forEach(function(lnk){
      if(!lnk)return;
      if(lnk['content-type']==='application/pdf')__oaPushUrl(urls,lnk.URL);
      if(lnk['intended-application']==='text-mining')__oaPushUrl(urls,lnk.URL);
    });
  }));
  await Promise.allSettled(primary);
  var secondary=[];
  // 5. CORE
  secondary.push(__oaFetchJSON('https://api.core.ac.uk/v3/search/works/?q=doi:'+encodeURIComponent(clean)+'&limit=3',{headers:{'Accept':'application/json'}},6000).then(function(core){
    if(!core||!core.results)return;
    core.results.forEach(function(item){
      __oaPushUrl(urls,item&&item.downloadUrl);
      var extra=item&&item.sourceFulltextUrls;
      if(extra)(Array.isArray(extra)?extra:[extra]).forEach(function(u){__oaPushUrl(urls,u);});
    });
  }));
  // 6. Europe PMC
  secondary.push(__oaFetchJSON('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:'+encodeURIComponent(clean)+'&format=json&resultType=core',null,6000).then(function(epmc){
    var rows=epmc&&epmc.resultList&&epmc.resultList.result;
    if(!rows)return;
    rows.forEach(function(item){
      var list=item&&item.fullTextUrlList&&item.fullTextUrlList.fullTextUrl;
      if(Array.isArray(list)){
        list.forEach(function(fu){
          if(!fu)return;
          if(fu.documentStyle==='pdf')__oaPushUrl(urls,fu.url);
          else if(fu.availability==='Open access')__oaPushUrl(urls,fu.url);
        });
      }
      if(item&&item.pmcid)__oaPushUrl(urls,'https://europepmc.org/backend/ptpmcrender.fcgi?accid='+item.pmcid+'&blobtype=pdf');
    });
  }));
  // 7. PubMed Central
  secondary.push(__oaFetchJSON('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term='+encodeURIComponent(clean)+'[doi]&retmode=json',null,6000).then(function(pmc){
    var ids=pmc&&pmc.esearchresult&&pmc.esearchresult.idlist;
    if(!Array.isArray(ids))return;
    ids.forEach(function(pmcid){
      __oaPushUrl(urls,'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC'+pmcid+'/pdf/');
      __oaPushUrl(urls,'https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC'+pmcid+'&blobtype=pdf');
    });
  }));
  // 8. DOAJ
  secondary.push(__oaFetchJSON('https://doaj.org/api/search/articles/doi:'+encodeURIComponent(clean),null,6000).then(function(doaj){
    var rows=doaj&&doaj.results;
    if(!Array.isArray(rows))return;
    rows.forEach(function(item){
      var links=item&&item.bibjson&&item.bibjson.link;
      if(!Array.isArray(links))return;
      links.forEach(function(link){
        if(link&&link.type==='fulltext')__oaPushUrl(urls,link.url);
      });
    });
  }));
  // 9. NCBI DOI conversion (PubMed/PMC bridge)
  secondary.push(__oaFetchJSON('https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids='+encodeURIComponent(clean)+'&format=json',null,6000).then(function(conv){
    var records=(conv&&conv.records)||[];
    if(!Array.isArray(records))return;
    records.forEach(function(rec){
      var pmcid=rec&&rec.pmcid;
      var pmid=rec&&rec.pmid;
      if(pmcid){
        var pmcOnly=String(pmcid).replace(/^PMC/i,'');
        __oaPushUrl(urls,'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC'+pmcOnly+'/pdf/');
        __oaPushUrl(urls,'https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC'+pmcOnly+'&blobtype=pdf');
      }
      if(pmid){
        __oaPushUrl(urls,'https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/');
      }
    });
  }));
  // 10. PubMed E-utilities search + PubMed->PMC linking
  secondary.push(__oaFetchJSON('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term='+encodeURIComponent(clean)+'[aid]&retmode=json',null,6000).then(async function(pub){
    var pmids=pub&&pub.esearchresult&&pub.esearchresult.idlist;
    if(!Array.isArray(pmids)||!pmids.length)return;
    pmids.slice(0,6).forEach(function(pmid){
      __oaPushUrl(urls,'https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/');
    });
    try{
      var elink=await __oaFetchJSON('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&db=pmc&id='+encodeURIComponent(pmids.slice(0,6).join(','))+'&retmode=json',null,6000);
      var linksets=(elink&&elink.linksets)||[];
      if(Array.isArray(linksets)){
        linksets.forEach(function(set){
          var dbs=set&&set.linksetdb;
          if(!Array.isArray(dbs))return;
          dbs.forEach(function(db){
            var links=(db&&db.links)||[];
            if(!Array.isArray(links))return;
            links.forEach(function(pmcid){
              __oaPushUrl(urls,'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC'+pmcid+'/pdf/');
              __oaPushUrl(urls,'https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC'+pmcid+'&blobtype=pdf');
            });
          });
        });
      }
    }catch(e){}
  }));
  // 11. DergiPark query expansion by DOI variants
  secondary.push(Promise.resolve().then(function(){
    __oaBuildDoiVariants(clean).forEach(function(v){
      __oaPushUrl(urls,'https://dergipark.org.tr/tr/search?q='+encodeURIComponent(v));
      __oaPushUrl(urls,'https://dergipark.org.tr/en/search?q='+encodeURIComponent(v));
    });
  }));
  // 12. OpenAIRE (XML endpoint)
  secondary.push(__oaFetchText('https://api.openaire.eu/search/publications?doi='+encodeURIComponent(clean)+'&size=10',null,7000).then(function(xml){
    __oaExtractHttpUrls(xml,'https://api.openaire.eu').forEach(function(u){__oaPushUrl(urls,u);});
  }));
  // 13. DataCite DOI metadata
  secondary.push(__oaFetchJSON('https://api.datacite.org/dois/'+encodeURIComponent(clean),null,7000).then(function(dc){
    var attrs=dc&&dc.data&&dc.data.attributes;
    if(!attrs)return;
    __oaPushUrl(urls,attrs.url);
    var related=attrs.relatedIdentifiers||attrs.related_identifiers||[];
    if(Array.isArray(related)){
      related.forEach(function(rel){
        __oaPushUrl(urls,(rel&&rel.relatedIdentifier)||rel&&rel.relatedIdentifierValue||rel&&rel.url);
      });
    }
  }));
  // 14. Zenodo by DOI
  secondary.push(__oaFetchJSON('https://zenodo.org/api/records?q='+encodeURIComponent('doi:"'+clean+'"')+'&size=5',null,7000).then(function(zen){
    var hits=zen&&zen.hits&&zen.hits.hits;
    if(!Array.isArray(hits))return;
    hits.forEach(function(item){
      var files=(item&&item.files)||[];
      if(Array.isArray(files)){
        files.forEach(function(f){
          __oaPushUrl(urls,f&&f.links&&f.links.download);
          __oaPushUrl(urls,f&&f.links&&f.links.self);
        });
      }
      __oaPushUrl(urls,item&&item.links&&item.links.self_html);
      __oaPushUrl(urls,item&&item.links&&item.links.self);
    });
  }));
  // 15. DOI landing-page scrape (meta/href urls)
  secondary.push(__oaFetchText('https://doi.org/'+clean,null,7000).then(function(html){
    __oaExtractHttpUrls(html,'https://doi.org/'+clean).forEach(function(u){__oaPushUrl(urls,u);});
  }));
  await Promise.allSettled(secondary);
  var unique=__oaSortUrlsByPdfLikely(__oaDedup(urls)).slice(0,120);
  __oaUrlCache[clean]=unique;
  return unique.slice(0);
}
var __oaLastDownloadFailure='';
async function __oaTryDownloadRefFromUrls(ref,baseUrls,maxAttempts){
  var failure='';
  if(!ref||!ref.id){
    failure='Gecersiz referans kimligi';
    __oaLastDownloadFailure=failure;
    return {ok:false,reason:failure};
  }
  var allUrls=[];
  (baseUrls||[]).forEach(function(u){
    buildPDFUrls(u).forEach(function(v){if(allUrls.indexOf(v)<0)allUrls.push(v);});
  });
  allUrls=__oaSortUrlsByPdfLikely(allUrls);
  var targetAttempts=parseInt(maxAttempts,10);
  if(!targetAttempts||targetAttempts<1)targetAttempts=allUrls.length;
  var cap=Math.min(allUrls.length,targetAttempts);
  var lastFailureLow=false;
  function isLowSignalUrl(u){
    return /\/search\?|scholar\.google|semanticscholar\.org\/search|dergipark\.org\.tr\/.*search/i.test(String(u||'').toLowerCase());
  }
  function setFailure(msg,url){
    var low=isLowSignalUrl(url);
    if(low&&failure&&!lastFailureLow)return;
    failure=String(msg||'Indirme basarisiz').slice(0,180)+' @ '+String(url||'').slice(0,96);
    lastFailureLow=low;
  }
  if(cap<1){
    failure='Uygun OA URL bulunamadi';
    __oaLastDownloadFailure=failure;
    return {ok:false,reason:failure};
  }
  for(var j=0;j<cap;j++){
    var triedUrl=allUrls[j];
    if(isLowSignalUrl(triedUrl)){
      setFailure('Arama URL atlandi',triedUrl);
      continue;
    }
    if(ref&&ref.doi){
      if(__oaUrlHasDifferentDoi(triedUrl,ref.doi)){
        setFailure('DOI uyumsuz URL atlandi',triedUrl);
        continue;
      }
      if(isLowSignalUrl(triedUrl)&&!__oaUrlMentionsDoi(triedUrl,ref.doi)){
        setFailure('Dusuk sinyal URL atlandi',triedUrl);
        continue;
      }
    }
    try{
      var timeoutMs=20000;
      if(/https?:\/\/(dx\.)?doi\.org\/10\./i.test(triedUrl))timeoutMs=14000;
      else if(isLowSignalUrl(triedUrl))timeoutMs=12000;
      var dlOptions={timeoutMs:timeoutMs};
      if(ref&&ref.doi){
        dlOptions.expectedDoi=normalizeRefDoi(ref.doi);
        dlOptions.requireDoiEvidence=true;
      }
      if(ref&&ref.title)dlOptions.expectedTitle=ref.title;
      if(ref&&Array.isArray(ref.authors)&&ref.authors.length)dlOptions.expectedAuthors=ref.authors.slice(0,4);
      if(ref&&ref.year)dlOptions.expectedYear=String(ref.year||'');
      var res=await window.electronAPI.downloadPDFfromURL(triedUrl,ref.id,dlOptions);
      if(res&&res.ok){
        if(!ref.pdfUrl)ref.pdfUrl=triedUrl;
        if(res.verification)propagatePdfVerification(ref,res.verification,triedUrl);
        var hydrated=await hydrateRefPDF(ref);
        if(hydrated&&ref.pdfData)return {ok:true,url:triedUrl};
        try{
          var direct=await window.electronAPI.loadPDF(ref.id);
          if(direct&&direct.ok&&direct.buffer){ref.pdfData=direct.buffer;return {ok:true,url:triedUrl};}
        }catch(e){}
        setFailure('PDF kaydedildi ama yuklenemedi',triedUrl);
      }else{
        var classified=(res&&res.failure)||classifyPdfDownloadFailureLocal((res&&res.error)?String(res.error):'Indirme basarisiz');
        setFailure((classified&&classified.userMessage)?classified.userMessage:((res&&res.error)?String(res.error):'Indirme basarisiz'),triedUrl);
      }
    }catch(e){
      var classifiedErr=classifyPdfDownloadFailureLocal((e&&e.message)?e.message:String(e));
      setFailure((classifiedErr&&classifiedErr.userMessage)?classifiedErr.userMessage:((e&&e.message)?e.message:String(e)),triedUrl);
    }
  }
  if(!failure)failure='Bilinmeyen indirme hatasi';
  __oaLastDownloadFailure=failure;
  return {ok:false,reason:failure};
}
async function __oaResolveUrlsForRef(ref){
  var reason='';
  var oaUrls=await fetchOAUrls(ref.doi);
  var doiVariants=__oaBuildDoiVariants(ref.doi);
  if((!oaUrls||!oaUrls.length)&&doiVariants.length>1){
    for(var dv=0;dv<doiVariants.length;dv++){
      var candDoi=dv===0?null:doiVariants[dv];
      if(!candDoi)continue;
      try{
        var more=await fetchOAUrls(candDoi);
        if(more&&more.length){
          oaUrls=(oaUrls||[]).concat(more);
          break;
        }
      }catch(e){}
    }
  }
  if(!oaUrls||!oaUrls.length){
    if(doiVariants.length){
      oaUrls=[];
      doiVariants.forEach(function(doiPath){
        oaUrls.push('https://doi.org/'+doiPath);
        oaUrls.push('https://dx.doi.org/'+doiPath);
      });
      oaUrls=__oaDedup(oaUrls);
      reason='OA URL servisleri yanit vermedi; DOI resolver fallback deneniyor';
    }else{
      reason='OA URL bulunamadi (DOI temizlenemedi)';
    }
  }
  if(ref.pdfUrl&&oaUrls&&oaUrls.indexOf(ref.pdfUrl)<0)oaUrls.unshift(ref.pdfUrl);
  return {urls:oaUrls||[],reason:reason};
}
async function __oaDownloadOneRef(ref){
  normalizeRefRecord(ref);
  var attempt={ok:false,reason:''};
  var reason='';
  try{
    if(ref.pdfUrl){
      attempt=await __oaTryDownloadRefFromUrls(ref,[ref.pdfUrl],8);
      if(attempt.ok)return {ok:true};
      reason=attempt.reason||reason;
    }
    var resolved=await __oaResolveUrlsForRef(ref);
    if(resolved.reason)reason=resolved.reason;
    if(resolved.urls&&resolved.urls.length){
      attempt=await __oaTryDownloadRefFromUrls(ref,resolved.urls,28);
      if(attempt.ok)return {ok:true};
      reason=attempt.reason||reason;
    }
    if(ref&&ref.doi){
      try{
        delete __oaUrlCache[__oaCleanDoi(ref.doi)];
        var retryUrls=await fetchOAUrls(ref.doi);
        if(retryUrls.length){
          attempt=await __oaTryDownloadRefFromUrls(ref,retryUrls,28);
          if(attempt.ok)return {ok:true};
          reason=attempt.reason||reason;
        }
      }catch(e){}
    }
  }catch(e){
    reason=(e&&e.message)?e.message:String(e);
  }
  return {ok:false,reason:reason||'Bilinmeyen hata'};
}
async function batchDownloadOA(){
  if(oaBatchBusy){
    setDst('Toplu OA indirme zaten çalışıyor.','ld');
    return;
  }
  oaBatchBusy=true;
  refreshBusyControls();
  try{
  if(typeof window.electronAPI==='undefined'){setDst('Electron gerekli.','er');return;}
  var allRefs=[];
  S.wss.forEach(function(ws){allRefs=allRefs.concat(ws.lib||[]);});
  allRefs.forEach(function(r){normalizeRefRecord(r);});
  var rawQueue=allRefs.filter(function(r){return r&&r.doi&&!r.pdfData;});
  if(!rawQueue.length){setDst('Tum kaynaklarda PDF mevcut veya DOI yok.','ok');setTimeout(function(){setDst('','');},4000);return;}
  var queue=[];
  var seen={};
  var alreadyLocal=0;
  for(var i=0;i<rawQueue.length;i++){
    var r=rawQueue[i];
    if(!r||!r.id||seen[r.id])continue;
    seen[r.id]=true;
    var exists=false;
    try{
      if(typeof window.electronAPI.pdfExists==='function'){
        exists=await window.electronAPI.pdfExists(r.id);
      }
    }catch(e){}
    if(exists){
      alreadyLocal++;
      if(!r.pdfData){try{await hydrateRefPDF(r);}catch(e){}}
      continue;
    }
    queue.push(r);
  }
  if(!queue.length){
    setDst('Toplu indirme: yeni indirilecek PDF yok ('+alreadyLocal+' adet zaten mevcut).','ok');
    setTimeout(function(){setDst('','');},5000);
    return;
  }
  var hw=((typeof navigator!=='undefined'&&navigator.hardwareConcurrency)?navigator.hardwareConcurrency:4);
  var concurrency=Math.min(queue.length,Math.max(2,Math.min(6,Math.ceil(hw/2))));
  setDst('Toplu indirme basladi: 0/'+queue.length+(alreadyLocal?(' (mevcut atlandi: '+alreadyLocal+')'):''),'ld');
  var done=0,fail=0,failReasons=[],completed=0,nextIdx=0,verifiedHigh=0,verifiedReview=0;
  async function worker(){
    while(true){
      var qi=nextIdx++;
      if(qi>=queue.length)return;
      var ref=queue[qi];
      var result=await __oaDownloadOneRef(ref);
      if(result&&result.ok){
        done++;
        var verification=normalizePdfVerification(ref&&ref.pdfVerification||null);
        if(verification&&verification.status==='verified')verifiedHigh++;
        else if(verification&&verification.status==='likely')verifiedReview++;
        save();
      }else{
        fail++;
        if(failReasons.length<3){
          failReasons.push((shortRef(ref)||'Kaynak')+': '+((result&&result.reason)||'Bilinmeyen hata'));
        }
      }
      completed++;
      if(completed===queue.length||completed%2===0){
        setDst('Toplu indirme devam: '+completed+'/'+queue.length+' (basarili '+done+', basarisiz '+fail+')','ld');
      }
    }
  }
  var workers=[];
  for(var wi=0;wi<concurrency;wi++)workers.push(worker());
  await Promise.allSettled(workers);
  save();rLib();
  var msg='Toplu indirme bitti: '+done+'/'+queue.length+' basarili';
  if(fail>0)msg+=', '+fail+' basarisiz';
  if(alreadyLocal>0)msg+=', '+alreadyLocal+' zaten mevcuttu';
  if(done>0)msg+=', '+verifiedHigh+' guvenli';
  if(verifiedReview>0)msg+=', '+verifiedReview+' kontrol gerekli';
  if(failReasons.length){
    msg+=' | '+failReasons[0].slice(0,170);
  }
  setDst(msg,done>0?'ok':'er');
  setTimeout(function(){setDst('','');},6500);
  }catch(e){
    logStability('batchDownloadOA',e);
    setDst('Toplu OA indirme hatası.','er');
  }finally{
    oaBatchBusy=false;
    refreshBusyControls();
  }
}

// ¦¦ THUMBNAIL SIDEBAR ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function toggleThumbs(){
  var el=document.getElementById('pdfthumbs');
  var vis=el.style.display==='none';
  el.style.display=vis?'block':'none';
  if(vis&&pdfDoc)renderThumbnails();
  updatePdfToolState();
}

function renderThumbnails(){
  if(!pdfDoc)return;
  var container=document.getElementById('pdfthumbs');
  container.innerHTML='';
  for(var i=1;i<=pdfTotal;i++){
    (function(n){
      var thumbWrap=document.createElement('div');
      thumbWrap.className='pdf-thumb-card';
      thumbWrap.style.cssText='padding:5px;cursor:pointer;border:1px solid rgba(172,188,196,.38);margin:4px 2px;border-radius:10px;background:rgba(255,255,255,.62);box-shadow:0 6px 14px rgba(44,67,81,.08);';
      thumbWrap.dataset.thumbpage=n;
      thumbWrap.onclick=function(){pdfPg=n;scrollToPage(n);updateThumbHL();};
      var thumbCanvas=document.createElement('canvas');
      thumbCanvas.style.cssText='width:100%;display:block;border-radius:2px;';
      thumbWrap.appendChild(thumbCanvas);
      var label=document.createElement('div');
      label.style.cssText='text-align:center;font-size:9px;color:var(--txt3);margin-top:2px;';
      label.textContent=n;
      thumbWrap.appendChild(label);
      container.appendChild(thumbWrap);
      pdfDoc.getPage(n).then(function(page){
        var scale=0.2;
        var vp=page.getViewport({scale:scale});
        thumbCanvas.width=vp.width;thumbCanvas.height=vp.height;
        page.render({canvasContext:thumbCanvas.getContext('2d'),viewport:vp});
      });
    })(i);
  }
  updateThumbHL();
}

function updateThumbHL(){
  document.querySelectorAll('#pdfthumbs [data-thumbpage]').forEach(function(el){
    var active=parseInt(el.dataset.thumbpage)===pdfPg;
    el.style.borderColor=active?'rgba(91,119,135,.72)':'rgba(172,188,196,.38)';
    el.style.background=active?'linear-gradient(180deg,rgba(255,255,255,.96),rgba(235,244,248,.92))':'rgba(255,255,255,.62)';
  });
}

// ¦¦ OUTLINE / TOC ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function toggleOutline(){
  var el=document.getElementById('pdfoutline');
  el.style.display=el.style.display==='none'?'block':'none';
  updatePdfToolState();
}

function togglePdfAnnotations(){
  var el=document.getElementById('pdfannots');
  if(!el)return;
  var vis=el.style.display==='none';
  el.style.display=vis?'block':'none';
  if(vis)renderPdfAnnotationPanel();
  updatePdfToolState();
}

function renderPdfRelatedPanel(){
  var host=document.getElementById('pdfrelated');
  if(!host)return;
  var header='<div class="pdfrel-head"><span>Benzer Makaleler</span><span style="font-size:9px;color:var(--txt3);letter-spacing:.04em;">Auto</span></div>';
  if(!curRef){
    host.innerHTML=header+'<div class="pdfrel-empty">Bir kaynak seçildiğinde benzer çalışmalar burada görünür.</div>';
    return;
  }
  var ws=S.wss.find(function(x){return x&&x.id===S.cur;});
  var refs=(ws&&ws.lib)||[];
  var recApi=window.AQReferenceRecommendation||null;
  if(!(recApi&&typeof recApi.relatedPapers==='function')){
    host.innerHTML=header+'<div class="pdfrel-empty">Benzer makale motoru hazır değil.</div>';
    return;
  }
  var related=recApi.relatedPapers(curRef,refs,{notes:S.notes||[]}).slice(0,8);
  if(!related.length){
    host.innerHTML=header+'<div class="pdfrel-empty">Bu kaynağa yakın kayıt bulunamadı. Kütüphaneye daha fazla çalışma ekleyince tavsiyeler genişler.</div>';
    return;
  }
  var esc=(typeof __escHtml==='function')?__escHtml:function(s){return String(s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
  host.innerHTML=header+related.map(function(item){
    var ref=item.ref||{};
    var reasons=(item.reasons||[]).slice(0,2).join(' · ');
    var authors=(Array.isArray(ref.authors)?ref.authors:[]).map(function(a){return String(a||'').split(',')[0].trim();}).filter(Boolean).slice(0,2).join(', ');
    return '<div class="pdfrel-item" data-related-ref="'+esc(ref.id||'')+'">'+
      '<div class="pdfrel-title">'+esc((ref.title||'Başlıksız').substring(0,140))+'</div>'+
      '<div class="pdfrel-meta">'+esc(authors||'Bilinmeyen')+' · '+esc(ref.year||'t.y.')+'</div>'+
      (reasons?('<div class="pdfrel-reason">'+esc(reasons)+'</div>'):'')+
    '</div>';
  }).join('');
}

function togglePdfRelated(forceOpen){
  var el=document.getElementById('pdfrelated');
  if(!el)return;
  var vis=(forceOpen===true)?true:(el.style.display==='none');
  el.style.display=vis?'block':'none';
  if(vis)renderPdfRelatedPanel();
  updatePdfToolState();
}

function openPdfRelatedForRef(ref){
  if(ref&&ref.id){
    var ws=S.wss.find(function(x){return x&&x.id===S.cur;});
    var refs=(ws&&ws.lib)||[];
    var target=refs.find(function(r){return r&&r.id===ref.id;});
    if(target)curRef=target;
  }
  var panel=document.getElementById('pdfpanel');
  if(panel&&!panel.classList.contains('open'))panel.classList.add('open');
  togglePdfRelated(true);
}

function getPdfAnnotationItemFromElement(el){
  var card=el&&el.closest?el.closest('.pdf-annot-card'):null;
  if(!card)return null;
  var kind=card.dataset.kind;
  var index=parseInt(card.dataset.index,10);
  if(kind==='highlight')return (Array.isArray(hlData)?hlData:[])[index]?{kind:kind,index:index,item:hlData[index]}:null;
  var annots=collectAnnotsFromDOM();
  return annots[index]?{kind:kind,index:index,item:annots[index]}:null;
}

function focusPdfAnnotationElement(id,index){
  var selector=id?'[data-annot-id="'+String(id).replace(/"/g,'\\"')+'"]':null;
  var el=selector?document.querySelector('.pdf-annot'+selector):null;
  if(!el){
    var all=document.querySelectorAll('.pdf-annot');
    el=all[index]||null;
  }
  document.querySelectorAll('.pdf-annot.aq-annot-focus').forEach(function(node){node.classList.remove('aq-annot-focus');});
  if(!el)return false;
  el.classList.add('aq-annot-focus');
  el.scrollIntoView({behavior:'smooth',block:'center'});
  var body=el.querySelector('.pdf-annot-body');
  setTimeout(function(){if(body)body.focus();},180);
  setTimeout(function(){el.classList.remove('aq-annot-focus');},1800);
  return true;
}

function jumpToPdfAnnotation(kind,index,item){
  if(!item)return false;
  pdfPg=parseInt(item.page,10)||pdfPg;
  scrollToPage(pdfPg);
  if(kind==='note')setTimeout(function(){focusPdfAnnotationElement(item.id,index);},220);
  return true;
}

function removePdfAnnotationItem(kind,index,item){
  if(kind==='highlight'){
    clickedHLIdx=index;
    hlRemove();
    renderPdfAnnotationPanel();
    return true;
  }
  var selector=item&&item.id?'[data-annot-id="'+String(item.id).replace(/"/g,'\\"')+'"]':null;
  var el=selector?document.querySelector('.pdf-annot'+selector):null;
  if(!el){
    var all=document.querySelectorAll('.pdf-annot');
    el=all[index]||null;
  }
  if(el){el.remove();saveAnnotsToTab();return true;}
  return false;
}

function createNoteFromPdfAnnotationItem(kind,item){
  var text=String(item&&item.text||'').trim();
  if(!text)return null;
  var note=createStructuredPdfNote(kind==='highlight'?'direct_quote':'summary',text,{
    source:curRef?shortRef(curRef):'',
    referenceId:curRef?curRef.id:'',
    pageTag:'s.'+((item&&item.page)||pdfPg),
    dateText:new Date().toLocaleDateString('tr-TR'),
    highlightColor:item&&item.color||''
  });
  if(kind==='note'){
    note.txt=text;
    note.q='';
    note.comment=text;
  }
  normalizeResearchNote(note);
  S.notes.unshift(note);
  save();
  rNotes();
  swR('notes',document.querySelectorAll('.rtab')[0]);
  return note;
}

function insertPdfAnnotationItemIntoDocument(kind,item){
  var note=createNoteFromPdfAnnotationItem(kind,item);
  if(!note)return false;
  var inserted=false;
  if(typeof insCiteNote==='function'){
    try{inserted=!!insCiteNote(note.id);}catch(_e){}
  }
  if(!inserted){
    var text=escapePdfPanelText(note.q||note.txt||note.comment||'');
    var cite=curRef?' <span class="cit" data-ref="'+curRef.id+'">'+escapePdfPanelText('('+shortRef(curRef)+')')+'</span>':'';
    iHTML('<blockquote>'+text+cite+'</blockquote>');
    inserted=true;
  }
  if(inserted)markNoteInserted(note.id);
  return inserted;
}

function buildCurrentPdfAnnotationDigest(){
  var items=getPdfAnnotationItems();
  var title=(curRef&&curRef.title)||'PDF Notları';
  var citation=curRef?shortRef(curRef):'';
  if(window.AQAnnotationState&&typeof window.AQAnnotationState.buildAnnotationDigest==='function'){
    return window.AQAnnotationState.buildAnnotationDigest(items,{title:title,citation:citation});
  }
  var text=items.map(function(item){
    return 'Sayfa '+(item.page||'?')+' - '+(item.kind==='highlight'?'Highlight':'Not')+': '+String(item.text||'').trim();
  }).filter(Boolean).join('\n');
  return {count:items.length,markdown:'# '+title+'\n\n'+text,html:'<section class="pdf-annotation-digest"><h2>'+escapePdfPanelText(title)+'</h2><pre>'+escapePdfPanelText(text)+'</pre></section>'};
}

function copyPdfAnnotationDigest(){
  var digest=buildCurrentPdfAnnotationDigest();
  if(!digest||!digest.count){setDst('PDF notu yok.','er');return false;}
  var text=digest.markdown||'';
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){setDst('PDF not özeti kopyalandı.','ok');}).catch(function(){setDst('Kopyalama başarısız.','er');});
    return true;
  }
  setDst('Kopyalama API desteklenmiyor.','er');
  return false;
}

function createNotesFromPdfAnnotationItems(){
  var items=getPdfAnnotationItems().filter(function(item){return String(item&&item.text||'').trim();});
  if(!items.length){setDst('Aktarılacak PDF notu yok.','er');return 0;}
  items.forEach(function(item){
    var note=createStructuredPdfNote(item.kind==='highlight'?'direct_quote':'summary',String(item.text||'').trim(),{
      source:curRef?shortRef(curRef):'',
      referenceId:curRef?curRef.id:'',
      pageTag:'s.'+(item.page||pdfPg),
      dateText:new Date().toLocaleDateString('tr-TR'),
      highlightColor:item.color||''
    });
    if(item.kind==='note'){
      note.txt=String(item.text||'').trim();
      note.q='';
      note.comment=note.txt;
    }
    normalizeResearchNote(note);
    S.notes.unshift(note);
  });
  save();
  rNotes();
  swR('notes',document.querySelectorAll('.rtab')[0]);
  setDst(items.length+' PDF notu notlara aktarıldı.','ok');
  return items.length;
}

function insertPdfAnnotationDigestIntoDocument(){
  var digest=buildCurrentPdfAnnotationDigest();
  if(!digest||!digest.count){setDst('Belgeye eklenecek PDF notu yok.','er');return false;}
  iHTML(digest.html);
  setDst('PDF not özeti belgeye eklendi.','ok');
  return true;
}

function getActivePdfDrawings(){
  var tab=pdfTabs.find(function(t){return t.id===activeTabId;});
  if(tab&&tab.drawings)return tab.drawings;
  if(curRef&&curRef._drawings)return curRef._drawings;
  return {};
}

function buildPdfAnnotationExportNotes(pageNum, exportWidth, exportHeight){
  return getPdfAnnotationExportNotes(pageNum, exportWidth, exportHeight).map(function(note){
    return '<div class="aq-pdf-note" style="left:'+note.x.toFixed(2)+'px;top:'+note.y.toFixed(2)+'px;width:'+note.w.toFixed(2)+'px;">'+escapePdfPanelText(note.text||'')+'</div>';
  }).join('');
}

function getPdfAnnotationExportNotes(pageNum, exportWidth, exportHeight){
  var notes=collectAnnotsFromDOM().filter(function(a){return parseInt(a.page,10)===pageNum;});
  if(!notes.length)return [];
  var liveWrap=document.querySelector('.pdf-page-wrap[data-page="'+pageNum+'"]');
  var liveW=liveWrap?liveWrap.offsetWidth:exportWidth;
  var liveH=liveWrap?liveWrap.offsetHeight:exportHeight;
  var sx=liveW?exportWidth/liveW:1;
  var sy=liveH?exportHeight/liveH:1;
  return notes.map(function(note){
    var x=Math.max(0,Number(note.x)||0)*sx;
    var y=Math.max(0,Number(note.y)||0)*sy;
    var w=Math.max(90,Number(note.w)||160)*sx;
    return {x:x,y:y,w:w,text:String(note.text||'')};
  });
}

function paintPdfExportHighlights(ctx,pageNum,width,height){
  (Array.isArray(hlData)?hlData:[]).filter(function(h){return parseInt(h.page,10)===pageNum;}).forEach(function(h){
    ctx.save();
    ctx.globalAlpha=0.38;
    ctx.fillStyle=h.color||hlColor||'#fef08a';
    (Array.isArray(h.rects)?h.rects:[]).forEach(function(r){
      ctx.fillRect((Number(r.x)||0)*width,(Number(r.y)||0)*height,(Number(r.w)||0)*width,(Number(r.h)||0)*height);
    });
    ctx.restore();
  });
}

async function renderPdfPageForAnnotatedExport(pageNum, scale){
  var page=await pdfDoc.getPage(pageNum);
  var vp=page.getViewport({scale:scale});
  var canvas=document.createElement('canvas');
  canvas.width=Math.round(vp.width);
  canvas.height=Math.round(vp.height);
  var ctx=canvas.getContext('2d');
  await page.render({canvasContext:ctx,viewport:vp}).promise;
  paintPdfExportHighlights(ctx,pageNum,canvas.width,canvas.height);
  return {page:pageNum,width:canvas.width,height:canvas.height,dataUrl:canvas.toDataURL('image/png')};
}

async function buildAnnotatedPdfExportHTML(){
  if(!pdfDoc)throw new Error('Açık PDF yok');
  saveCurrentTabState();
  var title=(curRef&&curRef.title)||'AcademiQ PDF';
  var drawings=getActivePdfDrawings();
  var scale=1.35;
  var pages=[];
  for(var i=1;i<=pdfTotal;i++){
    var rendered=await renderPdfPageForAnnotatedExport(i,scale);
    pages.push({
      page:i,
      width:rendered.width,
      height:rendered.height,
      dataUrl:rendered.dataUrl,
      drawingDataUrl:drawings&&drawings[String(i)]?String(drawings[String(i)]):'',
      notes:getPdfAnnotationExportNotes(i,rendered.width,rendered.height)
    });
  }
  if(window.AQPdfAnnotationExport&&typeof window.AQPdfAnnotationExport.buildAnnotatedPdfExportDocument==='function'){
    return window.AQPdfAnnotationExport.buildAnnotatedPdfExportDocument({title:title,pages:pages});
  }
  return "<!DOCTYPE html><html lang=\"tr\"><head><meta charset=\"UTF-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline';\"><title>"+escapePdfPanelText(title)+"</title><style>"
    + '@page{size:A4;margin:0;}html,body{margin:0;padding:0;background:#d7dee2;font-family:Arial,sans-serif;}'
    + '.aq-pdf-export-page{position:relative;margin:0 auto;page-break-after:always;break-after:page;background:#fff;overflow:hidden;}'
    + '.aq-pdf-export-page:last-child{page-break-after:auto;break-after:auto;}'
    + '.aq-pdf-page-img,.aq-pdf-drawing{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;}'
    + '.aq-pdf-drawing{pointer-events:none;}'
    + '.aq-pdf-note{position:absolute;box-sizing:border-box;min-height:26px;padding:6px 8px;border:1.2px solid #b98d28;border-radius:6px;background:rgba(255,248,199,.94);color:#2f2a1a;font-size:10px;line-height:1.35;box-shadow:0 4px 12px rgba(64,48,14,.18);white-space:pre-wrap;word-break:break-word;}'
    + '</style></head><body>'+pages.map(function(page){
      var drawing=page.drawingDataUrl?'<img class="aq-pdf-drawing" src="'+escapePdfPanelText(page.drawingDataUrl)+'" alt="Çizim"/>' : '';
      return '<section class="aq-pdf-export-page" style="width:'+page.width+'px;height:'+page.height+'px;">'
        + '<img class="aq-pdf-page-img" src="'+page.dataUrl+'" alt="Sayfa '+page.page+'"/>'
        + drawing
        + buildPdfAnnotationExportNotes(page.page,page.width,page.height)
        + '</section>';
    }).join('')+'</body></html>';
}

async function buildNativeAnnotationPayload(){
  saveCurrentTabState();
  var pages=[];
  var total=pdfDoc.numPages;
  var drawings=getActivePdfDrawings()||{};
  var notesAll=collectAnnotsFromDOM();
  for(var p=1;p<=total;p++){
    var liveWrap=document.querySelector('.pdf-page-wrap[data-page="'+p+'"]');
    var layoutW=liveWrap?liveWrap.offsetWidth:0;
    var layoutH=liveWrap?liveWrap.offsetHeight:0;
    if(!layoutW||!layoutH){
      try{
        var page=await pdfDoc.getPage(p);
        var vp=page.getViewport({scale:1});
        layoutW=vp.width;layoutH=vp.height;
      }catch(_e){layoutW=layoutW||595;layoutH=layoutH||842;}
    }
    var pageHighlights=(Array.isArray(hlData)?hlData:[])
      .filter(function(h){return parseInt(h.page,10)===p;})
      .map(function(h){return {color:h.color||hlColor||'#fef08a',rects:(Array.isArray(h.rects)?h.rects:[]).map(function(r){return {x:Number(r.x)||0,y:Number(r.y)||0,w:Number(r.w)||0,h:Number(r.h)||0};})};})
      .filter(function(h){return h.rects.length>0;});
    var pageNotes=notesAll.filter(function(a){return parseInt(a.page,10)===p;}).map(function(a){return {x:Number(a.x)||0,y:Number(a.y)||0,w:Number(a.w)||160,text:String(a.text||'')};});
    var drawingUrl=drawings&&drawings[p]?String(drawings[p]||''):'';
    if(pageHighlights.length||pageNotes.length||drawingUrl){
      pages.push({page:p,layoutWidth:layoutW,layoutHeight:layoutH,highlights:pageHighlights,notes:pageNotes,drawingDataUrl:drawingUrl});
    }
  }
  return {title:(curRef&&curRef.title)||'Annotated PDF',pages:pages};
}

async function exportAnnotatedPdf(){
  if(!pdfDoc){setDst('Önce bir PDF açın.','er');return false;}
  if(!(window.electronAPI&&typeof window.electronAPI.exportPDF==='function')){
    setDst('Annotationlı PDF dışa aktarımı masaüstü uygulamada desteklenir.','er');
    return false;
  }
  var name=(window.AQPdfAnnotationExport&&typeof window.AQPdfAnnotationExport.sanitizeFilename==='function')
    ? window.AQPdfAnnotationExport.sanitizeFilename((curRef&&curRef.title)||'annotated-pdf','annotated-pdf')
    : (((curRef&&curRef.title)||'annotated-pdf').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'annotated-pdf');
  // Native flatten (pdf-lib): keeps real PDF objects, smaller and text-selectable.
  if(typeof window.electronAPI.exportAnnotatedPdfNative==='function' && typeof pdfDoc.getData==='function'){
    try{
      setDst('Annotationlı PDF hazırlanıyor (native)...','ld');
      var bytes=await pdfDoc.getData();
      var b64='';
      try{
        var chunk=0x8000,parts=[];
        for(var off=0;off<bytes.length;off+=chunk){
          parts.push(String.fromCharCode.apply(null,bytes.subarray(off,Math.min(off+chunk,bytes.length))));
        }
        b64=btoa(parts.join(''));
      }catch(_e){b64='';}
      if(b64){
        var payload=await buildNativeAnnotationPayload();
        var nres=await window.electronAPI.exportAnnotatedPdfNative({defaultPath:name+' - annotated.pdf',pdfBase64:b64,payload:payload});
        if(nres&&nres.ok){setDst('Annotationlı PDF kaydedildi.','ok');return true;}
        if(nres&&nres.canceled){setDst('Annotationlı PDF dışa aktarımı iptal edildi.','');return false;}
        // else fall through to HTML fallback below
        console.warn('native exportAnnotatedPdf failed, falling back:',nres&&nres.error);
      }
    }catch(eNative){
      console.warn('native exportAnnotatedPdf threw, falling back:',eNative);
    }
  }
  try{
    setDst('Annotationlı PDF hazırlanıyor...','ld');
    var html=await buildAnnotatedPdfExportHTML();
    var result=await window.electronAPI.exportPDF({defaultPath:name+' - annotated.pdf',exportHTML:html,showPageNumbers:false,marginMode:'none'});
    if(result&&result.ok){setDst('Annotationlı PDF kaydedildi.','ok');return true;}
    if(result&&result.canceled){setDst('Annotationlı PDF dışa aktarımı iptal edildi.','');return false;}
    setDst('Annotationlı PDF dışa aktarılamadı.','er');
    return false;
  }catch(e){
    setDst('Annotationlı PDF hatası: '+((e&&e.message)||e),'er');
    return false;
  }
}

function loadOutline(){
  if(!pdfDoc)return;
  var container=document.getElementById('pdfoutline');
  pdfDoc.getOutline().then(function(outline){
    if(!outline||!outline.length){
      container.innerHTML='<div style="color:var(--txt3);font-size:10px;padding:6px;">Icerik tablosu yok</div>';
      return;
    }
    container.innerHTML='<div style="font-family:var(--fm);font-size:9px;color:var(--acc);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">ICERIK</div>';
    renderOutlineItems(outline,container,0);
  }).catch(function(){
    container.innerHTML='<div style="color:var(--txt3);font-size:10px;padding:6px;">Icerik tablosu yok</div>';
  });
}

function renderOutlineItems(items,container,depth){
  items.forEach(function(item){
    var div=document.createElement('div');
    div.style.cssText='padding:6px 7px 6px '+(depth*12+7)+'px;font-size:11px;color:var(--txt2);cursor:pointer;border-radius:10px;line-height:1.35;margin:2px 0;';
    div.textContent=item.title||'';
    div.onmouseover=function(){div.style.background='var(--bg3)';};
    div.onmouseout=function(){div.style.background='';};
    div.onclick=function(){
      if(item.dest){
        var destPromise=typeof item.dest==='string'?pdfDoc.getDestination(item.dest):Promise.resolve(item.dest);
        destPromise.then(function(dest){
          if(!dest||!dest[0])return;
          pdfDoc.getPageIndex(dest[0]).then(function(pageIdx){
            pdfPg=pageIdx+1;scrollToPage(pdfPg);
          });
        }).catch(function(){});
      }
    };
    container.appendChild(div);
    if(item.items&&item.items.length)renderOutlineItems(item.items,container,depth+1);
  });
}

document.addEventListener('click',function(e){
  var filterBtn=e.target&&e.target.closest?e.target.closest('#pdfannots [data-pdf-annot-filter]'):null;
  if(filterBtn){
    e.preventDefault();
    e.stopPropagation();
    setPdfAnnotationFilter(filterBtn.getAttribute('data-pdf-annot-filter'));
    return;
  }
  var bulkBtn=e.target&&e.target.closest?e.target.closest('#pdfannots [data-pdf-annot-bulk]'):null;
  if(bulkBtn){
    e.preventDefault();
    e.stopPropagation();
    var bulkAct=bulkBtn.getAttribute('data-pdf-annot-bulk');
    if(bulkAct==='copy')copyPdfAnnotationDigest();
    else if(bulkAct==='notes')createNotesFromPdfAnnotationItems();
    else if(bulkAct==='doc')insertPdfAnnotationDigestIntoDocument();
    else if(bulkAct==='export')exportAnnotatedPdf();
    return;
  }
  var btn=e.target&&e.target.closest?e.target.closest('#pdfannots .pdf-annot-action'):null;
  if(!btn)return;
  e.preventDefault();
  e.stopPropagation();
  var resolved=getPdfAnnotationItemFromElement(btn);
  if(!resolved||!resolved.item)return;
  var act=btn.dataset.act;
  if(act==='jump')jumpToPdfAnnotation(resolved.kind,resolved.index,resolved.item);
  else if(act==='edit')jumpToPdfAnnotation(resolved.kind,resolved.index,resolved.item);
  else if(act==='note')createNoteFromPdfAnnotationItem(resolved.kind,resolved.item);
  else if(act==='doc')insertPdfAnnotationItemIntoDocument(resolved.kind,resolved.item);
  else if(act==='delete')removePdfAnnotationItem(resolved.kind,resolved.index,resolved.item);
},true);

document.addEventListener('input',function(e){
  var inp=e.target&&e.target.closest?e.target.closest('#pdfAnnotSearch'):null;
  if(!inp)return;
  pdfAnnotQuery=String(inp.value||'');
  renderPdfAnnotationPanel();
  var next=document.getElementById('pdfAnnotSearch');
  if(next){
    next.focus();
    try{next.setSelectionRange(next.value.length,next.value.length);}catch(_e){}
  }
},true);

// ¦¦ COPY TEXT ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function cpSelText(){
  if(selText){
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(selText).catch(function(){cpStr(selText);});
    }else{cpStr(selText);}
  }
  hideHLtip();
}

// ¦¦ PDF TABLE EXTRACTION ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function extractTableFromSelection(){
  if(!selText){hideHLtip();return;}
  var text=selText;
  hideHLtip();
  var lines=text.split('\n').filter(function(l){return l.trim().length>0;});
  if(lines.length<2){alert('Tablo için en az 2 satır gerekli. PDF\'te tabloyu seçin.');return;}
  function splitRow(line){
    if(line.includes('\t'))return line.split('\t').map(function(c){return c.trim();}).filter(Boolean);
    var parts=line.split(/\s{3,}/).map(function(c){return c.trim();}).filter(Boolean);
    if(parts.length>=2)return parts;
    parts=line.split(/\s{2,}/).map(function(c){return c.trim();}).filter(Boolean);
    if(parts.length>=2)return parts;
    return [line.trim()];
  }
  var rows=lines.map(splitRow);
  var maxCols=Math.max.apply(null,rows.map(function(r){return r.length;}));
  rows.forEach(function(r){while(r.length<maxCols)r.push('');});
  var headerCells=rows[0];
  var bodyCells=rows.slice(1);
  var existingTables=document.getElementById('apaed').querySelectorAll('table').length;
  var tableNum=existingTables+1;
  var html='<p class="ni"><strong>Tablo '+tableNum+'</strong></p>';
  html+='<table><thead><tr>';
  headerCells.forEach(function(h){html+='<th>'+h+'</th>';});
  html+='</tr></thead><tbody>';
  bodyCells.forEach(function(row){
    html+='<tr>';
    row.forEach(function(cell){html+='<td>'+cell+'</td>';});
    html+='</tr>';
  });
  html+='</tbody></table><p><br></p>';
  iHTML(html);
  setDst('Tablo editöre eklendi ('+bodyCells.length+' satır, '+maxCols+' sütun)','ok');
  setTimeout(function(){setDst('','');},3000);
}

// ¦¦ FONT SIZE APPLY ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function applyFontSize(pt){
  if(window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.runFontSize==='function'){
    if(window.AQTipTapWordCommands.runFontSize({
      editor:editor||null,
      pt:pt,
      host:document.getElementById('apaed'),
      documentObj:document,
      onMutated:function(){
        runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});
      }
    }))return;
  }
  if(editor&&window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.execFontSize==='function'){
    if(window.AQTipTapWordCommands.execFontSize({
      editor:editor,
      pt:pt,
      onApplied:function(){
        runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});
      }
    }))return;
  }
  if(editor){
    editor.chain().focus().setMark('textStyle',{fontSize:pt+'pt'}).run();
    runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});return;
  }
  var ed=document.getElementById('apaed');
  ed.focus();
  var sel=window.getSelection();
  if(!sel||sel.isCollapsed)return;
  document.execCommand('fontSize',false,'7');
  ed.querySelectorAll('font[size="7"]').forEach(function(font){
    var span=document.createElement('span');
    span.style.fontSize=pt+'pt';
    span.innerHTML=font.innerHTML;
    font.parentNode.replaceChild(span,font);
  });
  runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});
}

// ¦¦ EDITOR SELECTION PRESERVE (fix dropdown insert) ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
var editorSavedRange=null;
function saveEditorSelection(){
  var sel=window.getSelection();
  if(sel&&sel.rangeCount>0){
    var range=sel.getRangeAt(0);
    var ed=document.getElementById('apaed');
    if(ed&&ed.contains(range.commonAncestorContainer)){
      editorSavedRange=range.cloneRange();
    }
  }
}
function restoreEditorSelection(){
  if(editorSavedRange){
    try{
      var sel=window.getSelection();
      sel.removeAllRanges();
      sel.addRange(editorSavedRange);
      editorSavedRange=null;
      return true;
    }catch(e){editorSavedRange=null;return false;}
  }
  return false;
}
var editorSavedPmSelection=null;
function captureEditorListStyleSelection(){
  editorSavedPmSelection=null;
  var activeEditor=(typeof window!=='undefined'&&window.editor)?window.editor:(editor||null);
  if(activeEditor&&activeEditor!==editor) editor=activeEditor;
  if(window.AQEditorCore&&typeof window.AQEditorCore.captureSelection==='function'){
    try{
      editorSavedPmSelection=window.AQEditorCore.captureSelection()||null;
    }catch(_e){}
  }
  if(activeEditor&&activeEditor.state&&activeEditor.state.selection){
    try{
      editorSavedPmSelection={
        type:'pm',
        from:activeEditor.state.selection.from,
        to:activeEditor.state.selection.to
      };
    }catch(_e){}
  }
  saveEditorSelection();
  return true;
}
function restoreEditorListStyleSelection(){
  if(editorSavedPmSelection&&window.AQEditorCore&&typeof window.AQEditorCore.restoreSelection==='function'){
    try{
      if(window.AQEditorCore.restoreSelection(editorSavedPmSelection,{focusAtEnd:false})) return true;
    }catch(_e){}
  }
  return restoreEditorSelection();
}
function applyEditorListStyle(listType, style, modalId){
  var api=window.AQTipTapWordCommands||null;
  var activeEditor=window.editor||editor||null;
  if(window.editor&&window.editor!==editor) editor=window.editor;
  if(!activeEditor) return false;
  var savedPmSelection=(editorSavedPmSelection
    && typeof editorSavedPmSelection.from==='number'
    && typeof editorSavedPmSelection.to==='number')
      ? { from:editorSavedPmSelection.from, to:editorSavedPmSelection.to }
      : null;
  var alreadyActive=!!(activeEditor&&typeof activeEditor.isActive==='function'&&activeEditor.isActive(listType));
  if(modalId&&typeof hideM==='function'){
    try{ hideM(modalId); }catch(_e){}
  }
  if(savedPmSelection&&activeEditor&&activeEditor.chain){
    try{
      activeEditor.chain().focus().setTextSelection(savedPmSelection).run();
    }catch(_e){
      restoreEditorListStyleSelection();
    }
  }else{
    restoreEditorListStyleSelection();
  }
  editorSavedPmSelection=null;
  if(!api){
    try{
      var fallbackChain=activeEditor.chain().focus();
      if(typeof activeEditor.isActive==='function'&&!activeEditor.isActive(listType)){
        if(listType==='orderedList'&&typeof fallbackChain.toggleOrderedList==='function'){
          fallbackChain.toggleOrderedList();
        }else if(listType==='bulletList'&&typeof fallbackChain.toggleBulletList==='function'){
          fallbackChain.toggleBulletList();
        }
      }
      if(typeof fallbackChain.updateAttributes==='function'){
        fallbackChain.updateAttributes(listType,{ listStyleType:style });
      }
      if(fallbackChain.run()){
        runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});
        return true;
      }
    }catch(_e){}
    return false;
  }
  function finalizeStyleApply(){
    var liveEditor=window.editor||activeEditor||null;
    if(!liveEditor||!window.AQTipTapWordCommands) return;
    try{
      if(savedPmSelection&&liveEditor.chain){
        try{ liveEditor.chain().focus().setTextSelection(savedPmSelection).run(); }catch(_e){}
      }
      var ok=false;
      if(typeof window.AQTipTapWordCommands.applyListStyleAtSelection==='function'){
        ok=!!window.AQTipTapWordCommands.applyListStyleAtSelection(liveEditor,listType,style);
      }else if(typeof window.AQTipTapWordCommands.applyListStyle==='function'){
        ok=!!window.AQTipTapWordCommands.applyListStyle(liveEditor,listType,style);
      }
      if(ok&&typeof window.AQTipTapWordCommands.syncRenderedListStyles==='function'){
        try{ window.AQTipTapWordCommands.syncRenderedListStyles(liveEditor,listType,style); }catch(_e){}
      }
      // Safety fallback: if command path reported success but list is not active at
      // the caret (or style did not stick), enforce the list/style in one chain.
      if((!ok||!(typeof liveEditor.isActive==='function'&&liveEditor.isActive(listType)))&&liveEditor.chain){
        try{
          var forceChain=liveEditor.chain().focus();
          var forceActive=(typeof liveEditor.isActive==='function')?!!liveEditor.isActive(listType):false;
          if(!forceActive){
            if(listType==='orderedList'&&typeof forceChain.toggleOrderedList==='function'){
              forceChain.toggleOrderedList();
            }else if(listType==='bulletList'&&typeof forceChain.toggleBulletList==='function'){
              forceChain.toggleBulletList();
            }
          }
          if(typeof forceChain.updateAttributes==='function'){
            forceChain.updateAttributes(listType,{ listStyleType:style });
          }
          ok=!!forceChain.run();
        }catch(_e){}
      }
      if(ok) runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});
    }catch(_e){}
  }
  if(alreadyActive){
    finalizeStyleApply();
    return false;
  }
  ec(listType==='orderedList'?'insertOrderedList':'insertUnorderedList');
  setTimeout(finalizeStyleApply,0);
  setTimeout(finalizeStyleApply,60);
  return false;
}

function applyMultiLevelList(templateName){
  var api=window.AQTipTapWordCommands||null;
  var activeEditor=window.editor||editor||null;
  if(window.editor&&window.editor!==editor) editor=window.editor;
  if(!activeEditor) return false;
  restoreEditorListStyleSelection();
  editorSavedPmSelection=null;
  if(!api){
    try{
      var fallbackChain=activeEditor.chain().focus();
      var preset=String(templateName||'number').toLowerCase();
      if((preset==='bullet'||preset==='mixed')&&typeof fallbackChain.toggleBulletList==='function'){
        fallbackChain.toggleBulletList();
        if(typeof fallbackChain.updateAttributes==='function'){
          fallbackChain.updateAttributes('bulletList',{ listStyleType:'disc' });
        }
      }else if(typeof fallbackChain.toggleOrderedList==='function'){
        fallbackChain.toggleOrderedList();
        if(typeof fallbackChain.updateAttributes==='function'){
          var defaultStyle=(preset==='outline')?'upper-roman':'decimal';
          fallbackChain.updateAttributes('orderedList',{ listStyleType:defaultStyle });
        }
      }
      if(fallbackChain.run()){
        runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});
        return true;
      }
    }catch(_e){}
    return false;
  }
  if(typeof api.applyMultiLevelListTemplate==='function'){
    var ok=api.applyMultiLevelListTemplate(activeEditor,templateName);
    if(ok) runEditorMutationEffects({layout:true,syncChrome:true,refreshTrigger:false});
    return ok;
  }
  return false;
}

// ¦¦ BIBTEX / RIS IMPORT ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function parseBibTeX(text){
  if(window.AQReferenceParse&&typeof window.AQReferenceParse.parseBibTeX==='function'){
    try{
      return window.AQReferenceParse.parseBibTeX(text,{
        createId:uid,
        workspaceId:S.cur
      });
    }catch(e){}
  }
  var entries=[];var re=/@(\w+)\s*\{([^,]*),\s*([\s\S]*?)\n\s*\}/g;
  var m;
  while((m=re.exec(text))!==null){
    var fields={};var body=m[3];
    var fr=/(\w+)\s*=\s*[\{"]([^}"]*)[\}"]/g;var fm;
    while((fm=fr.exec(body))!==null){
      fields[fm[1].toLowerCase()]=fm[2].replace(/[\{\}]/g,'').replace(/\\&/g,'&').replace(/\\\"/g,'"').replace(/\\'/g,"'").trim();
    }
    var authors=(fields.author||'').split(/\s+and\s+/i).map(function(a){return a.trim();}).filter(Boolean);
    var pages=(fields.pages||'').replace(/--/g,'-');
    var fp='',lp='';if(pages.includes('-')){fp=pages.split('-')[0].trim();lp=pages.split('-').pop().trim();}else fp=pages;
    entries.push({
      id:uid(),title:fields.title||'',authors:authors,year:fields.year||'',
      journal:fields.journal||fields.booktitle||'',volume:fields.volume||'',
      issue:fields.number||'',fp:fp,lp:lp,
      doi:normalizeRefDoi(fields.doi||fields.url||''),url:fields.url||'',pdfData:null,pdfUrl:null,wsId:S.cur
    });
  }
  return entries;
}
function parseRIS(text){
  if(window.AQReferenceParse&&typeof window.AQReferenceParse.parseRIS==='function'){
    try{
      return window.AQReferenceParse.parseRIS(text,{
        createId:uid,
        workspaceId:S.cur
      });
    }catch(e){}
  }
  var entries=[];var blocks=text.split(/^ER\s*-/m);
  blocks.forEach(function(block){
    if(!block.trim())return;
    var fields={};var lines=block.split('\n');
    var authors=[];
    lines.forEach(function(line){
      var m=line.match(/^([A-Z][A-Z0-9])\s*-\s*(.*)/);
      if(!m)return;
      var tag=m[1].trim(),val=m[2].trim();
      if(tag==='AU'||tag==='A1')authors.push(val);
      else if(tag==='TI'||tag==='T1')fields.title=val;
      else if(tag==='PY'||tag==='Y1')fields.year=val.split('/')[0];
      else if(tag==='JO'||tag==='JF'||tag==='T2')fields.journal=fields.journal||val;
      else if(tag==='VL')fields.volume=val;
      else if(tag==='IS')fields.issue=val;
      else if(tag==='SP')fields.fp=val;
      else if(tag==='EP')fields.lp=val;
      else if(tag==='DO')fields.doi=val;
      else if(tag==='UR')fields.url=val;
    });
    if(!fields.title&&!authors.length)return;
    entries.push({
      id:uid(),title:fields.title||'',authors:authors,year:fields.year||'',
      journal:fields.journal||'',volume:fields.volume||'',issue:fields.issue||'',
      fp:fields.fp||'',lp:fields.lp||'',
      doi:normalizeRefDoi(fields.doi||fields.url||''),url:fields.url||'',pdfData:null,pdfUrl:null,wsId:S.cur
    });
  });
  return entries;
}
function parseApaReferenceText(text){
  if(window.AQReferenceParse&&typeof window.AQReferenceParse.parseApaReferenceText==='function'){
    try{
      return window.AQReferenceParse.parseApaReferenceText(text,{
        createId:uid,
        workspaceId:S.cur
      });
    }catch(_e){}
  }
  return [];
}
function importBib(e){
  var file=e.target.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(ev){
    var text=ev.target.result;
    var entries=[];
    if(file.name.endsWith('.bib'))entries=parseBibTeX(text);
    else entries=parseRIS(text);
    if(!entries.length){setDst('Kaynak bulunamadı.','er');return;}
    var added=0;
    var merged=0;
    entries.forEach(function(ref){
      normalizeRefRecord(ref);
      var lib=cLib();
      var existing=lib.find(function(r){return refKey(r)===refKey(ref);});
      if(existing){
        mergeRefFields(existing,ref);
        if(existing.pdfData)persistBorrowedPDF(existing);
        merged++;
        return;
      }
      lib.push(ref);
      if(ref.pdfData)persistBorrowedPDF(ref);
      added++;
    });
    save();rLib();rRefs();
    setDst(added+' yeni, '+merged+' birleştirildi','ok');
    setTimeout(function(){setDst('','');},4000);
  };
  reader.readAsText(file);
  e.target.value='';
}

function parseCSLJSON(text){
  if(window.AQReferenceParse&&typeof window.AQReferenceParse.parseCSLJSON==='function'){
    try{
      return window.AQReferenceParse.parseCSLJSON(text,{
        createId:uid,
        workspaceId:S.cur
      });
    }catch(_e){}
  }
  return [];
}
function __importParseByFileName(fileName,text,allowJson){
  var name=String(fileName||'').toLowerCase().trim();
  if(allowJson&&window.AQZoteroIntegration&&typeof window.AQZoteroIntegration.parseExport==='function'){
    try{
      return window.AQZoteroIntegration.parseExport(name,text,{
        parseBibTeX:parseBibTeX,
        parseRIS:parseRIS,
        parseCSLJSON:parseCSLJSON
      });
    }catch(_e){}
  }
  if(name.endsWith('.bib'))return parseBibTeX(text);
  if(name.endsWith('.ris')||name.endsWith('.enw'))return parseRIS(text);
  if(name.endsWith('.txt')||name.endsWith('.apa'))return parseApaReferenceText(text);
  if(allowJson&&(name.endsWith('.json')||name.endsWith('.csljson')))return parseCSLJSON(text);
  throw new Error('Desteklenmeyen dosya turu');
}
function __importNeedsMetadataAttention(ref){
  if(window.AQMetadataHealth&&typeof window.AQMetadataHealth.analyzeReference==='function'){
    try{
      var report=window.AQMetadataHealth.analyzeReference(ref);
      return report&&report.status!=='complete';
    }catch(_e){}
  }
  var title=String(ref&&ref.title||'').trim();
  var year=String(ref&&ref.year||'').trim();
  var authors=(ref&&Array.isArray(ref.authors)?ref.authors:[]).filter(Boolean);
  return !title||!year||!authors.length;
}
function importReferenceEntries(entries,options){
  options=options||{};
  var lib=cLib();
  var summary={
    total:Array.isArray(entries)?entries.length:0,
    imported:0,
    duplicates:0,
    skipped:0,
    missingMetadata:0,
    referenceIds:[],
    errors:[]
  };
  (entries||[]).forEach(function(entry){
    try{
      if(!entry||typeof entry!=='object'){summary.skipped++;return;}
      var ref=Object.assign({},entry);
      normalizeRefRecord(ref);
      if(!ref.id)ref.id=uid();
      if(!Array.isArray(ref.labels))ref.labels=[];
      if(!ref.wsId)ref.wsId=S.cur;
      if(!ref.title&&!ref.doi&&!((ref.authors||[]).length)){summary.skipped++;return;}
      var existing=lib.find(function(r){return refKey(r)===refKey(ref);});
      var finalRef=existing||ref;
      if(existing){
        mergeRefFields(existing,ref);
        if(existing.pdfData)persistBorrowedPDF(existing);
        summary.duplicates++;
      }else{
        lib.push(ref);
        if(ref.pdfData)persistBorrowedPDF(ref);
        summary.imported++;
      }
      if(finalRef&&finalRef.id&&summary.referenceIds.indexOf(finalRef.id)<0)summary.referenceIds.push(finalRef.id);
      if(__importNeedsMetadataAttention(finalRef))summary.missingMetadata++;
    }catch(e){
      summary.skipped++;
      summary.errors.push(String(e&&e.message?e.message:e));
    }
  });
  var doc=typeof getCurrentDocRecord==='function'?getCurrentDocRecord():null;
  if(doc){
    // External imports should rejoin the generated bibliography pipeline instead
    // of leaving an old manual bibliography snapshot in control.
    doc.bibliographyManual=false;
    if(options.includeInBibliography)markRefsForBibliographyPage(summary.referenceIds);
  }
  save();rLib();rRefs();
  if(options.includeInBibliography&&typeof updateRefSection==='function'){
    updateRefSection(true);
    if(options.revealBibliography&&typeof openBibliographySection==='function'){
      setTimeout(function(){openBibliographySection();},0);
    }
  }else if(typeof scheduleRefSectionSync==='function')scheduleRefSectionSync();
  return summary;
}
function __importSummaryText(prefix,summary){
  var parts=[
    prefix,
    (summary.imported||0)+' eklendi',
    (summary.duplicates||0)+' duplicate',
    (summary.skipped||0)+' atlandi',
    (summary.missingMetadata||0)+' metadata kontrol'
  ];
  if(summary.errors&&summary.errors.length)parts.push('hata: '+summary.errors[0]);
  return parts.join(' | ');
}
function __importFromFileInput(event,options){
  options=options||{};
  var file=event&&event.target&&event.target.files?event.target.files[0]:null;
  if(!file)return;
  var reader=new FileReader();
  reader.onload=function(ev){
    try{
      var text=String(ev&&ev.target&&ev.target.result||'');
      var entries=__importParseByFileName(file.name,text,!!options.allowJson);
      if(!entries.length){setDst('Kaynak bulunamadi.','er');return;}
      var summary=importReferenceEntries(entries,{includeInBibliography:!!options.includeInBibliography,revealBibliography:!!options.revealBibliography});
      setDst(__importSummaryText(options.prefix||'Aktarim',summary),'ok');
      setTimeout(function(){setDst('','');},6500);
    }catch(e){
      setDst((options.prefix||'Aktarim')+' hatasi: '+String(e&&e.message?e.message:e),'er');
    }
  };
  reader.readAsText(file);
  event.target.value='';
}
importBib=function(e){
  __importFromFileInput(e,{allowJson:false,prefix:'Kaynak aktarimi'});
};
function importZotero(e){
  __importFromFileInput(e,{allowJson:true,prefix:'Zotero aktarimi'});
}
function openExternalReferenceImportModal(){
  var status=document.getElementById('externalReferenceImportStatus');
  if(status)status.textContent='';
  showM('externalReferenceImportModal');
  setTimeout(function(){
    var inp=document.getElementById('externalReferenceTextInput');
    if(inp&&typeof inp.focus==='function')inp.focus();
  },40);
}
function importExternalReferenceText(){
  var input=document.getElementById('externalReferenceTextInput');
  var status=document.getElementById('externalReferenceImportStatus');
  var text=String(input&&input.value||'').trim();
  if(!text){if(status)status.textContent='APA kaynak metni bos.';return;}
  var entries=parseApaReferenceText(text);
  if(!entries.length){if(status)status.textContent='Kaynak bulunamadi. Her giris APA 7 kaynakca satiri gibi olmali.';return;}
  var summary=importReferenceEntries(entries,{includeInBibliography:true,revealBibliography:true});
  if(status)status.textContent=__importSummaryText('APA metin',summary);
  if(summary.imported||summary.duplicates){
    if(input)input.value='';
    setDst(__importSummaryText('APA metin',summary),'ok');
  }
}
function importExternalReferenceFile(event){
  __importFromFileInput(event,{allowJson:false,prefix:'Dis kaynak dosyasi',includeInBibliography:true,revealBibliography:true});
  var status=document.getElementById('externalReferenceImportStatus');
  if(status)status.textContent='Dosya islendi. Sonuc ust durum cubugunda gosterildi.';
}
function importExternalReferenceDoi(){
  var input=document.getElementById('externalReferenceDoiInput');
  var status=document.getElementById('externalReferenceImportStatus');
  var raw=String(input&&input.value||'').trim();
  if(!raw){if(status)status.textContent='DOI alani bos.';return;}
  var dois=raw.split(/[\n,;]+/).map(function(part){return normalizeRefDoi(part);}).filter(Boolean);
  dois=dois.filter(function(doi,idx){return dois.indexOf(doi)===idx;});
  if(!dois.length){if(status)status.textContent='Gecerli DOI bulunamadi.';return;}
  if(status)status.textContent='CrossRef sorgulaniyor...';
  Promise.all(dois.map(function(doi){
    return new Promise(function(resolve){
      fetchCR(doi,function(err,ref){resolve(err?null:ref);});
    });
  })).then(function(entries){
    entries=entries.filter(Boolean);
    if(!entries.length){if(status)status.textContent='DOI metadata alinamadi.';return;}
    var summary=importReferenceEntries(entries,{includeInBibliography:true,revealBibliography:true});
    if(status)status.textContent=__importSummaryText('DOI',summary);
    if(input)input.value='';
    setDst(__importSummaryText('DOI',summary),'ok');
  }).catch(function(e){
    if(status)status.textContent='DOI aktarim hatasi: '+String(e&&e.message?e.message:e);
  });
}

// ¦¦ DARK THEME ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function updateThemeButton(){
  var btn=document.getElementById('themebtn');
  if(!btn)return;
  btn.style.display='none';
  btn.disabled=true;
  btn.textContent='Açık';
  btn.title='Koyu tema devre dışı';
}
function toggleTheme(){
  document.documentElement.dataset.theme='';
  if(document.body) document.body.setAttribute('data-theme','');
  updateThemeButton();
  try{localStorage.removeItem('aqTheme');}catch(e){}
}
(function(){
  document.documentElement.dataset.theme='';
  if(document.body) document.body.setAttribute('data-theme','');
  try{localStorage.removeItem('aqTheme');}catch(e){}
  updateThemeButton();
})();

// Otomatik guncelleme kontrolu (baslangicta, sessiz)
function autoCheckUpdate(){
  if(typeof window.electronAPI==='undefined') return;
  setTimeout(function(){
    window.electronAPI.checkUpdate().then(function(res){
      if(res&&res.available){
        setSL('Yeni surum: v'+res.remote,'ld');
        latestUpdateUrl=res.downloadUrl||'';
      }
    }).catch(function(){});
  },5000); // 5 saniye sonra kontrol et
}

// ¦¦ TIPTAP INIT ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function initPdfAnnotBody(body,el){
  if(!body)return;
  body.placeholder='Not yazın...';
  body.spellcheck=true;
  body.readOnly=false;
  body.disabled=false;
  body.tabIndex=0;
  body.style.pointerEvents='auto';
  if(body.tagName==='TEXTAREA'&&!body.rows)body.rows=3;
  body.addEventListener('pointerdown',function(e){e.stopPropagation();});
  body.addEventListener('mousedown',function(e){e.stopPropagation();});
  body.addEventListener('click',function(e){e.stopPropagation();body.focus();});
  body.addEventListener('focus',function(){body.dataset.editing='1';});
  body.addEventListener('blur',function(){
    body.dataset.editing='';
    saveAnnotsToTab();
  });
  body.addEventListener('input',function(){
    body.style.height='auto';
    body.style.height=Math.max(body.scrollHeight,56)+'px';
    if(el)el.style.minHeight=Math.max(body.scrollHeight+12,30)+'px';
    saveAnnotsToTab();
  });
  setTimeout(function(){
    body.style.height='auto';
    body.style.height=Math.max(body.scrollHeight,56)+'px';
    if(el)el.style.minHeight=Math.max(body.scrollHeight+12,30)+'px';
  },0);
}
document.addEventListener('keydown',function(e){
  var active=document.activeElement;
  var annot=active&&active.closest?active.closest('.pdf-annot'):null;
  if(!annot)return;
  var body=annot.querySelector('.pdf-annot-body');
  if(!body||active!==body)return;
  if((e.key==='Delete'||e.key==='Backspace')&&(!body.value.trim()||e.shiftKey)){
    e.preventDefault();
    e.stopImmediatePropagation();
    annot.remove();
    saveAnnotsToTab();
  }
},true);
function buildCitationHTML(refs){
  var style=getCurrentCitationStyle();
  if(window.AQCitationState&&typeof window.AQCitationState.buildCitationHTML==='function'){
    return window.AQCitationState.buildCitationHTML(refs,{
      formatAuthor:fa,
      sortReferences:sortLib,
      dedupeReferences:dedupeRefs,
      citationStyles:window.AQCitationStyles||null,
      styleId:style
    });
  }
  refs=sortLib(dedupeRefs(refs||[]));
  if(!refs.length)return '';
  if(refs.length===1)return '<span class="cit" data-ref="'+refs[0].id+'">'+getInlineCitationText(refs[0])+'</span> ';
  return '<span class="cit" data-ref="'+refs.map(function(r){return r.id;}).join(',')+'">'+visibleCitationText(refs)+'</span> ';
}
function buildNarrativeCitationHTML(refs){
  refs=sortLib(dedupeRefs(refs||[]));
  if(!refs.length)return '';
  if(refs.length===1)return '<span class="cit" data-ref="'+refs[0].id+'">'+getNarrativeCitationText(refs[0])+'</span> ';
  var text=refs.map(function(r){return getNarrativeCitationText(r);}).join('; ');
  return '<span class="cit" data-ref="'+refs.map(function(r){return r.id;}).join(',')+'">'+text+'</span> ';
}
function escJS(str){
  return String(str||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}
function esc(str){
  return escJS(str);
}
function rRefs(){
  var el=document.getElementById('reflist');
  var currentDocId=ensureScopedCurrentDoc();
  if(window.AQBibliographyState&&typeof window.AQBibliographyState.syncReferenceViewsForState==='function'){
    return window.AQBibliographyState.syncReferenceViewsForState({
      state:S,
      currentDocId:currentDocId,
      editor:editor||null,
      host:document.getElementById('apaed'),
      surfaceApi:window.AQTipTapWordSurface||null,
      listEl:el,
      skipBibliography:true,
      citationApi:window.AQTipTapWordCitation||null,
      findReference:function(id){return findRef(id,S.cur);},
      getInlineCitationText:getInlineCitationText,
      formatReference:formatRef,
      escapeJS:escJS,
      dedupeReferences:dedupeRefs,
      sortReferences:sortLib
    });
  }
  var refs=getUsedRefs();
  if(!refs.length){el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:14px;text-align:center;">Metinde atıf yok.</div>';return;}
  el.innerHTML='';
  refs.forEach(function(r,idx){
    var item=document.createElement('div');
    item.className='ri';
    item.setAttribute('data-ref-id',String(r.id||''));
    var cite=document.createElement('div');
    cite.className='ricite';
    cite.textContent=getInlineCitationText(r);
    var full=document.createElement('div');
    full.className='rifull';
    full.innerHTML=formatRef(r,{index:idx+1});
    var actions=document.createElement('div');
    actions.className='riacts';
    var copyBtn=document.createElement('button');
    copyBtn.className='rib';
    copyBtn.textContent='Kopyala';
    copyBtn.addEventListener('click',function(){cpStr(formatRef(r,{index:idx+1}));});
    var pdfBtn=document.createElement('button');
    pdfBtn.className='rib';
    pdfBtn.textContent='PDF';
    pdfBtn.addEventListener('click',function(){openRef(r.id);});
    actions.appendChild(copyBtn);
    actions.appendChild(pdfBtn);
    item.addEventListener('contextmenu',function(e){
      e.preventDefault();
      e.stopPropagation();
      showLabelMenu(e.clientX,e.clientY,r);
    });
    item.appendChild(cite);
    item.appendChild(full);
    item.appendChild(actions);
    el.appendChild(item);
  });
  return refs;
}
function buildTOCHTML(ed,headings){
  if(window.AQTipTapWordTOC&&typeof window.AQTipTapWordTOC.buildTOCHTML==='function'){
    return window.AQTipTapWordTOC.buildTOCHTML(ed,headings,{
      pageTotalHeight:1155,
      idFactory:function(index){return 'hdg-'+index+'-'+uid().slice(-6);}
    });
  }
  var pageTotalH=1155;
  var tocLevelIndent={1:0,2:36,3:72,4:108,5:144};
  var normalizeLevel=function(level){
    var parsed=parseInt(level,10);
    if(!Number.isFinite(parsed))return 1;
    if(parsed<1)return 1;
    if(parsed>5)return 5;
    return parsed;
  };
  var computeLeader=function(text,level){
    var compact=String(text||'').replace(/\s+/g,' ').trim();
    var depthPenalty=(normalizeLevel(level)-1)*6;
    var count=130-Math.min(compact.length,72)-depthPenalty;
    count=Math.max(44,Math.min(170,count));
    var dots='';for(var i=0;i<count;i++)dots+='.';
    return dots;
  };
  var tocHTML='<div class="toc-container" data-aq-toc="1">';
  tocHTML+='<h1 style="text-align:center;font-weight:bold;color:#000;font-family:&quot;Times New Roman&quot;,Times,serif;font-size:12pt;line-height:2;margin:0 0 8px 0;">İçindekiler</h1>';
  var realIdx=0;
  headings.forEach(function(h){
    var level=normalizeLevel(String(h.tagName||'').charAt(1));
    var text=h.textContent.trim();
    if(!text||text==='İçindekiler'||text==='Kaynakça')return;
    if(!h.id)h.id='hdg-'+realIdx+'-'+uid().slice(-6);
    var indent=(Object.prototype.hasOwnProperty.call(tocLevelIndent,level)?tocLevelIndent[level]:0);
    var pageNum=Math.max(1,Math.floor((h.offsetTop||0)/pageTotalH)+1);
    var leader=computeLeader(text,level);
    tocHTML+='<p class="ni toc-entry" style="position:relative;word-break:normal;text-indent:0;padding-left:'+indent+'px;cursor:pointer;margin:0;color:#000;background:transparent;border:none;box-shadow:none;font-family:&quot;Times New Roman&quot;,Times,serif;font-size:12pt;line-height:2;" data-toc-idx="'+realIdx+'" data-heading-idx="'+realIdx+'" data-target-id="'+h.id+'" data-heading-text="'+text.replace(/"/g,'&quot;')+'" data-toc-level="'+level+'"><span class="toc-text-wrap" style="display:block;word-break:normal;overflow-wrap:break-word;padding-right:32px;"><span class="toc-text" style="display:inline;">'+text+'</span></span><span class="toc-dots" style="position:absolute;bottom:0;left:0;right:28px;overflow:hidden;white-space:nowrap;display:none;" aria-hidden="true"></span><span class="toc-page" style="position:absolute;right:0;bottom:0;background:#fff;padding-left:4px;white-space:nowrap;">'+pageNum+'</span></p>';
    realIdx++;
  });
  tocHTML+='</div>';
  return tocHTML;
}
function stripTOCArtifactsFromHTML(html){
  html=String(html||'');
  html=html.replace(/<div\b[^>]*class=(["'])[^"'<>]*\btoc-container\b[^"'<>]*\1[^>]*>[\s\S]*?<\/div>/gi,'');
  html=html.replace(/<p\b[^>]*class=(["'])[^"'<>]*\btoc-entry\b[^"'<>]*\1[^>]*>[\s\S]*?<\/p>/gi,'');
  html=html.replace(/<span\b[^>]*class=(["'])[^"'<>]*\btoc-(?:text|dots|page)\b[^"'<>]*\1[^>]*>[\s\S]*?<\/span>/gi,'');
  return html;
}
function replaceTOCInEditorHTML(tocHTML){
  if(window.AQTipTapWordTOC&&typeof window.AQTipTapWordTOC.replaceTOCInHTML==='function'){
    var nextHTML=window.AQTipTapWordTOC.replaceTOCInHTML(getCurrentEditorHTML(),tocHTML);
    applyCurrentEditorHTML(nextHTML,{syncChrome:true,layout:true});
    return;
  }
  var fullHTML=stripTOCArtifactsFromHTML(getCurrentEditorHTML());
  var div=document.createElement('div');
  div.innerHTML=fullHTML;
  Array.from(div.querySelectorAll('.toc-container,.toc-entry')).forEach(function(node){node.remove();});
  div.insertAdjacentHTML('afterbegin',tocHTML);
  applyCurrentEditorHTML(div.innerHTML,{syncChrome:true,layout:true});
}
function stripLegacyTOCFromEditor(){
  var fullHTML=getCurrentEditorHTML();
  var stripped=stripTOCArtifactsFromHTML(fullHTML);
  if(stripped===fullHTML)return false;
  applyCurrentEditorHTML(stripped||'<p></p>',{syncChrome:true,layout:false});
  return true;
}
function insertTOC(){
  var ed=editor?editor.view.dom:document.getElementById('apaed');
  if(!ed)return;
  stripLegacyTOCFromEditor();
  var headings=ed.querySelectorAll('h1,h2,h3,h4,h5');
  if(!headings.length){alert('Belgede başlık bulunamadı. Önce H1-H5 başlıkları ekleyin.');return;}
  var tocHTML=buildTOCHTML(ed,headings);
  var doc=getCurrentDocRecord();
  if(!doc)return;
  ensureDocAuxFields(doc);
  doc.tocHTML=sanitizeAuxPageHTML(tocHTML);
  syncAuxiliaryPages();
  save();
  var tocPage=document.getElementById('tocpage');
  if(tocPage&&tocPage.style.display!=='none'&&typeof tocPage.scrollIntoView==='function'){
    setTimeout(function(){tocPage.scrollIntoView({behavior:'smooth',block:'start'});},0);
  }
}
function removeTOC(){
  var doc=getCurrentDocRecord();
  if(doc){
    ensureDocAuxFields(doc);
    doc.tocHTML='';
  }
  stripLegacyTOCFromEditor();
  syncAuxiliaryPages();
  save();
}
function autoUpdateTOC(){
  clearTimeout(_tocTimer);
  _tocTimer=setTimeout(function(){
    if(__aqDocSwitching){
      autoUpdateTOC();
      return;
    }
    var doc=getCurrentDocRecord();
    if(!doc)return;
    ensureDocAuxFields(doc);
    if(!String(doc.tocHTML||'').trim())return;
    var ed=editor?editor.view.dom:document.getElementById('apaed');
    if(!ed)return;
    var headings=ed.querySelectorAll('h1,h2,h3,h4,h5');
    if(!headings.length)return;
    var pm=document.querySelector('#apaed .ProseMirror');
    var active=document.activeElement;
    if(pm&&active&&(active===pm||pm.contains(active))){
      autoUpdateTOC();
      return;
    }
    doc.tocHTML=sanitizeAuxPageHTML(buildTOCHTML(ed,headings));
    syncAuxiliaryPages();
    save();
  },1500);
}
function fixTOCDots(container){
  if(!container)return;
  try{
    var tmp=document.createElement('span');
    tmp.style.cssText='position:fixed;visibility:hidden;white-space:nowrap;font-family:"Times New Roman",Times,serif;font-size:12pt;';
    tmp.textContent='..........';
    document.body.appendChild(tmp);
    var dotW=tmp.getBoundingClientRect().width/10||4;
    document.body.removeChild(tmp);
    container.querySelectorAll('.toc-entry').forEach(function(entry){
      var textSpan=entry.querySelector('.toc-text');
      var dotsSpan=entry.querySelector('.toc-dots');
      var pageSpan=entry.querySelector('.toc-page');
      if(!textSpan||!dotsSpan||!pageSpan)return;
      var textRects=textSpan.getClientRects();
      if(!textRects.length)return;
      var lastRect=textRects[textRects.length-1];
      var entryRect=entry.getBoundingClientRect();
      var pageRect=pageSpan.getBoundingClientRect();
      var dotsLeft=lastRect.right-entryRect.left;
      var available=pageRect.left-lastRect.right-4;
      var count=Math.max(3,Math.floor(available/dotW));
      dotsSpan.style.left=dotsLeft+'px';
      dotsSpan.style.display='block';
      dotsSpan.textContent=new Array(count+1).join('.');
    });
  }catch(e){}
}
function scrollToHeading(idx){
  var ed=editor?editor.view.dom:document.getElementById('apaed');
  if(!ed)return;
  var tocBody=document.getElementById('tocbody');
  var entry=(tocBody&&tocBody.querySelector('.toc-entry[data-toc-idx="'+idx+'"]'))||ed.querySelector('.toc-entry[data-toc-idx="'+idx+'"]');
  var headings=Array.from(ed.querySelectorAll('h1,h2,h3,h4,h5')).filter(function(h){
    var tx=(h.textContent||'').trim().toLowerCase();
    return tx&&tx!=='içindekiler'&&tx!=='i·çindekiler'&&tx!=='kaynakça';
  });
  var target=null;
  var headingText=entry&&entry.dataset?entry.dataset.headingText:'';
  if(headingText){
    target=headings.find(function(h){ return (h.textContent||'').trim()===headingText; })||null;
  }
  if(!target){
    var headingIdx=entry&&entry.dataset?parseInt(entry.dataset.headingIdx,10):parseInt(idx,10);
    target=(Number.isFinite(headingIdx)&&headings[headingIdx])?headings[headingIdx]:null;
  }
  if(!target){
    var targetId=entry&&entry.dataset?entry.dataset.targetId:'';
    target=targetId?ed.querySelector('#'+targetId):null;
  }
  if(!target)return;
  var scroll=document.getElementById('escroll');
  if(scroll&&typeof scroll.scrollTo==='function'){
    var sr=scroll.getBoundingClientRect();
    var tr=target.getBoundingClientRect();
    var top=Math.max(0,scroll.scrollTop+(tr.top-sr.top)-36);
    scroll.scrollTo({top:top,behavior:'smooth'});
  }else{
    target.scrollIntoView({behavior:'smooth',block:'center'});
  }
  requestAnimationFrame(function(){
    var tr=target.getBoundingClientRect();
    var fl=document.createElement('div');
    fl.style.cssText='position:fixed;pointer-events:none;z-index:9999;border-radius:2px;transition:opacity .5s;background:rgba(179,131,58,.2);left:'+tr.left+'px;top:'+tr.top+'px;width:'+tr.width+'px;height:'+tr.height+'px;';
    document.body.appendChild(fl);
    setTimeout(function(){fl.style.opacity='0';setTimeout(function(){if(fl.parentNode)fl.parentNode.removeChild(fl);},500);},1000);
  });
}
document.addEventListener('click',function(e){
  if(window.AQTipTapWordTOC&&typeof window.AQTipTapWordTOC.handleDocumentClick==='function'){
    if(window.AQTipTapWordTOC.handleDocumentClick(e,{scrollToHeading:scrollToHeading}))return;
  }
  var target=e.target&&e.target.nodeType===3?e.target.parentElement:e.target;
  var entry=target&&target.closest&&target.closest('.toc-entry');
  if(!entry)return;
  e.preventDefault();
  scrollToHeading(entry.dataset.tocIdx);
});
document.addEventListener('mousedown',function(e){
  var target=e.target&&e.target.nodeType===3?e.target.parentElement:e.target;
  var entry=target&&target.closest&&target.closest('.toc-entry');
  if(!entry)return;
  e.preventDefault();
  scrollToHeading(entry.dataset.tocIdx);
});
function setLabelFilterPanelOpen(next){
  labelFilterPanelOpen=!!next;
  var wrap=document.getElementById('labelToggleWrap');
  var btn=document.getElementById('labelToggleBtn');
  if(wrap)wrap.classList.toggle('open',labelFilterPanelOpen);
  if(btn)btn.setAttribute('aria-expanded',labelFilterPanelOpen?'true':'false');
}
function toggleLabelFilterPanel(force){
  if(typeof force==='boolean')setLabelFilterPanelOpen(force);
  else setLabelFilterPanelOpen(!labelFilterPanelOpen);
}
document.addEventListener('click',function(e){
  if(!labelFilterPanelOpen)return;
  var wrap=document.getElementById('labelToggleWrap');
  if(!wrap)return;
  if(wrap.contains(e.target))return;
  setLabelFilterPanelOpen(false);
});
document.addEventListener('click',function(e){
  var btn=e&&e.target&&e.target.closest?e.target.closest('#relatedToggleBtn'):null;
  if(!btn)return;
  e.preventDefault();
  if(typeof toggleRelatedPanel==='function')toggleRelatedPanel();
});
function currentWorkspaceForCollections(){
  return (S.wss||[]).find(function(ws){return ws&&ws.id===S.cur;})||null;
}
function ensureWorkspaceCollections(ws){
  ws=ws||currentWorkspaceForCollections();
  if(!ws)return [];
  if(!Array.isArray(ws.collections))ws.collections=[];
  ws.collections=ws.collections.map(function(col){
    if(!col||typeof col!=='object')return null;
    return {
      id:String(col.id||uid()),
      name:String(col.name||'Koleksiyon').trim()||'Koleksiyon'
    };
  }).filter(Boolean);
  return ws.collections;
}
function renderCollectionFilter(){
  var sel=document.getElementById('collectionFilterSel');
  if(!sel)return;
  var ws=currentWorkspaceForCollections();
  var collections=ensureWorkspaceCollections(ws);
  var prev=activeCollectionFilter||'all';
  sel.innerHTML='<option value="all">Tüm Koleksiyonlar</option>'+collections.map(function(col){
    return '<option value="'+__escHtml(col.id)+'">'+__escHtml(col.name)+'</option>';
  }).join('');
  if(Array.from(sel.options).some(function(opt){return opt.value===prev;})){
    sel.value=prev;
  }else{
    activeCollectionFilter='all';
    sel.value='all';
  }
}
function setCollectionFilter(value){
  activeCollectionFilter=String(value||'all').trim()||'all';
  renderCollectionFilter();
  rLib();
}
function createCollectionFromInput(){
  var inp=document.getElementById('collectionNameInp');
  var name=String(inp&&inp.value||'').trim();
  if(!name)return;
  var ws=currentWorkspaceForCollections();
  if(!ws)return;
  var collections=ensureWorkspaceCollections(ws);
  if(collections.some(function(col){return col.name.toLowerCase()===name.toLowerCase();})){
    setDst('Bu koleksiyon zaten var.','er');
    return;
  }
  collections.push({id:uid(),name:name});
  if(inp)inp.value='';
  save();
  renderCollectionFilter();
  renderCollectionManager();
  rLib();
}
function renameCollectionById(id){
  var ws=currentWorkspaceForCollections();
  var collections=ensureWorkspaceCollections(ws);
  var col=collections.find(function(item){return String(item.id)===String(id);});
  if(!col)return;
  customPrompt('Koleksiyon adı:',col.name).then(function(next){
    next=String(next||'').trim();
    if(!next)return;
    col.name=next;
    save();
    renderCollectionFilter();
    renderCollectionManager();
    rLib();
  });
}
function deleteCollectionById(id){
  var ws=currentWorkspaceForCollections();
  if(!ws)return;
  var collections=ensureWorkspaceCollections(ws);
  ws.collections=collections.filter(function(item){return String(item.id)!==String(id);});
  (ws.lib||[]).forEach(function(ref){
    if(!Array.isArray(ref.collectionIds))ref.collectionIds=[];
    ref.collectionIds=ref.collectionIds.filter(function(colId){return String(colId)!==String(id);});
  });
  if(activeCollectionFilter===String(id))activeCollectionFilter='all';
  save();
  renderCollectionFilter();
  renderCollectionManager();
  rLib();
}
function toggleReferenceCollection(ref,colId){
  if(!ref||!colId)return;
  if(!Array.isArray(ref.collectionIds))ref.collectionIds=[];
  var idx=ref.collectionIds.findIndex(function(id){return String(id)===String(colId);});
  if(idx>=0)ref.collectionIds.splice(idx,1);
  else ref.collectionIds.push(colId);
  save();
  rLib();
}
function renderCollectionManager(){
  var list=document.getElementById('collectionList');
  if(!list)return;
  var ws=currentWorkspaceForCollections();
  var collections=ensureWorkspaceCollections(ws);
  if(!collections.length){
    list.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:8px 4px;">Henüz koleksiyon yok.</div>';
    return;
  }
  list.innerHTML=collections.map(function(col){
    return '<div class="collection-row">'+
      '<div class="collection-name" title="'+__escHtml(col.name)+'">'+__escHtml(col.name)+'</div>'+
      '<div class="collection-actions">'+
        '<button class="collection-btn" data-col-action="rename" data-col-id="'+__escHtml(col.id)+'">Yeniden Adlandir</button>'+
        '<button class="collection-btn collection-btn-danger" data-col-action="delete" data-col-id="'+__escHtml(col.id)+'">Sil</button>'+
        '</div>'+
    '</div>';
  }).join('');
}
// Override legacy collection renderer with modal-specific minimal row styling.
renderCollectionManager=function(){
  var list=document.getElementById('collectionList');
  if(!list)return;
  var ws=currentWorkspaceForCollections();
  var collections=ensureWorkspaceCollections(ws);
  if(!collections.length){
    list.innerHTML='<div class="collection-empty">Henuz koleksiyon yok.</div>';
    return;
  }
  list.innerHTML=collections.map(function(col){
    return '<div class="collection-row">'+
      '<div class="collection-name" title="'+__escHtml(col.name)+'">'+__escHtml(col.name)+'</div>'+
      '<div class="collection-actions">'+
        '<button class="collection-btn" data-col-action="rename" data-col-id="'+__escHtml(col.id)+'">Yeniden Adlandir</button>'+
        '<button class="collection-btn collection-btn-danger" data-col-action="delete" data-col-id="'+__escHtml(col.id)+'">Sil</button>'+
      '</div>'+
    '</div>';
  }).join('');
};
function openCollectionManager(){
  renderCollectionFilter();
  renderCollectionManager();
  showM('collectionModal');
}
function rLabelFilter(){
  var el=document.getElementById('labelfilt');if(!el)return;
  var customLabels=(S.customLabels||[]).map(function(l){
    if(typeof l==='string')return {name:l,color:'#b6873f'};
    return l;
  }).filter(function(l){return l&&l.name;});
  var allLabels=defaultLabels.concat(customLabels);
  var btnTxt=document.getElementById('labelToggleBtnText');
  if(btnTxt)btnTxt.textContent=activeLabelFilter?('Etiket: '+activeLabelFilter):('Etiketler ('+allLabels.length+')');
  var toggleBtn=document.getElementById('labelToggleBtn');
  if(toggleBtn)toggleBtn.classList.toggle('is-filtered',!!activeLabelFilter);
  el.innerHTML='';
  allLabels.forEach(function(l){
    var isCustom=customLabels.some(function(x){return x.name===l.name;});
    var btn=document.createElement('button');
    btn.className='label-chip'+(activeLabelFilter===l.name?' is-active':'');
    btn.style.setProperty('--chip-color',String(l.color||'#9aa'));
    btn.onclick=function(){activeLabelFilter=activeLabelFilter===l.name?null:l.name;rLabelFilter();rLib();};
    var label=document.createElement('span');
    label.className='label-chip-text';
    label.textContent=l.name;
    btn.appendChild(label);
    if(isCustom){
      var del=document.createElement('span');
      del.className='label-chip-del';
      del.textContent='×';
      del.title='Etiketi sil';
      del.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        if(activeLabelFilter===l.name)activeLabelFilter=null;
        deleteCustomLabel(l.name);
      };
      btn.appendChild(del);
    }
    el.appendChild(btn);
  });
}
document.addEventListener('focusin',function(e){
  var body=e.target&&e.target.closest?e.target.closest('.pdf-annot-body'):null;
  if(body){
    body.dataset.editing='1';
    body.focus();
  }
});
setTimeout(function(){
  ['txtColor','hlColor'].forEach(function(id){
    var inp=document.getElementById(id);
    if(inp)inp.style.cssText+=';width:28px;height:24px;padding:0;border-radius:6px;border:1px solid var(--b);background:var(--bg);';
  });
},0);
setTimeout(function(){
  if(window.AQTipTapWordEvents&&typeof window.AQTipTapWordEvents.watchSurface==='function'){
    window.AQTipTapWordEvents.watchSurface();
  }
},0);
var syncQueued=false;
var suppressDocSave=false;
function sanitizeDocHTML(html){
  if(window.AQDocumentState&&typeof window.AQDocumentState.sanitizeDocHTML==='function'){
    html=window.AQDocumentState.sanitizeDocHTML(html);
  }
  html=String(html||'');
  // Strip shell wrapper divs that may leak into saved content
  try{
    var _s=document.createElement('div');
    _s.innerHTML=html;
    var _pm=_s.querySelector('.ProseMirror');
    if(_pm)html=_pm.innerHTML;
    else{
      var _tc=_s.querySelector('#aq-tiptap-content');
      if(_tc)html=_tc.innerHTML;
      else{
        var _tb=_s.querySelector('#aq-tiptap-body');
        if(_tb)html=_tb.innerHTML;
        else{
          var _ts=_s.querySelector('#aq-tiptap-shell');
          if(_ts)html=_ts.innerHTML;
        }
      }
    }
  }catch(e){}
  html=html.replace(/<div[^>]*class="aq-pe-page[^"]*"[^>]*>/gi,'');
  if(window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.stripLegacyEditorArtifacts==='function'){
    html=window.AQTipTapWordDocument.stripLegacyEditorArtifacts(html);
  }
  if(!(window.AQDocumentState&&typeof window.AQDocumentState.sanitizeDocHTML==='function')){
    html=html.replace(/<hr[^>]*class="find-hl[^"]*"[^>]*\/?>/gi,'');
    html=html.replace(/<mark[^>]*class="find-hl[^"]*"[^>]*>([\s\S]*?)<\/mark>/gi,'$1');
    html=html.replace(/<button[^>]*class="toc-delete"[^>]*>[\s\S]*?<\/button>/gi,'');
    html=html.replace(/<div[^>]*class="img-toolbar"[^>]*>[\s\S]*?<\/div>/gi,'');
    html=html.replace(/<div[^>]*class="img-resize-handle"[^>]*>[\s\S]*?<\/div>/gi,'');
    html=html.replace(/<p><\/p>/gi,'<p></p>');
  }
  html=html.replace(/<\/div>\s*(?=(?:<div[^>]*class="aq-pe-page)|$)/gi,'');
  // Strip scroll-flash class and any persisted background from paragraphs/headings
  try{
    var _tmp=document.createElement('div');
    _tmp.innerHTML=html;
    _tmp.querySelectorAll('p,h1,h2,h3,h4,h5,h6').forEach(function(el){
      el.classList.remove('aq-scroll-flash');
      if(el.style.background)el.style.background='';
      if(el.style.backgroundColor)el.style.backgroundColor='';
      if(el.getAttribute('style')==='')el.removeAttribute('style');
    });
    html=_tmp.innerHTML;
  }catch(e){}
  return html.trim()||'<p></p>';
}
function getCurrentEditorHTML(){
  if(window.AQTipTapWordBridge&&typeof window.AQTipTapWordBridge.getCurrentEditorHTML==='function'){
    return window.AQTipTapWordBridge.getCurrentEditorHTML({
      contentApi:window.AQTipTapWordContent||null,
      documentApi:window.AQTipTapWordDocument||null,
      editor:editor||null,
      shell:window.AQTipTapShell||null,
      host:document.getElementById('apaed')
    });
  }
  if(editor&&typeof editor.getHTML==='function')return editor.getHTML();
  if(window.AQTipTapShell&&typeof window.AQTipTapShell.getHTML==='function'){
    return window.AQTipTapShell.getHTML();
  }
  // Fallback: extract content from innermost ProseMirror/tiptap-content, strip shell wrappers
  var ed=document.getElementById('apaed');
  if(!ed)return '<p></p>';
  var pm=ed.querySelector('.ProseMirror');
  if(pm)return pm.innerHTML||'<p></p>';
  var tc=ed.querySelector('#aq-tiptap-content');
  if(tc)return tc.innerHTML||'<p></p>';
  var tb=ed.querySelector('#aq-tiptap-body');
  if(tb)return tb.innerHTML||'<p></p>';
  var ts=ed.querySelector('#aq-tiptap-shell');
  if(ts)return ts.innerHTML||'<p></p>';
  return ed.innerHTML||'<p></p>';
}
function setCurrentEditorHTML(html){
  if(window.AQTipTapWordBridge&&typeof window.AQTipTapWordBridge.setCurrentEditorHTML==='function'){
    if(window.AQTipTapWordBridge.setCurrentEditorHTML({
      contentApi:window.AQTipTapWordContent||null,
      documentApi:window.AQTipTapWordDocument||null,
      editor:editor||null,
      shell:window.AQTipTapShell||null,
      host:document.getElementById('apaed'),
      html:html||'<p></p>'
    })) return;
  }
  if(editor&&editor.commands&&typeof editor.commands.setContent==='function'){
    editor.commands.setContent(html||'<p></p>');
    return;
  }
  if(window.AQTipTapShell&&typeof window.AQTipTapShell.setHTML==='function'){
    window.AQTipTapShell.setHTML(html||'<p></p>');
    return;
  }
  var ed=document.getElementById('apaed');
  if(ed)ed.innerHTML=html||'<p></p>';
}
function runEditorMutationEffects(opts){
  opts=opts||{};
  if(window.AQTipTapWordBridge&&typeof window.AQTipTapWordBridge.runEditorMutationEffects==='function'){
    if(window.AQTipTapWordBridge.runEditorMutationEffects({
      contentApi:window.AQTipTapWordContent||null,
      runtimeApi:window.AQEditorRuntime||null,
      target:opts.target||null,
      normalize:opts.normalize!==false,
      layout:opts.layout!==false,
      syncChrome:!!opts.syncChrome,
      syncTOC:!!opts.syncTOC,
      syncRefs:!!opts.syncRefs,
      refreshTrigger:!!opts.refreshTrigger,
      onApplied:typeof opts.onApplied==='function'?opts.onApplied:null,
      afterLayout:typeof opts.afterLayout==='function'?opts.afterLayout:null,
      normalizeCitationSpans:normalizeCitationSpans,
      updatePageHeight:updatePageHeight,
      syncStatus:typeof uSt==='function'?uSt:null,
      save:typeof save==='function'?save:null,
      syncTOCNow:typeof autoUpdateTOC==='function'?autoUpdateTOC:null,
      syncRefsNow:typeof scheduleRefSectionSync==='function'?scheduleRefSectionSync:null,
      refreshTriggerNow:typeof checkTrig==='function'?function(){setTimeout(checkTrig,0);}:null
    })){
      scheduleTrackReviewBarUpdate();
      return true;
    }
  }
  if(window.AQEditorRuntime&&typeof window.AQEditorRuntime.runContentApplyEffects==='function'){
    window.AQEditorRuntime.runContentApplyEffects({
      target:opts.target||null,
      normalize:!!opts.normalize,
      layout:opts.layout!==false,
      syncChrome:!!opts.syncChrome,
      syncTOC:!!opts.syncTOC,
      syncRefs:!!opts.syncRefs,
      refreshTrigger:!!opts.refreshTrigger,
      onApplied:typeof opts.onApplied==='function'?opts.onApplied:null,
      afterLayout:typeof opts.afterLayout==='function'?opts.afterLayout:null
    });
    scheduleTrackReviewBarUpdate();
    return true;
  }
  if(opts.normalize&&typeof normalizeCitationSpans==='function')normalizeCitationSpans(opts.target);
  if(opts.layout!==false&&typeof updatePageHeight==='function')updatePageHeight();
  if(opts.syncChrome){
    if(typeof uSt==='function')uSt();
    if(typeof save==='function')save();
  }
  if(opts.syncTOC&&typeof autoUpdateTOC==='function')autoUpdateTOC();
  if(opts.syncRefs&&typeof scheduleRefSectionSync==='function')scheduleRefSectionSync();
  if(opts.refreshTrigger&&typeof checkTrig==='function')setTimeout(checkTrig,0);
  if(typeof opts.onApplied==='function')opts.onApplied();
  if(typeof opts.afterLayout==='function')opts.afterLayout();
  scheduleTrackReviewBarUpdate();
  return true;
}
function applyCurrentEditorHTML(html,opts){
  opts=opts||{};
  if(window.AQTipTapWordBridge&&typeof window.AQTipTapWordBridge.applyCurrentEditorHTML==='function'){
    if(window.AQTipTapWordBridge.applyCurrentEditorHTML({
      contentApi:window.AQTipTapWordContent||null,
      documentApi:window.AQTipTapWordDocument||null,
      runtimeApi:window.AQEditorRuntime||null,
      editor:editor||null,
      shell:window.AQTipTapShell||null,
      host:document.getElementById('apaed'),
      html:html||'<p></p>',
      normalizeCitationSpans:normalizeCitationSpans,
      updatePageHeight:updatePageHeight,
      normalize:opts.normalize!==false,
      layout:opts.layout!==false,
      syncChrome:!!opts.syncChrome,
      syncTOC:!!opts.syncTOC,
      syncRefs:!!opts.syncRefs,
      refreshTrigger:!!opts.refreshTrigger,
      onApplied:typeof opts.onApplied==='function'?opts.onApplied:null,
      afterLayout:typeof opts.afterLayout==='function'?opts.afterLayout:null,
      syncStatus:typeof uSt==='function'?uSt:null,
      save:typeof save==='function'?save:null,
      syncTOCNow:typeof autoUpdateTOC==='function'?autoUpdateTOC:null,
      syncRefsNow:typeof scheduleRefSectionSync==='function'?scheduleRefSectionSync:null,
      refreshTriggerNow:typeof checkTrig==='function'?function(){setTimeout(checkTrig,0);}:null
    })) return;
  }
  var nextHTML=html||'<p></p>';
  var onApplied=typeof opts.onApplied==='function'?opts.onApplied:null;
  var afterLayout=typeof opts.afterLayout==='function'?opts.afterLayout:null;
  if(editor&&editor.commands&&typeof editor.commands.setContent==='function'){
    editor.commands.setContent(nextHTML,false);
    runEditorMutationEffects({
      target:editor&&editor.view?editor.view.dom:null,
      normalize:opts.normalize!==false,
      layout:opts.layout!==false,
      syncChrome:!!opts.syncChrome,
      syncTOC:!!opts.syncTOC,
      syncRefs:!!opts.syncRefs,
      refreshTrigger:!!opts.refreshTrigger,
      onApplied:onApplied,
      afterLayout:afterLayout
    });
    return;
  }
  setCurrentEditorHTML(nextHTML);
  runEditorMutationEffects({
    normalize:false,
    layout:opts.layout!==false,
    syncChrome:!!opts.syncChrome,
    syncTOC:!!opts.syncTOC,
    syncRefs:!!opts.syncRefs,
    refreshTrigger:!!opts.refreshTrigger,
    onApplied:onApplied,
    afterLayout:afterLayout
  });
}
function flushCurrentDocFromEditor(){
  if(!S.docs||!S.curDoc)return '<p></p>';
  var html=getCurrentEditorHTML();
  if(window.AQDocumentState&&typeof window.AQDocumentState.commitActiveDoc==='function'){
    html=window.AQDocumentState.commitActiveDoc(S,html,{sanitize:sanitizeDocHTML});
  }else{
    html=sanitizeDocHTML(html);
    S.doc=html;
    var cur=S.docs.find(function(d){return d.id===S.curDoc;});
    if(cur)cur.content=html;
  }
  return html;
}
function ensureEditableRoot(){
  if(window.AQTipTapWordBridge&&typeof window.AQTipTapWordBridge.ensureEditableRoot==='function'){
    if(window.AQTipTapWordBridge.ensureEditableRoot({
      documentApi:window.AQTipTapWordDocument||null,
      editor:editor||null,
      sanitizeHTML:sanitizeDocHTML
    })) return;
  }
  if(!editor)return;
  var html=sanitizeDocHTML(editor.getHTML()||'').trim();
  var emptyHTML=html
    .replace(/<p>\s*(<br\s*\/?>|\u00a0|&nbsp;|\s)*<\/p>/gi,'')
    .replace(/<blockquote>\s*(<br\s*\/?>|\u00a0|&nbsp;|\s)*<\/blockquote>/gi,'')
    .replace(/<[^>]+>/g,'')
    .replace(/\s+/g,'');
  if(!html||html==='<p></p>'||!emptyHTML){
    editor.commands.setContent('<p></p>',false);
  }
}
var pendingRefSectionSync=false;
var refSectionSyncTimer=null;
function scheduleRefSectionSync(){
  clearTimeout(refSectionSyncTimer);
  pendingRefSectionSync=true;
  refSectionSyncTimer=setTimeout(function(){
    if(!pendingRefSectionSync)return;
    pendingRefSectionSync=false;
    updateRefSection();
  },300);
}
function focusEditorSurface(toEnd){
  if(window.AQTipTapWordFocus&&typeof window.AQTipTapWordFocus.focusWithFallback==='function'){
    if(window.AQTipTapWordFocus.focusWithFallback({
      editor:editor||null,
      toEnd:!!toEnd,
      getScrollEl:function(){
        return (window.AQEditorIntegration&&typeof window.AQEditorIntegration.getScrollEl==='function')
          ? window.AQEditorIntegration.getScrollEl()
          : document.getElementById('escroll');
      },
      ensureEditableRoot:ensureEditableRoot,
      sanitizeHTML:sanitizeDocHTML,
      getHTML:function(){ return editor&&typeof editor.getHTML==='function' ? editor.getHTML() : ''; }
    })) return;
  }
}
function cpCite(id){
  if(window.AQTipTapWordCitation&&typeof window.AQTipTapWordCitation.copyNoteCitation==='function'){
    window.AQTipTapWordCitation.copyNoteCitation(id,{
      notes:S.notes||[],
      findReference:function(rid){return findRef(rid,S.cur);},
      getInlineCitationText:getInlineCitationText,
      copyText:cpStr
    });
  }
}
function cleanupSlashRArtifacts(root){
  if(window.AQTipTapWordCitation&&typeof window.AQTipTapWordCitation.cleanupEditorArtifacts==='function'){
    if(window.AQTipTapWordCitation.cleanupEditorArtifacts({
      editor:editor||null,
      host:document.getElementById('apaed'),
      root:root||(editor?editor.view.dom:document.getElementById('apaed')),
      domState:window.AQCitationDOMState||null,
      onChanged:function(){setTimeout(function(){normalizeCitationSpans();},0);}
    }))return;
  }
  root=root||(editor?editor.view.dom:document.getElementById('apaed'));
  if(root&&window.AQCitationDOMState&&typeof window.AQCitationDOMState.cleanupSlashRTextNodes==='function')window.AQCitationDOMState.cleanupSlashRTextNodes(root);
}
function visibleCitationText(refs,options){
  options=options||{};
  var style=getCurrentCitationStyle();
  if(window.AQCitationStyles&&typeof window.AQCitationStyles.visibleCitationText==='function'){
    return window.AQCitationStyles.visibleCitationText(refs,{style:style});
  }
  if(window.AQTipTapWordCitation&&typeof window.AQTipTapWordCitation.visibleCitationText==='function'){
    return window.AQTipTapWordCitation.visibleCitationText(refs,{
      citationState:window.AQCitationState||null,
      getInlineCitationText:getInlineCitationText,
      formatAuthor:fa,
      dedupeReferences:dedupeRefs,
      sortReferences:sortLib,
      options:options
    });
  }
  return '';
}
function normalizeCitationSpans(root){
  if(window.AQTipTapWordCitation&&typeof window.AQTipTapWordCitation.syncEditorCitationSpans==='function'){
    if(window.AQTipTapWordCitation.syncEditorCitationSpans({
      editor:editor||null,
      host:document.getElementById('apaed'),
      root:root||null,
      domState:window.AQCitationDOMState||null,
      findReference:function(id){return findRef(id,S.cur);},
      dedupeReferences:dedupeRefs,
      visibleCitationText:visibleCitationText
    }))return;
  }
  root=root||(editor?editor.view.dom:document.getElementById('apaed'));
  if(root&&window.AQCitationDOMState&&typeof window.AQCitationDOMState.normalizeCitationSpans==='function'){
    window.AQCitationDOMState.normalizeCitationSpans(root,{
      findReference:function(id){return findRef(id,S.cur);},
      dedupeReferences:dedupeRefs,
      visibleCitationText:visibleCitationText
    });
  }
}
function insRefs(){
  var currentDocId=ensureScopedCurrentDoc();
  if(window.AQBibliographyState&&typeof window.AQBibliographyState.openBibliographySectionForState==='function'){
    if(window.AQBibliographyState.openBibliographySectionForState({
      state:S,
      currentDocId:currentDocId,
      editor:editor||null,
      host:document.getElementById('apaed'),
      surfaceApi:window.AQTipTapWordSurface||null,
      listEl:document.getElementById('reflist'),
      pageEl:document.getElementById('bibpage'),
      bodyEl:document.getElementById('bibbody'),
      citationApi:window.AQTipTapWordCitation||null,
      findReference:function(id){return findRef(id,S.cur);},
      getInlineCitationText:getInlineCitationText,
      formatReference:formatRef,
      escapeJS:esc,
      dedupeReferences:dedupeRefs,
      sortReferences:sortLib,
      getExtraReferences:getBibliographyExtraRefs,
      formatRef:formatRef,
      bindSurface:bindBibliographySurface,
      defer:function(fn){setTimeout(fn,0);}
    })) return;
  }
  refreshBibliographyManual();
  var bibPage=document.getElementById('bibpage');
  if(bibPage&&typeof bibPage.scrollIntoView==='function'){
    setTimeout(function(){bibPage.scrollIntoView({behavior:'smooth',block:'start'});},0);
  }
}
function sanitizeAuxPageHTML(html){
  var holder=document.createElement('div');
  holder.innerHTML=String(html||'');
  holder.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv]').forEach(function(node){node.remove();});
  holder.querySelectorAll('*').forEach(function(node){
    Array.from(node.attributes||[]).forEach(function(attr){
      var name=String(attr.name||'').toLowerCase();
      var value=String(attr.value||'');
      if(/^on/i.test(name)){node.removeAttribute(attr.name);return;}
      if((name==='href'||name==='src'||name==='xlink:href'||name==='formaction')&&/^\s*javascript:/i.test(value)){
        node.removeAttribute(attr.name);
        return;
      }
      if(name==='style'&&/(expression\s*\(|javascript:|url\s*\(\s*['"]?\s*javascript:)/i.test(value)){
        node.removeAttribute(attr.name);
      }
    });
  });
  return holder.innerHTML.trim();
}
function ensureDocAuxFields(doc){
  if(!doc||typeof doc!=='object')return null;
  if(typeof doc.coverHTML!=='string')doc.coverHTML='';
  if(typeof doc.tocHTML!=='string')doc.tocHTML='';
  if(!Array.isArray(doc.bibliographyExtraRefIds))doc.bibliographyExtraRefIds=[];
  else doc.bibliographyExtraRefIds=doc.bibliographyExtraRefIds.map(function(id){return String(id||'').trim();}).filter(Boolean);
  doc.trackChangesEnabled=!!doc.trackChangesEnabled;
  if(typeof doc.citationStyle!=='string'||!doc.citationStyle.trim()){
    doc.citationStyle='apa7';
  }else if(window.AQCitationStyles&&typeof window.AQCitationStyles.normalizeStyleId==='function'){
    doc.citationStyle=window.AQCitationStyles.normalizeStyleId(doc.citationStyle);
  }
  return doc;
}
function applyCurrentDocTrackChangesMode(options){
  options=options||{};
  var currentDoc=ensureDocAuxFields(getCurrentDocRecord());
  var enabled=!!(currentDoc&&currentDoc.trackChangesEnabled);
  setTrackChangesMode(enabled,{
    source:options.source||'doc-sync',
    persistDoc:false,
    saveState:false,
    silent:options.silent!==false
  });
  return enabled;
}
function syncAuxiliaryPages(){
  var doc=ensureDocAuxFields(getCurrentDocRecord());
  var coverPage=document.getElementById('coverpage');
  var coverBody=document.getElementById('coverbody');
  var tocPage=document.getElementById('tocpage');
  var tocBody=document.getElementById('tocbody');
  var coverHTML=doc?String(doc.coverHTML||'').trim():'';
  var tocHTML=doc?String(doc.tocHTML||'').trim():'';
  var hasDocHeadings=doc?/<h[1-5]\b/i.test(String(doc.content||'')):false;
  if(doc&&tocHTML&&!hasDocHeadings){
    doc.tocHTML='';
    tocHTML='';
  }
  if(coverBody)coverBody.innerHTML=coverHTML||'';
  if(coverPage)coverPage.style.display=coverHTML?'block':'none';
  if(tocBody){tocBody.innerHTML=tocHTML||'';if(tocHTML)setTimeout(function(){fixTOCDots(tocBody);},0);}
  if(tocPage)tocPage.style.display=tocHTML?'block':'none';
}
function getCurrentWorkspaceRecord(){
  return (S.wss||[]).find(function(ws){return ws&&ws.id===S.cur;})||null;
}
function getScopedCurrentDocId(){
  var ws=getCurrentWorkspaceRecord();
  if(ws&&ws.docId)return ws.docId;
  return S.curDoc||'';
}
function ensureScopedCurrentDoc(){
  var scopedDocId=getScopedCurrentDocId();
  if(scopedDocId&&S.curDoc!==scopedDocId)S.curDoc=scopedDocId;
  return S.curDoc||scopedDocId||'';
}
function getCurrentDocRecord(){
  var currentDocId=ensureScopedCurrentDoc();
  if(window.AQBibliographyState&&typeof window.AQBibliographyState.getCurrentDocumentFromState==='function'){
    return ensureDocAuxFields(window.AQBibliographyState.getCurrentDocumentFromState(S,currentDocId));
  }
  if(window.AQBibliographyState&&typeof window.AQBibliographyState.getCurrentDocument==='function'){
    return ensureDocAuxFields(window.AQBibliographyState.getCurrentDocument(S.docs||[],currentDocId));
  }
  return ensureDocAuxFields((S.docs||[]).find(function(doc){return doc&&doc.id===currentDocId;})||null);
}
function bindBibliographySurface(){
  var currentDocId=ensureScopedCurrentDoc();
  if(window.AQBibliographyState&&typeof window.AQBibliographyState.bindBibliographySurfaceForState==='function'){
    if(window.AQBibliographyState.bindBibliographySurfaceForState({
      state:S,
      currentDocId:currentDocId,
      bodyEl:document.getElementById('bibbody'),
      onChange:function(){save();},
      onReferenceClick:function(refId){
        if(window.AQBibliographyState&&typeof window.AQBibliographyState.jumpToCitationForRef==='function'){
          window.AQBibliographyState.jumpToCitationForRef(refId,{
            root:document.getElementById('apaed'),
            editorRoot:document.getElementById('apaed'),
            doc:getCurrentDocRecord(),
            behavior:'smooth',
            block:'center'
          });
        }
      }
    })) return;
  }
  if(window.AQBibliographyState&&typeof window.AQBibliographyState.bindBibliographySurface==='function'){
    if(window.AQBibliographyState.bindBibliographySurface({
      bodyEl:document.getElementById('bibbody'),
      getCurrentDocument:getCurrentDocRecord,
      onChange:function(){save();},
      onReferenceClick:function(refId){
        if(window.AQBibliographyState&&typeof window.AQBibliographyState.jumpToCitationForRef==='function'){
          window.AQBibliographyState.jumpToCitationForRef(refId,{
            root:document.getElementById('apaed'),
            editorRoot:document.getElementById('apaed'),
            doc:getCurrentDocRecord(),
            behavior:'smooth',
            block:'center'
          });
        }
      }
    })) return;
  }
  var bibBody=document.getElementById('bibbody');
  if(!bibBody||bibBody.__aqBound)return;
  bibBody.__aqBound=true;
  bibBody.setAttribute('contenteditable','true');
  bibBody.setAttribute('spellcheck','true');
  bibBody.addEventListener('input',function(){
    var doc=getCurrentDocRecord();
    if(!doc)return;
    doc.bibliographyHTML=bibBody.innerHTML;
    doc.bibliographyManual=!!String(bibBody.textContent||'').trim();
    save();
  });
  bibBody.addEventListener('click',function(event){
    var target=event&&event.target?event.target:null;
    if(target&&target.nodeType===3)target=target.parentElement;
    var entry=target&&target.closest?target.closest('.refe[data-ref-id]'):null;
    if(!entry)return;
    if(event&&typeof event.preventDefault==='function')event.preventDefault();
    if(event&&typeof event.stopPropagation==='function')event.stopPropagation();
    if(window.AQBibliographyState&&typeof window.AQBibliographyState.jumpToCitationForRef==='function'){
      window.AQBibliographyState.jumpToCitationForRef(entry.getAttribute('data-ref-id')||'',{
        root:document.getElementById('apaed'),
        editorRoot:document.getElementById('apaed'),
        doc:getCurrentDocRecord(),
        behavior:'smooth',
        block:'center'
      });
    }
  });
}
function resetBibliographyManual(){
  var currentDocId=ensureScopedCurrentDoc();
  if(window.AQBibliographyState&&typeof window.AQBibliographyState.resetManualBibliographyForState==='function'){
    window.AQBibliographyState.resetManualBibliographyForState(S,currentDocId);
  }else{
    var doc=getCurrentDocRecord();
    if(window.AQBibliographyState&&typeof window.AQBibliographyState.resetManualBibliography==='function'){
      window.AQBibliographyState.resetManualBibliography(doc);
    }else if(doc){
      doc.bibliographyHTML='';
      doc.bibliographyManual=false;
    }
  }
  refreshBibliographyManual();
}
function refreshBibliographyManual(){
  var currentDocId=ensureScopedCurrentDoc();
  if(window.AQBibliographyState&&typeof window.AQBibliographyState.refreshManualBibliographyForState==='function'){
    if(window.AQBibliographyState.refreshManualBibliographyForState({
      state:S,
      currentDocId:currentDocId,
      editor:editor||null,
      host:document.getElementById('apaed'),
      surfaceApi:window.AQTipTapWordSurface||null,
      listEl:document.getElementById('reflist'),
      pageEl:document.getElementById('bibpage'),
      bodyEl:document.getElementById('bibbody'),
      citationApi:window.AQTipTapWordCitation||null,
      findReference:function(id){return findRef(id,S.cur);},
      getInlineCitationText:getInlineCitationText,
      formatReference:formatRef,
      escapeJS:esc,
      dedupeReferences:dedupeRefs,
      sortReferences:sortLib,
      getExtraReferences:getBibliographyExtraRefs,
      formatRef:formatRef,
      bindSurface:bindBibliographySurface
    })) return;
  }
  updateRefSection(true);
}
function iHTML(html){
  if(window.AQTipTapWordContent&&typeof window.AQTipTapWordContent.insertEditorHTMLWithBridge==='function'){
    window.AQTipTapWordContent.insertEditorHTMLWithBridge({
      editor:editor||null,
      html:html,
      host:document.getElementById('apaed'),
      bridgeApi:window.AQTipTapWordBridge||null,
      documentApi:window.AQTipTapWordDocument||null,
      runtimeApi:window.AQEditorRuntime||null,
      sanitizeHTML:sanitizeDocHTML,
      getSavedRange:function(){ return editorSavedRange; },
      setSavedRange:function(v){ editorSavedRange=v; }
    });
    return;
  }
  if(window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.insertHTML==='function'){
    window.AQTipTapWordDocument.insertHTML({
      editor:editor||null,
      html:html,
      host:document.getElementById('apaed'),
      savedRangeRef:{
        get current(){ return editorSavedRange; },
        set current(v){ editorSavedRange=v; }
      },
      beforeEditorInsert:function(){
        ensureEditableRoot();
      },
      afterEditorInsert:function(){
        afterInsert(editor&&editor.view?editor.view.dom:null);
      },
      afterDomInsert:function(ed){
        afterInsert(ed);
      }
    });
    return;
  }
}
function applyTemplate(type){
  if(window.AQTipTapWordContent&&typeof window.AQTipTapWordContent.applyTemplateByTypeWithBridge==='function'){
    if(window.AQTipTapWordContent.applyTemplateByTypeWithBridge({
      type:type,
      confirmFn:confirm,
      editor:editor||null,
      bridgeApi:window.AQTipTapWordBridge||null,
      documentApi:window.AQTipTapWordDocument||null,
      sanitizeHTML:sanitizeDocHTML,
      focusEditorSurface:focusEditorSurface
    })) return;
  }
  if(!confirm('Mevcut belge içeriği silinecek. Devam etmek istiyor musunuz?'))return;
  var html=window.AQTipTapWordTemplates&&typeof window.AQTipTapWordTemplates.getTemplate==='function'
    ? window.AQTipTapWordTemplates.getTemplate(type)
    : '';
  if(!html)return;
  if(window.AQTipTapWordContent&&typeof window.AQTipTapWordContent.applyTemplate==='function'){
    window.AQTipTapWordContent.applyTemplate({
      editor:editor||null,
      html:html,
      setCurrentEditorHTML:setCurrentEditorHTML,
      ensureEditableRoot:ensureEditableRoot,
      normalizeCitationSpans:normalizeCitationSpans,
      updatePageHeight:updatePageHeight,
      focusEditorSurface:focusEditorSurface
    });
    return;
  }
}
function initTipTapEditor(){
  if(window.AQTipTapWordInit&&typeof window.AQTipTapWordInit.init==='function'){
    editor=window.AQTipTapWordInit.init();
    return;
  }
  console.warn('TipTap word init module missing');
}

function __refreshUIAfterBrowserCapture(detail){
  var info=detail&&typeof detail==='object'?detail:{};
  return syncLoad().then(function(){
    rWS();rNB();rLib();renderRelatedPapers();rNotes();rRefs();applyCurrentDocTrackChangesMode({source:'capture-refresh'});uSt();rDocTabs();
    if(info.focusWorkspace&&info.workspaceId){
      try{switchWs(String(info.workspaceId));}catch(_e){}
    }
    setTimeout(function(){
      try{rNotes();}catch(_e){}
    },120);
  }).catch(function(e){
    logStability('browserCapture.stateChanged',e,info);
  });
}

// ¦¦ INIT ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
syncLoad().then(function(){
  window.__aqLegacyRuntimePhase='post-syncLoad';
  resetTransientChrome();
  __bindLibraryContextMenuGlobal();
  rWS();rNB();rLib();renderRelatedPapers();rNotes();rRefs();applyCurrentDocTrackChangesMode({source:'init-load'});uSt();rDocTabs();
  setTimeout(function(){
    try{rNotes();}catch(_e){}
  },120);
  enhanceMenus();
  enhanceToolbar();
  normalizeToolbarMenuButtonLabels();
  // Initialize TipTap editor after content is loaded
  if(window.AQEditorLifecycle && typeof window.AQEditorLifecycle.bootstrap === 'function'){
    window.AQEditorLifecycle.bootstrap({
      initFn:initTipTapEditor,
      delay:60,
      getHTML:function(){
        var cur=(S.docs||[]).find(function(d){return d.id===S.curDoc;});
        return cur&&cur.content?cur.content:(S.doc||'<p></p>');
      },
      applyDocument:function(html){
        if(typeof __aqSetEditorDoc==='function') __aqSetEditorDoc(html,false);
      }
    });
  }else{
    if(window.AQEditorLifecycle && typeof window.AQEditorLifecycle.initTipTap === 'function') window.AQEditorLifecycle.initTipTap();
    else initTipTapEditor();
  }
  // Electron: uygulama bilgisi
  if(typeof window.electronAPI!=='undefined'){
    window.electronAPI.getAppInfo().then(function(info){
      lastAppInfoSnapshot=info||null;
      renderDataSafetySummary(info);
      setSL('Yerel','ok');
      setTimeout(function(){setSL('','');},3000);
    }).catch(function(){});
    if(typeof window.electronAPI.onBrowserCaptureStateChanged==='function'){
      window.electronAPI.onBrowserCaptureStateChanged(function(detail){
        __refreshUIAfterBrowserCapture(detail||{});
      });
    }
  }
  setTimeout(normalizeToolbarMenuButtonLabels,120);
  setTimeout(normalizeToolbarMenuButtonLabels,800);
  setTimeout(resetTransientChrome,120);
  window.__aqLegacyRuntimePhase='ready';
});
setInterval(function(){if(syncDirty){syncDirty=false;syncSave();}},10000);
window.addEventListener('beforeunload',function(){
  try{
    flushCurrentDocFromEditor();
    syncDirty=true;
    syncSave();
  }catch(e){}
});
window.addEventListener('pagehide',function(){
  try{
    flushCurrentDocFromEditor();
    syncDirty=true;
    syncSave();
  }catch(e){}
});
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState!=='hidden')return;
  try{
    flushCurrentDocFromEditor();
    syncDirty=true;
    syncSave();
  }catch(e){}
});
autoCheckUpdate();
// ¦¦ ZEN MODE ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function toggleZenMode(){
  if(window.AQTipTapWordChrome&&typeof window.AQTipTapWordChrome.toggleZenMode==='function'){
    window.AQTipTapWordChrome.toggleZenMode({
      body:document.body,
      toolbar:document.getElementById('zentb'),
      focusEditor:function(){
        if(editor){editor.commands.focus('end');}else{document.getElementById('apaed').focus();}
      },
      onTick:updateZenTime,
      bindMouseTracking:function(){ document.addEventListener('mousemove',zenMouseMove); },
      unbindMouseTracking:function(){ document.removeEventListener('mousemove',zenMouseMove); }
    });
    return;
  }
}
function zenMouseMove(){
  if(window.AQTipTapWordChrome&&typeof window.AQTipTapWordChrome.handleZenMouseMove==='function'){
    window.AQTipTapWordChrome.handleZenMouseMove({
      toolbar:document.getElementById('zentb'),
      hideDelay:3000
    });
    return;
  }
}
function updateZenTime(){
  if(window.AQTipTapWordChrome&&typeof window.AQTipTapWordChrome.updateZenTime==='function'){
    if(window.AQTipTapWordChrome.updateZenTime({
      timeEl:document.getElementById('zentime'),
      wordsEl:document.getElementById('zenwords'),
      getWordCount:function(){
        var txt=editor?editor.getText():(document.getElementById('apaed').innerText||'');
        return String(txt||'').trim().split(/\s+/).filter(function(x){return x.length>0;}).length;
      }
    })) return;
  }
}
function updateRefSection(forceAuto){
  var bibPage=document.getElementById('bibpage');
  var bibBody=document.getElementById('bibbody');
  if(__aqDocSwitching){
    scheduleRefSectionSync();
    return;
  }
  var currentDocId=ensureScopedCurrentDoc();
  if(!bibPage||!bibBody)return;
  if(window.AQBibliographyState&&typeof window.AQBibliographyState.syncReferenceViewsForState==='function'){
    if(window.AQBibliographyState.syncReferenceViewsForState({
      state:S,
      currentDocId:currentDocId,
      editor:editor||null,
      host:document.getElementById('apaed'),
      surfaceApi:window.AQTipTapWordSurface||null,
      listEl:document.getElementById('reflist'),
      pageEl:bibPage,
      bodyEl:bibBody,
      forceAuto:!!forceAuto,
      citationApi:window.AQTipTapWordCitation||null,
      findReference:function(id){return findRef(id,S.cur);},
      getInlineCitationText:getInlineCitationText,
      formatReference:formatRef,
      escapeJS:escJS,
      dedupeReferences:dedupeRefs,
      sortReferences:sortLib,
      getExtraReferences:getBibliographyExtraRefs,
      formatRef:formatRef,
      bindSurface:bindBibliographySurface,
      onAfterUpdate:function(){save();}
    })) return;
  }
  var refs=rRefs();
  refs=getBibliographyPageRefs(refs||getUsedRefs()||[]);
  var doc=getCurrentDocRecord();
  bindBibliographySurface();
  var generatedHTML='<h1>Kaynakça</h1>'+refs.map(function(ref,idx){return '<p class="refe">'+formatRef(ref,{index:idx+1})+'</p>';}).join('');
  var persistedHTML=doc?String(doc.bibliographyHTML||'').trim():'';
  var hasExternalBibliographyRefs=!!(doc&&Array.isArray(doc.bibliographyExtraRefIds)&&doc.bibliographyExtraRefIds.length);
  if(hasExternalBibliographyRefs)forceAuto=true;
  var manualHTML=doc&&doc.bibliographyManual&&!forceAuto?String(doc.bibliographyHTML||'').trim():'';
  if(!refs.length){
    var showManualOnly=!!(doc&&doc.bibliographyManual&&persistedHTML);
    if(showManualOnly){
      bibBody.innerHTML=persistedHTML;
      bibPage.style.display='block';
    }else{
      bibBody.innerHTML='';
      bibPage.style.display='none';
      if(doc){
        doc.bibliographyHTML='';
        doc.bibliographyManual=false;
      }
    }
  }else{
    bibBody.innerHTML=manualHTML||generatedHTML;
    bibPage.style.display='block';
    if(doc&&(!doc.bibliographyManual||forceAuto)){
      doc.bibliographyHTML=generatedHTML;
      doc.bibliographyManual=false;
    }
  }
  save();
}
function renderRelatedPapers(){
  var panel=document.getElementById('relatedPanel');
  var list=document.getElementById('relatedList');
  if(!panel||!list)return;
  if(!curRef){
    panel.style.display='none';
    list.innerHTML='<div class="rmeta">Bir kaynak seçildiğinde benzer çalışmalar burada görünür.</div>';
    return;
  }
  panel.style.display='block';
  var ws=S.wss.find(function(x){return x&&x.id===S.cur;});
  var refs=(ws&&ws.lib)||[];
  var recApi=window.AQReferenceRecommendation||null;
  if(!(recApi&&typeof recApi.relatedPapers==='function')){
    list.innerHTML='<div class="rmeta">Related öneri motoru hazır değil.</div>';
    return;
  }
  var related=recApi.relatedPapers(curRef,refs,{notes:S.notes||[]}).slice(0,5);
  if(!related.length){
    list.innerHTML='<div class="rmeta">Benzer kayıt bulunamadı.</div>';
    return;
  }
  list.innerHTML=related.map(function(item){
    var ref=item.ref||{};
    var reason=(item.reasons||[]).slice(0,2).join(' · ');
    var authors=(Array.isArray(ref.authors)?ref.authors:[]).map(function(a){return String(a||'').split(',')[0].trim();}).filter(Boolean).slice(0,2).join(', ');
    return '<div class="related-item" data-related-ref="'+__escHtml(ref.id||'')+'">'+
      '<div class="rttl">'+__escHtml((ref.title||'Başlıksız').substring(0,86))+'</div>'+
      '<div class="rmeta">'+__escHtml(authors||'Bilinmeyen')+' · '+__escHtml(ref.year||'t.y.')+(reason?(' · '+__escHtml(reason)):'')+'</div>'+
    '</div>';
  }).join('');
}
renderRelatedPapers=function(){
  var panel=document.getElementById('relatedPanel');
  var list=document.getElementById('relatedList');
  var toggleBtn=document.getElementById('relatedToggleBtn');
  if(!panel||!list)return;
  panel.classList.toggle('collapsed',!!relatedPanelCollapsed);
  if(toggleBtn){
    toggleBtn.textContent=relatedPanelCollapsed?'+':'−';
    toggleBtn.title=relatedPanelCollapsed?'Goster':'Kucult';
    toggleBtn.setAttribute('aria-expanded',relatedPanelCollapsed?'false':'true');
  }
  panel.style.display='block';
  if(!curRef){
    list.innerHTML='<div class="rmeta">Bir kaynak secildiginde benzer makaleler burada gorunur.</div>';
    return;
  }
  var ws=S.wss.find(function(x){return x&&x.id===S.cur;});
  var refs=(ws&&ws.lib)||[];
  var recApi=window.AQReferenceRecommendation||null;
  if(!(recApi&&typeof recApi.relatedPapers==='function')){
    list.innerHTML='<div class="rmeta">Benzer makale motoru hazir degil.</div>';
    return;
  }
  var related=recApi.relatedPapers(curRef,refs,{notes:S.notes||[]}).slice(0,6);
  if(!related.length){
    list.innerHTML='<div class="rmeta">Benzer kayit bulunamadi.</div>';
    return;
  }
  list.innerHTML=related.map(function(item){
    var ref=item.ref||{};
    var reasons=(item.reasons||[]).slice(0,2).join(' · ');
    var authors=(Array.isArray(ref.authors)?ref.authors:[]).map(function(a){
      return String(a||'').split(',')[0].trim();
    }).filter(Boolean).slice(0,2).join(', ');
    return '<div class="related-item" data-related-ref="'+__escHtml(ref.id||'')+'">'+
      '<div class="rttl">'+__escHtml((ref.title||'Basliksiz').substring(0,100))+'</div>'+
      '<div class="rmeta">'+__escHtml(authors||'Bilinmeyen')+' · '+__escHtml(ref.year||'t.y.')+(reasons?(' · '+__escHtml(reasons)):'')+'</div>'+
    '</div>';
  }).join('');
};
function toggleRelatedPanel(){
  relatedPanelCollapsed=!relatedPanelCollapsed;
  renderRelatedPapers();
}
renderCollectionManager=function(){
  var list=document.getElementById('collectionList');
  if(!list)return;
  var ws=currentWorkspaceForCollections();
  var collections=ensureWorkspaceCollections(ws);
  if(!collections.length){
    list.innerHTML='<div class="collection-empty">Henuz koleksiyon yok.</div>';
    return;
  }
  list.innerHTML=collections.map(function(col){
    return '<div class="collection-row">'+
      '<div class="collection-name" title="'+__escHtml(col.name)+'">'+__escHtml(col.name)+'</div>'+
      '<div class="collection-actions">'+
        '<button class="collection-btn" data-col-action="rename" data-col-id="'+__escHtml(col.id)+'">Yeniden Adlandir</button>'+
        '<button class="collection-btn collection-btn-danger" data-col-action="delete" data-col-id="'+__escHtml(col.id)+'">Sil</button>'+
      '</div>'+
    '</div>';
  }).join('');
};
renderRelatedPapers=function(){
  var panel=document.getElementById('relatedPanel');
  var list=document.getElementById('relatedList');
  var toggleBtn=document.getElementById('relatedToggleBtn');
  if(!panel||!list)return;
  panel.style.display='block';
  panel.classList.toggle('collapsed',!!relatedPanelCollapsed);
  if(toggleBtn){
    toggleBtn.textContent=relatedPanelCollapsed?'+':'-';
    toggleBtn.title=relatedPanelCollapsed?'Goster':'Kucult';
    toggleBtn.setAttribute('aria-expanded',relatedPanelCollapsed?'false':'true');
  }
  if(!curRef){
    list.innerHTML='<div class="rmeta">Bir kaynak secildiginde benzer makaleler burada gorunur.</div>';
    return;
  }
  var ws=S.wss.find(function(x){return x&&x.id===S.cur;});
  var refs=(ws&&ws.lib)||[];
  var recApi=window.AQReferenceRecommendation||null;
  if(!(recApi&&typeof recApi.relatedPapers==='function')){
    list.innerHTML='<div class="rmeta">Benzer makale motoru hazir degil.</div>';
    return;
  }
  var related=recApi.relatedPapers(curRef,refs,{notes:S.notes||[]}).slice(0,6);
  if(!related.length){
    list.innerHTML='<div class="rmeta">Benzer kayit bulunamadi.</div>';
    return;
  }
  list.innerHTML=related.map(function(item){
    var ref=item.ref||{};
    var reasons=(item.reasons||[]).slice(0,2).join(' · ');
    var authors=(Array.isArray(ref.authors)?ref.authors:[]).map(function(a){return String(a||'').split(',')[0].trim();}).filter(Boolean).slice(0,2).join(', ');
    return '<div class="related-item" data-related-ref="'+__escHtml(ref.id||'')+'">'+
      '<div class="rttl">'+__escHtml((ref.title||'Basliksiz').substring(0,100))+'</div>'+
      '<div class="rmeta">'+__escHtml(authors||'Bilinmeyen')+' · '+__escHtml(ref.year||'t.y.')+(reasons?(' · '+__escHtml(reasons)):'')+'</div>'+
    '</div>';
  }).join('');
  // Keep PDF-viewer related panel in sync when visible so users see
  // recommendations update as they switch sources.
  try{
    var pdfRel=document.getElementById('pdfrelated');
    if(pdfRel&&pdfRel.style.display!=='none'&&typeof renderPdfRelatedPanel==='function'){
      renderPdfRelatedPanel();
    }
  }catch(_e){}
};
function showSidebarRefMenu(x,y,ref){
  var menu=document.getElementById('ctxmenu');
  if(!menu||!ref)return;
  menu.innerHTML='';
  closeCtxLabelPanel();
  var editBtn=document.createElement('button');
  editBtn.className='ctxi';
  editBtn.textContent='Künyeyi Düzenle';
  editBtn.onclick=function(event){
    if(event){event.preventDefault();event.stopPropagation();}
    hideCtx();
    editRefMetadata(ref);
  };
  menu.appendChild(editBtn);
  var labelBtn=document.createElement('button');
  labelBtn.className='ctxi has-arrow';
  labelBtn.innerHTML='<span>Etiket Ekle</span><span class="ctx-arrow">▸</span>';
  labelBtn.onclick=function(event){
    if(event){event.preventDefault();event.stopPropagation();}
    openLabelPickerPanel(labelBtn,ref);
  };
  menu.appendChild(labelBtn);
  var relatedBtn=document.createElement('button');
  relatedBtn.className='ctxi';
  relatedBtn.innerHTML='<span>\uD83D\uDD17 Benzer Makaleler</span>';
  relatedBtn.onclick=function(event){
    if(event){event.preventDefault();event.stopPropagation();}
    hideCtx();
    if(typeof openPdfRelatedForRef==='function')openPdfRelatedForRef(ref);
  };
  menu.appendChild(relatedBtn);
  menu.style.top=Math.min(y,window.innerHeight-220)+'px';
  menu.style.left=Math.min(x,window.innerWidth-240)+'px';
  menu.classList.add('show');
}
function rLib(){
  var q=(document.getElementById('libsrch').value||'').toLowerCase();
  var el=document.getElementById('liblist');if(!el)return;
  function closeInlineCollectionPanels(exceptPanel){
    document.querySelectorAll('.lcard-inline-submenu.open').forEach(function(panel){
      if(exceptPanel&&panel===exceptPanel)return;
      panel.classList.remove('open');
    });
  }
  function closeInlineCardMenus(exceptMenu){
    closeInlineCollectionPanels();
    el.querySelectorAll('.lcard-inline-menu.open').forEach(function(menu){
      if(exceptMenu&&menu===exceptMenu)return;
      menu.classList.remove('open');
      if(menu.parentElement&&menu.parentElement.classList)menu.parentElement.classList.remove('menu-open');
    });
  }
  function ensureInlineCollectionPanel(card,menu,ref,anchorBtn){
    var panel=document.getElementById('libCollectionSubmenu');
    if(!panel){
      panel=document.createElement('div');
      panel.id='libCollectionSubmenu';
      panel.className='lcard-inline-submenu';
      var title=document.createElement('div');
      title.className='lcard-inline-submenu-title';
      title.textContent='Koleksiyonlar';
      panel.appendChild(title);
      var list=document.createElement('div');
      list.className='lcard-inline-submenu-list';
      panel.appendChild(list);
      var manageBtn=document.createElement('button');
      manageBtn.type='button';
      manageBtn.className='lcard-inline-subitem lcard-inline-subitem-manage';
      manageBtn.textContent='Koleksiyon Yonet';
      manageBtn.addEventListener('click',function(event){
        if(event){event.preventDefault();event.stopPropagation();}
        closeInlineCollectionPanels();
        closeInlineCardMenus();
        try{openCollectionManager();}catch(_e){}
      });
      panel.appendChild(manageBtn);
      document.body.appendChild(panel);
    }
    panel.__aqRef=ref;
    panel.__aqAnchor=anchorBtn;
    panel.__aqMenu=menu;
    var listEl=panel.querySelector('.lcard-inline-submenu-list');
    if(listEl){
      listEl.innerHTML='';
      var ws=currentWorkspaceForCollections();
      var collections=ensureWorkspaceCollections(ws);
      if(!collections.length){
        var empty=document.createElement('div');
        empty.className='lcard-inline-subempty';
        empty.textContent='Koleksiyon yok';
        listEl.appendChild(empty);
      }else{
        collections.forEach(function(col){
          var activeRef=panel.__aqRef||ref;
          if(!Array.isArray(activeRef.collectionIds))activeRef.collectionIds=[];
          var has=(activeRef.collectionIds||[]).some(function(id){return String(id)===String(col.id);});
          var btn=document.createElement('button');
          btn.type='button';
          btn.className='lcard-inline-subitem'+(has?' on':'');
          var check=document.createElement('span');
          check.className='lcard-inline-subcheck';
          check.textContent=has?'✓':'';
          btn.appendChild(check);
          var txt=document.createElement('span');
          txt.className='lcard-inline-subtext';
          txt.textContent=String(col.name||'');
          btn.appendChild(txt);
          btn.addEventListener('click',function(event){
            if(event){event.preventDefault();event.stopPropagation();}
            var refNow=panel.__aqRef||ref;
            if(!refNow)return;
            window.__aqSidebarCtxAt=Date.now();
            toggleReferenceCollection(refNow,col.id);
          });
          listEl.appendChild(btn);
        });
      }
    }
    return panel;
  }
  function toggleInlineCollectionPanel(card,menu,ref,anchorBtn){
    var panel=ensureInlineCollectionPanel(card,menu,ref,anchorBtn);
    var shouldOpen=!panel.classList.contains('open');
    closeInlineCollectionPanels(shouldOpen?panel:null);
    if(!shouldOpen){
      panel.classList.remove('open');
      return;
    }
    var anchorRect=anchorBtn.getBoundingClientRect();
    var panelWidth=210;
    var panelHeight=260;
    var left=Math.round(anchorRect.right+6);
    var top=Math.round(anchorRect.top-2);
    if(left+panelWidth>window.innerWidth-8){
      left=Math.max(8,Math.round(anchorRect.left-panelWidth-6));
    }
    if(top+panelHeight>window.innerHeight-8){
      top=Math.max(8,window.innerHeight-panelHeight-8);
    }
    top=Math.max(8,top);
    panel.style.left=left+'px';
    panel.style.top=top+'px';
    panel.classList.add('open');
    card.classList.add('menu-open');
    window.__aqSidebarCtxAt=Date.now();
  }
  function ensureInlineCardMenu(card,ref){
    var menu=card.querySelector('.lcard-inline-menu');
    if(menu){
      menu.__aqRef=ref;
      return menu;
    }
    menu=document.createElement('div');
    menu.className='lcard-inline-menu';
    menu.setAttribute('role','menu');
    var editAction=document.createElement('button');
    editAction.type='button';
    editAction.className='lcard-inline-action';
    editAction.textContent='Kunyeyi Duzenle';
    editAction.addEventListener('click',function(event){
      if(event){event.preventDefault();event.stopPropagation();}
      closeInlineCardMenus();
      try{editRefMetadata(menu.__aqRef||ref);}catch(_e){}
    });
    menu.appendChild(editAction);
    var labelAction=document.createElement('button');
    labelAction.type='button';
    labelAction.className='lcard-inline-action';
    labelAction.textContent='Etiketleri Duzenle';
    labelAction.addEventListener('click',function(event){
      if(event){event.preventDefault();event.stopPropagation();}
      try{openLabelPickerPanel(labelAction,menu.__aqRef||ref);}catch(_e){}
    });
    menu.appendChild(labelAction);
    var collectionAction=document.createElement('button');
    collectionAction.type='button';
    collectionAction.className='lcard-inline-action';
    collectionAction.textContent='Koleksiyonlara Ekle';
    collectionAction.addEventListener('click',function(event){
      if(event){event.preventDefault();event.stopPropagation();}
      var activeRef=menu.__aqRef||ref;
      if(!activeRef)return;
      toggleInlineCollectionPanel(card,menu,activeRef,collectionAction);
    });
    menu.appendChild(collectionAction);
    var manageCollectionsAction=document.createElement('button');
    manageCollectionsAction.type='button';
    manageCollectionsAction.className='lcard-inline-action';
    manageCollectionsAction.textContent='Koleksiyon Yonet';
    manageCollectionsAction.addEventListener('click',function(event){
      if(event){event.preventDefault();event.stopPropagation();}
      closeInlineCardMenus();
      try{openCollectionManager();}catch(_e){}
    });
    menu.appendChild(manageCollectionsAction);
    card.appendChild(menu);
    menu.__aqRef=ref;
    return menu;
  }
  function openInlineCardMenu(card,ref,coords){
    if(!card||!ref)return false;
    var menu=ensureInlineCardMenu(card,ref);
    closeInlineCardMenus(menu);
    if(coords&&typeof coords.x==='number'&&typeof coords.y==='number'){
      var rect=card.getBoundingClientRect();
      var menuWidth=188;
      var menuHeight=164;
      var left=Math.round(coords.x-rect.left);
      var top=Math.round(coords.y-rect.top);
      left=Math.max(8,Math.min(left,Math.max(8,card.clientWidth-menuWidth-8)));
      top=Math.max(28,Math.min(top,Math.max(28,card.clientHeight-menuHeight-6)));
      menu.style.left=left+'px';
      menu.style.top=top+'px';
      menu.style.right='auto';
    }else{
      menu.style.left='';
      menu.style.top='';
      menu.style.right='';
    }
    menu.classList.add('open');
    closeInlineCollectionPanels();
    card.classList.add('menu-open');
    window.__aqSidebarCtxAt=Date.now();
    return true;
  }
  function resolveRefFromCard(card){
    if(!card)return null;
    var refId=String(card.getAttribute('data-ref-id')||'').trim();
    if(!refId)return null;
    var ref=findRef(refId,S.cur)||findRef(refId);
    if(!ref){
      var ws=S.wss.find(function(x){return x&&x.id===S.cur;});
      ref=(ws&&ws.lib||[]).find(function(item){return item&&String(item.id||'')===refId;})||null;
    }
    return ref;
  }
  function openCardContextMenu(event,card){
    var ref=resolveRefFromCard(card);
    if(!ref)return false;
    if(event&&typeof event.preventDefault==='function')event.preventDefault();
    if(event&&typeof event.stopPropagation==='function')event.stopPropagation();
    if(event&&typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
    var coords=(event&&typeof event.clientX==='number'&&typeof event.clientY==='number')
      ? {x:event.clientX,y:event.clientY}
      : null;
    return openInlineCardMenu(card,ref,coords);
  }
  if(!document.__aqLibInlineMenuCloseBound){
    document.__aqLibInlineMenuCloseBound=true;
    document.addEventListener('mousedown',function(event){
      var target=event&&event.target?event.target:null;
      if(target&&target.nodeType===3)target=target.parentElement;
      if(target&&target.closest&&(target.closest('#liblist .lcard-inline-menu')||target.closest('.lcard-inline-submenu')||target.closest('#liblist .lcard-menu')))return;
      var listEl=document.getElementById('liblist');
      if(!listEl)return;
      listEl.querySelectorAll('.lcard-inline-menu.open').forEach(function(menu){
        menu.classList.remove('open');
        if(menu.parentElement&&menu.parentElement.classList)menu.parentElement.classList.remove('menu-open');
      });
      document.querySelectorAll('.lcard-inline-submenu.open').forEach(function(panel){panel.classList.remove('open');});
    });
  }
  if(!el.__aqContextBound){
    el.__aqContextBound=true;
    el.addEventListener('contextmenu',function(e){
      var target=e&&e.target?e.target:null;
      if(target&&target.nodeType===3)target=target.parentElement;
      var card=target&&target.closest?target.closest('.lcard'):null;
      if(!card)return;
      openCardContextMenu(e,card);
    });
    el.addEventListener('mousedown',function(e){
      if(!e||e.button!==2)return;
      var target=e.target;
      if(target&&target.nodeType===3)target=target.parentElement;
      var card=target&&target.closest?target.closest('.lcard'):null;
      if(!card)return;
      openCardContextMenu(e,card);
    });
    el.addEventListener('mouseup',function(e){
      if(!e||e.button!==2)return;
      var target=e.target;
      if(target&&target.nodeType===3)target=target.parentElement;
      var card=target&&target.closest?target.closest('.lcard'):null;
      if(!card)return;
      openCardContextMenu(e,card);
    });
  }
  el.innerHTML='';
  rLabelFilter();
  var ws=S.wss.find(function(x){return x.id===S.cur;});
  if(!ws){el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:14px;text-align:center;">Çalışma alanı yok.</div>';return;}
  function labelName(l){return typeof l==='string'?l:((l&&l.name)||'');}
  function labelColor(l){return typeof l==='string'?'#b6873f':((l&&l.color)||'#b6873f');}
  var fl=window.AQLibraryState&&typeof window.AQLibraryState.filterLibraryItems==='function'
    ? window.AQLibraryState.filterLibraryItems(ws.lib||[],q,activeLabelFilter,{getLabelName:labelName,collectionFilter:activeCollectionFilter})
    : (ws.lib||[]).filter(function(r){
        if(q&&!((r.title||'')+(r.authors||[]).join(' ')+(r.year||'')+(r.journal||'')+(r.publisher||'')+(r.websiteName||'')).toLowerCase().includes(q))return false;
        if(activeLabelFilter&&!(r.labels||[]).some(function(l){return labelName(l)===activeLabelFilter;}))return false;
        if(activeCollectionFilter&&activeCollectionFilter!=='all'&&!(Array.isArray(r.collectionIds)&&r.collectionIds.indexOf(activeCollectionFilter)>=0))return false;
        return true;
      });
  if(!fl.length){el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:14px;text-align:center;">'+(q||activeLabelFilter?'Eşleşme yok.':'DOI/URL gir veya PDF yükle.')+'</div>';return;}
  fl.forEach(function(r){
    var a=r.authors&&r.authors[0]?r.authors[0].split(',')[0]:'?';
    if(r.authors&&r.authors.length>1)a+=' vd.';
    var div=document.createElement('div');
    div.className='lcard'+(curRef&&curRef.id===r.id?' on':'');
    div.setAttribute('data-ref-id',String(r.id||''));
    var hasPDFlocal=!!r.pdfData;
    var hasOAurl=!!(r.pdfUrl);
    var pdfVerificationHtml=hasPDFlocal?pdfVerificationBadgeHTML(r):'';
    var pdfStatus=hasPDFlocal?('<span class="lbadge pdf" title="'+__escHtml(pdfVerificationSummaryText(r)||'PDF bu cihazda mevcut')+'">PDF ✓</span>'+pdfVerificationHtml):(hasOAurl?'<span class="lbadge oa">OA v</span>':'');
    var labelHTML=(r.labels||[]).map(function(l){
      var nm=labelName(l);if(!nm)return '';
      var color=labelColor(l);
      return '<span class="lbadge lbadge-tag" style="--badge-color:'+color+';">'+nm+'</span>';
    }).join('');
    var citeStr='';
    if(typeof r.citationCount==='number')citeStr='<span class="lbadge lbadge-cite" title="Atıf sayısı">'+r.citationCount+' atıf</span>';
    div.innerHTML='<div class="ltitle">'+(r.title||'Başlıksız').substring(0,62)+'</div>'+'<div class="lmeta">'+a+' '+(r.year||'t.y.')+(r.journal?' · '+r.journal.substring(0,22):'')+(r.volume?(' · '+r.volume+(r.issue?'('+r.issue+')':'')):'')+'</div>'+'<div class="lbadges">'+pdfStatus+(r.doi?'<span class="lbadge doi">DOI</span>':'')+citeStr+labelHTML+'</div>';
    if(hasOAurl&&!hasPDFlocal){
      var dlBtn=document.createElement('button');
      dlBtn.className='lcard-dl';
      dlBtn.textContent='v İndir';
      dlBtn.title='PDF bu cihaza indirilir';
      div.addEventListener('mouseenter',function(){dlBtn.style.opacity='1';});
      div.addEventListener('mouseleave',function(){dlBtn.style.opacity='0';});
      dlBtn.addEventListener('click',function(e){e.stopPropagation();downloadPDF(r.id);});
      div.appendChild(dlBtn);
    }
    var del=document.createElement('button');del.className='ldel';del.textContent='×';
    del.addEventListener('click',function(e){e.stopPropagation();dRefIn(r.id,S.cur);});
    div.appendChild(del);
    var menuBtn=document.createElement('button');
    menuBtn.className='lcard-menu';
    menuBtn.type='button';
    menuBtn.title='Kaynak menusu';
    menuBtn.textContent='...';
    menuBtn.addEventListener('click',function(e){
      if(e&&typeof e.preventDefault==='function')e.preventDefault();
      if(e&&typeof e.stopPropagation==='function')e.stopPropagation();
      var rect=menuBtn.getBoundingClientRect();
      openInlineCardMenu(div,r,{x:rect.right-10,y:rect.bottom+8});
    });
    div.appendChild(menuBtn);
    div.addEventListener('contextmenu',function(e){
      if(e&&typeof e.preventDefault==='function')e.preventDefault();
      if(e&&typeof e.stopPropagation==='function')e.stopPropagation();
      if(e&&typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
      openInlineCardMenu(div,r,{x:e.clientX,y:e.clientY});
    });
    div.addEventListener('click',function(e){
      var actionTarget=e&&e.target&&e.target.closest?e.target.closest('.lcard-inline-menu,.lcard-inline-submenu,.lcard-menu'):null;
      if(actionTarget)return;
      closeInlineCardMenus();
      if(Date.now()-Number(window.__aqSidebarCtxAt||0)<420)return;
      openRef(r.id);
    });
    el.appendChild(div);
  });
}
function __bindLibraryContextMenuGlobal(){
  if(document.__aqLibContextBound)return;
  document.__aqLibContextBound=true;
  // Capture phase: ensure sidebar right-click works even if editor handlers run.
  document.addEventListener('contextmenu',function(e){
    var target=e&&e.target?e.target:null;
    if(target&&target.nodeType===3)target=target.parentElement;
    var card=target&&target.closest?target.closest('#liblist .lcard'):null;
    if(!card)return;
    var refId=String(card.getAttribute('data-ref-id')||'').trim();
    if(!refId)return;
    var ref=findRef(refId,S.cur)||findRef(refId);
    if(!ref){
      var ws=S.wss.find(function(x){return x&&x.id===S.cur;});
      ref=(ws&&ws.lib||[]).find(function(item){return item&&String(item.id||'')===refId;})||null;
    }
    if(!ref)return;
    if(typeof e.preventDefault==='function')e.preventDefault();
    if(typeof e.stopPropagation==='function')e.stopPropagation();
    if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
    window.__aqSidebarCtxAt=Date.now();
    setTimeout(function(){
      try{ showSidebarRefMenu(e.clientX,e.clientY,ref); }
      catch(_e){ try{ editRefMetadata(ref); }catch(__e){} }
    },0);
  },true);
}
function __duplicateDismissedMap(wsId){
  var key=String(wsId||S.cur||'');
  if(!duplicateReviewState.dismissedByWs[key])duplicateReviewState.dismissedByWs[key]={};
  return duplicateReviewState.dismissedByWs[key];
}
function __duplicateReasonLabel(code){
  if(code==='doi_exact')return 'DOI eşleşmesi';
  if(code==='title_exact')return 'Başlık birebir eşleşme';
  if(code==='author_year_similar_title')return 'Yazar+yıl+benzer başlık';
  if(code==='pdf_signature')return 'PDF imzası eşleşmesi';
  return code;
}
function __escHtml(value){
  return String(value==null?'':value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function __replaceCitationRefIdInDocs(oldId,newId){
  if(!oldId||!newId||oldId===newId)return;
  var oldToken='data-ref="'+String(oldId).replace(/"/g,'&quot;')+'"';
  var newToken='data-ref="'+String(newId).replace(/"/g,'&quot;')+'"';
  (S.docs||[]).forEach(function(doc){
    if(!doc||typeof doc.content!=='string')return;
    if(doc.content.indexOf(oldToken)>=0)doc.content=doc.content.split(oldToken).join(newToken);
  });
  if(typeof S.doc==='string'&&S.doc.indexOf(oldToken)>=0)S.doc=S.doc.split(oldToken).join(newToken);
  try{
    var root=(editor&&editor.view&&editor.view.dom)?editor.view.dom:document.getElementById('apaed');
    if(root){
      root.querySelectorAll('.cit[data-ref="'+String(oldId).replace(/"/g,'')+'"]').forEach(function(node){
        node.setAttribute('data-ref',newId);
      });
    }
  }catch(_e){}
}
function __findDuplicateGroupsForCurrentWs(){
  var ws=S.wss.find(function(x){return x&&x.id===S.cur;});
  var refs=ws&&(ws.lib||[])||[];
  if(!(window.AQDuplicateDetection&&typeof window.AQDuplicateDetection.detectDuplicateGroups==='function'))return [];
  return window.AQDuplicateDetection.detectDuplicateGroups(refs,{
    dismissedSignatures:__duplicateDismissedMap(S.cur)
  });
}
function __renderDuplicateReviewModal(){
  var summaryEl=document.getElementById('dupSummary');
  var listEl=document.getElementById('dupGroups');
  if(!summaryEl||!listEl)return;
  var groups=duplicateReviewState.groups||[];
  summaryEl.textContent=groups.length
    ? (groups.length+' duplicate grup bulundu')
    : 'Duplicate grup bulunamadı';
  if(!groups.length){
    listEl.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:12px 6px;">Şüpheli duplicate bulunamadı.</div>';
    return;
  }
  listEl.innerHTML=groups.map(function(group){
    var refs=(group.records||[]);
    var reasons=(group.reasons||[]).map(__duplicateReasonLabel).join(', ');
    var cards=refs.map(function(ref){
      var authors=(Array.isArray(ref.authors)?ref.authors:[]).slice(0,2).join('; ');
      return '<div class="dup-ref-card">'+
        '<div class="dup-ref-title">'+__escHtml(ref.title||'Başlıksız')+'</div>'+
        '<div class="dup-ref-meta"><b>Yazar:</b> '+__escHtml(authors||'-')+'</div>'+
        '<div class="dup-ref-meta"><b>Yıl:</b> '+__escHtml(ref.year||'-')+'</div>'+
        '<div class="dup-ref-meta"><b>Dergi:</b> '+__escHtml(ref.journal||'-')+'</div>'+
        '<div class="dup-ref-meta"><b>DOI:</b> '+__escHtml(ref.doi||'-')+'</div>'+
      '</div>';
    }).join('');
    return '<div class="dup-group-card" data-dup-signature="'+__escHtml(group.signature)+'">'+
      '<div class="dup-head">Güven: '+Math.round((group.confidence||0)*100)+'% · '+__escHtml(reasons||'benzer metadata')+'</div>'+
      '<div class="dup-ref-grid">'+cards+'</div>'+
      '<div class="mb">'+
        '<button class="mbtn p" data-dup-action="merge" data-dup-signature="'+__escHtml(group.signature)+'">Birleştir</button>'+
        '<button class="mbtn s" data-dup-action="keep" data-dup-signature="'+__escHtml(group.signature)+'">İkisini de Tut</button>'+
        '<button class="mbtn s" data-dup-action="dismiss" data-dup-signature="'+__escHtml(group.signature)+'">Yoksay</button>'+
      '</div>'+
    '</div>';
  }).join('');
}
function __removeDuplicateGroup(signature){
  duplicateReviewState.groups=(duplicateReviewState.groups||[]).filter(function(group){
    return group.signature!==signature;
  });
}
function __mergeDuplicateGroup(signature,options){
  options=options||{};
  var group=(duplicateReviewState.groups||[]).find(function(item){return item.signature===signature;});
  if(!group)return false;
  var ws=S.wss.find(function(x){return x&&x.id===S.cur;});
  if(!ws)return false;
  var candidates=(group.ids||[]).map(function(id){
    return (ws.lib||[]).find(function(ref){return ref&&ref.id===id;})||null;
  }).filter(Boolean);
  if(candidates.length<2){
    __removeDuplicateGroup(signature);
    if(!options.silentUI)__renderDuplicateReviewModal();
    return false;
  }
  var primary=(window.AQDuplicateDetection&&typeof window.AQDuplicateDetection.pickPrimaryRecord==='function')
    ? window.AQDuplicateDetection.pickPrimaryRecord(candidates)
    : candidates[0];
  if(!primary)primary=candidates[0];
  var removeMap={};
  candidates.forEach(function(ref){
    if(!ref||ref.id===primary.id)return;
    if(window.AQDuplicateDetection&&typeof window.AQDuplicateDetection.mergeRecords==='function'){
      window.AQDuplicateDetection.mergeRecords(primary,ref);
    }else{
      mergeRefFields(primary,ref);
    }
    removeMap[ref.id]=true;
  });
  ws.lib=(ws.lib||[]).filter(function(ref){return !removeMap[ref.id];});
  (S.notes||[]).forEach(function(note){
    if(note&&removeMap[note.rid])note.rid=primary.id;
  });
  Object.keys(removeMap).forEach(function(oldId){
    __replaceCitationRefIdInDocs(oldId,primary.id);
  });
  if(curRef&&removeMap[curRef.id])curRef=primary;
  save();rLib();rRefs();updateRefSection();
  __removeDuplicateGroup(signature);
  if(options.silentUI)return true;
  __renderDuplicateReviewModal();
  setDst('Duplicate kayıtlar birleştirildi.','ok');
  setTimeout(function(){setDst('','');},3000);
}
function openDuplicateReview(){
  duplicateReviewState.groups=__findDuplicateGroupsForCurrentWs();
  showM('dupModal');
  __renderDuplicateReviewModal();
}
function __mergeAllDuplicateGroups(){
  var groups=(duplicateReviewState.groups||[]).slice();
  if(!groups.length){
    setDst('Birlestirilecek duplicate grup yok.','ok');
    setTimeout(function(){setDst('','');},2200);
    return;
  }
  var merged=0;
  groups.forEach(function(group){
    if(!group||!group.signature)return;
    if(__mergeDuplicateGroup(group.signature,{silentUI:true}))merged++;
  });
  __renderDuplicateReviewModal();
  setDst(merged+' duplicate grup birlestirildi.','ok');
  setTimeout(function(){setDst('','');},3200);
}
function __dismissAllDuplicateGroups(){
  var groups=(duplicateReviewState.groups||[]).slice();
  if(!groups.length){
    setDst('Yoksayilacak duplicate grup yok.','ok');
    setTimeout(function(){setDst('','');},2200);
    return;
  }
  var dismissed=__duplicateDismissedMap(S.cur);
  groups.forEach(function(group){
    if(group&&group.signature)dismissed[group.signature]=true;
  });
  duplicateReviewState.groups=[];
  __renderDuplicateReviewModal();
  setDst(groups.length+' duplicate grup yoksayildi.','ok');
  setTimeout(function(){setDst('','');},3200);
}
function __renderMetadataHealth(){
  var listEl=document.getElementById('metaHealthList');
  var sumEl=document.getElementById('metaHealthSummary');
  if(!listEl||!sumEl)return;
  var ws=S.wss.find(function(x){return x&&x.id===S.cur;});
  var refs=(ws&&ws.lib)||[];
  var rows=refs.map(function(ref){
    var report=(window.AQMetadataHealth&&typeof window.AQMetadataHealth.analyzeReference==='function')
      ? window.AQMetadataHealth.analyzeReference(ref)
      : {status:'complete',issues:[]};
    return {ref:ref,report:report};
  });
  var summary=(window.AQMetadataHealth&&typeof window.AQMetadataHealth.summarizeHealth==='function')
    ? window.AQMetadataHealth.summarizeHealth(refs)
    : {total:refs.length,complete:refs.length,incomplete:0,suspicious:0,issueCounts:{}};
  function issueLabel(code){
    if(code==='missing_title')return 'Eksik başlık';
    if(code==='missing_authors')return 'Eksik yazar';
    if(code==='missing_year')return 'Eksik yıl';
    if(code==='missing_journal')return 'Eksik dergi';
    if(code==='malformed_doi')return 'Şüpheli DOI';
    if(code==='malformed_pages')return 'Şüpheli sayfa';
    return code;
  }
  var issueText=Object.keys(summary.issueCounts||{}).map(function(code){
    return issueLabel(code)+' '+summary.issueCounts[code];
  }).join(' · ');
  sumEl.textContent='Toplam '+summary.total+' · Tam '+summary.complete+' · Eksik '+summary.incomplete+' · Şüpheli '+summary.suspicious+(issueText?(' · '+issueText):'');
  if(!rows.length){
    listEl.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:12px 6px;">Kaynak bulunamadı.</div>';
    return;
  }
  listEl.innerHTML=rows.map(function(row){
    var ref=row.ref||{};
    var report=row.report||{status:'complete',issues:[]};
    var statusLabel=report.status==='complete'?'Tam':(report.status==='incomplete'?'Eksik':'Şüpheli');
    var issueHtml=(report.issues||[]).map(function(issue){
      return '<span class="mh-issue">'+__escHtml(issue.message||issue.code)+'</span>';
    }).join(' ');
    return '<div class="mh-card" data-ref-id="'+__escHtml(ref.id||'')+'">'+
      '<div class="mh-card-head"><span class="mh-status mh-'+__escHtml(report.status)+'">'+statusLabel+'</span><span class="mh-title">'+__escHtml(ref.title||'Başlıksız')+'</span></div>'+
      '<div class="mh-meta">'+__escHtml((ref.authors||[]).slice(0,2).join('; ')||'Yazar yok')+' · '+__escHtml(ref.year||'yıl yok')+' · '+__escHtml(ref.journal||'dergi yok')+'</div>'+
      '<div class="mh-issues">'+(issueHtml||'<span class="mh-issue">Sorun yok</span>')+'</div>'+
      '<div class="mb">'+
        '<button class="mbtn s" data-mh-action="edit" data-ref-id="'+__escHtml(ref.id||'')+'">Manuel Düzenle</button>'+
        '<button class="mbtn s" data-mh-action="refetch" data-ref-id="'+__escHtml(ref.id||'')+'">DOI Yeniden Çek</button>'+
        '<button class="mbtn p" data-mh-action="normalize" data-ref-id="'+__escHtml(ref.id||'')+'">Normalize Et</button>'+
      '</div>'+
    '</div>';
  }).join('');
}
function openMetadataHealthCenter(){
  showM('metaHealthModal');
  __renderMetadataHealth();
}
function __getWebRelatedApi(){
  return window.AQWebRelatedPapers||null;
}
function __getWebRelatedDiscoveryApi(){
  return window.AQWebRelatedDiscovery||null;
}
function __ensureWebRelatedCache(){
  if(webRelatedRuntime.cache)return webRelatedRuntime.cache;
  var api=__getWebRelatedApi();
  if(api&&typeof api.createCache==='function'){
    webRelatedRuntime.cache=api.createCache(10*60*1000);
    return webRelatedRuntime.cache;
  }
  var store={};
  webRelatedRuntime.cache={
    get:function(key){
      var row=store[String(key||'')];
      if(!row)return null;
      if((Date.now()-row.at)>(10*60*1000)){
        delete store[String(key||'')];
        return null;
      }
      return row.value;
    },
    set:function(key,value){
      store[String(key||'')]={at:Date.now(),value:value};
    },
    clear:function(){store={};}
  };
  return webRelatedRuntime.cache;
}
function __getWebRelatedSeedKey(ref){
  var api=__getWebRelatedApi();
  if(api&&typeof api.buildSeedKey==='function'){
    try{return String(api.buildSeedKey(ref)||'');}catch(_e){}
  }
  if(ref&&ref.doi){
    var doi=normalizeRefDoi(ref.doi);
    if(doi)return 'doi:'+doi;
  }
  return 'ref:'+(ref&&ref.id?String(ref.id):'');
}
function __formatRelatedAuthors(ref){
  return (Array.isArray(ref&&ref.authors)?ref.authors:[]).map(function(a){
    return String(a||'').split(',')[0].trim();
  }).filter(Boolean).slice(0,2).join(', ');
}
function __webRelatedFetchJSON(url,options){
  var opts=options||{};
  if(!(window.electronAPI&&typeof window.electronAPI.netFetchJSON==='function')){
    return Promise.reject(new Error('Electron ag kanali bulunamadi'));
  }
  var timeoutMs=Math.max(2500,Math.min(parseInt(opts.timeoutMs,10)||9000,30000));
  var requestPromise=window.electronAPI.netFetchJSON(url,{timeoutMs:timeoutMs}).then(function(res){
    if(!res||!res.ok)throw new Error(res&&res.error?String(res.error):'Ag istegi basarisiz');
    return res.data;
  });
  // Guard against hung IPC/net calls so UI never remains in perpetual "loading" state.
  var timeoutPromise=new Promise(function(_resolve,reject){
    setTimeout(function(){reject(new Error('Web istek zaman asimi'));},timeoutMs+1500);
  });
  return Promise.race([requestPromise,timeoutPromise]);
}
function __fallbackTokenize(text){
  return String(text||'')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]/g,' ')
    .split(/\s+/)
    .filter(function(tok){return tok&&tok.length>=3;});
}
function __fallbackBuildQuery(seedRef){
  var titleToks=__fallbackTokenize(seedRef&&seedRef.title||'').slice(0,8);
  var firstAuthor=(Array.isArray(seedRef&&seedRef.authors)?seedRef.authors:[])[0]||'';
  var surname=String(firstAuthor).split(',')[0].trim()||String(firstAuthor).split(/\s+/).slice(-1)[0]||'';
  if(surname)titleToks.push(surname);
  if(seedRef&&seedRef.year)titleToks.push(String(seedRef.year));
  return titleToks.join(' ').trim();
}
function __fallbackMapOpenAlex(work){
  if(!work||typeof work!=='object')return null;
  function abstractFromInvertedIndex(inverted){
    if(!inverted||typeof inverted!=='object')return '';
    var tokens=[];
    Object.keys(inverted).forEach(function(tok){
      var positions=Array.isArray(inverted[tok])?inverted[tok]:[];
      positions.forEach(function(pos){
        tokens.push({pos:Number(pos),tok:String(tok||'')});
      });
    });
    tokens.sort(function(a,b){return a.pos-b.pos;});
    return tokens.map(function(row){return row.tok;}).join(' ').trim();
  }
  var authors=(Array.isArray(work.authorships)?work.authorships:[]).map(function(row){
    return String(row&&row.author&&row.author.display_name||'').trim();
  }).filter(Boolean);
  var doi=String(work.doi||'').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'');
  var abstractText=String(work.abstract||'').trim()||abstractFromInvertedIndex(work.abstract_inverted_index||null);
  return {
    id:String(work.id||'').trim(),
    provider:'openalex',
    providerLabel:'OpenAlex',
    title:String(work.display_name||work.title||'').trim(),
    authors:authors,
    year:String(work.publication_year||'').trim(),
    journal:String(work&&work.primary_location&&work.primary_location.source&&work.primary_location.source.display_name||'').trim(),
    doi:normalizeRefDoi(doi||''),
    url:String(work&&work.primary_location&&work.primary_location.landing_page_url||work.id||'').trim(),
    abstract:abstractText,
    reasons:['OpenAlex benzerlik']
  };
}
function __fallbackMapCrossref(item){
  if(!item||typeof item!=='object')return null;
  var authors=(Array.isArray(item.author)?item.author:[]).map(function(a){
    var family=String(a&&a.family||'').trim();
    var given=String(a&&a.given||'').trim();
    if(family&&given)return family+', '+given;
    return family||given;
  }).filter(Boolean);
  var title=Array.isArray(item.title)?String(item.title[0]||'').trim():String(item.title||'').trim();
  var year='';
  var dp=item&&((item.issued&&item.issued['date-parts'])||(item.published_print&&item.published_print['date-parts'])||(item.published_online&&item.published_online['date-parts']))||null;
  if(Array.isArray(dp)&&Array.isArray(dp[0])&&dp[0].length)year=String(dp[0][0]||'').trim();
  var journal=Array.isArray(item['container-title'])?String(item['container-title'][0]||'').trim():String(item['container-title']||'').trim();
  var abstractText=String(item.abstract||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  return {
    id:String(item.DOI||item.URL||title||'').trim(),
    provider:'crossref',
    providerLabel:'Crossref',
    title:title,
    authors:authors,
    year:year,
    journal:journal,
    doi:normalizeRefDoi(String(item.DOI||'')),
    url:String(item.URL||'').trim(),
    abstract:abstractText,
    reasons:['Crossref benzerlik']
  };
}
async function __discoverWebRelatedFallback(seedRef,options){
  options=options||{};
  var limit=Math.max(3,Math.min(parseInt(options.limit,10)||8,12));
  var out=[];
  var seen={};
  function push(item){
    var row=__normalizeWebRelatedItem(item||{});
    if(!row.title)return;
    var key=row.doi?('doi:'+row.doi.toLowerCase()):('title:'+String(row.title||'').toLowerCase().trim());
    if(seen[key])return;
    seen[key]=true;
    out.push(row);
  }
  var doi=normalizeRefDoi(seedRef&&seedRef.doi||'');
  if(doi){
    try{
      var seed=await __webRelatedFetchJSON('https://api.openalex.org/works/doi:'+encodeURIComponent(doi)+'?mailto=academiq@example.com',{timeoutMs:9000});
      var ids=(Array.isArray(seed&&seed.related_works)?seed.related_works:[]).slice(0,Math.min(limit,8));
      var rows=await Promise.all(ids.map(function(rawId){
        var id=String(rawId||'').trim();
        var m=id.match(/openalex\.org\/(W\d+)/i);
        if(m&&m[1])id=m[1];
        if(!id)return Promise.resolve(null);
        return __webRelatedFetchJSON('https://api.openalex.org/works/'+encodeURIComponent(id)+'?mailto=academiq@example.com',{timeoutMs:9000}).catch(function(){return null;});
      }));
      rows.forEach(function(row){push(__fallbackMapOpenAlex(row));});
    }catch(_e){}
  }
  if(out.length<Math.min(4,limit)){
    var query=__fallbackBuildQuery(seedRef||{});
    if(query){
      try{
        var search=await __webRelatedFetchJSON('https://api.openalex.org/works?search='+encodeURIComponent(query)+'&per-page='+String(limit)+'&mailto=academiq@example.com',{timeoutMs:9000});
        (Array.isArray(search&&search.results)?search.results:[]).forEach(function(work){
          push(__fallbackMapOpenAlex(work));
        });
      }catch(_e){}
    }
  }
  if(out.length<Math.min(4,limit)){
    var q=__fallbackBuildQuery(seedRef||{});
    if(q){
      try{
        var cr=await __webRelatedFetchJSON('https://api.crossref.org/works?rows='+String(limit)+'&mailto=academiq@example.com&query.bibliographic='+encodeURIComponent(q),{timeoutMs:9000});
        (Array.isArray(cr&&cr.message&&cr.message.items)?cr.message.items:[]).forEach(function(item){
          push(__fallbackMapCrossref(item));
        });
      }catch(_e){}
    }
  }
  if(doi){
    out=out.filter(function(row){
      return !(row&&row.doi&&normalizeRefDoi(row.doi)===doi);
    });
  }
  return {
    items:out.slice(0,limit),
    fetchedAt:Date.now()
  };
}
function __normalizeWebRelatedItem(item){
  var api=__getWebRelatedApi();
  if(api&&typeof api.normalizeWebResult==='function'){
    try{return api.normalizeWebResult(item||{},{
      provider:(item&&item.provider)||'web',
      providerLabel:(item&&item.providerLabel)||'Web'
    });}catch(_e){}
  }
  return {
    id:String(item&&item.id||''),
    provider:String(item&&item.provider||'web'),
    providerLabel:String(item&&item.providerLabel||'Web'),
    referenceType:normalizeRefTypeValue(item&&item.referenceType||'article'),
    title:String(item&&item.title||'').trim(),
    authors:Array.isArray(item&&item.authors)?item.authors.slice():[],
    year:String(item&&item.year||'').trim(),
    journal:String(item&&item.journal||'').trim(),
    publisher:String(item&&item.publisher||'').trim(),
    edition:String(item&&item.edition||'').trim(),
    websiteName:String(item&&item.websiteName||'').trim(),
    publishedDate:String(item&&item.publishedDate||'').trim(),
    accessedDate:String(item&&item.accessedDate||'').trim(),
    volume:String(item&&item.volume||'').trim(),
    issue:String(item&&item.issue||'').trim(),
    fp:String(item&&item.fp||'').trim(),
    lp:String(item&&item.lp||'').trim(),
    doi:normalizeRefDoi(item&&item.doi||item&&item.url||''),
    url:String(item&&item.url||'').trim(),
    abstract:String(item&&item.abstract||item&&item.snippet||'').trim(),
    labels:Array.isArray(item&&item.labels)?item.labels.slice():[],
    reasons:Array.isArray(item&&item.reasons)?item.reasons.slice():[]
  };
}
function __buildRefFromWebRelated(item){
  var normalized=__normalizeWebRelatedItem(item);
  var api=__getWebRelatedApi();
  var ref=null;
  if(api&&typeof api.buildWorkspaceReference==='function'){
    try{
      ref=api.buildWorkspaceReference(normalized,{
        workspaceId:S.cur,
        createId:uid
      });
    }catch(_e){}
  }
  if(!ref){
    ref={
      id:uid(),
      referenceType:normalized.referenceType||'article',
      title:normalized.title||'',
      authors:Array.isArray(normalized.authors)?normalized.authors.slice():[],
      year:normalized.year||'',
      journal:normalized.journal||'',
      publisher:normalized.publisher||'',
      edition:normalized.edition||'',
      websiteName:normalized.websiteName||'',
      publishedDate:normalized.publishedDate||'',
      accessedDate:normalized.accessedDate||'',
      volume:normalized.volume||'',
      issue:normalized.issue||'',
      fp:normalized.fp||'',
      lp:normalized.lp||'',
      doi:normalizeRefDoi(normalized.doi||normalized.url||''),
      url:normalized.url||'',
      abstract:normalized.abstract||'',
      note:'',
      labels:Array.isArray(normalized.labels)?normalized.labels.slice():[],
      pdfData:null,
      pdfUrl:'',
      wsId:S.cur
    };
  }
  normalizeRefRecord(ref);
  if(!ref.id)ref.id=uid();
  if(!ref.wsId)ref.wsId=S.cur;
  if(!ref.url&&ref.doi)ref.url='https://doi.org/'+ref.doi;
  if(!Array.isArray(ref.labels))ref.labels=[];
  if(normalized.providerLabel){
    ref.discoveryProvider=normalized.providerLabel;
  }else if(normalized.provider){
    ref.discoveryProvider=normalized.provider;
  }
  if(normalized.reasons&&normalized.reasons.length){
    ref.discoveryReasons=normalized.reasons.slice(0,4);
  }
  return ref;
}
function __findEquivalentRefAcrossWorkspaces(ref){
  if(!ref)return null;
  for(var wi=0;wi<S.wss.length;wi++){
    var ws=S.wss[wi];
    var lib=(ws&&ws.lib)||[];
    for(var ri=0;ri<lib.length;ri++){
      var cand=lib[ri];
      if(cand&&refsLikelySame(cand,ref)){
        return {wsId:ws.id,ref:cand};
      }
    }
  }
  return null;
}
function __attachExistingRefToActiveWorkspace(existingRef,candidateRef){
  if(!existingRef)return null;
  // Keep workspaces isolated: attach as a cloned record so edits in one workspace do not mutate another.
  var clone=JSON.parse(JSON.stringify(existingRef));
  clone.id=uid();
  clone.wsId=S.cur;
  clone.collectionIds=[];
  mergeRefFields(clone,candidateRef||{});
  normalizeRefRecord(clone);
  return addToLib(clone)||clone;
}
function __addWebResultToActiveWorkspace(item,options){
  options=options||{};
  var ws=curWs();
  if(!ws){
    if(!options.quiet)setDst('Aktif workspace bulunamadi.','er');
    return {status:'error',reason:'no_workspace'};
  }
  var normalized=__normalizeWebRelatedItem(item);
  var candidateRef=__buildRefFromWebRelated(normalized);
  var api=__getWebRelatedApi();
  var decision=null;
  if(api&&typeof api.decideAddToActiveWorkspace==='function'){
    try{decision=api.decideAddToActiveWorkspace(S.wss,S.cur,candidateRef);}catch(_e){}
  }
  if(decision&&decision.action==='already_in_workspace'&&decision.existingRef){
    if(!options.quiet){
      setDst('Zaten bu workspace\'te mevcut.','ok');
      setTimeout(function(){setDst('','');},2200);
    }
    return {status:'already',ref:decision.existingRef};
  }
  if(decision&&decision.action==='attach_existing'&&decision.existingRef){
    var attached=__attachExistingRefToActiveWorkspace(decision.existingRef,candidateRef);
    renderRelatedPapers();
    if(!options.quiet){
      setDst('Kaynak aktif workspace\'e eklendi.','ok');
      setTimeout(function(){setDst('','');},2400);
    }
    return {status:'attached_existing',ref:attached};
  }
  var existingAny=__findEquivalentRefAcrossWorkspaces(candidateRef);
  if(existingAny&&String(existingAny.wsId)!==String(S.cur)){
    var attachedAny=__attachExistingRefToActiveWorkspace(existingAny.ref,candidateRef);
    renderRelatedPapers();
    if(!options.quiet){
      setDst('Kaynak aktif workspace\'e eklendi.','ok');
      setTimeout(function(){setDst('','');},2400);
    }
    return {status:'attached_existing',ref:attachedAny};
  }
  var added=addToLib(candidateRef)||candidateRef;
  renderRelatedPapers();
  if(!options.quiet){
    setDst('Kaynak aktif workspace\'e eklendi.','ok');
    setTimeout(function(){setDst('','');},2400);
  }
  return {status:'added',ref:added};
}
function __addWebResultToLibraryOnly(item){
  var normalized=__normalizeWebRelatedItem(item);
  var candidateRef=__buildRefFromWebRelated(normalized);
  var existingAny=__findEquivalentRefAcrossWorkspaces(candidateRef);
  if(existingAny&&existingAny.ref){
    setDst('Kaynak kutuphanede zaten mevcut.','ok');
    setTimeout(function(){setDst('','');},2200);
    return {status:'already',ref:existingAny.ref,wsId:existingAny.wsId};
  }
  var added=addToLib(candidateRef)||candidateRef;
  renderRelatedPapers();
  setDst('Kaynak kutuphaneye eklendi.','ok');
  setTimeout(function(){setDst('','');},2400);
  return {status:'added',ref:added,wsId:S.cur};
}
function __resolveWebRelatedItemFromButton(btn){
  var card=btn&&btn.closest?btn.closest('[data-related-web-index][data-related-seed]'):null;
  if(!card)return null;
  var idx=parseInt(card.getAttribute('data-related-web-index'),10);
  if(!Number.isFinite(idx)||idx<0)return null;
  var seedKey=String(card.getAttribute('data-related-seed')||'');
  if(!seedKey)return null;
  var row=webRelatedRuntime.resultMap&&webRelatedRuntime.resultMap[seedKey];
  var items=row&&Array.isArray(row.items)?row.items:[];
  if(idx>=items.length)return null;
  return {
    item:items[idx],
    seedKey:seedKey,
    index:idx,
    card:card
  };
}
function __handleWebRelatedAction(action,payload){
  var item=payload&&payload.item;
  if(!item)return;
  if(action==='open-abstract'){
    __openWebAbstractPreview(item);
    return;
  }
  if(action==='add-active'){
    __addWebResultToActiveWorkspace(item);
    return;
  }
  if(action==='add-library'){
    __addWebResultToLibraryOnly(item);
    return;
  }
  if(action==='preview'){
    var url=item.url||(item.doi?('https://doi.org/'+item.doi):'');
    if(!url){
      setDst('Detay URL bulunamadi.','er');
      return;
    }
    try{window.open(url,'_blank','noopener');}catch(_e){
      setDst('Detay acilamadi.','er');
    }
    return;
  }
  if(action==='find-oa'){
    (async function(){
      var added=__addWebResultToActiveWorkspace(item,{quiet:true});
      var ref=added&&added.ref;
      if(!ref){
        setDst('Kaynak eklenemedi.','er');
        return;
      }
      if(!ref.doi&&!ref.pdfUrl){
        setDst('PDF/OA arama icin DOI veya URL gerekli.','er');
        return;
      }
      setDst('OA PDF araniyor...','ld');
      try{
        var out=await __oaDownloadOneRef(ref);
        if(out&&out.ok){
          save();rLib();rRefs();
          setDst('OA PDF bulundu ve eklendi.','ok');
          setTimeout(function(){setDst('','');},2800);
        }else{
          setDst('OA PDF bulunamadi.','er');
        }
      }catch(e){
        setDst('OA PDF aramasi basarisiz.','er');
      }
    })();
    return;
  }
}
function __openWebAbstractPreview(item){
  var row=__normalizeWebRelatedItem(item||{});
  var panel=document.getElementById('pdfpanel');
  var sc=document.getElementById('pdfscroll');
  var titleEl=document.getElementById('pdftitle');
  if(!panel||!sc||!titleEl)return;

  clearPDFView();
  pdfDoc=null;
  pdfTotal=0;
  pdfPg=1;
  updPgLabel();
  panel.classList.add('open');
  titleEl.textContent=('Ozet onizleme: '+(row.title||'Web sonuc')).substring(0,80);

  var card=document.createElement('div');
  card.style.cssText='width:min(820px,100%);background:#fff;border:1px solid rgba(214,202,184,.9);border-radius:12px;padding:16px 18px;box-shadow:0 14px 28px rgba(42,29,12,.12);line-height:1.6;color:var(--txt2);';

  var h=document.createElement('h3');
  h.style.cssText='margin:0 0 8px;font-size:18px;line-height:1.35;color:var(--txt);';
  h.textContent=row.title||'Basliksiz';
  card.appendChild(h);

  var meta=document.createElement('div');
  meta.style.cssText='font-family:var(--fm);font-size:11px;color:var(--txt3);margin-bottom:10px;';
  var metaAuthors=__formatRelatedAuthors(row)||'Bilinmeyen';
  meta.textContent=metaAuthors+' · '+(row.year||'t.y.')+(row.journal?(' · '+row.journal):'')+(row.providerLabel?(' · '+row.providerLabel):'');
  card.appendChild(meta);

  var abstractBox=document.createElement('div');
  abstractBox.style.cssText='font-size:13px;white-space:pre-wrap;';
  card.appendChild(abstractBox);
  function renderAbstract(text,status){
    var absText=String(text||'').trim();
    if(absText){
      abstractBox.style.whiteSpace='pre-wrap';
      abstractBox.style.fontSize='13px';
      abstractBox.style.color='var(--txt2)';
      abstractBox.textContent=absText;
      return;
    }
    abstractBox.style.whiteSpace='normal';
    abstractBox.style.fontSize='12px';
    abstractBox.style.color='var(--txt3)';
    abstractBox.textContent=status||'Bu kayitta abstract bulunamadi.';
  }
  renderAbstract(row.abstract,'Bu kayitta abstract aranıyor...');
  if(!String(row.abstract||'').trim()){
    __hydrateWebResultAbstract(row).then(function(updated){
      if(updated&&updated.abstract){
        renderAbstract(updated.abstract,'');
        if(item&&typeof item==='object'){
          item.abstract=updated.abstract;
          if(!item.url&&updated.url)item.url=updated.url;
        }
      }else{
        renderAbstract('', 'Bu kayitta abstract bulunamadi.');
      }
    }).catch(function(){
      renderAbstract('', 'Bu kayitta abstract bulunamadi.');
    });
  }

  var actions=document.createElement('div');
  actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;';
  function mkBtn(label,primary){
    var btn=document.createElement('button');
    btn.type='button';
    btn.textContent=label;
    btn.style.cssText='border:1px solid '+(primary?'rgba(88,128,156,.45)':'rgba(146,166,177,.44)')+';background:'+(primary?'rgba(88,128,156,.1)':'rgba(255,255,255,.95)')+';color:'+ (primary?'#36586d':'var(--txt2)') +';border-radius:8px;padding:6px 10px;font-family:var(--fm);font-size:11px;cursor:pointer;';
    return btn;
  }
  var addWsBtn=mkBtn('Workspace\'e ekle',true);
  addWsBtn.addEventListener('click',function(){__addWebResultToActiveWorkspace(row);});
  actions.appendChild(addWsBtn);

  var addLibBtn=mkBtn('Kutuphaneye ekle',false);
  addLibBtn.addEventListener('click',function(){__addWebResultToLibraryOnly(row);});
  actions.appendChild(addLibBtn);

  if(row.url||row.doi){
    var detailBtn=mkBtn('Detay',false);
    detailBtn.addEventListener('click',function(){
      var url=row.url||(row.doi?('https://doi.org/'+row.doi):'');
      if(!url)return;
      try{window.open(url,'_blank','noopener');}catch(_e){}
    });
    actions.appendChild(detailBtn);
  }

  card.appendChild(actions);
  sc.appendChild(card);
}
function __hydrateWebResultAbstract(row){
  row=__normalizeWebRelatedItem(row||{});
  if(row.abstract)return Promise.resolve(row);
  function normalizeAbstract(text){
    return String(text||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  }
  function abstractFromOpenAlex(inverted){
    if(!inverted||typeof inverted!=='object')return '';
    var toks=[];
    Object.keys(inverted).forEach(function(tok){
      var positions=Array.isArray(inverted[tok])?inverted[tok]:[];
      positions.forEach(function(pos){toks.push({pos:Number(pos),tok:String(tok||'')});});
    });
    toks.sort(function(a,b){return a.pos-b.pos;});
    return toks.map(function(x){return x.tok;}).join(' ').trim();
  }
  var doi=normalizeRefDoi(row.doi||'');
  var openAlexUrl='';
  if(row.url&&/api\.openalex\.org\/works\//i.test(String(row.url||''))){
    openAlexUrl=String(row.url||'');
  }else if(row.id&&/openalex\.org\/W\d+/i.test(String(row.id||''))){
    var m=String(row.id).match(/openalex\.org\/(W\d+)/i);
    if(m&&m[1])openAlexUrl='https://api.openalex.org/works/'+encodeURIComponent(m[1]);
  }
  var tasks=[];
  if(doi){
    tasks.push(function(){
      return __webRelatedFetchJSON('https://api.openalex.org/works/doi:'+encodeURIComponent(doi)+'?mailto=academiq@example.com',{timeoutMs:9000}).then(function(work){
        var abs=normalizeAbstract(work&&work.abstract)||abstractFromOpenAlex(work&&work.abstract_inverted_index||null);
        if(abs){
          row.abstract=abs;
          if(!row.url)row.url=String(work&&work.primary_location&&work.primary_location.landing_page_url||work&&work.id||'').trim();
        }
      }).catch(function(){});
    });
    tasks.push(function(){
      return __webRelatedFetchJSON('https://api.crossref.org/works/'+encodeURIComponent(doi),{timeoutMs:9000}).then(function(out){
        var item=out&&out.message||null;
        var abs=normalizeAbstract(item&&item.abstract||'');
        if(abs&&!row.abstract)row.abstract=abs;
        if(!row.url&&item&&item.URL)row.url=String(item.URL||'').trim();
      }).catch(function(){});
    });
  }
  if(openAlexUrl){
    tasks.push(function(){
      var u=openAlexUrl+(openAlexUrl.indexOf('?')>=0?'&':'?')+'mailto=academiq@example.com';
      return __webRelatedFetchJSON(u,{timeoutMs:9000}).then(function(work){
        var abs=normalizeAbstract(work&&work.abstract)||abstractFromOpenAlex(work&&work.abstract_inverted_index||null);
        if(abs&&!row.abstract)row.abstract=abs;
      }).catch(function(){});
    });
  }
  if(!tasks.length)return Promise.resolve(row);
  return tasks.reduce(function(p,step){
    return p.then(function(){
      if(row.abstract)return row;
      return step().then(function(){return row;});
    });
  },Promise.resolve(row)).then(function(){return row;});
}
function __startWebRelatedFetch(seedRef,seedKey,retryCount){
  retryCount=parseInt(retryCount,10)||0;
  var discoverApi=__getWebRelatedDiscoveryApi();
  if(webRelatedRuntime.loadingSeedKey===seedKey)return;
  if(!(window.electronAPI&&typeof window.electronAPI.netFetchJSON==='function')){
    webRelatedRuntime.error='Web arama icin guvenli ag kanali bulunamadi.';
    webRelatedRuntime.statusText='';
    return;
  }
  webRelatedRuntime.loadingSeedKey=seedKey;
  webRelatedRuntime.error='';
  webRelatedRuntime.statusText='Webde araniyor...';
  var token=(webRelatedRuntime.token||0)+1;
  webRelatedRuntime.token=token;
  var watchdogTimer=setTimeout(function(){
    if(token!==webRelatedRuntime.token)return;
    if(webRelatedRuntime.loadingSeedKey!==seedKey)return;
    webRelatedRuntime.loadingSeedKey='';
    webRelatedRuntime.error='Web arama zaman asimina ugradi.';
    webRelatedRuntime.statusText='';
    if(webRelatedRuntime.activeSeedKey===seedKey)renderRelatedPapers();
  },22000);
  setTimeout(function(){
    if(webRelatedRuntime.activeSeedKey===seedKey)renderRelatedPapers();
  },0);
  // Web discovery runs only through secure IPC-backed fetch, never direct renderer fetch.
  var discoveryPromise;
  try{
    if(discoverApi&&typeof discoverApi.discoverWebRelated==='function'){
      discoveryPromise=Promise.resolve(discoverApi.discoverWebRelated(seedRef,{
        fetchJSON:function(url,opts){return __webRelatedFetchJSON(url,opts||{});},
        limit:8
      }));
    }else{
      discoveryPromise=Promise.resolve(__discoverWebRelatedFallback(seedRef,{limit:8}));
    }
  }catch(err){
    if(token===webRelatedRuntime.token){
      webRelatedRuntime.loadingSeedKey='';
      webRelatedRuntime.error=String(err&&err.message?err.message:err||'Web aramasi basarisiz');
      webRelatedRuntime.statusText='';
      if(webRelatedRuntime.activeSeedKey===seedKey)renderRelatedPapers();
    }
    return;
  }
  discoveryPromise.then(function(out){
    if(token!==webRelatedRuntime.token)return;
    var items=Array.isArray(out&&out.items)?out.items:[];
    var normalized=items.map(__normalizeWebRelatedItem);
    var bucket={items:normalized,fetchedAt:out&&out.fetchedAt?out.fetchedAt:Date.now()};
    if(!webRelatedRuntime.resultMap)webRelatedRuntime.resultMap={};
    webRelatedRuntime.resultMap[seedKey]=bucket;
    webRelatedRuntime.items=normalized.slice();
    var cache=__ensureWebRelatedCache();
    if(cache&&typeof cache.set==='function')cache.set(seedKey,bucket);
    webRelatedRuntime.error='';
    webRelatedRuntime.statusText=normalized.length
      ? ('Web: '+normalized.length+' sonuc')
      : 'Webde sonuc bulunamadi';
  }).catch(function(err){
    if(token!==webRelatedRuntime.token)return;
    webRelatedRuntime.error=String(err&&err.message?err.message:err||'Web aramasi basarisiz');
    webRelatedRuntime.statusText='';
  }).finally(function(){
    clearTimeout(watchdogTimer);
    if(token===webRelatedRuntime.token&&webRelatedRuntime.loadingSeedKey===seedKey){
      webRelatedRuntime.loadingSeedKey='';
    }
    if(webRelatedRuntime.activeSeedKey===seedKey)renderRelatedPapers();
  });
}
function __bindSprint1PanelEvents(){
  var collectionManageBtn=document.getElementById('collectionManageBtn');
  if(collectionManageBtn&&!collectionManageBtn.__aqBound){
    collectionManageBtn.__aqBound=true;
    collectionManageBtn.addEventListener('click',function(){openCollectionManager();});
  }
  var collectionCreateBtn=document.getElementById('collectionCreateBtn');
  if(collectionCreateBtn&&!collectionCreateBtn.__aqBound){
    collectionCreateBtn.__aqBound=true;
    collectionCreateBtn.addEventListener('click',function(){createCollectionFromInput();});
  }
  var btnZoteroImport=document.getElementById('btnZoteroImport');
  if(btnZoteroImport&&!btnZoteroImport.__aqBound){
    btnZoteroImport.__aqBound=true;
    btnZoteroImport.addEventListener('click',function(){
      var inp=document.getElementById('zoteroinp');
      if(inp&&typeof inp.click==='function')inp.click();
    });
  }
  var btnFindDuplicates=document.getElementById('btnFindDuplicates');
  if(btnFindDuplicates&&!btnFindDuplicates.__aqBound){
    btnFindDuplicates.__aqBound=true;
    btnFindDuplicates.addEventListener('click',function(){openDuplicateReview();});
  }
  var btnMetadataHealth=document.getElementById('btnMetadataHealth');
  if(btnMetadataHealth&&!btnMetadataHealth.__aqBound){
    btnMetadataHealth.__aqBound=true;
    btnMetadataHealth.addEventListener('click',function(){openMetadataHealthCenter();});
  }
  var citationStyleSel=document.getElementById('citationStyleSel');
  if(citationStyleSel&&!citationStyleSel.__aqBound){
    citationStyleSel.__aqBound=true;
    citationStyleSel.addEventListener('change',function(event){
      setCitationStyle(event&&event.target?event.target.value:'apa7');
    });
  }
  var dupMergeAllBtn=document.getElementById('dupMergeAllBtn');
  if(dupMergeAllBtn&&!dupMergeAllBtn.__aqBound){
    dupMergeAllBtn.__aqBound=true;
    dupMergeAllBtn.addEventListener('click',function(){__mergeAllDuplicateGroups();});
  }
  var dupDismissAllBtn=document.getElementById('dupDismissAllBtn');
  if(dupDismissAllBtn&&!dupDismissAllBtn.__aqBound){
    dupDismissAllBtn.__aqBound=true;
    dupDismissAllBtn.addEventListener('click',function(){__dismissAllDuplicateGroups();});
  }
  var dupEl=document.getElementById('dupGroups');
  if(dupEl&&!dupEl.__aqDupBound){
    dupEl.__aqDupBound=true;
    dupEl.addEventListener('click',function(event){
      var btn=event&&event.target&&event.target.closest?event.target.closest('[data-dup-action]'):null;
      if(!btn)return;
      var action=String(btn.getAttribute('data-dup-action')||'');
      var signature=String(btn.getAttribute('data-dup-signature')||'');
      if(!signature)return;
      if(action==='merge'){__mergeDuplicateGroup(signature);return;}
      if(action==='dismiss'){
        var dismissed=__duplicateDismissedMap(S.cur);
        dismissed[signature]=true;
      }
      __removeDuplicateGroup(signature);
      __renderDuplicateReviewModal();
    });
  }
  var metaList=document.getElementById('metaHealthList');
  if(metaList&&!metaList.__aqMhBound){
    metaList.__aqMhBound=true;
    metaList.addEventListener('click',function(event){
      var btn=event&&event.target&&event.target.closest?event.target.closest('[data-mh-action]'):null;
      if(!btn)return;
      var action=String(btn.getAttribute('data-mh-action')||'');
      var refId=String(btn.getAttribute('data-ref-id')||'');
      if(!refId)return;
      var ref=findRef(refId,S.cur)||findRef(refId);
      if(!ref)return;
      if(action==='edit'){
        editRefMetadata(ref);
        setTimeout(__renderMetadataHealth,220);
        return;
      }
      if(action==='refetch'){
        if(!ref.doi){setDst('DOI olmayan kaynakta yeniden çekme yapılamaz.','er');return;}
        setDst('Metadata DOI üzerinden güncelleniyor...','ld');
        fetchCR(ref.doi,function(err,fetched){
          if(err||!fetched){setDst('DOI metadata alınamadı.','er');return;}
          mergeRefFields(ref,fetched);
          save();rLib();rRefs();updateRefSection();
          __renderMetadataHealth();
          setDst('Metadata güncellendi.','ok');
          setTimeout(function(){setDst('','');},3000);
        });
        return;
      }
      if(action==='normalize'){
        if(window.AQMetadataHealth&&typeof window.AQMetadataHealth.applyConservativeRepairs==='function'){
          var result=window.AQMetadataHealth.applyConservativeRepairs(ref);
          if(result&&result.ref){
            Object.keys(result.ref).forEach(function(key){ref[key]=result.ref[key];});
            normalizeRefRecord(ref);
            save();rLib();rRefs();
            __renderMetadataHealth();
            setDst((result.changes||[]).length?'Kayıt normalize edildi.':'Değişiklik gerekmedi.','ok');
            setTimeout(function(){setDst('','');},2500);
          }
        }
      }
    });
  }
  var mhRefresh=document.getElementById('metaHealthRefreshBtn');
  if(mhRefresh&&!mhRefresh.__aqBound){
    mhRefresh.__aqBound=true;
    mhRefresh.addEventListener('click',function(){__renderMetadataHealth();});
  }
  var relatedList=document.getElementById('relatedList');
  if(relatedList&&!relatedList.__aqBound){
    relatedList.__aqBound=true;
    relatedList.addEventListener('click',function(event){
      var actionBtn=event&&event.target&&event.target.closest?event.target.closest('[data-related-action]'):null;
      if(actionBtn){
        if(typeof event.preventDefault==='function')event.preventDefault();
        if(typeof event.stopPropagation==='function')event.stopPropagation();
        var action=String(actionBtn.getAttribute('data-related-action')||'');
        var payload=__resolveWebRelatedItemFromButton(actionBtn);
        if(action&&payload)__handleWebRelatedAction(action,payload);
        return;
      }
      var card=event&&event.target&&event.target.closest?event.target.closest('[data-related-ref]'):null;
      if(card){
        var refId=String(card.getAttribute('data-related-ref')||'');
        if(refId&&typeof openRef==='function')openRef(refId);
        return;
      }
      var webCard=event&&event.target&&event.target.closest?event.target.closest('[data-related-web-index][data-related-seed]'):null;
      if(webCard){
        var payload=__resolveWebRelatedItemFromButton(webCard);
        if(payload&&payload.item)__openWebAbstractPreview(payload.item);
      }
    });
  }
  var pdfRelatedPanel=document.getElementById('pdfrelated');
  if(pdfRelatedPanel&&!pdfRelatedPanel.__aqBound){
    pdfRelatedPanel.__aqBound=true;
    pdfRelatedPanel.addEventListener('click',function(event){
      var card=event&&event.target&&event.target.closest?event.target.closest('[data-related-ref]'):null;
      if(!card)return;
      var refId=String(card.getAttribute('data-related-ref')||'');
      if(refId&&typeof openRef==='function')openRef(refId);
    });
  }
  var relatedToggleBtn=document.getElementById('relatedToggleBtn');
  if(relatedToggleBtn&&!relatedToggleBtn.__aqBound){
    relatedToggleBtn.__aqBound=true;
    relatedToggleBtn.addEventListener('click',function(event){
      if(event&&typeof event.preventDefault==='function')event.preventDefault();
      toggleRelatedPanel();
    });
  }
  var collectionList=document.getElementById('collectionList');
  if(collectionList&&!collectionList.__aqBound){
    collectionList.__aqBound=true;
    collectionList.addEventListener('click',function(event){
      var btn=event&&event.target&&event.target.closest?event.target.closest('[data-col-action][data-col-id]'):null;
      if(!btn)return;
      var action=String(btn.getAttribute('data-col-action')||'');
      var colId=String(btn.getAttribute('data-col-id')||'');
      if(!colId)return;
      if(action==='rename'){renameCollectionById(colId);return;}
      if(action==='delete'){deleteCollectionById(colId);}
    });
  }
  var docHistoryOpenBtn=document.getElementById('docHistoryOpenBtn');
  if(docHistoryOpenBtn&&!docHistoryOpenBtn.__aqBound){
    docHistoryOpenBtn.__aqBound=true;
    docHistoryOpenBtn.addEventListener('click',function(){openDocumentHistory().catch(function(){});});
  }
  var docHistoryRefreshBtn=document.getElementById('docHistoryRefreshBtn');
  if(docHistoryRefreshBtn&&!docHistoryRefreshBtn.__aqBound){
    docHistoryRefreshBtn.__aqBound=true;
    docHistoryRefreshBtn.addEventListener('click',function(){refreshDocumentHistory().catch(function(){});});
  }
  var docHistoryCloseBtn=document.getElementById('docHistoryCloseBtn');
  if(docHistoryCloseBtn&&!docHistoryCloseBtn.__aqBound){
    docHistoryCloseBtn.__aqBound=true;
    docHistoryCloseBtn.addEventListener('click',function(){hideM('docHistoryModal');});
  }
  var docHistoryList=document.getElementById('docHistoryList');
  if(docHistoryList&&!docHistoryList.__aqBound){
    docHistoryList.__aqBound=true;
    docHistoryList.addEventListener('click',function(event){
      var btn=event&&event.target&&event.target.closest?event.target.closest('[data-doc-history-restore]'):null;
      if(!btn)return;
      var snapshotId=String(btn.getAttribute('data-doc-history-restore')||'');
      if(!snapshotId)return;
      restoreDocumentHistoryVersion(snapshotId).catch(function(){});
    });
  }
  var docOutlineRefreshBtn=document.getElementById('docOutlineRefreshBtn');
  if(docOutlineRefreshBtn&&!docOutlineRefreshBtn.__aqBound){
    docOutlineRefreshBtn.__aqBound=true;
    docOutlineRefreshBtn.addEventListener('click',function(){refreshDocumentOutline();});
  }
  var docOutlineCurrentBtn=document.getElementById('docOutlineCurrentBtn');
  if(docOutlineCurrentBtn&&!docOutlineCurrentBtn.__aqBound){
    docOutlineCurrentBtn.__aqBound=true;
    docOutlineCurrentBtn.addEventListener('click',function(){jumpToCurrentDocumentOutlineTarget();});
  }
  var docOutlineCloseBtn=document.getElementById('docOutlineCloseBtn');
  if(docOutlineCloseBtn&&!docOutlineCloseBtn.__aqBound){
    docOutlineCloseBtn.__aqBound=true;
    docOutlineCloseBtn.addEventListener('click',function(){hideM('docOutlineModal');});
  }
  var docOutlineSearch=document.getElementById('docOutlineSearch');
  if(docOutlineSearch&&!docOutlineSearch.__aqBound){
    docOutlineSearch.__aqBound=true;
    docOutlineSearch.addEventListener('input',function(event){
      docOutlineRuntime.query=String(event&&event.target?event.target.value:'').trim();
      renderDocumentOutline();
    });
  }
  var docOutlineFilter=document.getElementById('docOutlineFilter');
  if(docOutlineFilter&&!docOutlineFilter.__aqBound){
    docOutlineFilter.__aqBound=true;
    docOutlineFilter.addEventListener('change',function(event){
      docOutlineRuntime.filter=String(event&&event.target?event.target.value:'all')||'all';
      renderDocumentOutline();
    });
  }
  var docOutlineList=document.getElementById('docOutlineList');
  if(docOutlineList&&!docOutlineList.__aqBound){
    docOutlineList.__aqBound=true;
    docOutlineList.addEventListener('click',function(event){
      var btn=event&&event.target&&event.target.closest?event.target.closest('[data-outline-jump]'):null;
      if(!btn)return;
      var targetId=String(btn.getAttribute('data-outline-jump')||'').trim();
      if(!targetId)return;
      jumpToDocumentOutlineTarget(targetId);
    });
  }
  var captionManagerRefreshBtn=document.getElementById('captionManagerRefreshBtn');
  if(captionManagerRefreshBtn&&!captionManagerRefreshBtn.__aqBound){
    captionManagerRefreshBtn.__aqBound=true;
    captionManagerRefreshBtn.addEventListener('click',function(){refreshCaptionManager();});
  }
  var captionManagerCloseBtn=document.getElementById('captionManagerCloseBtn');
  if(captionManagerCloseBtn&&!captionManagerCloseBtn.__aqBound){
    captionManagerCloseBtn.__aqBound=true;
    captionManagerCloseBtn.addEventListener('click',function(){hideM('captionManagerModal');});
  }
  var captionManagerList=document.getElementById('captionManagerList');
  if(captionManagerList&&!captionManagerList.__aqBound){
    captionManagerList.__aqBound=true;
    captionManagerList.addEventListener('click',function(event){
      var saveBtn=event&&event.target&&event.target.closest?event.target.closest('[data-caption-save]'):null;
      if(saveBtn){
        var saveId=String(saveBtn.getAttribute('data-caption-save')||'').trim();
        if(saveId)saveCaptionManagerEntry(saveId);
        return;
      }
      var jumpBtn=event&&event.target&&event.target.closest?event.target.closest('[data-caption-jump]'):null;
      if(!jumpBtn)return;
      var jumpId=String(jumpBtn.getAttribute('data-caption-jump')||'').trim();
      if(!jumpId)return;
      hideM('captionManagerModal');
      jumpToDocumentOutlineTarget(jumpId);
    });
  }
  if(captionManagerList&&!captionManagerList.__aqInputBound){
    captionManagerList.__aqInputBound=true;
    captionManagerList.addEventListener('keydown',function(event){
      if(!event||event.key!=='Enter'||event.shiftKey)return;
      var input=event.target;
      if(!input||!input.hasAttribute)return;
      var saveId=String(input.getAttribute('data-caption-title')||input.getAttribute('data-caption-note')||'').trim();
      if(!saveId)return;
      event.preventDefault();
      saveCaptionManagerEntry(saveId);
    });
  }
  var outlineScrollHost=document.getElementById('escroll');
  if(outlineScrollHost&&!outlineScrollHost.__aqOutlineBound){
    outlineScrollHost.__aqOutlineBound=true;
    outlineScrollHost.addEventListener('scroll',function(){scheduleDocumentOutlineRefresh();},{passive:true});
  }
  if(typeof window!=='undefined'&&!window.__aqOutlineResizeBound){
    window.__aqOutlineResizeBound=true;
    window.addEventListener('resize',function(){scheduleDocumentOutlineRefresh();});
  }
  renderCollectionFilter();
}
__bindSprint1PanelEvents();
(function enforceFinalSidebarOverrides(){
  renderCollectionManager=function(){
    var list=document.getElementById('collectionList');
    if(!list)return;
    var ws=currentWorkspaceForCollections();
    var collections=ensureWorkspaceCollections(ws);
    if(!collections.length){
      list.innerHTML='<div class="collection-empty">Henuz koleksiyon yok.</div>';
      return;
    }
    list.innerHTML=collections.map(function(col){
      return '<div class="collection-row">'+
        '<div class="collection-name" title="'+__escHtml(col.name)+'">'+__escHtml(col.name)+'</div>'+
        '<div class="collection-actions">'+
          '<button class="collection-btn" data-col-action="rename" data-col-id="'+__escHtml(col.id)+'">Yeniden Adlandir</button>'+
          '<button class="collection-btn collection-btn-danger" data-col-action="delete" data-col-id="'+__escHtml(col.id)+'">Sil</button>'+
        '</div>'+
      '</div>';
    }).join('');
  };

  renderRelatedPapers=function(){
    var panel=document.getElementById('relatedPanel');
    var list=document.getElementById('relatedList');
    var toggleBtn=document.getElementById('relatedToggleBtn');
    if(!panel||!list)return;
    panel.style.display='block';
    panel.classList.toggle('collapsed',!!relatedPanelCollapsed);
    if(toggleBtn){
      toggleBtn.textContent=relatedPanelCollapsed?'+':'-';
      toggleBtn.title=relatedPanelCollapsed?'Goster':'Kucult';
      toggleBtn.setAttribute('aria-expanded',relatedPanelCollapsed?'false':'true');
    }
    if(!curRef){
      list.innerHTML='<div class="rmeta">Bir kaynak secildiginde benzer makaleler burada gorunur.</div>';
      return;
    }
    var ws=S.wss.find(function(x){return x&&x.id===S.cur;});
    var refs=(ws&&ws.lib)||[];
    var recApi=window.AQReferenceRecommendation||null;
    if(!(recApi&&typeof recApi.relatedPapers==='function')){
      list.innerHTML='<div class="rmeta">Benzer makale motoru hazir degil.</div>';
      return;
    }

    var related=recApi.relatedPapers(curRef,refs,{notes:S.notes||[]}).slice(0,6);
    var localHtml='';
    if(related.length){
      localHtml=related.map(function(item){
        var ref=item.ref||{};
        var reasons=(item.reasons||[]).slice(0,2).join(' · ');
        var authors=__formatRelatedAuthors(ref);
        return '<div class="related-item" data-related-ref="'+__escHtml(ref.id||'')+'">'+
          '<div class="rttl">'+__escHtml((ref.title||'Basliksiz').substring(0,100))+'</div>'+
          '<div class="rmeta">'+__escHtml(authors||'Bilinmeyen')+' · '+__escHtml(ref.year||'t.y.')+(reasons?(' · '+__escHtml(reasons)):'')+'</div>'+
        '</div>';
      }).join('');
    }else{
      localHtml='<div class="rmeta">Kutuphanede benzer kayit bulunamadi.</div>';
    }

    var seedKey=__getWebRelatedSeedKey(curRef);
    webRelatedRuntime.activeSeedKey=seedKey;
    var cache=__ensureWebRelatedCache();
    if(cache&&typeof cache.get==='function'&&(!webRelatedRuntime.resultMap||!webRelatedRuntime.resultMap[seedKey])){
      var cached=cache.get(seedKey);
      if(cached&&Array.isArray(cached.items)){
        if(!webRelatedRuntime.resultMap)webRelatedRuntime.resultMap={};
        webRelatedRuntime.resultMap[seedKey]={
          items:cached.items.slice(),
          fetchedAt:cached.fetchedAt||Date.now()
        };
      }
    }
    var webBucket=webRelatedRuntime.resultMap&&webRelatedRuntime.resultMap[seedKey]||null;
    var webItems=webBucket&&Array.isArray(webBucket.items)?webBucket.items:[];
    var isLoading=(webRelatedRuntime.loadingSeedKey===seedKey);
    var webStateText=webRelatedRuntime.statusText||'';
    var webError=isLoading?'':String(webRelatedRuntime.error||'');

    if(!webBucket&&!isLoading){
      __startWebRelatedFetch({
        id:curRef.id||'',
        title:curRef.title||'',
        authors:Array.isArray(curRef.authors)?curRef.authors.slice():[],
        year:curRef.year||'',
        journal:curRef.journal||'',
        doi:curRef.doi||'',
        url:curRef.url||'',
        abstract:curRef.abstract||''
      },seedKey);
      isLoading=(webRelatedRuntime.loadingSeedKey===seedKey);
      webError=isLoading?'':String(webRelatedRuntime.error||'');
      webStateText=isLoading?'Webde araniyor...':'';
    }
    if(!webStateText){
      if(isLoading)webStateText='Webde araniyor...';
      else if(webError)webStateText='Hata';
      else if(webItems.length)webStateText='Web: '+webItems.length+' sonuc';
      else webStateText='Sonuc yok';
    }

    var webHtml='';
    if(webItems.length){
      webHtml=webItems.map(function(item,idx){
        var authors=__formatRelatedAuthors(item);
        var reasons=(Array.isArray(item.reasons)?item.reasons:[]).slice(0,2).join(' · ');
        var sourceLabel=item.providerLabel||item.provider||'Web';
        return '<div class="related-item" data-related-web-index="'+idx+'" data-related-seed="'+__escHtml(seedKey)+'">'+
          '<div class="rttl">'+__escHtml((item.title||'Basliksiz').substring(0,110))+'</div>'+
          '<div class="rmeta">'+__escHtml(authors||'Bilinmeyen')+' · '+__escHtml(item.year||'t.y.')+(item.journal?(' · '+__escHtml(item.journal)):'')+' · '+__escHtml(sourceLabel)+'</div>'+
          (reasons?('<div class="rreason">Oneri: '+__escHtml(reasons)+'</div>'):'')+
          '<div class="related-actions">'+
            '<button type="button" class="related-act" data-related-action="open-abstract">Ozet</button>'+
            '<button type="button" class="related-act primary" data-related-action="add-active">Workspace\'e ekle</button>'+
            '<button type="button" class="related-act" data-related-action="add-library">Kutuphaneye ekle</button>'+
            '<button type="button" class="related-act" data-related-action="preview">Detay</button>'+
            '<button type="button" class="related-act" data-related-action="find-oa">PDF/OA bul</button>'+
          '</div>'+
        '</div>';
      }).join('');
    }else if(webError){
      webHtml='<div class="rmeta">Web sonuclari alinamadi: '+__escHtml(webError.substring(0,120))+'</div>';
    }else if(isLoading){
      webHtml='<div class="rmeta">Webde benzer makaleler araniyor...</div>';
    }else{
      webHtml='<div class="rmeta">Webde benzer kayit bulunamadi.</div>';
    }

    list.innerHTML=
      '<div class="related-group">'+
        '<div class="related-group-title"><span>Yerel kutuphane</span></div>'+
        '<div class="related-sublist">'+localHtml+'</div>'+
      '</div>'+
      '<div class="related-group">'+
        '<div class="related-group-title"><span>Web sonuclari</span><span class="related-web-state">'+__escHtml(webStateText)+'</span></div>'+
        '<div class="related-sublist">'+webHtml+'</div>'+
      '</div>';
  };

  window.toggleRelatedPanel=function(){
    relatedPanelCollapsed=!relatedPanelCollapsed;
    renderRelatedPapers();
  };
})();
(function installHardOverrides(){
  var st=document.createElement('style');
  var apaStyleEngine=null;
  try{
    if(typeof require==='function'){
      try{ apaStyleEngine=require('./src/apa-style-engine.js'); }
      catch(_firstRequireError){ apaStyleEngine=require('./apa-style-engine.js'); }
    }
  }catch(_e){}
  if(!apaStyleEngine && window.AQApaStyleEngine) apaStyleEngine=window.AQApaStyleEngine;
  var apaEditorBlockCSS=apaStyleEngine && typeof apaStyleEngine.buildEditorBlockCSS==='function'
    ? apaStyleEngine.buildEditorBlockCSS('#apaed .ProseMirror')
    : '#apaed .ProseMirror p{margin:0!important;padding:0!important;text-indent:.5in!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important;}'
      + '#apaed .ProseMirror p.ni{ text-indent:0!important; }';
  var apaEditorHeadingCSS=apaStyleEngine && typeof apaStyleEngine.buildEditorHeadingCSS==='function'
    ? apaStyleEngine.buildEditorHeadingCSS('#apaed .ProseMirror')
    : '#apaed .ProseMirror h1{font-size:12pt!important;font-weight:bold!important;font-style:normal!important;text-align:center!important;text-indent:0!important;line-height:var(--aq-line-spacing,2)!important;}'
      + '#apaed .ProseMirror h2{font-size:12pt!important;font-weight:bold!important;font-style:normal!important;text-align:left!important;text-indent:0!important;line-height:var(--aq-line-spacing,2)!important;}'
      + '#apaed .ProseMirror h3{font-size:12pt!important;font-weight:bold!important;font-style:italic!important;text-align:left!important;text-indent:0!important;line-height:var(--aq-line-spacing,2)!important;}'
      + '#apaed .ProseMirror h4{font-size:12pt!important;font-weight:bold!important;font-style:normal!important;text-align:left!important;text-indent:.5in!important;line-height:var(--aq-line-spacing,2)!important;}'
      + '#apaed .ProseMirror h5{font-size:12pt!important;font-weight:bold!important;font-style:italic!important;text-align:left!important;text-indent:.5in!important;line-height:var(--aq-line-spacing,2)!important;}';
  st.textContent='' +
    '#apaed .ProseMirror{display:block!important;position:relative!important;left:auto!important;right:auto!important;transform:none!important;padding:0!important;margin:0!important;}' +
    '#apaed .ProseMirror>*{position:static!important;left:auto!important;right:auto!important;transform:none!important;max-width:100%!important;}' +
    '#apaed .ProseMirror h1,#apaed .ProseMirror h2,#apaed .ProseMirror h3,#apaed .ProseMirror h4,#apaed .ProseMirror h5,#apaed .ProseMirror blockquote{margin:0!important;padding:0!important;transform:none!important;left:auto!important;right:auto!important;}' +
    apaEditorBlockCSS +
    apaEditorHeadingCSS +
    '#apaed .ProseMirror ul,#apaed .ProseMirror ol{margin:0 0 0 .5in!important;padding-left:.24in!important;list-style-position:outside!important;transform:none!important;left:auto!important;right:auto!important;}' +
    '#apaed .ProseMirror li{display:list-item!important;text-indent:0!important;margin:0!important;padding-left:.04in!important;}' +
    '#relatedList .related-item .related-actions{display:flex!important;flex-wrap:wrap!important;gap:6px!important;margin-top:8px!important;}' +
    '#relatedList .related-item .related-actions .related-act{appearance:none!important;border:1px solid rgba(153,171,182,.52)!important;background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(248,252,254,.92))!important;color:var(--txt2)!important;border-radius:999px!important;font-family:var(--fm)!important;font-size:10px!important;letter-spacing:.01em!important;padding:5px 11px!important;min-height:28px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;box-shadow:0 2px 8px rgba(35,59,73,.08)!important;}' +
    '#relatedList .related-item .related-actions .related-act.primary{border-color:rgba(85,122,146,.58)!important;background:linear-gradient(180deg,rgba(102,139,163,.18),rgba(95,132,157,.14))!important;color:#2f5063!important;font-weight:600!important;}' +
    '#relatedList .related-item .related-actions .related-act:hover{border-color:var(--acc)!important;color:var(--acc)!important;box-shadow:0 6px 14px rgba(35,59,73,.12)!important;transform:translateY(-1px)!important;}' +
    '#apapage{overflow:visible!important;}';
  document.head.appendChild(st);
})();
var __aqDocSwitching=false;
function __aqBlankDocHTML(){return '<p></p>';}
function __aqCommitActiveDoc(){
  var currentDocId=ensureScopedCurrentDoc();
  if(window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.commitEditorDocumentFromContext==='function'){
    return window.AQTipTapWordDocument.commitEditorDocumentFromContext({
      isSwitching:__aqDocSwitching,
      state:S,
      currentDocId:currentDocId,
      blankHTML:__aqBlankDocHTML,
      editor:editor||null,
      shell:window.AQTipTapShell||null,
      host:document.getElementById('apaed'),
      sanitizeHTML:sanitizeDocHTML,
      documentStateApi:window.AQDocumentState||null
    });
  }
  if(window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.commitEditorDocumentWithState==='function'){
    return window.AQTipTapWordDocument.commitEditorDocumentWithState({
      isSwitching:__aqDocSwitching,
      state:S,
      currentDocId:currentDocId,
      blankHTML:__aqBlankDocHTML(),
      getHTML:getCurrentEditorHTML,
      sanitizeHTML:sanitizeDocHTML,
      documentStateApi:window.AQDocumentState||null
    });
  }
  var html=getCurrentEditorHTML();
  if(window.AQDocumentState&&typeof window.AQDocumentState.commitActiveDoc==='function'){
    html=window.AQDocumentState.commitActiveDoc(S,html,{sanitize:sanitizeDocHTML});
  }else{
    html=sanitizeDocHTML(html);
    var cur=S.docs.find(function(d){return d.id===S.curDoc;});
    if(cur)cur.content=html;
    S.doc=html;
  }
  return html||__aqBlankDocHTML();
}
function __aqSetEditorDoc(html,focusAtEnd){
  if(window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.loadEditorDocumentFromContext==='function'){
    return window.AQTipTapWordDocument.loadEditorDocumentFromContext({
      html:html||__aqBlankDocHTML(),
      blankHTML:__aqBlankDocHTML,
      sanitizeHTML:sanitizeDocHTML,
      editor:editor||null,
      shell:window.AQTipTapShell||null,
      host:document.getElementById('apaed'),
      runtimeApi:window.AQEditorRuntime||null,
      setSwitching:function(value){ __aqDocSwitching=!!value; },
      setSuppressSave:function(value){ suppressDocSave=!!value; },
      ensureEditableRoot:ensureEditableRoot,
      focusAtEnd:!!focusAtEnd,
      focusToEndFn:function(){ if(editor)editor.commands.focus('end'); },
      focusSurfaceFn:function(){ focusEditorSurface(true); },
      normalize:normalizeCitationSpans,
      syncRefs:function(){
        updateRefSection();
        syncAuxiliaryPages();
      },
      syncChrome:uSt,
      updatePageHeight:updatePageHeight,
      afterLayout:function(){ rDocTabs(); syncAuxiliaryPages(); }
    });
  }
  if(window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.loadEditorDocumentWithState==='function'){
    return window.AQTipTapWordDocument.loadEditorDocumentWithState({
      html:html||__aqBlankDocHTML(),
      blankHTML:__aqBlankDocHTML(),
      sanitizeHTML:sanitizeDocHTML,
      editor:editor||null,
      shell:window.AQTipTapShell||null,
      host:document.getElementById('apaed'),
      runtimeApi:window.AQEditorRuntime||null,
      beforeSet:function(){
        __aqDocSwitching=true;
        suppressDocSave=true;
      },
      beforeApply:function(){
        suppressDocSave=false;
        __aqDocSwitching=false;
        ensureEditableRoot();
      },
      focusAtEnd:!!focusAtEnd,
      focusToEndFn:function(){ if(editor)editor.commands.focus('end'); },
      focusSurfaceFn:function(){ focusEditorSurface(true); },
      normalize:normalizeCitationSpans,
      syncRefs:function(){
        updateRefSection();
        syncAuxiliaryPages();
      },
      syncChrome:uSt,
      syncLayout:function(){
        if(window.AQEditorRuntime&&typeof window.AQEditorRuntime.syncPageLayout==='function')window.AQEditorRuntime.syncPageLayout();
        else updatePageHeight();
      },
      afterLayout:function(){ rDocTabs(); syncAuxiliaryPages(); }
    });
  }
  if(window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.prepareLoadedHTML==='function'){
    html=window.AQTipTapWordDocument.prepareLoadedHTML(html||__aqBlankDocHTML(),__aqBlankDocHTML());
  }
  __aqDocSwitching=true;
  suppressDocSave=true;
  function finalizeDocSwitch(target){
    if(window.AQEditorRuntime&&typeof window.AQEditorRuntime.runDocumentLoadEffects==='function'){
      window.AQEditorRuntime.runDocumentLoadEffects({
        target:target||null,
        beforeApply:function(){
          suppressDocSave=false;
          __aqDocSwitching=false;
          ensureEditableRoot();
        },
        focusToEnd:!!focusAtEnd&&!!editor,
        focusToEndFn:function(){ if(editor)editor.commands.focus('end'); },
        focusSurface:!!focusAtEnd&&!editor,
        focusSurfaceFn:function(){ focusEditorSurface(true); },
        afterLayout:function(){ rDocTabs(); syncAuxiliaryPages(); }
      });
      return;
    }
    suppressDocSave=false;
    __aqDocSwitching=false;
    ensureEditableRoot();
    normalizeCitationSpans(target||undefined);
    if(focusAtEnd&&editor)editor.commands.focus('end');
    else if(focusAtEnd&&!editor)focusEditorSurface(true);
    updateRefSection();
    syncAuxiliaryPages();
    uSt();
    if(window.AQEditorRuntime&&typeof window.AQEditorRuntime.syncPageLayout==='function')window.AQEditorRuntime.syncPageLayout();
    else updatePageHeight();
    rDocTabs();
  }
  html=sanitizeDocHTML(html||__aqBlankDocHTML());
  if(editor){
    try{
      editor.commands.setContent(html,false);
    }catch(ex){
      console.warn('set editor doc error:',ex);
    }
    finalizeDocSwitch(editor&&editor.view?editor.view.dom:null);
    return;
  }
  setCurrentEditorHTML(html);
  finalizeDocSwitch(document.getElementById('apaed'));
}
function save(){
  if(suppressDocSave||__aqDocSwitching)return;
  clearTimeout(syncTimer);
  syncDirty=true;
  setAutosaveDirty();
  scheduleEditorDraftSave();
  syncTimer=setTimeout(function(){
    if(suppressDocSave||__aqDocSwitching||!syncDirty)return;
    syncDirty=false;
    syncSave();
  },1200);
}
function __aqBuildPersistedStateJSON(){
  var html=__aqCommitActiveDoc();
  S.doc=html;
  var toSave=window.AQSyncState&&typeof window.AQSyncState.buildPersistedState==='function'
    ? window.AQSyncState.buildPersistedState(S,{serialize:(window.AQStateSchema&&typeof window.AQStateSchema.serialize==='function'?window.AQStateSchema.serialize:null),sanitize:sanitizeDocHTML})
    : window.AQStateSchema&&typeof window.AQStateSchema.serialize==='function'
    ? window.AQStateSchema.serialize(S,{sanitize:sanitizeDocHTML})
    : {
        schemaVersion:2,
        wss:S.wss.map(function(ws){return {id:ws.id,name:ws.name,docId:ws.docId,lib:(ws.lib||[]).map(function(r){var c=Object.assign({},r);delete c.pdfData;return c;})};}),
        cur:S.cur,notebooks:S.notebooks,curNb:S.curNb,notes:S.notes,doc:html,cm:S.cm,
        docs:S.docs,curDoc:S.curDoc,showPageNumbers:S.showPageNumbers,customLabels:S.customLabels||[]
      };
  return JSON.stringify(toSave);
}
function scheduleEditorDraftSave(){
  if(typeof window.electronAPI==='undefined'||typeof window.electronAPI.saveEditorDraft!=='function')return;
  clearTimeout(editorDraftTimer);
  editorDraftTimer=setTimeout(function(){
    saveEditorDraftNow();
  },320);
}
async function saveEditorDraftNow(){
  if(suppressDocSave||__aqDocSwitching)return;
  if(typeof window.electronAPI==='undefined'||typeof window.electronAPI.saveEditorDraft!=='function')return;
  if(editorDraftInFlight){
    editorDraftQueued=true;
    return;
  }
  editorDraftInFlight=true;
  try{
    await window.electronAPI.saveEditorDraft(__aqBuildPersistedStateJSON());
  }catch(e){
    logStability('saveEditorDraftNow',e);
  }finally{
    editorDraftInFlight=false;
    if(editorDraftQueued){
      editorDraftQueued=false;
      saveEditorDraftNow();
    }
  }
}
syncSave=async function(){
  if(__aqDocSwitching){
    syncDirty=true;
    setAutosaveDirty();
    return;
  }
  if(syncInFlight){
    syncQueued=true;
    return syncInFlight;
  }
  syncInFlight=(async function(){
    setAutosaveSaving();
    var json=__aqBuildPersistedStateJSON();
    if(typeof window.electronAPI!=='undefined'){
      try{
        var saveResult=await window.electronAPI.saveData(json);
        if(!saveResult||saveResult.ok===false)throw new Error((saveResult&&saveResult.error)||'Kaydetme basarisiz');
      }catch(e){
        logStability('syncSave.electron',e);
        setAutosaveError(e&&e.message?e.message:'Kaydetme hatasi');
        throw e;
      }
    }
    if(typeof window.electronAPI==='undefined'){try{localStorage.setItem('aqR2',json);}catch(e){logStability('syncSave.localStorage',e);}}
    try{
      var pm=window.AQSyncState&&typeof window.AQSyncState.buildPDFCacheMap==='function'
        ? window.AQSyncState.buildPDFCacheMap(S.wss)
        : (function(){
            var cache={};
            S.wss.forEach(function(ws){(ws.lib||[]).forEach(function(r){if(r.pdfData)cache[r.id]=r.pdfData;});});
            return cache;
          })();
      localStorage.setItem('aqPDF2',JSON.stringify(pm));
    }catch(e){
      logStability('syncSave.pdfCache',e);
    }
    setAutosaveSaved();
  })();
  try{return await syncInFlight;}finally{
    syncInFlight=null;
    if(syncQueued){
      syncQueued=false;
      return syncSave();
    }
  }
};
deleteCustomLabel=function(name){
  var labelName=String(name||'').trim();
  if(!labelName)return;
  var customLabels=(S.customLabels||[]).map(function(l){return typeof l==='string'?{name:l,color:'#b6873f'}:l;});
  if(!customLabels.some(function(l){return l&&l.name===labelName;}))return;
  if(!confirm('"'+labelName+'" etiketi silinsin?'))return;
  S.customLabels=customLabels.filter(function(l){return l&&l.name!==labelName;});
  S.wss.forEach(function(ws){
    (ws.lib||[]).forEach(function(ref){
      ref.labels=(ref.labels||[]).filter(function(l){
        return (typeof l==='string'?l:((l&&l.name)||''))!==labelName;
      });
    });
  });
  if(activeLabelFilter===labelName)activeLabelFilter=null;
  rLabelFilter();
  rLib();
  save();
};
updatePageHeight=function(){
  clearTimeout(_pgTimer);
  _pgTimer=setTimeout(function(){
    var page=document.getElementById('apapage');
    var ed=editor?editor.view.dom:document.getElementById('apaed');
    var sc=(window.AQEditorIntegration&&typeof window.AQEditorIntegration.getScrollEl==='function')
      ? window.AQEditorIntegration.getScrollEl()
      : document.getElementById('escroll');
    if(!page||!ed)return;
    if(window.AQEditorShell&&typeof window.AQEditorShell.syncLayout==='function'){
      try{window.AQEditorShell.syncLayout();}catch(e){}
    }
    if(window.AQTipTapWordLayout&&typeof window.AQTipTapWordLayout.syncPageMetrics==='function'){
      try{
        window.AQTipTapWordLayout.syncPageMetrics({
          page:page,
          editorDom:ed,
          editorView:editor?editor.view:null,
          scrollEl:sc,
          showPageNumbers:S.showPageNumbers,
          pageHeight:1123,
          pageContentHeight:931,
          pageGap:32,
          pageTotalHeight:1155,
          pageVerticalPadding:192
        });
        return;
      }catch(e){}
    }
    var PAGE_CONTENT_HEIGHT=931;
    var PAGE_TOTAL_HEIGHT=1155;
    var PAGE_VERTICAL_PADDING=192;
    page.querySelectorAll('.page-number').forEach(function(pb){pb.remove();});
    var contentH=Math.max(ed.scrollHeight||0,ed.offsetHeight||0,PAGE_CONTENT_HEIGHT);
    var numPages=Math.max(1,Math.ceil(contentH/PAGE_CONTENT_HEIGHT));
    var viewportMinHeight=sc?Math.max(PAGE_TOTAL_HEIGHT,sc.clientHeight+44):PAGE_TOTAL_HEIGHT;
    page.style.minHeight=Math.max(viewportMinHeight,numPages*PAGE_TOTAL_HEIGHT,contentH+PAGE_VERTICAL_PADDING)+'px';
    if(!S.showPageNumbers)return;
    for(var p=0;p<numPages;p++){
      var pn=document.createElement('div');
      pn.className='page-number';
      pn.textContent=String(p+1);
      pn.style.top=(48+p*PAGE_TOTAL_HEIGHT)+'px';
      page.appendChild(pn);
    }
  },80);
};
;(function installNoteSurfaceFix(){
  var st=document.getElementById('aq-note-surface-fix');
  if(st)st.remove();
  st=document.createElement('style');
  st.id='aq-note-surface-fix';
  st.textContent=
    '[data-theme="dark"] #sbr,[data-theme="dark"] #rpnotes,[data-theme="dark"] #noteinp,[data-theme="dark"] #rtype{background:rgba(251,244,232,.98)!important;color:#2d2419!important;border-color:rgba(110,91,60,.34)!important;}'+
    '[data-theme="dark"] #notelist{background:rgba(251,244,232,.98)!important;}'+
    '[data-theme="dark"] #notelist .nc{background:rgba(255,248,236,.98)!important;border:1px solid rgba(110,91,60,.34)!important;color:#2d2419!important;box-shadow:none!important;}'+
    '[data-theme="dark"] #rpnotes,[data-theme="dark"] #rpnotes *{color:#2d2419!important;}'+
    '[data-theme="dark"] #notelist .nctxt{color:#2d2419!important;}'+
    '[data-theme="dark"] #notelist .ncq{color:#5f4e38!important;background:rgba(255,250,241,.82)!important;}'+
    '[data-theme="dark"] #notelist .ncsrc,[data-theme="dark"] #notelist .ncb,[data-theme="dark"] #notelist .ncdel{color:#6a563d!important;}'+
    '[data-theme="dark"] #notelist .nc *,[data-theme="dark"] #notelist .ncb,[data-theme="dark"] #notelist .ncdel{color:#2d2419!important;background:transparent!important;}'+
    '[data-theme="dark"] #rtype .rtab{color:#6a563d!important;}'+
    '[data-theme="dark"] #rtype .rtab.on{color:#8d6730!important;border-bottom-color:#b6873f!important;background:rgba(182,135,63,.10)!important;}'+
    '[data-theme="dark"] #nbtabs .nbtab{color:#6a563d!important;background:rgba(255,251,244,.72)!important;}'+
    '[data-theme="dark"] #nbtabs .nbtab.on{color:#8d6730!important;background:rgba(182,135,63,.12)!important;box-shadow:inset 0 0 0 1px rgba(182,135,63,.22)!important;}'+
    '[data-theme="dark"] #noteta,[data-theme="dark"] #notetag{background:rgba(255,251,244,.98)!important;border-color:rgba(110,91,60,.34)!important;color:#2d2419!important;}'+
    '[data-theme="dark"] #noteta::placeholder,[data-theme="dark"] #notetag::placeholder{color:#8c7860!important;}';
  document.head.appendChild(st);
})();
