#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const configPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');

function configureMacosBundle(config) {
  const next = JSON.parse(JSON.stringify(config));
  next.bundle = next.bundle || {};
  next.bundle.targets = ['dmg'];
  next.bundle.icon = ['icons/icon.icns'];
  next.bundle.macOS = { ...next.bundle.macOS, signingIdentity: '-' };

  const resources = Array.isArray(next.bundle.resources) ? next.bundle.resources : [];
  next.bundle.resources = resources
    .filter((resource) => !['binaries/pdfium.dll', 'binaries/libpdfium.so'].includes(resource));
  if (!next.bundle.resources.includes('binaries/libpdfium.dylib')) {
    next.bundle.resources.push('binaries/libpdfium.dylib');
  }
  if (!next.bundle.resources.includes('binaries/vision-ocr')) {
    next.bundle.resources.push('binaries/vision-ocr');
  }
  return next;
}

function main() {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const next = configureMacosBundle(config);
  fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log('[configure-tauri-macos] target=dmg; ad-hoc signing for test build');
}

if (require.main === module) main();

module.exports = { configureMacosBundle };
