pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.min.js';

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
var labelFilterPanelOpen=false;

var pdfDoc=null,pdfPg=1,pdfTotal=0,pdfScale=0,curRef=null; // 0=auto
var pdfTabs=[],activeTabId=null; // {id,title,refId,pdfData,scrollPos,hlData,annots}
var trigOn=false,trigIdx=-1,savedRange=null;
var trigSelected=[]; // çoklu atıf seçim listesi
var editorTrigRange=null;
var hlColor='#fef08a';
var selText='',selPageNum=1,selRangeObj=null;
var hlData=[]; // [{page,color,rects}] — highlight kalıcı veri
var syncTimer=null,syncDirty=false,syncInFlight=null;
var citationBatchBusy=false;
var oaBatchBusy=false;
var addDoiBusy=false;
var workspaceMutationBusy=false;
var switchWsBusy=false;
var pdfRenderTokenId=0;
var currentPdfRenderToken=null;
var pdfFetchToken=0;


// ¦¦ SYNC ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function setSL(msg,cls){
  var e=document.getElementById('synclbl');
  if(!msg){e.textContent='';e.className='';return;}
  e.textContent=msg;e.className=cls;
}
function logStability(scope,error,meta){
  try{
    if(window.AQStability&&typeof window.AQStability.capture==='function'){
      window.AQStability.capture(scope,error,meta||null);
    }
  }catch(_e){}
}

async function syncLoad(){
  var d=null;
  // Electron: dosyadan oku
  if(typeof window.electronAPI!=='undefined'){
    try{
      setSL('v yükleniyor...','ld');
      var res=await window.electronAPI.loadData();
      if(res.ok&&res.data)d=JSON.parse(res.data);
      if(res.dir)document.title='AcademiQ — '+res.dir;
      if(res.restoredFromBackup){
        setSL('Yedek veri dosyasi yuklendi','ld');
        setTimeout(function(){setSL('','');},4000);
      }else{
      setSL('','');
      }
    }catch(e){
      logStability('syncLoad.electron',e);
      setSL('','');
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
    if(!doc.bibliographyManual&&!hasCitation&&String(doc.bibliographyHTML||'').trim()){
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
  ref.title=String(ref.title||'').replace(/\s+/g,' ').trim();
  var y=String(ref.year||'').trim();
  var yMatch=y.match(/\b(19|20)\d{2}\b/);
  ref.year=yMatch?yMatch[0]:y;
  ref.doi=normalizeRefDoi(ref.doi||ref.url||'');
  if(Array.isArray(ref.authors)){
    ref.authors=ref.authors.map(function(a){return String(a||'').replace(/\s+/g,' ').trim();}).filter(Boolean);
  }else{
    ref.authors=[];
  }
  return ref;
}
function refKey(ref){
  if(!ref)return'';
  var doi=normalizeRefDoi(ref.doi||'');
  if(doi)return'doi:'+doi;
  var title=String(ref.title||'').trim().replace(/\s+/g,' ').toLowerCase();
  var year=(ref.year||'').trim().toLowerCase();
  var author=(ref.authors&&ref.authors[0]?ref.authors[0]:'').trim().replace(/\s+/g,' ').toLowerCase();
  // Zayıf metadata çakışmalarında yanlış PDF yayılımını önlemek için
  // meta-key'i yalnızca yeterli sinyal varsa üret.
  if(title.length<8)return'id:'+String(ref.id||'');
  if(!author&&!year)return'id:'+String(ref.id||'');
  return 'meta:'+author+'|'+year+'|'+title;
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
async function hydrateRefPDF(ref){
  if(!ref)return false;
  if(ref.pdfData)return true;
  if(typeof window.electronAPI==='undefined')return false;
  try{
    var direct=await window.electronAPI.loadPDF(ref.id);
    if(direct&&direct.ok&&direct.buffer){
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
      if(cand.pdfData){
        ref.pdfData=cand.pdfData;
        if(cand.pdfUrl&&!ref.pdfUrl)ref.pdfUrl=cand.pdfUrl;
        if(cand.url&&!ref.url)ref.url=cand.url;
        persistBorrowedPDF(ref);
        return true;
      }
      try{
        var res=await window.electronAPI.loadPDF(cand.id);
        if(res&&res.ok&&res.buffer){
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
        if(!ref.pdfData&&eq.pdfData)ref.pdfData=eq.pdfData;
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
      r.volume||'',
      r.issue||''
    ].join(' ').toLowerCase();
    return tokens.every(function(token){return hay.indexOf(token)>=0;});
  }));
}
function curNotes(){return S.notes.filter(function(n){return n.nbId===S.curNb;});}

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
function apa7(d){var c='';var a=fal(d.authors||[]);if(a)c+=a+' ';c+='('+(d.year||'t.y.')+('). ');c+=fT(d.title||'')+'. ';if(d.journal){c+=d.journal;if(d.volume){c+=', '+d.volume;if(d.issue)c+='('+d.issue+')';}if(d.fp){c+=', '+d.fp;if(d.lp)c+='\u2013'+d.lp;}c+='. ';}if(d.doi)c+='https://doi.org/'+d.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i,'');else if(d.url)c+=d.url;return c.trim();}
function inText(d,mode){var au=(d.authors||[]).map(fa).filter(Boolean);var ls=au.map(function(a){return a.split(',')[0].trim();});var ap=ls.length===0?'Bilinmeyen':ls.length===1?ls[0]:ls.length===2?ls[0]+' & '+ls[1]:ls[0]+' vd.';var yr=d.year||'t.y.';return mode==='footnote_explicit'?ap+', '+yr+'.':'('+ap+', '+yr+')';}
function getInlineCitationText(ref){
  if(window.AQCitationState&&typeof window.AQCitationState.getInlineCitationText==='function'){
    return window.AQCitationState.getInlineCitationText(ref,{
      formatAuthor:fa,
      sortReferences:sortLib,
      dedupeReferences:dedupeRefs
    });
  }
  return inText(ref,'inline');
}
function shortRef(d){var a=d.authors&&d.authors[0]?d.authors[0].split(',')[0]:'?';if(d.authors&&d.authors.length>1)a+=' et al.';return a+' ('+(d.year||'t.y.')+')';}
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
  return (refs||[]).slice().sort(function(a,b){
    return apaSortKey(a).localeCompare(apaSortKey(b),'tr',{numeric:true,sensitivity:'base'});
  });
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
  var doi=document.getElementById('doiinp').value.trim();
  if(!doi){setDst('DOI boş.','er');addDoiBusy=false;refreshBusyControls();return;}
  // DOI temizle
  doi=doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i,'').trim();
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
    'title','year','journal','volume','issue','fp','lp','doi','url','pdfUrl',
    'publisher','edition','booktitle','location','language','abstract','note'
  ].forEach(function(k){
    if(source[k]&&!target[k])target[k]=source[k];
  });
  if((source.authors||[]).length&&!(target.authors||[]).length)target.authors=source.authors.slice();
  if((source.labels||[]).length){
    target.labels=Array.from(new Set([].concat(target.labels||[],source.labels||[]).filter(Boolean)));
  }
  if(source.pdfData&&!target.pdfData)target.pdfData=source.pdfData;
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
  function propagatePDF(buffer){
    if(!r)return;
    normalizeRefRecord(r);
    r.pdfData=buffer;
    if(fetchUrl&&!r.pdfUrl)r.pdfUrl=fetchUrl;
    S.wss.forEach(function(ws){
      (ws.lib||[]).forEach(function(cand){
        if(!cand||cand.id===r.id)return;
        normalizeRefRecord(cand);
        if(!refsLikelySame(cand,r))return;
        if(buffer&&!cand.pdfData)cand.pdfData=buffer;
        if(fetchUrl&&!cand.pdfUrl)cand.pdfUrl=fetchUrl;
        if(r.url&&!cand.url)cand.url=r.url;
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
    window.electronAPI.downloadPDFfromURL(fetchUrl, r.id, dlOptions).then(function(res){
      if(res.ok){
        window.electronAPI.loadPDF(r.id).then(function(pr){
          if(pr.ok){propagatePDF(pr.buffer);curRef=r;rLib();renderPDF(pr.buffer,activeTabId||null);setDst('? PDF indirildi (Electron)','ok');setTimeout(function(){setDst('','');},3000);}
        });
      } else {
        setDst('Electron indirme hatasi: '+res.error,'er');
        showNoPDF(r);
      }
    }).catch(function(e){setDst('Electron hatasi','er');showNoPDF(r);});
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
    if(!r.pdfData&&eq.pdfData)r.pdfData=eq.pdfData;
    if(!r.pdfUrl&&eq.pdfUrl)r.pdfUrl=eq.pdfUrl;
    if(!r.url&&eq.url)r.url=eq.url;
    if(r.pdfData)persistBorrowedPDF(r);
  }
  curRef=r;rLib();
  document.getElementById('pdfpanel').classList.add('open');
  document.getElementById('pdftitle').textContent=(r.title||r.doi||'PDF').substring(0,55);
  if(r.pdfData){addPdfTab(r.title||r.doi||'PDF',r.pdfData,r.id);return;}
  if(typeof window.electronAPI!=='undefined'){
    try{
      var hydrated=await hydrateRefPDF(r);
      if(hydrated&&r.pdfData){
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
  save();rLib();rRefs();
}
function showLabelMenu(x,y,ref){
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
function hideCtx(){document.getElementById('ctxmenu').classList.remove('show');}
document.addEventListener('click',function(e){if(!e.target.closest('#ctxmenu'))hideCtx();});
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
        if(existing){existing.pdfData=orig;curRef=existing;}
        else{cLib().push(ref);curRef=ref;}
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
function attachFetchedPDF(refId,buffer,url){
  var ref=findRef(refId);
  if(!ref)return;
  normalizeRefRecord(ref);
  ref.pdfData=buffer;
  if(url&&!ref.pdfUrl)ref.pdfUrl=url;
  if(url&&!ref.url)ref.url=url;
  S.wss.forEach(function(ws){
    (ws.lib||[]).forEach(function(cand){
      if(!cand||cand.id===ref.id)return;
      normalizeRefRecord(cand);
      if(!refsLikelySame(cand,ref))return;
      if(!cand.pdfData)cand.pdfData=buffer;
      if(url&&!cand.pdfUrl)cand.pdfUrl=url;
      if(url&&!cand.url)cand.url=url;
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
  window.electronAPI.downloadPDFfromURL(u,refId,dlOptions)
    .then(function(res){
      if(!isPdfFetchTokenActive(fetchToken))return;
      if(res.ok){
        return window.electronAPI.loadPDF(refId).then(function(pr){
          if(!isPdfFetchTokenActive(fetchToken))return;
          if(pr.ok){
            attachFetchedPDF(refId,pr.buffer,u);
            var refLoaded=findRef(refId);
            addPdfTab((refLoaded&&refLoaded.title)||'PDF',pr.buffer,refId);
            setDst('PDF indirildi ('+Math.round(res.size/1024)+' KB)','ok');
            setTimeout(function(){setDst('','');},3000);
          } else {
            electronFetchChain(urls,idx+1,refId,fetchToken);
          }
        });
      } else {
        // Bu URL basarisiz, sonrakini dene
        electronFetchChain(urls,idx+1,refId,fetchToken);
      }
    })
    .catch(function(e){
      if(!isPdfFetchTokenActive(fetchToken))return;
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

function getScale(){
  var w=document.getElementById('pdfscroll').clientWidth||560;
  if(pdfScale>0)return pdfScale;
  return Math.max(0.6,Math.min((w-28)/595,2.2));
}

function renderPDF(buf,sourceTabId){
  clearPDFView();
  var renderToken=createPdfRenderToken(sourceTabId);
  loadHLData();
  var safeBuf;
  try{safeBuf=(buf instanceof ArrayBuffer)?buf.slice(0):(buf.slice?buf.slice(0):new Uint8Array(buf));}
  catch(e){console.error('PDF buffer error:',e);setDst('PDF verisi bozuk','er');return;}

  pdfjsLib.getDocument({data:safeBuf}).promise.then(function(pdf){
    if(!isPdfRenderTokenActive(renderToken))return;
    pdfDoc=pdf;pdfTotal=pdf.numPages;pdfPg=1;
    renderedPages={};pdfTextCache={};
    updPgLabel();
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
        if(!tc||!tc.items||!tc.items.length){paintHL(hlc,n);return;}
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
  currentPdfRenderToken=null;
  pdfRenderTokenId++;
  pdfFetchToken++;
  if(pageObserver)pageObserver.disconnect();
  if(lazyObserver)lazyObserver.disconnect();
  pdfDoc=null;pdfPg=1;pdfTotal=0;
  pdfTextCache={};renderedPages={};
  pdfSearchResults=[];pdfSearchIdx=-1;
  var pgEl=document.getElementById('pdfpg');if(pgEl)pgEl.textContent='--';
  var zmEl=document.getElementById('pdfzoom');if(zmEl)zmEl.textContent='--';
  var sc=document.getElementById('pdfscroll');if(sc)sc.innerHTML='';
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
  var tab=next&&next.activeTab?next.activeTab:{id:'tab_'+Date.now(),title:(title||'PDF').substring(0,40),refId:refId||null,wsId:S.cur,pdfData:pdfData,scrollPos:0,hlData:[],annots:[]};
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
        annots:collectAnnotsFromDOM()
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
  // Update curRef
  if(tab.refId){var ref=findRef(tab.refId);if(ref)curRef=ref;}else{curRef=null;}
  hlData=tab.hlData?tab.hlData.slice():[];
  renderPdfTabs();
  renderPDF(tab.pdfData,activeTabId||tab.id);
  // Restore scroll position after render
  setTimeout(function(){
    var sc=document.getElementById('pdfscroll');
    if(sc&&tab.scrollPos)sc.scrollTop=tab.scrollPos;
    // Restore annotations
    restoreAnnots(tab.annots);
  },200);
}
function closePdfTab(tabId){
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
  var wsTabs=next&&next.workspaceTabs?next.workspaceTabs:getWsTabs();
  if(wsTabs.length===0){
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
    ctx.strokeStyle=hlColor||'#c9453e';
    ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';
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
function toggleAnnotMode(){
  annotMode=!annotMode;
  if(!annotMode)drawMode=false;
  var btn=document.getElementById('annotbtn');
  if(btn){btn.style.color=annotMode?'var(--acc)':'';btn.style.background=annotMode?'var(--acc-g)':'';}
  var dbtn=document.getElementById('drawbtn');
  if(dbtn){dbtn.style.color=drawMode?'var(--acc)':'';dbtn.style.background=drawMode?'var(--acc-g)':'';}
  // Change cursor on PDF pages
  document.querySelectorAll('.pdf-page-wrap').forEach(function(w){w.style.cursor=annotMode?'crosshair':'';});
}
function toggleDrawMode(){
  drawMode=!drawMode;
  if(drawMode&&!annotMode){annotMode=true;var btn=document.getElementById('annotbtn');if(btn){btn.style.color='var(--acc)';btn.style.background='var(--acc-g)';}}
  var dbtn=document.getElementById('drawbtn');
  if(dbtn){dbtn.style.color=drawMode?'var(--acc)':'';dbtn.style.background=drawMode?'var(--acc-g)':'';}
  document.querySelectorAll('.pdf-page-wrap').forEach(function(w){w.style.cursor=drawMode?'crosshair':(annotMode?'crosshair':'');});
}

// Page tracking
var pageObserver=null;
function setupPageTracking(){
  if(pageObserver)pageObserver.disconnect();
  var sc=document.getElementById('pdfscroll');
  pageObserver=new IntersectionObserver(function(entries){
    var best=null,bestR=0;
    entries.forEach(function(e){if(e.isIntersecting&&e.intersectionRatio>bestR){bestR=e.intersectionRatio;best=e.target;}});
    if(best&&best.dataset&&best.dataset.page){var pg=parseInt(best.dataset.page);if(pg&&pg!==pdfPg){pdfPg=pg;updPgLabel();updateThumbHL();}}
  },{root:sc,threshold:[0,0.25,0.5,0.75,1]});
  sc.querySelectorAll('.pdf-page-wrap').forEach(function(w){pageObserver.observe(w);});
}

function showNoPDF(ref){
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
function scrollToPage(n){var w=document.querySelector('.pdf-page-wrap[data-page="'+n+'"]');if(w)w.scrollIntoView({behavior:'smooth',block:'start'});updPgLabel();}
function updPgLabel(){
  var pgEl=document.getElementById('pdfpg');
  var zmEl=document.getElementById('pdfzoom');
  if(pgEl) pgEl.textContent=pdfPg+'/'+pdfTotal;
  if(zmEl) zmEl.textContent=Math.round((pdfScale||getScale())*100)+'%';
}
function pZI(){pdfScale=Math.min(((pdfScale||getScale())+0.15),4);if(curRef&&curRef.pdfData)renderPDF(curRef.pdfData,activeTabId||null);updPgLabel();}
function pZO(){pdfScale=Math.max(((pdfScale||getScale())-0.15),0.3);if(curRef&&curRef.pdfData)renderPDF(curRef.pdfData,activeTabId||null);updPgLabel();}
function pZFit(){pdfScale=0;if(curRef&&curRef.pdfData)renderPDF(curRef.pdfData,activeTabId||null);updPgLabel();}
function togglePDF(){var p=document.getElementById('pdfpanel');if(p.classList.contains('fullscreen')){p.classList.remove('fullscreen');document.getElementById('pdffullbtn').innerHTML='&#x26F6;';}p.classList.toggle('open');}
function togglePdfFullscreen(){var p=document.getElementById('pdfpanel');p.classList.toggle('fullscreen');document.getElementById('pdffullbtn').innerHTML=p.classList.contains('fullscreen')?'&#x2716;':'&#x26F6;';if(p.classList.contains('fullscreen')){document.getElementById('pdfresize').style.display='none';}else{document.getElementById('pdfresize').style.display='';}if(pdfDoc&&curRef&&curRef.pdfData){pdfScale=0;renderPDF(curRef.pdfData,activeTabId||null);}}
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
    if(!pdfTextCache[p]){
      try{
        var page=await pdfDoc.getPage(p);
        var tc=await page.getTextContent({normalizeWhitespace:true});
        if(tc&&tc.items)pdfTextCache[p]=tc.items;
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
function toggleFindBar(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.toggleSearchWithState==='function'){
    window.AQTipTapWordFind.toggleSearchWithState({
      doc:document,
      state:findState,
      host:document.getElementById('apaed')
    });
    return;
  }
  var bar=document.getElementById('findbar');
  if(bar.style.display==='none'){
    bar.style.display='block';
    var inp=document.getElementById('findinp');
    inp.focus();inp.select();
  }else{closeFindBar();}
}
function closeFindBar(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.closeSearchWithState==='function'){
    window.AQTipTapWordFind.closeSearchWithState({
      doc:document,
      state:findState,
      host:document.getElementById('apaed')
    });
    return;
  }
  document.getElementById('findbar').style.display='none';
  clearFindHL();
  findState.matches=[];findState.index=-1;
  document.getElementById('findcount').textContent='--';
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
function findExec(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.executeSearchWithState==='function'){
    window.AQTipTapWordFind.executeSearchWithState({
      doc:document,
      host:document.getElementById('apaed'),
      state:findState
    });
    return;
  }
}
function highlightActive(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.highlightActive==='function'){
    if(window.AQTipTapWordFind.highlightActive({
      state:findState,
      countEl:document.getElementById('findcount')
    }))return;
  }
}
function findNext(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.navigateSearch==='function'){
    if(window.AQTipTapWordFind.navigateSearch({
      doc:document,
      state:findState,
      forward:true
    }))return;
  }
}
function findPrev(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.navigateSearch==='function'){
    if(window.AQTipTapWordFind.navigateSearch({
      doc:document,
      state:findState,
      forward:false
    }))return;
  }
}
function replaceCurrent(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.replaceSearchWithState==='function'){
    if(window.AQTipTapWordFind.replaceSearchWithState({
      doc:document,
      state:findState,
      onMutate:function(){
        runEditorMutationEffects({
          target:editor&&editor.view?editor.view.dom:null,
          normalize:false,
          layout:true,
          syncChrome:true,
          syncTOC:true,
          refreshTrigger:false
        });
      }
    }))return;
  }
}
function replaceAll(){
  if(window.AQTipTapWordFind&&typeof window.AQTipTapWordFind.replaceSearchWithState==='function'){
    var count=window.AQTipTapWordFind.replaceSearchWithState({
      doc:document,
      state:findState,
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
      }
    });
    if(count)return;
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
    return;
  }
  var fi=document.getElementById('findinp');
  if(fi){
    fi.addEventListener('input',function(){clearTimeout(_findTimer);_findTimer=setTimeout(findExec,200);});
    fi.addEventListener('keydown',function(e){
      if(e.key==='Enter'){e.preventDefault();if(e.shiftKey)findPrev();else findNext();}
      if(e.key==='Escape'){e.preventDefault();closeFindBar();}
    });
  }
  var ri=document.getElementById('replaceinp');
  if(ri){ri.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();closeFindBar();}});}
})();

// ¦¦ KEYBOARD SHORTCUTS (Word-like) ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
document.addEventListener('keydown',function(e){
  var shortcuts=window.AQTipTapWordShortcuts||null;
  if(shortcuts&&typeof shortcuts.handleAppDocumentShortcut==='function'){
    if(shortcuts.handleAppDocumentShortcut(e,{
      doc:document,
      host:document.getElementById('apaed'),
      chromeApi:window.AQTipTapWordChrome||null,
      actions:{
      toggleFindBar:function(){e.preventDefault();toggleFindBar();},
      toggleZenMode:function(){e.preventDefault();toggleZenMode();},
      save:function(){e.preventDefault();syncSave();setSL('? Kaydedildi','ok');setTimeout(function(){setSL('','');},2000);},
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
      printDoc:function(){e.preventDefault();window.print();},
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
    addTipButton('Nota Kaydet',function(){doHL(true);});
    addTipButton('Highlight',function(){doHL(false);});
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

function doHL(saveToNote){
  if(!selText||!selRangeObj){hideHLtip();return;}
  drawHL();
  saveHLData();  // Persist highlights
  hideHLtip();
  if(saveToNote){
    var note={id:uid(),nbId:S.curNb,type:'hl',txt:'',q:selText,
      src:curRef?shortRef(curRef):'',rid:curRef?curRef.id:'',
      tag:'s.'+selPageNum,dt:new Date().toLocaleDateString('tr-TR'),hlColor:hlColor};
    S.notes.unshift(note);save();rNotes();
    swR('notes',document.querySelectorAll('.rtab')[0]);
  }
  window.getSelection().removeAllRanges();
  selRangeObj=null;selText='';
}

// Tiklanan highlight'i nota ekle
function hlToNote(){
  if(clickedHLIdx<0||!hlData[clickedHLIdx]){hideHLtip();return;}
  var hd=hlData[clickedHLIdx];
  var note=(window.AQNotesState&&typeof window.AQNotesState.createHighlightNote==='function')
    ? window.AQNotesState.createHighlightNote({
        id:uid(),
        notebookId:S.curNb,
        quoteText:hd.text,
        source:curRef?shortRef(curRef):'',
        referenceId:curRef?curRef.id:'',
        pageTag:'s.'+hd.page,
        dateText:new Date().toLocaleDateString('tr-TR'),
        highlightColor:hd.color
      })
    : {id:uid(),nbId:S.curNb,type:'hl',txt:'',q:(hd.text||'(metin yok)'),
      src:curRef?shortRef(curRef):'',rid:curRef?curRef.id:'',
      tag:'s.'+hd.page,dt:new Date().toLocaleDateString('tr-TR'),hlColor:hd.color};
  S.notes.unshift(note);save();rNotes();
  swR('notes',document.querySelectorAll('.rtab')[0]);
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
function rNotes(){
  var el=document.getElementById('notelist');
  var notes=curNotes();
  if(!el)return;
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
      delStyle:delStyle
    });
    return;
  }
  if(!notes.length){
    el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:14px;text-align:center;">PDF\'ten metin seç › Nota Kaydet<br/>veya aşağıdan yaz.</div>';
    return;
  }
}
function dNote(id){
  S.notes=(window.AQNotesState&&typeof window.AQNotesState.deleteNote==='function')
    ? window.AQNotesState.deleteNote(S.notes,id)
    : S.notes.filter(function(n){return n.id!=id;});
  save();rNotes();
}
function saveNote(){
  var txt=document.getElementById('noteta').value.trim();
  if(!txt)return;
  var tag=document.getElementById('notetag').value.trim()||'genel';
  var note=(window.AQNotesState&&typeof window.AQNotesState.createManualNote==='function')
    ? window.AQNotesState.createManualNote({
        id:uid(),
        notebookId:S.curNb,
        text:txt,
        source:curRef?shortRef(curRef):'',
        referenceId:curRef?curRef.id:'',
        tag:tag,
        dateText:new Date().toLocaleDateString('tr-TR')
      })
    : {id:uid(),nbId:S.curNb,type:'m',txt:txt,q:'',src:curRef?shortRef(curRef):'',rid:curRef?curRef.id:'',tag:tag,dt:new Date().toLocaleDateString('tr-TR')};
  if(!note)return;
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
var _refUpdating=false;
function ec(cmd,val){
  if(window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.runEditorCommand==='function'){
    window.AQTipTapWordCommands.runEditorCommand({
      editor:editor||null,
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
    return;
  }
  console.warn('TipTap editor not ready, command ignored:',cmd);
}
// ¦¦ LINE SPACING ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function setLineSpacing(val){
  if(window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.runLineSpacing==='function'){
    window.AQTipTapWordCommands.runLineSpacing({
      value:val,
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
document.addEventListener('click',function(e){if(!e.target.closest('.dd'))cdd();});

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
function insFig(){customPrompt('Şekil No:','1').then(function(n){if(!n)return;customPrompt('Başlık:','').then(function(t){t=t||'';if(window.AQTipTapWordContent&&typeof window.AQTipTapWordContent.insertCommandBuiltBlockWithBridge==='function'){if(window.AQTipTapWordContent.insertCommandBuiltBlockWithBridge({builderName:'buildFigureHTML',builderArgs:[n,t],editor:editor||null,host:document.getElementById('apaed'),bridgeApi:window.AQTipTapWordBridge||null,documentApi:window.AQTipTapWordDocument||null,runtimeApi:window.AQEditorRuntime||null,sanitizeHTML:sanitizeDocHTML,getSavedRange:function(){ return editorSavedRange; },setSavedRange:function(v){ editorSavedRange=v; }}))return; }var html=window.AQTipTapWordCommands&&typeof window.AQTipTapWordCommands.buildFigureHTML==='function'?window.AQTipTapWordCommands.buildFigureHTML(n,t):'<p style="text-align:center;text-indent:0">[Şekil '+n+']</p><p style="text-align:center;text-indent:0;font-style:italic">Şekil '+n+(t?' - '+t:'')+'</p><p><br></p>';iHTML(html);});});
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
function getExportDocHTML(){
  var edHTML=sanitizeDocHTML(getCurrentEditorHTML());
  if(window.AQTipTapWordDocument&&typeof window.AQTipTapWordDocument.buildExportDocHTML==='function'){
    return window.AQTipTapWordDocument.buildExportDocHTML(edHTML);
  }
  return '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><meta name="ProgId" content="Word.Document"><meta name="Generator" content="AcademiQ Research"><style>@page WordSection1{size:595pt 842pt;margin:72pt 72pt 72pt 72pt;}div.WordSection1{page:WordSection1;}body{font-family:"Times New Roman",serif;font-size:12pt;line-height:2;margin:0;}h1{font-size:12pt;font-weight:bold;text-align:center;margin:0;text-indent:0;}h2{font-size:12pt;font-weight:bold;text-align:left;margin:0;text-indent:0;}h3{font-size:12pt;font-weight:bold;font-style:italic;margin:0;text-indent:0;}h4{font-size:12pt;font-weight:bold;margin:0;text-indent:.5in;}h5{font-size:12pt;font-weight:bold;font-style:italic;margin:0;text-indent:.5in;}p{margin:0;text-indent:.5in;mso-pagination:none;}.ni{text-indent:0;}.cit{color:#000;border:none;white-space:normal;}.cit-gap{display:none!important;}.refe{text-indent:-.5in;padding-left:.5in;margin:0;}blockquote{padding-left:.5in;text-indent:0;margin:0;}table{width:100%;border-collapse:collapse;font-size:12pt;page-break-inside:auto;}thead{display:table-header-group;}tr,img{page-break-inside:avoid;}th{border-top:1.5px solid #000;border-bottom:1px solid #000;padding:4px 8px;}td{padding:4px 8px;}.toc-delete,.img-toolbar,.img-resize-handle,.aq-page-sheet,.page-break-overlay,.page-number{display:none!important;}</style></head><body><div class="WordSection1">'+edHTML+'</div></body></html>';
}
function expDOC(){
  saveAs(new Blob([getExportDocHTML()],{type:'application/msword'}),'makale.doc');
}
function expPDF(){
  if(window.electronAPI&&typeof window.electronAPI.exportPDF==='function'){
    window.electronAPI.exportPDF({defaultPath:'makale.pdf'}).then(function(result){
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
    var clone=window.AQTipTapWordIO&&typeof window.AQTipTapWordIO.buildPrintablePageClone==='function'
      ? window.AQTipTapWordIO.buildPrintablePageClone(page)
      : page.cloneNode(true);
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
  window.print();
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
  if(exportMenu&&!exportMenu.querySelector('[data-aq="bib"]')){
    var bib=document.createElement('button');
    bib.className='ddi';
    bib.dataset.aq='bib';
    bib.textContent='BIB';
    bib.onclick=function(){expBIB();cdd();};
    exportMenu.insertBefore(bib,exportMenu.children[2]||null);
    var ris=document.createElement('button');
    ris.className='ddi';
    ris.dataset.aq='ris';
    ris.textContent='RIS';
    ris.onclick=function(){expRIS();cdd();};
    exportMenu.insertBefore(ris,exportMenu.children[3]||null);
  }
}
function enhanceToolbar(){
  var tb=document.getElementById('etb');
  if(!tb||tb.querySelector('[data-aq="sup"]'))return;
  ['txtColor','hlColor'].forEach(function(id){
    var inp=document.getElementById(id);
    if(inp)inp.style.cssText+=';appearance:none;-webkit-appearance:none;background:transparent;overflow:hidden;width:26px;height:26px;padding:0;border-radius:6px;border:1px solid var(--b);cursor:pointer;';
  });
  var mk=function(label,title,fn,key){
    var b=document.createElement('button');
    b.className='efmt';
    b.dataset.aq=key;
    b.textContent=label;
    b.title=title;
    b.onclick=fn;
    return b;
  };
  tb.appendChild(mk('X²','Üst simge',function(){ec('superscript');},'sup'));
  tb.appendChild(mk('X²','Alt simge',function(){ec('subscript');},'sub'));
  tb.appendChild(mk('AA','Tümünü büyük harf',function(){transformSelectedText('upper');},'upper'));
  tb.appendChild(mk('Aa','Kelime başlarını büyüt',function(){transformSelectedText('title');},'title'));
  tb.appendChild(mk('aa','Tümünü küçük harf',function(){transformSelectedText('lower');},'lower'));
}
function tSB(side){var el=document.getElementById(side);var btn=document.getElementById('btn'+side);el.classList.toggle('closed');btn.classList.toggle('on');}
function swR(name,btn){document.querySelectorAll('.rtab').forEach(function(t){t.classList.remove('on');});document.querySelectorAll('.rpnl').forEach(function(p){p.classList.remove('on');});if(btn)btn.classList.add('on');var el=document.getElementById('rp'+name);if(el)el.classList.add('on');}
function showM(id){document.getElementById(id).classList.add('show');}
function hideM(id){document.getElementById(id).classList.remove('show');var inp=document.querySelector('#'+id+' .minp');if(inp)inp.value='';}
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
function openRefMetadataModal(ref){
  return new Promise(function(resolve){
    _refMetaResolve=resolve;
    document.getElementById('refMetaTitle').value=ref&&ref.title||'';
    document.getElementById('refMetaAuthors').value=((ref&&ref.authors)||[]).join('; ');
    document.getElementById('refMetaYear').value=ref&&ref.year||'';
    document.getElementById('refMetaJournal').value=ref&&ref.journal||'';
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
    title:(document.getElementById('refMetaTitle').value||'').trim(),
    authors:(document.getElementById('refMetaAuthors').value||'').split(';').map(function(a){return a.trim();}).filter(Boolean),
    year:(document.getElementById('refMetaYear').value||'').trim(),
    journal:(document.getElementById('refMetaJournal').value||'').trim(),
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
function opdd(id,btn){if(!editor)saveEditorSelection();cdd();var m=document.getElementById(id);var r=btn.getBoundingClientRect();m.style.top=(r.bottom+4)+'px';m.style.left=r.left+'px';m.classList.add('open');}
function cdd(){document.querySelectorAll('.ddm').forEach(function(m){m.classList.remove('open');});}
function cpStr(s){var ta=document.createElement('textarea');ta.value=s;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);}
// Close modals on bg click
document.querySelectorAll('.modal-bg').forEach(function(bg){bg.addEventListener('click',function(e){if(e.target===bg)bg.classList.remove('show');});});

// ¦¦ SYNC SETTINGS UI ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
async function showSyncSettings(){
  showM('syncmodal');
  // Update preference checkboxes
  var pnCb=document.getElementById('prefPageNum');if(pnCb)pnCb.checked=!!S.showPageNumbers;
  var dirEl=document.getElementById('syncdirshow');
  var infoEl=document.getElementById('syncappinfo');
  if(typeof window.electronAPI!=='undefined'){
    try{
      var info=await window.electronAPI.getAppInfo();
      dirEl.innerHTML='<span style="color:var(--green)">'+info.appDir+'</span>';
      infoEl.innerHTML='PDF: '+info.pdfDir+' ('+info.pdfCount+' dosya)<br/>Surum: v'+info.version;
    }catch(e){dirEl.textContent='Bilgi alinamadi';infoEl.textContent='';}
  } else {
    dirEl.innerHTML='<span style="color:var(--txt3)">Tarayici modu - localStorage kullaniliyor</span>';
    infoEl.innerHTML='';
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
      var res=await window.electronAPI.downloadPDFfromURL(triedUrl,ref.id,dlOptions);
      if(res&&res.ok){
        if(!ref.pdfUrl)ref.pdfUrl=triedUrl;
        var hydrated=await hydrateRefPDF(ref);
        if(hydrated&&ref.pdfData)return {ok:true,url:triedUrl};
        try{
          var direct=await window.electronAPI.loadPDF(ref.id);
          if(direct&&direct.ok&&direct.buffer){ref.pdfData=direct.buffer;return {ok:true,url:triedUrl};}
        }catch(e){}
        setFailure('PDF kaydedildi ama yuklenemedi',triedUrl);
      }else{
        var errMsg=(res&&res.error)?String(res.error):'Indirme basarisiz';
        setFailure(errMsg,triedUrl);
      }
    }catch(e){
      setFailure((e&&e.message)?e.message:String(e),triedUrl);
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
  var done=0,fail=0,failReasons=[],completed=0,nextIdx=0;
  async function worker(){
    while(true){
      var qi=nextIdx++;
      if(qi>=queue.length)return;
      var ref=queue[qi];
      var result=await __oaDownloadOneRef(ref);
      if(result&&result.ok){
        done++;
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
}

function renderThumbnails(){
  if(!pdfDoc)return;
  var container=document.getElementById('pdfthumbs');
  container.innerHTML='';
  for(var i=1;i<=pdfTotal;i++){
    (function(n){
      var thumbWrap=document.createElement('div');
      thumbWrap.style.cssText='padding:3px;cursor:pointer;border:2px solid transparent;margin:2px;border-radius:3px;';
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
    el.style.borderColor=parseInt(el.dataset.thumbpage)===pdfPg?'var(--acc)':'transparent';
  });
}

// ¦¦ OUTLINE / TOC ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
function toggleOutline(){
  var el=document.getElementById('pdfoutline');
  el.style.display=el.style.display==='none'?'block':'none';
}

function loadOutline(){
  if(!pdfDoc)return;
  var container=document.getElementById('pdfoutline');
  pdfDoc.getOutline().then(function(outline){
    if(!outline||!outline.length){
      container.innerHTML='<div style="color:var(--txt3);font-size:10px;padding:6px;">Icerik tablosu yok</div>';
      return;
    }
    container.innerHTML='<div style="font-family:var(--fm);font-size:9px;color:var(--acc);letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;">ICERIK</div>';
    renderOutlineItems(outline,container,0);
  }).catch(function(){
    container.innerHTML='<div style="color:var(--txt3);font-size:10px;padding:6px;">Icerik tablosu yok</div>';
  });
}

function renderOutlineItems(items,container,depth){
  items.forEach(function(item){
    var div=document.createElement('div');
    div.style.cssText='padding:3px 4px 3px '+(depth*12+4)+'px;font-size:11px;color:var(--txt2);cursor:pointer;border-radius:3px;line-height:1.4;';
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
  if(window.AQCitationState&&typeof window.AQCitationState.buildCitationHTML==='function'){
    return window.AQCitationState.buildCitationHTML(refs,{
      formatAuthor:fa,
      sortReferences:sortLib,
      dedupeReferences:dedupeRefs
    });
  }
  refs=sortLib(dedupeRefs(refs||[]));
  if(!refs.length)return '';
  if(refs.length===1)return '<span class="cit" data-ref="'+refs[0].id+'" contenteditable="false">'+getInlineCitationText(refs[0])+'</span> ';
  return '<span class="cit" data-ref="'+refs.map(function(r){return r.id;}).join(',')+'" contenteditable="false">'+visibleCitationText(refs)+'</span> ';
}
function escJS(str){
  return String(str||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
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
      formatReference:apa7,
      escapeJS:escJS,
      dedupeReferences:dedupeRefs,
      sortReferences:sortLib
    });
  }
  var refs=getUsedRefs();
  if(!refs.length){el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:14px;text-align:center;">Metinde atıf yok.</div>';return;}
  el.innerHTML='';
  refs.forEach(function(r){
    var item=document.createElement('div');
    item.className='ri';
    var cite=document.createElement('div');
    cite.className='ricite';
    cite.textContent=getInlineCitationText(r);
    var full=document.createElement('div');
    full.className='rifull';
    full.innerHTML=apa7(r);
    var actions=document.createElement('div');
    actions.className='riacts';
    var copyBtn=document.createElement('button');
    copyBtn.className='rib';
    copyBtn.textContent='Kopyala';
    copyBtn.addEventListener('click',function(){cpStr(apa7(r));});
    var pdfBtn=document.createElement('button');
    pdfBtn.className='rib';
    pdfBtn.textContent='PDF';
    pdfBtn.addEventListener('click',function(){openRef(r.id);});
    actions.appendChild(copyBtn);
    actions.appendChild(pdfBtn);
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
  var tb=document.getElementById('etb');
  if(tb){
    Array.from(tb.querySelectorAll('button')).forEach(function(btn){
      if((btn.textContent||'').trim()==='İçindekiler')btn.remove();
    });
  }
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
    })) return true;
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
function visibleCitationText(refs){
  if(window.AQTipTapWordCitation&&typeof window.AQTipTapWordCitation.visibleCitationText==='function'){
    return window.AQTipTapWordCitation.visibleCitationText(refs,{
      citationState:window.AQCitationState||null,
      getInlineCitationText:getInlineCitationText,
      formatAuthor:fa,
      dedupeReferences:dedupeRefs,
      sortReferences:sortLib
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
  return doc;
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
      onChange:function(){save();}
    })) return;
  }
  if(window.AQBibliographyState&&typeof window.AQBibliographyState.bindBibliographySurface==='function'){
    if(window.AQBibliographyState.bindBibliographySurface({
      bodyEl:document.getElementById('bibbody'),
      getCurrentDocument:getCurrentDocRecord,
      onChange:function(){save();}
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

// ¦¦ INIT ¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦¦
syncLoad().then(function(){
  rWS();rNB();rLib();rNotes();rRefs();uSt();rDocTabs();
  enhanceMenus();
  enhanceToolbar();
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
      setSL('Yerel','ok');
      setTimeout(function(){setSL('','');},3000);
    }).catch(function(){});
  }
});
setInterval(function(){if(syncDirty){syncDirty=false;syncSave();}},30000);
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
      formatReference:apa7,
      escapeJS:escJS,
      dedupeReferences:dedupeRefs,
      sortReferences:sortLib,
      formatRef:apa7,
      bindSurface:bindBibliographySurface,
      onAfterUpdate:function(){save();}
    })) return;
  }
  var refs=rRefs();
  refs=sortLib(dedupeRefs(refs||getUsedRefs()||[]));
  var doc=getCurrentDocRecord();
  bindBibliographySurface();
  var generatedHTML='<h1>Kaynakça</h1>'+refs.map(function(ref){return '<p class="refe">'+apa7(ref)+'</p>';}).join('');
  var persistedHTML=doc?String(doc.bibliographyHTML||'').trim():'';
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
function rLib(){
  var q=(document.getElementById('libsrch').value||'').toLowerCase();
  var el=document.getElementById('liblist');if(!el)return;
  el.innerHTML='';
  rLabelFilter();
  var ws=S.wss.find(function(x){return x.id===S.cur;});
  if(!ws){el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:14px;text-align:center;">Çalışma alanı yok.</div>';return;}
  function labelName(l){return typeof l==='string'?l:((l&&l.name)||'');}
  function labelColor(l){return typeof l==='string'?'#b6873f':((l&&l.color)||'#b6873f');}
  var fl=window.AQLibraryState&&typeof window.AQLibraryState.filterLibraryItems==='function'
    ? window.AQLibraryState.filterLibraryItems(ws.lib||[],q,activeLabelFilter,{getLabelName:labelName})
    : (ws.lib||[]).filter(function(r){
        if(q&&!((r.title||'')+(r.authors||[]).join(' ')+(r.year||'')+(r.journal||'')).toLowerCase().includes(q))return false;
        if(activeLabelFilter&&!(r.labels||[]).some(function(l){return labelName(l)===activeLabelFilter;}))return false;
        return true;
      });
  if(!fl.length){el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:14px;text-align:center;">'+(q||activeLabelFilter?'Eşleşme yok.':'DOI gir veya PDF yükle.')+'</div>';return;}
  fl.forEach(function(r){
    var a=r.authors&&r.authors[0]?r.authors[0].split(',')[0]:'?';
    if(r.authors&&r.authors.length>1)a+=' et al.';
    var div=document.createElement('div');
    div.className='lcard'+(curRef&&curRef.id===r.id?' on':'');
    var hasPDFlocal=!!r.pdfData;
    var hasOAurl=!!(r.pdfUrl);
    var pdfStatus=hasPDFlocal?'<span class="lbadge pdf">PDF ?</span>':(hasOAurl?'<span class="lbadge oa">OA v</span>':'');
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
    div.addEventListener('contextmenu',function(e){e.preventDefault();showLabelMenu(e.clientX,e.clientY,r);});
    div.addEventListener('click',function(){openRef(r.id);});
    el.appendChild(div);
  });
}
(function installHardOverrides(){
  var st=document.createElement('style');
  st.textContent='' +
    '#apaed .ProseMirror{display:block!important;position:relative!important;left:auto!important;right:auto!important;transform:none!important;padding:0!important;margin:0!important;text-align:left!important;}' +
    '#apaed .ProseMirror>*{position:static!important;left:auto!important;right:auto!important;transform:none!important;max-width:100%!important;}' +
    '#apaed .ProseMirror p{margin:0!important;padding:0!important;text-indent:.5in!important;text-align:left!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important;}' +
    '#apaed .ProseMirror p.ni{ text-indent:0!important; }' +
    '#apaed .ProseMirror h1,#apaed .ProseMirror h2,#apaed .ProseMirror h3,#apaed .ProseMirror h4,#apaed .ProseMirror h5,#apaed .ProseMirror blockquote,#apaed .ProseMirror ul,#apaed .ProseMirror ol{margin:0!important;padding:0!important;transform:none!important;left:auto!important;right:auto!important;}' +
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
  syncTimer=setTimeout(function(){
    if(suppressDocSave||__aqDocSwitching||!syncDirty)return;
    syncDirty=false;
    syncSave();
  },600);
}
syncSave=async function(){
  if(__aqDocSwitching){
    syncDirty=true;
    return;
  }
  if(syncInFlight){
    syncQueued=true;
    return syncInFlight;
  }
  syncInFlight=(async function(){
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
    var json=JSON.stringify(toSave);
    if(typeof window.electronAPI!=='undefined'){
      try{await window.electronAPI.saveData(json);}catch(e){
        logStability('syncSave.electron',e);
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

