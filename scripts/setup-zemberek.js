#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Build the Zemberek-based Turkish spell-check server, end to end.
 *
 * Why this exists
 * ---------------
 *   Zemberek-NLP isn't published to Maven Central and has no GitHub
 *   release zip. The only way to get usable jars is to clone the repo
 *   and run its Gradle build. This script automates that so end users
 *   don't have to touch Java tooling beyond installing a JDK once.
 *
 * Prerequisites
 * -------------
 *   - JDK 17+ installed and on PATH (`javac --version` must work).
 *     Adoptium Temurin recommended: https://adoptium.net/
 *   - git on PATH.
 *
 * What it does
 * ------------
 *   1. Skip if vendor/languagetool/zemberek-server.jar already exists.
 *   2. Clone ahmetaa/zemberek-nlp into vendor/_build/zemberek-nlp.
 *   3. Run ./gradlew shadowJar (or :all:jar) inside that clone.
 *   4. Stage all produced jars into a libs/ directory.
 *   5. Compile scripts/zemberek/ZemberekServer.java against those jars.
 *   6. Pack everything (Zemberek classes + our wrapper class +
 *      META-INF/Main-Class) into a single fat jar at
 *      vendor/languagetool/zemberek-server.jar.
 *   7. Clean up vendor/_build/ to save disk.
 *
 * Idempotent — second runs no-op as long as the final jar exists.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const FINAL_JAR_DIR = path.join(VENDOR, 'languagetool');
const FINAL_JAR = path.join(FINAL_JAR_DIR, 'zemberek-server.jar');
const BUILD_DIR = path.join(VENDOR, '_build');
const ZEM_CLONE = path.join(BUILD_DIR, 'zemberek-nlp');
const STAGE = path.join(BUILD_DIR, 'stage');
const WRAPPER_SRC = path.join(__dirname, 'zemberek', 'ZemberekServer.java');

function log(msg) { console.log(`[setup-zemberek] ${msg}`); }
function fatal(msg) { console.error(`[setup-zemberek] FATAL: ${msg}`); process.exit(1); }

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }

function which(cmd) {
  const where = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(where, [cmd], { stdio: 'pipe' });
  return r.status === 0 && r.stdout && String(r.stdout).trim().split(/\r?\n/)[0] || '';
}

function run(cmd, args, cwd) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) fatal(`${cmd} exited with code ${r.status}`);
}

function checkPrereqs() {
  const javac = which('javac');
  if (!javac) {
    fatal([
      'JDK 17+ not found. Install Adoptium Temurin from https://adoptium.net/',
      'then make sure javac is on PATH (`javac --version` must work).'
    ].join('\n'));
  }
  log(`javac: ${javac}`);
  const git = which('git');
  if (!git) fatal('git not found on PATH. Install git first.');
  log(`git: ${git}`);
}

function cloneZemberek() {
  if (exists(ZEM_CLONE)) {
    log(`reusing existing clone at ${ZEM_CLONE}`);
    return;
  }
  mkdirp(BUILD_DIR);
  run('git', ['clone', '--depth', '1', 'https://github.com/ahmetaa/zemberek-nlp.git', ZEM_CLONE]);
}

function buildZemberekJars() {
  // Zemberek ships a gradle wrapper. Each top-level module has a
  // `jar` task that produces build/libs/<module>-<ver>.jar.
  const isWin = process.platform === 'win32';
  const gradle = isWin ? 'gradlew.bat' : './gradlew';
  // Build all needed modules. core is a dep of every other; morphology,
  // normalization, tokenization are the runtime libs we use.
  run(gradle, ['core:jar', 'morphology:jar', 'tokenization:jar', 'normalization:jar', '--no-daemon'], ZEM_CLONE);
}

function stageJars() {
  if (exists(STAGE)) fs.rmSync(STAGE, { recursive: true, force: true });
  mkdirp(STAGE);
  const modules = ['core', 'morphology', 'tokenization', 'normalization'];
  for (const mod of modules) {
    const libsDir = path.join(ZEM_CLONE, mod, 'build', 'libs');
    if (!exists(libsDir)) fatal(`expected build output missing: ${libsDir}`);
    const files = fs.readdirSync(libsDir).filter((f) => f.endsWith('.jar') && !f.includes('sources') && !f.includes('javadoc'));
    if (files.length === 0) fatal(`no jar produced under ${libsDir}`);
    for (const f of files) {
      const src = path.join(libsDir, f);
      const dst = path.join(STAGE, f);
      fs.copyFileSync(src, dst);
      log(`staged ${f}`);
    }
  }
  // Zemberek's Gradle build downloads its own deps to ~/.gradle. We
  // need them in the fat jar too. Walk the cache for jars referenced
  // by each module's runtime classpath. Easiest: harvest jars from
  // each module's resolved runtime configuration via gradle.
  // To keep it simple here we mirror the well-known transitive set —
  // protobuf-java, jcommander, log4j-core/api, antlr-runtime, guava —
  // by looking for them in the gradle dependency cache.
  const userGradle = path.join(process.env.USERPROFILE || process.env.HOME || '', '.gradle', 'caches', 'modules-2', 'files-2.1');
  if (exists(userGradle)) {
    const wanted = [
      'guava', 'protobuf-java', 'jcommander', 'log4j-core', 'log4j-api',
      'antlr4-runtime', 'snakeyaml', 'failureaccess', 'jsr305', 'gson',
      'commons-cli', 'checker-qual'
    ];
    function walk(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) { walk(full); continue; }
        if (!ent.name.endsWith('.jar')) continue;
        if (ent.name.includes('-sources.') || ent.name.includes('-javadoc.')) continue;
        if (wanted.some((w) => ent.name.startsWith(w + '-'))) {
          const dst = path.join(STAGE, ent.name);
          if (!exists(dst)) {
            fs.copyFileSync(full, dst);
            log(`staged transitive ${ent.name}`);
          }
        }
      }
    }
    walk(userGradle);
  } else {
    log(`warning: ${userGradle} not found; transitive deps may be missing`);
  }
}

function compileWrapper() {
  const classpathSeparator = process.platform === 'win32' ? ';' : ':';
  const jars = fs.readdirSync(STAGE).filter((f) => f.endsWith('.jar')).map((f) => path.join(STAGE, f));
  const classesDir = path.join(BUILD_DIR, 'classes');
  if (exists(classesDir)) fs.rmSync(classesDir, { recursive: true, force: true });
  mkdirp(classesDir);
  run('javac', [
    '-d', classesDir,
    '-cp', jars.join(classpathSeparator),
    '-source', '17', '-target', '17',
    WRAPPER_SRC
  ]);
}

function buildFatJar() {
  // Extract every staged jar's contents into a single tree, then `jar cfm` it.
  const fatRoot = path.join(BUILD_DIR, 'fat');
  if (exists(fatRoot)) fs.rmSync(fatRoot, { recursive: true, force: true });
  mkdirp(fatRoot);
  // Unpack each lib jar
  const jars = fs.readdirSync(STAGE).filter((f) => f.endsWith('.jar'));
  for (const j of jars) {
    log(`unpacking ${j} into fat tree`);
    run('jar', ['-xf', path.join(STAGE, j)], fatRoot);
  }
  // Drop any META-INF/*.SF, *.DSA, *.RSA signatures (would invalidate fat jar)
  function purgeSig(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { purgeSig(full); continue; }
      if (/\.(SF|DSA|RSA|EC)$/i.test(ent.name)) fs.unlinkSync(full);
    }
  }
  const metaInf = path.join(fatRoot, 'META-INF');
  if (exists(metaInf)) purgeSig(metaInf);
  // Copy our compiled wrapper
  const classesDir = path.join(BUILD_DIR, 'classes');
  function copyTree(src, dst) {
    mkdirp(dst);
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, ent.name);
      const d = path.join(dst, ent.name);
      if (ent.isDirectory()) copyTree(s, d);
      else fs.copyFileSync(s, d);
    }
  }
  copyTree(classesDir, fatRoot);
  // Manifest
  const manifest = path.join(BUILD_DIR, 'MANIFEST.MF');
  fs.writeFileSync(manifest, 'Manifest-Version: 1.0\nMain-Class: academiq.zemberek.ZemberekServer\n', 'utf8');
  // Build final jar
  mkdirp(FINAL_JAR_DIR);
  run('jar', ['cfm', FINAL_JAR, manifest, '-C', fatRoot, '.']);
  const sizeMB = (fs.statSync(FINAL_JAR).size / 1048576).toFixed(1);
  log(`fat jar ready: ${FINAL_JAR} (${sizeMB} MB)`);
}

function cleanup() {
  try {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
    log('cleaned vendor/_build');
  } catch (_e) {}
}

function main() {
  if (exists(FINAL_JAR)) {
    log(`already built: ${FINAL_JAR}`);
    log('delete it and re-run if you want a fresh build');
    return;
  }
  checkPrereqs();
  cloneZemberek();
  buildZemberekJars();
  stageJars();
  compileWrapper();
  buildFatJar();
  cleanup();
  log('DONE. Next: `npm start` and the Zemberek HTTP server will spawn automatically.');
}

if (require.main === module) main();
