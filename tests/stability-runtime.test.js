const test = require('node:test');
const assert = require('node:assert/strict');

function loadFresh(){
  const modPath = require.resolve('../src/stability-runtime.js');
  delete require.cache[modPath];
  return require(modPath);
}

test('stability runtime exports core api', () => {
  const stability = loadFresh();
  assert.equal(typeof stability.init, 'function');
  assert.equal(typeof stability.capture, 'function');
  assert.equal(typeof stability.safe, 'function');
  assert.equal(typeof stability.getRecent, 'function');
  assert.equal(typeof stability.clear, 'function');
});

test('capture writes entries and keeps bounded log size', () => {
  const origWarn = console.warn;
  try{
    console.warn = () => {};
    const stability = loadFresh();
    stability.clear();
    for(let i = 0; i < 140; i++){
      stability.capture('test.scope', new Error('boom-' + i));
    }
    const recent = stability.getRecent();
    assert.equal(recent.length, 120);
    assert.equal(recent[0].message, 'boom-20');
    assert.equal(recent[119].message, 'boom-139');
  }finally{
    console.warn = origWarn;
  }
});

test('safe catches errors and returns fallback', () => {
  const origWarn = console.warn;
  try{
    console.warn = () => {};
    const stability = loadFresh();
    stability.clear();
    const ok = stability.safe('safe.ok', () => 42, 0);
    const fallback = stability.safe('safe.fail', () => { throw new Error('x'); }, 7);
    assert.equal(ok, 42);
    assert.equal(fallback, 7);
    const recent = stability.getRecent(1);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].scope, 'safe.fail');
  }finally{
    console.warn = origWarn;
  }
});
