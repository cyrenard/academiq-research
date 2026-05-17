const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { countCrashes, main, parseArgs } = require('../scripts/dual-run-crash-gate');

test('dual-run crash gate counts local telemetry crash lines', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aq-crash-gate-'));
  fs.writeFileSync(path.join(dir, 'crash-day-20590.jsonl'), '{"event":"panic"}\n{"event":"panic"}\n');
  fs.writeFileSync(path.join(dir, 'compat-day-20590.jsonl'), '{"event":"app_start"}\n');
  assert.equal(countCrashes(dir), 2);
});

test('dual-run crash gate compares Tauri crashes to Electron baseline threshold', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aq-crash-gate-'));
  fs.writeFileSync(path.join(dir, 'crash-day-20590.jsonl'), '{"event":"panic"}\n');
  assert.equal(main(['node', 'gate', '--telemetry-dir', dir, '--baseline', '1']), 0);
  fs.appendFileSync(path.join(dir, 'crash-day-20590.jsonl'), '{"event":"panic"}\n');
  assert.equal(main(['node', 'gate', '--telemetry-dir', dir, '--baseline', '1']), 1);
});

test('dual-run crash gate accepts explicit telemetry and baseline args', () => {
  const parsed = parseArgs(['node', 'gate', '--telemetry-dir', 'C:/tmp/telemetry', '--baseline', '12']);
  assert.equal(parsed.telemetryDir, 'C:/tmp/telemetry');
  assert.equal(parsed.baseline, 12);
});
