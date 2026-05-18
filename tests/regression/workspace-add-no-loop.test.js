const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

test('workspace add does not have a focus-driven switchWorkspace effect loop', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'App.tsx'), 'utf8');
  assert.doesNotMatch(source, /useEffect\([\s\S]{0,500}focus\.workspaceId[\s\S]{0,500}switchWorkspace/);
  assert.match(source, /const handleAddWorkspace = async/);
  assert.match(source, /persistState\(next\)/);
});
