#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const configPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');

function parseTargets(raw) {
  return String(raw || 'rpm,appimage')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function configureLinuxBundle(config, targets = parseTargets()) {
  const next = JSON.parse(JSON.stringify(config));
  next.bundle = next.bundle || {};
  next.bundle.targets = targets;
  const icons = Array.isArray(next.bundle.icon) ? next.bundle.icon : [];
  next.bundle.icon = icons.includes('../icon.png') ? icons : ['../icon.png', ...icons];

  const resources = Array.isArray(next.bundle.resources) ? next.bundle.resources : [];
  next.bundle.resources = resources
    .filter((resource) => resource !== 'binaries/pdfium.dll')
    .concat(resources.includes('binaries/libpdfium.so') ? [] : ['binaries/libpdfium.so']);

  return next;
}

function main() {
  const targets = parseTargets(process.env.ACADEMIQ_TAURI_BUNDLES || process.argv[2]);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const next = configureLinuxBundle(config, targets);
  fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`[configure-tauri-linux] targets=${targets.join(',')}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  configureLinuxBundle,
  parseTargets
};
