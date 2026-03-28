const test = require('node:test');
const assert = require('node:assert/strict');

const focus = require('../src/tiptap-word-focus.js');

test('tiptap word focus exports focusEditorSurface', () => {
  assert.equal(typeof focus.focusEditorSurface, 'function');
  assert.equal(typeof focus.focusWithFallback, 'function');
});

test('focusEditorSurface focuses editor, normalizes blank content and restores scroll', async () => {
  const scroll = { scrollTop:42 };
  const calls = [];
  const editor = {
    getHTML(){ return '   '; },
    view: {
      dom: {
        focus(arg){ calls.push(['focus', arg && arg.preventScroll === true]); }
      }
    },
    state: {
      doc: { content: { size:9 } }
    },
    commands: {
      setContent(html, emit){ calls.push(['setContent', html, emit]); },
      setTextSelection(pos){ calls.push(['setTextSelection', pos]); }
    }
  };

  const ok = focus.focusEditorSurface({
    editor,
    toEnd:true,
    getScrollEl(){ return scroll; },
    ensureEditableRoot(){ calls.push(['ensure']); },
    sanitizeHTML(){ return '<p></p>'; },
    restoreDelays:[1]
  });

  assert.equal(ok, true);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(calls, [
    ['ensure'],
    ['setContent', '<p></p>', false],
    ['focus', true],
    ['setTextSelection', 9]
  ]);
  assert.equal(scroll.scrollTop, 42);
});

test('focusEditorSurface does not rewrite scroll when focus kept position stable', async () => {
  let setCount = 0;
  let top = 24;
  const scroll = {
    get scrollTop(){ return top; },
    set scrollTop(value){
      setCount++;
      top = value;
    }
  };
  const editor = {
    getHTML(){ return '<p>Merhaba</p>'; },
    view: {
      dom: {
        focus(){ }
      }
    },
    commands: {
      setTextSelection(){ }
    }
  };

  const ok = focus.focusEditorSurface({
    editor,
    getScrollEl(){ return scroll; },
    restoreDelays:[1]
  });

  assert.equal(ok, true);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(setCount, 0);
  assert.equal(scroll.scrollTop, 24);
});
