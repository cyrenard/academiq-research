/**
 * Runs the renderer build without shell chaining.
 * This avoids Node DEP0190 warnings from shell-based script execution.
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist', 'renderer');

const staticRoots = [
  'browser-capture-extension',
  'experiments',
  'src',
  'vendor'
];

const staticFiles = [
  'icon.ico',
  'icon.png',
  'tiptap-bundle.js'
];

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false
  });
  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(label + ' failed with exit code ' + result.status);
  }
}

function resolveViteCli() {
  const cli = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
  if (fs.existsSync(cli)) return cli;
  throw new Error('vite CLI not found. Run npm install first.');
}

run(process.execPath, [resolveViteCli(), 'build'], 'vite build');

function shouldSkipCopy(sourcePath) {
  const relativePath = path.relative(rootDir, sourcePath).replace(/\\/g, '/');
  if (relativePath === 'src/renderer' || relativePath.startsWith('src/renderer/')) return true;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(relativePath)) return true;
  if (relativePath.endsWith('/test') || relativePath.includes('/test/')) return true;
  return false;
}

function copyDir(source, target) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (shouldSkipCopy(sourcePath)) continue;
    if (entry.isDirectory()) copyDir(sourcePath, targetPath);
    else if (entry.isFile()) fs.copyFileSync(sourcePath, targetPath);
  }
}

staticRoots.forEach((name) => copyDir(path.join(rootDir, name), path.join(distDir, name)));
staticFiles.forEach((name) => {
  const source = path.join(rootDir, name);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(distDir, name));
});

run(process.execPath, [path.join(__dirname, 'patch-renderer-index.js')], 'patch-renderer-index');
