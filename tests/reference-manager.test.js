const test = require('node:test');
const assert = require('node:assert/strict');

function loadReferenceManager(windowMock){
  const previousWindow = global.window;
  const modulePath = require.resolve('../src/reference-manager.js');
  delete require.cache[modulePath];
  global.window = windowMock;
  require(modulePath);
  return {
    manager: global.window.AQReferenceManager,
    restore(){
      delete require.cache[modulePath];
      if(typeof previousWindow === 'undefined') delete global.window;
      else global.window = previousWindow;
    }
  };
}

test('findReference resolves against provided/current workspace without global fallback calls', () => {
  const findCalls = [];
  const { manager, restore } = loadReferenceManager({
    S: { cur: 'ws-a' },
    findRef(id, workspaceId){
      findCalls.push([id, workspaceId]);
      return null;
    }
  });
  try{
    assert.equal(typeof manager.findReference, 'function');
    assert.equal(manager.findReference('ref-1'), null);
    assert.equal(manager.findReference('ref-2', 'ws-b'), null);
    assert.deepEqual(findCalls, [
      ['ref-1', 'ws-a'],
      ['ref-2', 'ws-b']
    ]);
  } finally {
    restore();
  }
});
