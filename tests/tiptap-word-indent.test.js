const test = require('node:test');
const assert = require('node:assert/strict');

const indent = require('../src/tiptap-word-indent.js');

function mockEl(attrs){
  attrs = attrs || {};
  return {
    getAttribute(key){
      return Object.prototype.hasOwnProperty.call(attrs, key) ? String(attrs[key]) : null;
    }
  };
}

function makeResolvedPos(config){
  const parentChildren = config.parentChildren || [];
  return {
    depth: config.depth,
    node(depth){
      if(depth === config.depth) return config.paragraphNode;
      if(depth === config.parentDepth){
        return {
          type: { name: config.parentType || 'doc' },
          child(index){ return parentChildren[index] || null; }
        };
      }
      return { type: { name:'doc' } };
    },
    index(depth){
      if(depth === config.depth) return config.indexInParent;
      return 0;
    },
    before(){ return config.pos; }
  };
}

test('parseIndentModeFromElement prefers explicit data-indent-mode', () => {
  assert.equal(indent.parseIndentModeFromElement(mockEl({ 'data-indent-mode':'first-line' })), 'first-line');
  assert.equal(indent.parseIndentModeFromElement(mockEl({ 'data-indent-mode':'none' })), 'none');
});

test('parseIndentModeFromElement parses legacy classes and style', () => {
  assert.equal(indent.parseIndentModeFromElement(mockEl({ class:'ni' })), 'none');
  assert.equal(indent.parseIndentModeFromElement(mockEl({ class:'refe' })), 'none');
  assert.equal(indent.parseIndentModeFromElement(mockEl({ style:'text-indent:0' })), 'none');
  assert.equal(indent.parseIndentModeFromElement(mockEl({ style:'text-indent:-.5in' })), 'none');
  assert.equal(indent.parseIndentModeFromElement(mockEl({ style:'text-indent:.5in' })), 'first-line');
});

test('stripIndentClasses removes only indent helper classes', () => {
  assert.equal(indent.stripIndentClasses('indent-first-line'), null);
  assert.equal(indent.stripIndentClasses('indent-none refe'), 'refe');
  assert.equal(indent.stripIndentClasses('ni refe'), 'ni refe');
});

test('special context detection: blockquote/list/table parents are no-indent', () => {
  const paragraphNode = { type:{ name:'paragraph' }, attrs:{} };
  const pos = {
    depth: 2,
    node(depth){
      if(depth === 2) return paragraphNode;
      if(depth === 1) return { type:{ name:'blockquote' } };
      return { type:{ name:'doc' } };
    },
    index(){ return 0; }
  };
  assert.equal(indent.resolveParagraphIndentMode({ $pos:pos, node:paragraphNode }), 'none');
});

test('special context detection: paragraph after heading is no-indent', () => {
  const paragraphNode = { type:{ name:'paragraph' }, attrs:{} };
  const headingNode = { type:{ name:'heading' }, attrs:{} };
  const pos = makeResolvedPos({
    depth: 1,
    parentDepth: 0,
    parentType: 'doc',
    indexInParent: 1,
    parentChildren: [headingNode, paragraphNode],
    paragraphNode,
    pos: 8
  });
  assert.equal(indent.resolveParagraphIndentMode({ $pos:pos, node:paragraphNode }), 'none');
});

test('normal body paragraph resolves to first-line indent', () => {
  const paragraphNode = { type:{ name:'paragraph' }, attrs:{} };
  const pos = makeResolvedPos({
    depth: 1,
    parentDepth: 0,
    parentType: 'doc',
    indexInParent: 1,
    parentChildren: [{ type:{ name:'paragraph' }, attrs:{} }, paragraphNode],
    paragraphNode,
    pos: 12
  });
  assert.equal(indent.resolveParagraphIndentMode({ $pos:pos, node:paragraphNode }), 'first-line');
});

test('normalizeParagraphIndentation updates only mismatched paragraph attrs', () => {
  const doc = {
    descendants(visitor){
      visitor({ type:{ name:'paragraph' }, attrs:{ indentMode:'first-line' } }, 1);
      visitor({ type:{ name:'paragraph' }, attrs:{ class:'refe', indentMode:'first-line' } }, 10);
      visitor({ type:{ name:'heading' }, attrs:{} }, 20);
    },
    resolve(pos){
      if(pos === 1){
        const paragraphNode = { type:{ name:'paragraph' }, attrs:{ indentMode:'first-line' } };
        return makeResolvedPos({
          depth: 1,
          parentDepth: 0,
          parentType: 'doc',
          indexInParent: 0,
          parentChildren: [paragraphNode],
          paragraphNode,
          pos
        });
      }
      const paragraphNode = { type:{ name:'paragraph' }, attrs:{ class:'refe', indentMode:'first-line' } };
      return makeResolvedPos({
        depth: 1,
        parentDepth: 0,
        parentType: 'doc',
        indexInParent: 1,
        parentChildren: [{ type:{ name:'heading' }, attrs:{} }, paragraphNode],
        paragraphNode,
        pos
      });
    }
  };

  const updates = [];
  const result = indent.normalizeParagraphIndentation({
    doc,
    applyUpdate(update){ updates.push(update); }
  });

  assert.equal(result.changed, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].pos, 10);
  assert.equal(updates[0].attrs.indentMode, 'none');
});
