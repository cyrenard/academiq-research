const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const result = {
    telemetryDir: process.env.ACADEMIQ_TELEMETRY_DIR || defaultTelemetryDir(),
    baseline: Number(process.env.ACADEMIQ_ELECTRON_BASELINE_CRASHES || 0)
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--telemetry-dir') {
      result.telemetryDir = argv[++index];
    } else if (arg === '--baseline') {
      result.baseline = Number(argv[++index]);
    }
  }
  return result;
}

function defaultTelemetryDir() {
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA || process.cwd();
  return path.join(appData, 'academiq-research', 'telemetry');
}

function countCrashes(telemetryDir) {
  if (!fs.existsSync(telemetryDir)) return 0;
  return fs.readdirSync(telemetryDir)
    .filter((name) => /^crash-day-\d+\.jsonl$/.test(name))
    .map((name) => path.join(telemetryDir, name))
    .reduce((total, filePath) => {
      const lines = fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);
      return total + lines.length;
    }, 0);
}

function main(argv = process.argv) {
  const args = parseArgs(argv);
  if (!Number.isFinite(args.baseline) || args.baseline < 0) {
    throw new Error('baseline must be a non-negative number');
  }
  const crashes = countCrashes(args.telemetryDir);
  const threshold = Math.max(0, args.baseline * 1.1);
  const pass = crashes <= threshold;
  const summary = {
    ok: pass,
    telemetryDir: args.telemetryDir,
    tauriCrashes: crashes,
    electronBaseline: args.baseline,
    threshold
  };
  console.log(JSON.stringify(summary, null, 2));
  return pass ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = { countCrashes, main, parseArgs };
