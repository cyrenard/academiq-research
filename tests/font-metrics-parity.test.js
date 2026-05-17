const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');
const tauriDir = path.join(rootDir, 'src-tauri');
const artifactDir = path.join(__dirname, 'artifacts');
const manualSmokePath = path.join(__dirname, 'MANUAL_SMOKE.md');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const windowsFontDir = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');
const timesRegular = path.join(windowsFontDir, 'times.ttf');

function fileUrl(filePath) {
  return 'file:///' + filePath.replace(/\\/g, '/').replace(/ /g, '%20');
}

function appendManualSmoke(text) {
  fs.appendFileSync(manualSmokePath, `\n${text.trim()}\n`);
}

function runRustMetrics() {
  const result = spawnSync('cargo', ['run', '--quiet', '--bin', 'font_metrics', '--', windowsFontDir], {
    cwd: tauriDir,
    encoding: 'utf8',
    timeout: 180000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout);
}

function runCanvasMetrics() {
  assert.ok(fs.existsSync(edgePath), 'Microsoft Edge headless is required for canvas metrics');
  const fonts = [
    ['Times New Roman', 'regular', 'times.ttf', '400', 'normal'],
    ['Times New Roman', 'bold', 'timesbd.ttf', '700', 'normal'],
    ['Times New Roman', 'italic', 'timesi.ttf', '400', 'italic'],
    ['Times New Roman', 'boldItalic', 'timesbi.ttf', '700', 'italic']
  ];
  const glyphs = 'ABCÇĞİÖŞÜabcçğıöşü0123456789.,;:!?()[]{}\'-–— ';
  const fontFaces = fonts.map(([family, style, file, weight, fontStyle]) => {
    const name = `AQ ${family} ${style}`;
    const url = fileUrl(path.join(windowsFontDir, file));
    return `@font-face{font-family:"${name}";src:url("${url}") format("truetype");font-weight:${weight};font-style:${fontStyle};}`;
  }).join('\n');
  const script = `
    (async () => {
      await document.fonts.ready;
      const ctx = document.createElement('canvas').getContext('2d');
      const fonts = ${JSON.stringify(fonts)};
      const glyphs = ${JSON.stringify(glyphs)};
      const out = {};
      for (const [family, style] of fonts) {
        const name = 'AQ ' + family + ' ' + style;
        await document.fonts.load('16px "' + name + '"');
        ctx.font = '16px "' + name + '"';
        const key = family + ':' + style;
        out[key] = {};
        for (const ch of glyphs) out[key][ch] = ctx.measureText(ch).width;
      }
      document.getElementById('out').textContent = JSON.stringify(out);
    })();
  `;
  const html = `<!doctype html><meta charset="utf-8"><style>${fontFaces}</style><body><pre id="out"></pre><script>${script}</script></body>`;
  const htmlPath = path.join(os.tmpdir(), `academiq-font-metrics-${Date.now()}.html`);
  const userDataDir = path.join(os.tmpdir(), `academiq-edge-font-metrics-${Date.now()}`);
  fs.writeFileSync(htmlPath, html);
  const result = spawnSync(edgePath, [
    '--headless',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-dev-shm-usage',
    '--disable-features=VizDisplayCompositor',
    '--no-sandbox',
    '--virtual-time-budget=5000',
    `--user-data-dir=${userDataDir}`,
    '--dump-dom',
    fileUrl(htmlPath)
  ], {
    encoding: 'utf8',
    timeout: 60000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const match = result.stdout.match(/<pre id="out">(.*?)<\/pre>/s);
  assert.ok(match, result.stdout);
  return JSON.parse(match[1].replace(/&quot;/g, '"'));
}

test('Canvas and Rust system Times New Roman metrics stay within 0.5px per glyph', (t) => {
  if (!fs.existsSync(timesRegular)) {
    appendManualSmoke(`
## Phase 5 Font Metrics - ${new Date().toISOString()}

SKIPPED: system Times New Roman was not found at ${timesRegular}. Fallback PDF export remains testable, but CI/release should require system TTR for the APA 7 font gate.
`);
    t.skip('system Times New Roman missing');
    return;
  }
  const rust = runRustMetrics();
  const canvas = runCanvasMetrics();
  let maxDiff = 0;
  let sum = 0;
  let count = 0;
  let worst = null;
  const diffs = [];
  for (const key of Object.keys(canvas)) {
    for (const glyph of Object.keys(canvas[key])) {
      const diff = Math.abs(canvas[key][glyph] - rust[key][glyph]);
      diffs.push(diff);
      sum += diff;
      count += 1;
      if (diff > maxDiff) {
        maxDiff = diff;
        worst = { key, glyph, canvas: canvas[key][glyph], rust: rust[key][glyph], diff };
      }
    }
  }
  diffs.sort((a, b) => a - b);
  const summary = {
    source: 'system-times-new-roman',
    fontDir: windowsFontDir,
    max_diff: maxDiff,
    avg_diff: count ? sum / count : 0,
    p99_diff: diffs[Math.floor(diffs.length * 0.99)] || 0,
    worst
  };
  fs.mkdirSync(artifactDir, { recursive: true });
  const artifact = path.join(artifactDir, `font-metrics-${Date.now()}.json`);
  fs.writeFileSync(artifact, JSON.stringify(summary, null, 2));
  appendManualSmoke(`
## Phase 5 Font Metrics - ${new Date().toISOString()}

System Times New Roman gate:

\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`
`);
  assert.ok(maxDiff <= 0.5, `font metrics max_diff ${maxDiff} > 0.5 (${JSON.stringify(worst)})`);
});
