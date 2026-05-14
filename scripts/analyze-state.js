#!/usr/bin/env node
/**
 * State Analysis Script
 *
 * Reads the AcademiQ state.json from the user's appData directory
 * and reports the size distribution across categories. Helps decide
 * whether/where to shard the JSON storage.
 *
 * Usage:
 *   node scripts/analyze-state.js [path/to/state.json]
 *
 * If no path given, tries to autodetect:
 *   Windows: %APPDATA%/AcademiQ Research/state.json
 *   macOS:   ~/Library/Application Support/AcademiQ Research/state.json
 *   Linux:   ~/.config/AcademiQ Research/state.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function defaultStatePath() {
  const home = os.homedir();
  const appName = 'AcademiQ';
  const fileName = 'academiq-data.json';
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return path.join(local, appName, fileName);
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', appName, fileName);
  }
  return path.join(home, '.config', appName, fileName);
}

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function jsonSize(value) {
  if (value === undefined || value === null) return 0;
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function pct(part, total) {
  if (!total) return '0.0';
  return ((part / total) * 100).toFixed(1);
}

function renderBar(percent, width = 30) {
  const filled = Math.round((percent / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function timed(label, fn) {
  const start = process.hrtime.bigint();
  const result = fn();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return { result, ms, label };
}

function analyzeWorkspace(ws, totalSize) {
  if (!ws || typeof ws !== 'object') return null;
  const lib = Array.isArray(ws.lib) ? ws.lib : [];
  const notes = Array.isArray(ws.notes) ? ws.notes : [];
  const notebooks = Array.isArray(ws.notebooks) ? ws.notebooks : [];
  const collections = Array.isArray(ws.collections) ? ws.collections : [];
  const matrix = ws.matrix || {};
  const annotations = ws.annotations || {};
  const drawings = ws.drawings || {};

  const libSize = jsonSize(lib);
  const notesSize = jsonSize(notes);
  const notebooksSize = jsonSize(notebooks);
  const collectionsSize = jsonSize(collections);
  const matrixSize = jsonSize(matrix);
  const annotationsSize = jsonSize(annotations);
  const drawingsSize = jsonSize(drawings);

  // Count annotation strokes / drawing points (heaviest culprits)
  let totalAnnotEntries = 0;
  let totalDrawEntries = 0;
  if (annotations && typeof annotations === 'object') {
    Object.values(annotations).forEach((entry) => {
      if (Array.isArray(entry)) totalAnnotEntries += entry.length;
      else if (entry && typeof entry === 'object') totalAnnotEntries += Object.keys(entry).length;
    });
  }
  if (drawings && typeof drawings === 'object') {
    Object.values(drawings).forEach((entry) => {
      if (Array.isArray(entry)) totalDrawEntries += entry.length;
      else if (entry && typeof entry === 'object') totalDrawEntries += Object.keys(entry).length;
    });
  }

  return {
    id: String(ws.id || ''),
    name: String(ws.name || '(adsız)'),
    refs: lib.length,
    notes: notes.length,
    notebooks: notebooks.length,
    collections: collections.length,
    annotEntries: totalAnnotEntries,
    drawEntries: totalDrawEntries,
    sizes: {
      lib: libSize,
      notes: notesSize,
      notebooks: notebooksSize,
      collections: collectionsSize,
      matrix: matrixSize,
      annotations: annotationsSize,
      drawings: drawingsSize
    }
  };
}

function analyzeDocs(docs) {
  if (!Array.isArray(docs)) return { count: 0, totalSize: 0, contentSize: 0, historySize: 0, biggest: [] };
  let contentSize = 0;
  let historySize = 0;
  const perDoc = docs.map((doc) => {
    if (!doc || typeof doc !== 'object') return { id: '', name: '(boş)', content: 0, history: 0, total: 0 };
    const docContent = jsonSize(doc.content);
    const docHistory = jsonSize(doc.history);
    const docTotal = jsonSize(doc);
    contentSize += docContent;
    historySize += docHistory;
    return {
      id: String(doc.id || ''),
      name: String(doc.name || doc.title || '(adsız)'),
      content: docContent,
      history: docHistory,
      historyCount: Array.isArray(doc.history) ? doc.history.length : (doc.history && typeof doc.history === 'object' ? Object.keys(doc.history).length : 0),
      total: docTotal
    };
  });
  perDoc.sort((a, b) => b.total - a.total);
  return {
    count: docs.length,
    totalSize: perDoc.reduce((s, d) => s + d.total, 0),
    contentSize,
    historySize,
    biggest: perDoc.slice(0, 5)
  };
}

function main() {
  const arg = process.argv[2];
  const target = arg ? path.resolve(arg) : defaultStatePath();
  console.log(`\n📄 State file: ${target}`);

  if (!fs.existsSync(target)) {
    console.error(`\n❌ Dosya bulunamadı: ${target}`);
    console.error('   Kullanım: node scripts/analyze-state.js [path/to/state.json]');
    process.exit(1);
  }

  const stat = fs.statSync(target);
  const totalSize = stat.size;
  console.log(`📦 Dosya boyutu: ${fmtBytes(totalSize)} (${totalSize.toLocaleString()} byte)\n`);

  // Timing breakdown
  const { result: rawText, ms: readMs } = timed('read', () => fs.readFileSync(target, 'utf8'));
  const { result: state, ms: parseMs } = timed('parse', () => JSON.parse(rawText));
  const { ms: stringifyMs } = timed('stringify', () => JSON.stringify(state));

  console.log('⏱  I/O & parse latency:');
  console.log(`   read:       ${readMs.toFixed(1)} ms`);
  console.log(`   JSON.parse: ${parseMs.toFixed(1)} ms`);
  console.log(`   stringify:  ${stringifyMs.toFixed(1)} ms`);
  console.log(`   total save: ~${(readMs + parseMs + stringifyMs).toFixed(0)} ms (her save'de tekrarlanır)\n`);

  // Top-level breakdown
  const wssSize = jsonSize(state.wss);
  const docsSize = jsonSize(state.docs);
  const notesSize = jsonSize(state.notes);
  const settingsSize = jsonSize(state.settings || state.cfg);
  const otherKeys = Object.keys(state).filter((k) => !['wss', 'docs', 'notes', 'settings', 'cfg'].includes(k));
  const otherSize = otherKeys.reduce((s, k) => s + jsonSize(state[k]), 0);

  console.log('📊 Üst seviye dağılım:\n');
  const topLevel = [
    { label: 'wss (workspaces)', size: wssSize },
    { label: 'docs', size: docsSize },
    { label: 'notes (root)', size: notesSize },
    { label: 'settings/cfg', size: settingsSize },
    { label: 'diğer', size: otherSize }
  ].sort((a, b) => b.size - a.size);

  topLevel.forEach(({ label, size }) => {
    const p = parseFloat(pct(size, totalSize));
    console.log(`   ${label.padEnd(22)} ${fmtBytes(size).padStart(10)}  ${pct(size, totalSize).padStart(5)}%  ${renderBar(p)}`);
  });

  // Detail breakdown of "other" keys
  if (otherKeys.length && otherSize > totalSize * 0.05) {
    console.log('\n   "diğer" anahtarları:');
    const otherBreakdown = otherKeys.map((k) => ({ k, size: jsonSize(state[k]) }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);
    otherBreakdown.forEach(({ k, size }) => {
      console.log(`     ${k.padEnd(28)} ${fmtBytes(size).padStart(10)}  ${pct(size, totalSize).padStart(5)}%`);
    });
  }

  // Docs analysis
  if (Array.isArray(state.docs) && state.docs.length) {
    console.log(`\n📝 docs (${state.docs.length} adet):`);
    const docsInfo = analyzeDocs(state.docs);
    console.log(`   toplam content (HTML):   ${fmtBytes(docsInfo.contentSize).padStart(10)}`);
    console.log(`   toplam history:          ${fmtBytes(docsInfo.historySize).padStart(10)}`);
    console.log('\n   En büyük 5 dokuman:');
    docsInfo.biggest.forEach((doc, i) => {
      console.log(`     ${i + 1}. ${doc.name.slice(0, 40).padEnd(42)} ${fmtBytes(doc.total).padStart(10)}  (history: ${doc.historyCount} snapshot, ${fmtBytes(doc.history)})`);
    });
  }

  // Workspace analysis
  if (Array.isArray(state.wss) && state.wss.length) {
    console.log(`\n🗂  workspaces (${state.wss.length} adet):`);
    const wsAnalysis = state.wss.map((ws) => analyzeWorkspace(ws, totalSize)).filter(Boolean);
    wsAnalysis.sort((a, b) => Object.values(b.sizes).reduce((s, v) => s + v, 0) - Object.values(a.sizes).reduce((s, v) => s + v, 0));

    const grandTotals = { lib: 0, notes: 0, notebooks: 0, collections: 0, matrix: 0, annotations: 0, drawings: 0 };
    let totalAnnotEntries = 0;
    let totalDrawEntries = 0;
    let totalRefs = 0;
    let totalNotes = 0;

    wsAnalysis.forEach((ws) => {
      Object.keys(grandTotals).forEach((k) => { grandTotals[k] += ws.sizes[k]; });
      totalAnnotEntries += ws.annotEntries;
      totalDrawEntries += ws.drawEntries;
      totalRefs += ws.refs;
      totalNotes += ws.notes;
    });

    console.log(`   toplam ${totalRefs} ref, ${totalNotes} not, ${totalAnnotEntries} annotation entry, ${totalDrawEntries} drawing entry\n`);
    console.log("   Workspace içi kategori dağılımı (tüm workspace'lerin toplamı):");
    Object.entries(grandTotals)
      .sort((a, b) => b[1] - a[1])
      .forEach(([key, size]) => {
        const p = parseFloat(pct(size, totalSize));
        console.log(`     ${key.padEnd(14)} ${fmtBytes(size).padStart(10)}  ${pct(size, totalSize).padStart(5)}%  ${renderBar(p, 24)}`);
      });

    if (wsAnalysis.length > 1) {
      console.log('\n   En büyük 3 workspace:');
      wsAnalysis.slice(0, 3).forEach((ws, i) => {
        const wsTotal = Object.values(ws.sizes).reduce((s, v) => s + v, 0);
        console.log(`     ${i + 1}. ${ws.name.slice(0, 30).padEnd(32)} ${fmtBytes(wsTotal).padStart(10)}  (${ws.refs} ref, ${ws.notes} not, ${ws.annotEntries} annot, ${ws.drawEntries} draw)`);
      });
    }
  }

  // Recommendations
  console.log('\n💡 Tavsiyeler:\n');
  const recommendations = [];

  // Find PDF annotations percentage across workspaces
  let totalAnnotSize = 0;
  let totalDrawSize = 0;
  let totalHistorySize = 0;
  if (Array.isArray(state.wss)) {
    state.wss.forEach((ws) => {
      if (!ws || typeof ws !== 'object') return;
      totalAnnotSize += jsonSize(ws.annotations);
      totalDrawSize += jsonSize(ws.drawings);
    });
  }
  if (Array.isArray(state.docs)) {
    state.docs.forEach((d) => { if (d) totalHistorySize += jsonSize(d.history); });
  }

  if (totalAnnotSize + totalDrawSize > totalSize * 0.20) {
    recommendations.push(`PDF annotation/drawing verisi %${pct(totalAnnotSize + totalDrawSize, totalSize)} yer kaplıyor → ayrı dosyaya shard et (annotations/<pdfId>.json)`);
  }
  if (totalHistorySize > totalSize * 0.15) {
    recommendations.push(`Document history %${pct(totalHistorySize, totalSize)} yer kaplıyor → ayrı dosyaya shard et (docs/<id>.history/<ts>.json) + LRU temizlik`);
  }
  if (totalSize > 50 * 1024 * 1024) {
    recommendations.push(`State dosyası ${fmtBytes(totalSize)} (>50MB) → save latency hissedilir, shard kritik`);
  } else if (totalSize > 20 * 1024 * 1024) {
    recommendations.push(`State dosyası ${fmtBytes(totalSize)} (>20MB) → save latency artmaya başlayabilir, ölçmeye devam edin`);
  }
  if (stringifyMs > 200) {
    recommendations.push(`JSON.stringify ${stringifyMs.toFixed(0)}ms sürüyor → her save'de UI donabilir, shard çözer`);
  }
  if (recommendations.length === 0) {
    recommendations.push('State dosyanız sağlıklı boyutta. Henüz refaktör gerektirmez — periyodik olarak tekrar ölçün.');
  }
  recommendations.forEach((r, i) => console.log(`   ${i + 1}. ${r}`));

  console.log('');
}

main();
