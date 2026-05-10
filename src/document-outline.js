(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory(root || globalThis);
    return;
  }
  root.AQDocumentOutline = factory(root);
})(typeof window !== 'undefined' ? window : globalThis, function(root){
  'use strict';

  var DOCUMENT_POSITION_PRECEDING = 2;
  var DOCUMENT_POSITION_FOLLOWING = 4;

  function asText(value){
    return String(value == null ? '' : value);
  }

  function normalizeText(value){
    return asText(value)
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeTextLower(value){
    return normalizeText(value).toLowerCase();
  }

  function getRoot(options){
    options = options || {};
    if(options.root) return options.root;
    if(root.document && typeof root.document.getElementById === 'function'){
      return root.document.getElementById('apaed');
    }
    return null;
  }

  function getDocument(options){
    options = options || {};
    if(options.document) return options.document;
    if(root.document) return root.document;
    return null;
  }

  function getAcademicApi(options){
    options = options || {};
    if(options.academicApi) return options.academicApi;
    return root.AQAcademicObjects || null;
  }

  function getActiveEditor(options){
    options = options || {};
    if(options.editor) return options.editor;
    try{
      if(root && typeof root.getActiveEditorInstance === 'function'){
        return root.getActiveEditorInstance();
      }
    }catch(_error){}
    return root ? (root.editor || null) : null;
  }

  function isAQEngineEditor(editor){
    return !!(editor && editor._aqEngine && editor._docModel);
  }

  function getAQBlocks(editor){
    if(!isAQEngineEditor(editor) || !editor._docModel || typeof editor._docModel.get !== 'function') return [];
    var doc = editor._docModel.get() || {};
    return Array.isArray(doc.blocks) ? doc.blocks : [];
  }

  function getScrollElement(options){
    options = options || {};
    if(options.scrollEl) return options.scrollEl;
    var doc = getDocument(options);
    if(doc && typeof doc.getElementById === 'function'){
      return doc.getElementById('escroll');
    }
    return null;
  }

  function safeNormalizeAcademicObjects(rootNode, academicApi){
    if(!rootNode || !academicApi || typeof academicApi.normalizeDocument !== 'function') return;
    try{
      academicApi.normalizeDocument({ root: rootNode });
    }catch(_error){}
  }

  function shouldSkipHeading(text){
    var normalized = normalizeTextLower(text);
    return !normalized || normalized === 'içindekiler' || normalized === 'icindekiler' || normalized === 'kaynakça' || normalized === 'kaynakca';
  }

  function ensureHeadingId(node, index, academicApi){
    if(!node) return '';
    var existing = normalizeText(node.id || (node.getAttribute ? node.getAttribute('id') : ''));
    if(existing){
      if(node.id !== existing) node.id = existing;
      return existing;
    }
    if(academicApi && typeof academicApi.collectTargets === 'function'){
      try{
        var targets = academicApi.collectTargets({ root: node.parentNode || node.ownerDocument || null });
        var match = Array.isArray(targets) ? targets.find(function(target){
          return target && target.type === 'heading' && normalizeText(target.label).replace(/\s+/g, ' ') === normalizeText(node.textContent || '');
        }) : null;
        if(match && match.id){
          node.id = String(match.id);
          return node.id;
        }
      }catch(_error){}
    }
    node.id = 'aq-outline-heading-' + String(index + 1);
    return node.id;
  }

  function runsText(runs){
    return normalizeText((Array.isArray(runs) ? runs : []).map(function(run){
      return String(run && run.text || '');
    }).join(''));
  }

  function makeAQOutlineId(prefix, index){
    return 'aq-outline-' + prefix + '-' + String(index + 1);
  }

  function cloneAQBlock(block){
    block = block || {};
    var copy = Object.assign({}, block);
    copy.attrs = Object.assign({}, block.attrs || {});
    if(Array.isArray(block.runs)){
      copy.runs = block.runs.map(function(run){ return Object.assign({}, run || {}); });
    }
    if(Array.isArray(block.rows)){
      copy.rows = block.rows.map(function(row){
        return Object.assign({}, row || {}, {
          cells: Array.isArray(row && row.cells) ? row.cells.map(function(cell){
            return Object.assign({}, cell || {}, {
              runs: Array.isArray(cell && cell.runs) ? cell.runs.map(function(run){ return Object.assign({}, run || {}); }) : []
            });
          }) : []
        });
      });
    }
    return copy;
  }

  function blockNeedsAQOutlineId(block){
    if(!block) return false;
    if(block.type === 'image' || block.type === 'table') return true;
    if(block.headingLevel){
      var text = runsText(block.runs || [{ text: block.text || '' }]);
      if(shouldSkipHeading(text) || block._isBibHeading || block._isAppendixHeading) return false;
      return true;
    }
    return false;
  }

  function ensureAQOutlineIds(editor){
    var blocks = getAQBlocks(editor);
    if(!blocks.length) return blocks;
    var changed = false;
    var nextBlocks = blocks.map(function(block, index){
      if(!blockNeedsAQOutlineId(block)) return block;
      var attrs = block.attrs || {};
      if(normalizeText(attrs.refId || block._refId || '')) return block;
      var copy = cloneAQBlock(block);
      var prefix = copy.type === 'image' ? 'figure' : (copy.type === 'table' ? 'table' : 'heading');
      copy.attrs.refId = makeAQOutlineId(prefix, index);
      changed = true;
      return copy;
    });
    if(changed && editor._docModel && typeof editor._docModel.replace === 'function'){
      editor._docModel.replace(nextBlocks);
      if(typeof editor._reflow === 'function') editor._reflow();
      return getAQBlocks(editor);
    }
    return blocks;
  }

  function collectAQPageByBlock(editor){
    var pageByBlock = {};
    var layout = editor && editor._aqLayout;
    var pages = layout && Array.isArray(layout.pages) ? layout.pages : [];
    pages.forEach(function(page, pageIndex){
      (Array.isArray(page && page.lines) ? page.lines : []).forEach(function(line){
        if(!line || line.blockIndex == null) return;
        if(pageByBlock[line.blockIndex] == null) pageByBlock[line.blockIndex] = pageIndex + 1;
      });
    });
    return pageByBlock;
  }

  function collectAQEngineEntries(editor){
    if(!isAQEngineEditor(editor)) return null;
    var blocks = ensureAQOutlineIds(editor);
    var pageByBlock = collectAQPageByBlock(editor);
    var entries = [];
    blocks.forEach(function(block, index){
      if(!block) return;
      var attrs = block.attrs || {};
      var id = normalizeText(attrs.refId || block._refId || '');
      if(block.headingLevel){
        var text = runsText(block.runs || [{ text: block.text || '' }]);
        if(shouldSkipHeading(text) || block._isBibHeading || block._isAppendixHeading) return;
        entries.push({
          id: id || makeAQOutlineId('heading', index),
          type: 'heading',
          level: Math.max(1, Math.min(5, parseInt(block.headingLevel, 10) || 1)),
          label: text,
          title: text,
          blockIndex: index,
          page: pageByBlock[index] || 1
        });
        return;
      }
      if(block.type === 'table'){
        entries.push({
          id: id || makeAQOutlineId('table', index),
          type: 'table',
          level: 0,
          label: normalizeText(attrs.label || block.captionLabel || 'Tablo'),
          title: normalizeText(attrs.title || block.caption || ''),
          blockIndex: index,
          page: pageByBlock[index] || 1
        });
        return;
      }
      if(block.type === 'image'){
        entries.push({
          id: id || makeAQOutlineId('figure', index),
          type: 'figure',
          level: 0,
          label: normalizeText(attrs.label || block.captionLabel || 'Sekil'),
          title: normalizeText(attrs.title || block.caption || block.alt || ''),
          blockIndex: index,
          page: pageByBlock[index] || 1
        });
      }
    });
    return entries.map(function(entry, index){
      entry.index = index;
      return entry;
    });
  }

  function collectHeadingEntries(rootNode, academicApi){
    var entries = [];
    if(!rootNode || typeof rootNode.querySelectorAll !== 'function') return entries;
    Array.prototype.forEach.call(rootNode.querySelectorAll('h1,h2,h3,h4,h5'), function(node, index){
      var text = normalizeText(node.textContent || '');
      if(shouldSkipHeading(text)) return;
      var level = parseInt(asText(node.tagName).slice(1), 10) || 1;
      var id = ensureHeadingId(node, index, academicApi);
      entries.push({
        id: id,
        type: 'heading',
        level: level,
        label: text,
        title: text,
        node: node
      });
    });
    return entries;
  }

  function buildTargetMap(rootNode, academicApi){
    var map = {};
    if(!academicApi || typeof academicApi.collectTargets !== 'function') return map;
    try{
      var targets = academicApi.collectTargets({ root: rootNode });
      (Array.isArray(targets) ? targets : []).forEach(function(target){
        if(!target || !target.id) return;
        map[String(target.id)] = target;
      });
    }catch(_error){}
    return map;
  }

  function getFigureNodes(rootNode){
    if(!rootNode || typeof rootNode.querySelectorAll !== 'function') return [];
    var seen = {};
    var out = [];
    Array.prototype.forEach.call(rootNode.querySelectorAll('[data-academic-object="figure"][data-academic-id]'), function(node){
      var id = normalizeText(node.getAttribute('data-academic-id') || '');
      if(!id) return;
      if(!seen[id]){
        seen[id] = node;
        out.push(node);
        return;
      }
      if(node.getAttribute('data-academic-title-node') === 'true'){
        seen[id] = node;
        for(var i = 0; i < out.length; i += 1){
          if(normalizeText(out[i].getAttribute('data-academic-id') || '') === id){
            out[i] = node;
            break;
          }
        }
      }
    });
    return out;
  }

  function collectAcademicEntries(rootNode, academicApi){
    var entries = [];
    if(!rootNode || typeof rootNode.querySelectorAll !== 'function') return entries;
    var targetMap = buildTargetMap(rootNode, academicApi);
    Array.prototype.forEach.call(rootNode.querySelectorAll('table[data-academic-id]'), function(node){
      var id = normalizeText(node.getAttribute('data-academic-id') || node.id || '');
      if(!id) return;
      var target = targetMap[id] || {};
      entries.push({
        id: id,
        type: 'table',
        level: 0,
        label: normalizeText(target.label || node.getAttribute('data-academic-label') || 'Tablo'),
        title: normalizeText(target.title || ''),
        node: node
      });
    });
    getFigureNodes(rootNode).forEach(function(node){
      var id = normalizeText(node.getAttribute('data-academic-id') || node.id || '');
      if(!id) return;
      var target = targetMap[id] || {};
      entries.push({
        id: id,
        type: 'figure',
        level: 0,
        label: normalizeText(target.label || node.getAttribute('data-academic-label') || 'Şekil'),
        title: normalizeText(target.title || node.textContent || ''),
        node: node
      });
    });
    return entries;
  }

  function compareEntries(left, right){
    if(!left || !left.node) return 1;
    if(!right || !right.node) return -1;
    if(left.node === right.node) return 0;
    if(typeof left.node.compareDocumentPosition === 'function'){
      var position = left.node.compareDocumentPosition(right.node);
      if(position & DOCUMENT_POSITION_FOLLOWING) return -1;
      if(position & DOCUMENT_POSITION_PRECEDING) return 1;
    }
    return 0;
  }

  function collectEntries(options){
    options = options || {};
    var aqEntries = collectAQEngineEntries(getActiveEditor(options));
    if(Array.isArray(aqEntries)) return aqEntries;
    var rootNode = getRoot(options);
    if(!rootNode) return [];
    var academicApi = getAcademicApi(options);
    safeNormalizeAcademicObjects(rootNode, academicApi);
    return collectHeadingEntries(rootNode, academicApi)
      .concat(collectAcademicEntries(rootNode, academicApi))
      .sort(compareEntries)
      .map(function(entry, index){
        return {
          id: entry.id,
          type: entry.type,
          level: entry.level,
          label: entry.label,
          title: entry.title,
          index: index
        };
      });
  }

  function filterEntries(entries, options){
    entries = Array.isArray(entries) ? entries : [];
    options = options || {};
    var type = normalizeTextLower(options.type || 'all');
    var query = normalizeTextLower(options.query || '');
    return entries.filter(function(entry){
      if(type !== 'all' && normalizeTextLower(entry.type) !== type) return false;
      if(!query) return true;
      var haystack = normalizeTextLower([entry.label, entry.title].join(' '));
      return haystack.indexOf(query) !== -1;
    });
  }

  function buildSummary(entries){
    var summary = {
      total: 0,
      headings: 0,
      tables: 0,
      figures: 0
    };
    (Array.isArray(entries) ? entries : []).forEach(function(entry){
      summary.total += 1;
      if(entry.type === 'heading') summary.headings += 1;
      if(entry.type === 'table') summary.tables += 1;
      if(entry.type === 'figure') summary.figures += 1;
    });
    return summary;
  }

  function findTargetNode(options){
    options = options || {};
    var id = normalizeText(options.id || '');
    if(!id) return null;
    var editor = getActiveEditor(options);
    if(isAQEngineEditor(editor)){
      var aqDoc = getDocument(options);
      var stage = (editor._stageEl && typeof editor._stageEl.querySelector === 'function')
        ? editor._stageEl
        : (aqDoc && typeof aqDoc.querySelector === 'function' ? aqDoc.querySelector('.aq-engine-stage, .aq-engine-root') : null);
      if(stage && typeof stage.querySelector === 'function'){
        try{
          var attrId = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          var byRef = stage.querySelector('[data-ref-id="' + attrId + '"]');
          if(byRef) return byRef;
        }catch(_error){}
      }
    }
    var rootNode = getRoot(options);
    var doc = getDocument(options);
    if(doc && typeof doc.getElementById === 'function'){
      var byId = doc.getElementById(id);
      if(byId) return byId;
    }
    if(rootNode && typeof rootNode.querySelector === 'function'){
      try{
        return rootNode.querySelector('#' + id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1'));
      }catch(_error){}
    }
    return null;
  }

  function scrollToEntry(options){
    options = options || {};
    var node = findTargetNode(options);
    if(!node) return false;
    if(typeof node.scrollIntoView === 'function'){
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if(node.classList && typeof node.classList.add === 'function'){
      node.classList.add('aq-outline-target-flash');
      setTimeout(function(){
        try{ node.classList.remove('aq-outline-target-flash'); }catch(_error){}
      }, 1500);
    }else if(node.style){
      var original = node.style.background;
      node.style.background = 'rgba(179,131,58,.18)';
      setTimeout(function(){
        try{ node.style.background = original; }catch(_error){}
      }, 1500);
    }
    return true;
  }

  function findActiveEntry(entries, options){
    entries = Array.isArray(entries) ? entries : [];
    options = options || {};
    if(!entries.length) return null;
    var doc = getDocument(options);
    var scrollEl = getScrollElement(options);
    var viewportTop = 0;
    var viewportBottom = Number.POSITIVE_INFINITY;
    if(scrollEl && typeof scrollEl.getBoundingClientRect === 'function'){
      var scrollRect = scrollEl.getBoundingClientRect();
      viewportTop = Number(scrollRect.top || 0) + 120;
      viewportBottom = Number(scrollRect.bottom || viewportTop + 1);
    }else if(doc && doc.documentElement && typeof doc.documentElement.clientHeight === 'number'){
      viewportTop = 120;
      viewportBottom = doc.documentElement.clientHeight;
    }
    var bestPast = null;
    var bestNext = null;
    entries.forEach(function(entry){
      var node = findTargetNode({
        root: options.root,
        editor: options.editor,
        document: doc,
        id: entry && entry.id
      });
      if(!node || typeof node.getBoundingClientRect !== 'function') return;
      var rect = node.getBoundingClientRect();
      var top = Number(rect.top || 0);
      var bottom = Number(rect.bottom || top);
      if(bottom <= viewportTop){
        if(!bestPast || top > bestPast.top){
          bestPast = { entry: entry, top: top };
        }
        return;
      }
      if(top >= viewportTop && top <= viewportBottom){
        if(!bestNext || top < bestNext.top){
          bestNext = { entry: entry, top: top };
        }
      }
    });
    return (bestPast && bestPast.entry) || (bestNext && bestNext.entry) || entries[0] || null;
  }

  return {
    collectEntries: collectEntries,
    filterEntries: filterEntries,
    buildSummary: buildSummary,
    findTargetNode: findTargetNode,
    scrollToEntry: scrollToEntry,
    findActiveEntry: findActiveEntry
  };
});
