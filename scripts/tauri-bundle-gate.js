const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist', 'tauri');

function fail(message) {
  throw new Error(message);
}

function findSignTool() {
  const kitsRoot = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  if (!fs.existsSync(kitsRoot)) return null;
  const stack = [kitsRoot];
  const matches = [];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.toLowerCase() === 'signtool.exe' && /\\x64\\/i.test(full)) matches.push(full);
    }
  }
  return matches.sort().at(-1) || null;
}

function verifySignature(installerPath) {
  const signtool = findSignTool();
  if (!signtool) fail('signtool.exe not found');
  const result = spawnSync(signtool, ['verify', '/v', installerPath], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status !== 0 && !/Signing Certificate Chain:/.test(output)) {
    fail(`signtool signature presence check failed for ${installerPath}`);
  }
}

function main() {
  if (!fs.existsSync(distDir)) fail('dist/tauri does not exist; run npm run build first');
  const noticesPath = path.join(rootDir, 'dist', 'THIRD_PARTY_NOTICES.md');
  if (!fs.existsSync(noticesPath)) fail('dist/THIRD_PARTY_NOTICES.md is missing');
  const installers = fs.readdirSync(distDir)
    .filter((name) => name.toLowerCase().endsWith('.exe'))
    .map((name) => path.join(distDir, name));
  if (!installers.length) fail('No Tauri NSIS installer in dist/tauri');

  const latestPath = path.join(distDir, 'latest.json');
  if (!fs.existsSync(latestPath)) fail('dist/tauri/latest.json is missing');
  const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  if (!latest.version || !latest.platforms || !latest.platforms['windows-x86_64']) {
    fail('latest.json does not match the Tauri updater manifest shape');
  }

  for (const installer of installers) {
    const sizeMb = fs.statSync(installer).size / (1024 * 1024);
    if (sizeMb > 250) fail(`${path.basename(installer)} is unexpectedly large (${sizeMb.toFixed(1)} MB)`);
    verifySignature(installer);
  }

  console.log('[tauri-bundle-gate] PASS');
}

try {
  main();
} catch (error) {
  console.error('[tauri-bundle-gate] FAIL:', error && error.message ? error.message : error);
  process.exit(1);
}
