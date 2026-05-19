const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

test('React toolbar exposes the legacy track changes control set', () => {
  const toolbar = fs.readFileSync(path.join(rootDir, 'src/renderer/components/shell/TopToolbar.tsx'), 'utf8');
  assert.match(toolbar, /toggleTrackChanges/);
  assert.match(toolbar, /runTrackChangeAction/);
  [
    'focusPrevTrackedChange',
    'focusNextTrackedChange',
    'acceptCurrentTrackedChange',
    'rejectCurrentTrackedChange',
    'acceptTrackedChanges',
    'rejectTrackedChanges'
  ].forEach((fn) => assert.match(toolbar, new RegExp(fn)));
  assert.match(toolbar, /callLegacy\(fn\)/);
});
