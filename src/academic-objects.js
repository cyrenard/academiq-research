(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory(root || globalThis);
    return;
  }
  root.AQAcademicObjects = factory(root);
})(typeof window !== 'undefined' ? window : globalThis, function(root){
  'use strict';

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

  function slugify(value){
    return normalizeTextLower(value)
      .replace(/[^a-z0-9çğıöşü\s-]/gi, ' ')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'nesne';
  }

  function extractTargetNumber(targetOrLabel){
    var source = targetOrLabel && typeof targetOrLabel === 'object'
      ? normalizeText(targetOrLabel.label || '')
      : normalizeText(targetOrLabel);
    var match = source.match(/\b(\d+)\b/);
    return match ? match[1] : '';
  }

  function buildCrossRefText(targetOrLabel, options){
    options = options || {};
    var mode = normalizeTextLower(options.mode || 'context');
    var target = targetOrLabel && typeof targetOrLabel === 'object' ? targetOrLabel : null;
    var safeLabel = target ? normalizeText(target.label || '') : normalizeText(targetOrLabel);
    var number = extractTargetNumber(targetOrLabel);
    if(mode === 'label'){
      return safeLabel || 'Referans';
    }
    if(mode === 'number' && number){
      return number;
    }
    return safeLabel ? ('bkz. ' + safeLabel) : 'bkz.';
  }

  function parseFigureTitle(text){
    return normalizeText(text)
      .replace(/^şekil\s+\d+\s*[-:–—]?\s*/i, '')
      .replace(/^figure\s+\d+\s*[-:–—]?\s*/i, '')
      .trim();
  }

  function isBlankBlock(node){
    if(!node) return true;
    var tag = asText(node.tagName).toLowerCase();
    if(tag !== 'p' && tag !== 'div') return false;
    return normalizeText(node.textContent || '') === '';
  }

  function isParagraphLike(node){
    if(!node) return false;
    var tag = asText(node.tagName).toLowerCase();
    return tag === 'p' || tag === 'div';
  }

  function matchesTableLabel(text){
    return /^(tablo|table)\s+\d+\b/i.test(normalizeText(text));
  }

  function matchesFigureLabel(text){
    return /^(şekil|sekil|figure)\s+\d+\b/i.test(normalizeText(text));
  }

  function matchesFigurePlaceholder(text){
    return /^\[\s*(şekil|sekil|figure)\s+\d+\s*\]$/i.test(normalizeText(text));
  }

  function matchesNoteText(text){
    return /^not\./i.test(normalizeText(text));
  }

  function setNodeObjectMeta(node, type, id, label){
    if(!node || !node.setAttribute) return;
    node.setAttribute('data-academic-object', type);
    node.setAttribute('data-academic-id', id);
    node.setAttribute('data-academic-label', label);
  }

  function ensureAnchorId(node, prefix, fallbackText){
    if(!node) return '';
    var existing = normalizeText(node.getAttribute ? node.getAttribute('id') : node.id);
    if(existing){
      if(node.id !== existing) node.id = existing;
      return existing;
    }
    var generated = 'aq-' + prefix + '-' + (slugify(fallbackText) || Math.random().toString(36).slice(2, 8));
    node.id = generated;
    return generated;
  }

  function getRoot(options){
    options = options || {};
    if(options.root) return options.root;
    if(typeof document !== 'undefined' && document.getElementById){
      return document.getElementById('apaed');
    }
    return null;
  }

  function getObjectLabelNode(node){
    if(!node) return null;
    if(node.getAttribute && node.getAttribute('data-academic-label-node') === 'true') return node;
    return null;
  }

  function getObjectTitleNode(node){
    if(!node) return null;
    if(node.getAttribute && node.getAttribute('data-academic-title-node') === 'true') return node;
    return null;
  }

  function clearObjectNodeHints(rootNode, type){
    if(!rootNode || !rootNode.querySelectorAll) return;
    rootNode.querySelectorAll('[data-academic-object="' + type + '"]').forEach(function(node){
      node.removeAttribute('data-academic-object');
      node.removeAttribute('data-academic-id');
      node.removeAttribute('data-academic-label');
      node.removeAttribute('data-academic-label-node');
      node.removeAttribute('data-academic-title-node');
    });
  }

  function updateTableLabelNode(node, number){
    if(!node) return;
    node.setAttribute('data-academic-label-node', 'true');
    node.innerHTML = '<strong>Tablo ' + String(number) + '</strong>';
  }

  function updateFigureNodes(placeholderNode, captionNode, number, title){
    var label = 'Şekil ' + String(number);
    if(placeholderNode){
      placeholderNode.setAttribute('data-academic-label-node', 'true');
      placeholderNode.textContent = '[' + label + ']';
    }
    if(captionNode){
      captionNode.setAttribute('data-academic-title-node', 'true');
      captionNode.textContent = title ? (label + ' - ' + title) : label;
      if(captionNode.style) captionNode.style.fontStyle = 'italic';
    }
  }

  function previousContentSibling(node){
    var current = node ? node.previousElementSibling : null;
    while(current){
      if(isBlankBlock(current)){
        current = current.previousElementSibling;
        continue;
      }
      return current;
    }
    return null;
  }

  function nextContentSibling(node){
    var current = node ? node.nextElementSibling : null;
    while(current){
      if(isBlankBlock(current)){
        current = current.nextElementSibling;
        continue;
      }
      return current;
    }
    return null;
  }

  function collectTableObjects(rootNode){
    var out = [];
    if(!rootNode || !rootNode.querySelectorAll) return out;
    clearObjectNodeHints(rootNode, 'table');
    Array.prototype.forEach.call(rootNode.querySelectorAll('table'), function(table, index){
      var labelNode = null;
      var titleNode = null;
      var walker = previousContentSibling(table);
      var scanned = 0;
      while(walker && scanned < 3 && isParagraphLike(walker)){
        var text = normalizeText(walker.textContent || '');
        if(matchesTableLabel(text) && !labelNode){
          labelNode = walker;
        }else if(!titleNode){
          titleNode = walker;
        }
        walker = previousContentSibling(walker);
        scanned += 1;
      }
      if(!labelNode){
        labelNode = previousContentSibling(table);
        if(labelNode && !isParagraphLike(labelNode)) labelNode = null;
      }
      var noteNode = nextContentSibling(table);
      if(noteNode && !matchesNoteText(noteNode.textContent || '')) noteNode = null;
      var number = index + 1;
      var label = 'Tablo ' + number;
      var anchorNode = table;
      var title = titleNode && titleNode !== labelNode ? normalizeText(titleNode.textContent || '') : '';
      var id = ensureAnchorId(anchorNode, 'table', label + '-' + title);
      setNodeObjectMeta(table, 'table', id, label);
      if(labelNode){
        setNodeObjectMeta(labelNode, 'table', id, label);
        updateTableLabelNode(labelNode, number);
      }
      if(titleNode && titleNode !== labelNode){
        titleNode.setAttribute('data-academic-object', 'table');
        titleNode.setAttribute('data-academic-id', id);
        titleNode.setAttribute('data-academic-label', label);
        titleNode.setAttribute('data-academic-title-node', 'true');
      }
      if(noteNode){
        noteNode.setAttribute('data-academic-object', 'table');
        noteNode.setAttribute('data-academic-id', id);
        noteNode.setAttribute('data-academic-label', label);
      }
      out.push({
        type: 'table',
        id: id,
        label: label,
        title: title
      });
    });
    return out;
  }

  function collectFigureCandidates(rootNode){
    var candidates = [];
    if(!rootNode || !rootNode.children) return candidates;
    Array.prototype.forEach.call(rootNode.children, function(node){
      if(!isParagraphLike(node)) return;
      var text = normalizeText(node.textContent || '');
      if(!text) return;
      if(matchesFigurePlaceholder(text) || matchesFigureLabel(text)){
        candidates.push(node);
      }
    });
    return candidates;
  }

  function collectFigureObjects(rootNode){
    var out = [];
    if(!rootNode) return out;
    clearObjectNodeHints(rootNode, 'figure');
    var candidates = collectFigureCandidates(rootNode);
    var used = [];
    candidates.forEach(function(node){
      if(used.indexOf(node) >= 0) return;
      var text = normalizeText(node.textContent || '');
      var placeholderNode = matchesFigurePlaceholder(text) ? node : null;
      var captionNode = matchesFigureLabel(text) ? node : null;
      if(placeholderNode && !captionNode){
        var next = nextContentSibling(node);
        if(next && isParagraphLike(next) && normalizeText(next.textContent || '')){
          captionNode = next;
        }
      }
      if(captionNode && !placeholderNode){
        var prev = previousContentSibling(node);
        if(prev && matchesFigurePlaceholder(prev.textContent || '')){
          placeholderNode = prev;
        }
      }
      var title = captionNode ? parseFigureTitle(captionNode.textContent || '') : '';
      var number = out.length + 1;
      var label = 'Şekil ' + number;
      var anchorNode = captionNode || placeholderNode || node;
      var id = ensureAnchorId(anchorNode, 'figure', label + '-' + title);
      if(placeholderNode){
        used.push(placeholderNode);
        setNodeObjectMeta(placeholderNode, 'figure', id, label);
      }
      if(captionNode){
        used.push(captionNode);
        setNodeObjectMeta(captionNode, 'figure', id, label);
      }
      updateFigureNodes(placeholderNode, captionNode, number, title);
      out.push({
        type: 'figure',
        id: id,
        label: label,
        title: title
      });
    });
    return out;
  }

  function collectHeadingTargets(rootNode){
    var out = [];
    if(!rootNode || !rootNode.querySelectorAll) return out;
    Array.prototype.forEach.call(rootNode.querySelectorAll('h1,h2,h3,h4,h5'), function(node){
      var text = normalizeText(node.textContent || '');
      if(!text) return;
      var level = parseInt(asText(node.tagName).slice(1), 10) || 1;
      var id = ensureAnchorId(node, 'heading', text);
      out.push({
        type: 'heading',
        id: id,
        label: Array(Math.max(1, level)).join('  ') + text
      });
    });
    return out;
  }

  function collectNoteTargets(rootNode){
    var out = [];
    if(!rootNode || !rootNode.querySelectorAll) return out;
    var footnoteIndex = 0;
    var endnoteIndex = 0;
    Array.prototype.forEach.call(rootNode.querySelectorAll('sup.fn-ref'), function(node){
      var type = normalizeTextLower(node.getAttribute('data-fn-type') || 'footnote') || 'footnote';
      var refId = normalizeText(node.getAttribute('data-fn-id') || '');
      if(!refId) return;
      if(type === 'endnote'){
        endnoteIndex += 1;
        out.push({ type: 'endnote', id: refId, label: 'Sonnot ' + endnoteIndex });
      }else{
        footnoteIndex += 1;
        out.push({ type: 'footnote', id: refId, label: 'Dipnot ' + footnoteIndex });
      }
    });
    return out;
  }

  function findAcademicNode(rootNode, selector, objectId){
    if(!rootNode || !rootNode.querySelectorAll) return null;
    var targetId = normalizeText(objectId);
    if(!targetId) return null;
    var found = null;
    Array.prototype.forEach.call(rootNode.querySelectorAll(selector), function(node){
      if(found) return;
      var nodeId = normalizeText(node.getAttribute('data-academic-id') || node.id || '');
      if(nodeId === targetId) found = node;
    });
    return found;
  }

  function findTableObjectNodes(rootNode, objectId){
    var tableNode = findAcademicNode(rootNode, 'table[data-academic-id], table[id]', objectId);
    if(!tableNode) return null;
    var labelNode = previousContentSibling(tableNode);
    if(labelNode && (!isParagraphLike(labelNode) || !matchesTableLabel(labelNode.textContent || ''))){
      labelNode = null;
    }
    var titleNode = labelNode ? nextContentSibling(labelNode) : previousContentSibling(tableNode);
    if(titleNode === tableNode) titleNode = null;
    if(titleNode === labelNode) titleNode = nextContentSibling(titleNode);
    if(titleNode && (!isParagraphLike(titleNode) || titleNode === tableNode || matchesTableLabel(titleNode.textContent || '') || matchesNoteText(titleNode.textContent || ''))){
      titleNode = null;
    }
    var noteNode = nextContentSibling(tableNode);
    if(noteNode && (!isParagraphLike(noteNode) || !matchesNoteText(noteNode.textContent || ''))){
      noteNode = null;
    }
    return {
      tableNode: tableNode,
      labelNode: labelNode,
      titleNode: titleNode,
      noteNode: noteNode
    };
  }

  function findFigureObjectNodes(rootNode, objectId){
    var captionNode = null;
    var placeholderNode = null;
    if(!rootNode || !rootNode.querySelectorAll) return null;
    Array.prototype.forEach.call(rootNode.querySelectorAll('[data-academic-object="figure"][data-academic-id]'), function(node){
      var nodeId = normalizeText(node.getAttribute('data-academic-id') || '');
      if(nodeId !== normalizeText(objectId)) return;
      if(node.getAttribute('data-academic-title-node') === 'true'){
        captionNode = node;
      }else if(node.getAttribute('data-academic-label-node') === 'true'){
        placeholderNode = node;
      }else if(!captionNode){
        captionNode = node;
      }
    });
    if(!captionNode && placeholderNode){
      var next = nextContentSibling(placeholderNode);
      if(next && isParagraphLike(next)) captionNode = next;
    }
    if(!placeholderNode && captionNode){
      var prev = previousContentSibling(captionNode);
      if(prev && matchesFigurePlaceholder(prev.textContent || '')) placeholderNode = prev;
    }
    if(!placeholderNode && !captionNode) return null;
    return {
      placeholderNode: placeholderNode,
      captionNode: captionNode
    };
  }

  function ensureTableTitleNode(nodes){
    if(!nodes || !nodes.tableNode || !nodes.tableNode.ownerDocument) return null;
    if(nodes.titleNode) return nodes.titleNode;
    var doc = nodes.tableNode.ownerDocument;
    var node = doc.createElement('p');
    node.className = 'ni';
    if(nodes.labelNode && nodes.labelNode.parentNode){
      if(nodes.labelNode.nextSibling){
        nodes.labelNode.parentNode.insertBefore(node, nodes.labelNode.nextSibling);
      }else{
        nodes.labelNode.parentNode.appendChild(node);
      }
    }else if(nodes.tableNode.parentNode){
      nodes.tableNode.parentNode.insertBefore(node, nodes.tableNode);
    }
    nodes.titleNode = node;
    return node;
  }

  function ensureTableNoteNode(nodes){
    if(!nodes || !nodes.tableNode || !nodes.tableNode.ownerDocument) return null;
    if(nodes.noteNode) return nodes.noteNode;
    var doc = nodes.tableNode.ownerDocument;
    var node = doc.createElement('p');
    node.className = 'ni';
    if(nodes.tableNode.parentNode){
      if(nodes.tableNode.nextSibling){
        nodes.tableNode.parentNode.insertBefore(node, nodes.tableNode.nextSibling);
      }else{
        nodes.tableNode.parentNode.appendChild(node);
      }
    }
    nodes.noteNode = node;
    return node;
  }

  function ensureFigureCaptionNode(nodes){
    if(!nodes) return null;
    if(nodes.captionNode) return nodes.captionNode;
    var anchor = nodes.placeholderNode;
    if(!anchor || !anchor.ownerDocument || !anchor.parentNode) return null;
    var node = anchor.ownerDocument.createElement('p');
    node.style.textAlign = 'center';
    node.style.textIndent = '0';
    node.style.fontStyle = 'italic';
    if(anchor.nextSibling){
      anchor.parentNode.insertBefore(node, anchor.nextSibling);
    }else{
      anchor.parentNode.appendChild(node);
    }
    nodes.captionNode = node;
    return node;
  }

  function removeNode(node){
    if(node && node.parentNode) node.parentNode.removeChild(node);
  }

  function getCaptionManagerEntries(options){
    var rootNode = getRoot(options);
    if(!rootNode) return [];
    var targets = collectTargets({ root: rootNode }).filter(function(target){
      return target && (target.type === 'table' || target.type === 'figure');
    });
    return targets.map(function(target){
      var entry = {
        id: target.id,
        type: target.type,
        label: normalizeText(target.label || ''),
        title: normalizeText(target.title || ''),
        note: ''
      };
      if(target.type === 'table'){
        var nodes = findTableObjectNodes(rootNode, target.id);
        if(nodes && nodes.noteNode){
          entry.note = normalizeText(nodes.noteNode.textContent || '').replace(/^not\.\s*/i, '');
        }
      }
      return entry;
    });
  }

  function updateCaption(options){
    options = options || {};
    var rootNode = getRoot(options);
    if(!rootNode) return false;
    var objectId = normalizeText(options.id || '');
    var objectType = normalizeTextLower(options.type || '');
    if(!objectId || !objectType) return false;
    var title = normalizeText(options.title || '');
    var note = normalizeText(options.note || '');
    if(objectType === 'table'){
      var tableNodes = findTableObjectNodes(rootNode, objectId);
      if(!tableNodes) return false;
      if(title){
        var titleNode = ensureTableTitleNode(tableNodes);
        if(titleNode){
          titleNode.textContent = title;
          if(titleNode.style) titleNode.style.fontStyle = 'italic';
          titleNode.setAttribute('data-academic-object', 'table');
          titleNode.setAttribute('data-academic-id', objectId);
          titleNode.setAttribute('data-academic-title-node', 'true');
        }
      }else{
        removeNode(tableNodes.titleNode);
        tableNodes.titleNode = null;
      }
      if(note){
        var noteNode = ensureTableNoteNode(tableNodes);
        if(noteNode){
          noteNode.innerHTML = '<em>Not.</em> ';
          noteNode.appendChild(noteNode.ownerDocument.createTextNode(note));
          noteNode.setAttribute('data-academic-object', 'table');
          noteNode.setAttribute('data-academic-id', objectId);
        }
      }else{
        removeNode(tableNodes.noteNode);
        tableNodes.noteNode = null;
      }
      normalizeDocument({ root: rootNode });
      return true;
    }
    if(objectType === 'figure'){
      var figureNodes = findFigureObjectNodes(rootNode, objectId);
      if(!figureNodes) return false;
      var currentTarget = getCaptionManagerEntries({ root: rootNode }).find(function(entry){
        return entry && entry.type === 'figure' && entry.id === objectId;
      }) || null;
      var currentLabel = normalizeText(currentTarget && currentTarget.label || '');
      if(title){
        var captionNode = ensureFigureCaptionNode(figureNodes);
        if(captionNode){
          captionNode.textContent = title ? ((currentLabel || 'Şekil') + ' - ' + title) : (currentLabel || 'Şekil');
          if(captionNode.style) captionNode.style.fontStyle = 'italic';
          captionNode.setAttribute('data-academic-object', 'figure');
          captionNode.setAttribute('data-academic-id', objectId);
          captionNode.setAttribute('data-academic-title-node', 'true');
        }
      }else if(figureNodes.captionNode && !figureNodes.placeholderNode){
        removeNode(figureNodes.captionNode);
        figureNodes.captionNode = null;
      }else if(figureNodes.captionNode){
        figureNodes.captionNode.textContent = currentLabel || 'Şekil';
      }
      normalizeDocument({ root: rootNode });
      return true;
    }
    return false;
  }

  function collectTargets(options){
    var rootNode = getRoot(options);
    if(!rootNode) return [];
    var tables = collectTableObjects(rootNode);
    var figures = collectFigureObjects(rootNode);
    return collectHeadingTargets(rootNode)
      .concat(tables)
      .concat(figures)
      .concat(collectNoteTargets(rootNode));
  }

  function getTargetMap(targets){
    var map = {};
    (Array.isArray(targets) ? targets : []).forEach(function(target){
      if(!target || !target.id) return;
      map[String(target.id)] = target;
    });
    return map;
  }

  function syncCrossRefLabels(options){
    var rootNode = getRoot(options);
    if(!rootNode || !rootNode.querySelectorAll) return { updated: 0, missing: 0 };
    var targets = Array.isArray(options && options.targets) ? options.targets : collectTargets({ root: rootNode });
    var targetMap = getTargetMap(targets);
    var updated = 0;
    var missing = 0;
    Array.prototype.forEach.call(rootNode.querySelectorAll('a.cross-ref'), function(node){
      var refId = normalizeText(node.getAttribute('data-ref-id') || '');
      if(!refId) return;
      var target = targetMap[refId];
      if(!target){
        node.classList.add('cross-ref-missing');
        node.setAttribute('title', 'Çapraz referans hedefi bulunamadi');
        missing += 1;
        return;
      }
      var label = normalizeText(target.label || '');
      var displayMode = normalizeTextLower(node.getAttribute('data-ref-display') || 'context') || 'context';
      var text = buildCrossRefText(target, { mode: displayMode });
      if(normalizeText(node.textContent || '') !== text) node.textContent = text;
      node.setAttribute('data-ref-type', target.type || 'heading');
      node.setAttribute('data-ref-label', label);
      node.setAttribute('data-ref-display', displayMode);
      node.setAttribute('href', '#' + refId);
      node.setAttribute('title', 'Çapraz referans: ' + label);
      node.classList.remove('cross-ref-missing');
      updated += 1;
    });
    return { updated: updated, missing: missing };
  }

  function normalizeDocument(options){
    var rootNode = getRoot(options);
    if(!rootNode) return { tables: 0, figures: 0, refsUpdated: 0 };
    var tables = collectTableObjects(rootNode);
    var figures = collectFigureObjects(rootNode);
    var targets = collectHeadingTargets(rootNode)
      .concat(tables)
      .concat(figures)
      .concat(collectNoteTargets(rootNode));
    var refs = syncCrossRefLabels({ root: rootNode, targets: targets });
    return {
      tables: tables.length,
      figures: figures.length,
      refsUpdated: refs.updated,
      refsMissing: refs.missing,
      targets: targets
    };
  }

  function normalizeHTMLForExport(html, options){
    if(typeof document === 'undefined' || !document.createElement) return String(html || '');
    var wrapper = document.createElement('div');
    wrapper.innerHTML = String(html || '');
    normalizeDocument({ root: wrapper });
    return wrapper.innerHTML;
  }

  function getNextNumber(type, options){
    var rootNode = getRoot(options);
    if(!rootNode) return 1;
    if(String(type || '') === 'figure'){
      return collectFigureObjects(rootNode).length + 1;
    }
    if(String(type || '') === 'table'){
      return collectTableObjects(rootNode).length + 1;
    }
    return 1;
  }

  return {
    slugify: slugify,
    buildCrossRefText: buildCrossRefText,
    extractTargetNumber: extractTargetNumber,
    parseFigureTitle: parseFigureTitle,
    collectTargets: collectTargets,
    getCaptionManagerEntries: getCaptionManagerEntries,
    updateCaption: updateCaption,
    syncCrossRefLabels: syncCrossRefLabels,
    normalizeDocument: normalizeDocument,
    normalizeHTMLForExport: normalizeHTMLForExport,
    getNextNumber: getNextNumber
  };
});
