const localAssistant = require('./literature-matrix-local-assistant.js');

const COLUMN_KEYS = new Set(['purpose', 'method', 'sample', 'findings', 'limitations']);

function text(value, maxLen = 2000) {
  const out = String(value == null ? '' : value).trim();
  return out.length > maxLen ? out.slice(0, maxLen).trim() : out;
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeSource(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    page: text(source.page, 64),
    snippet: text(source.snippet, 2000),
    section: text(source.section, 80),
    extractionType: text(source.extractionType, 80),
    confidence: Math.max(0, Math.min(1, number(source.confidence, 0))),
    updatedAt: number(source.updatedAt, Date.now())
  };
}

function sanitizeCandidate(value) {
  const source = value && typeof value === 'object' ? value : {};
  const columnKey = text(source.columnKey, 32);
  const body = text(source.text, 2000);
  if (!COLUMN_KEYS.has(columnKey) || !body) return null;
  return {
    columnKey,
    text: body,
    score: number(source.score, 0),
    confidence: Math.max(0, Math.min(1, number(source.confidence, 0))),
    source: sanitizeSource(source.source),
    reasons: Array.isArray(source.reasons)
      ? source.reasons.map((item) => text(item, 160)).filter(Boolean).slice(0, 12)
      : []
  };
}

function sanitizeSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return localAssistant.normalizeSettings({
    enabled: source.enabled === true,
    provider: text(source.provider || 'rule-guard', 80),
    allowModelProvider: source.allowModelProvider === true,
    composeCells: source.composeCells === true,
    maxCandidatesPerColumn: number(source.maxCandidatesPerColumn, 4),
    maxSnippetChars: number(source.maxSnippetChars, 1200),
    minConfidence: number(source.minConfidence, 0.5)
  });
}

function createLocalMatrixAssistantService() {
  return {
    getStatus(settings) {
      return Object.assign({ ok: true }, localAssistant.getStatus(sanitizeSettings(settings)));
    },
    rankCandidates(payload) {
      const source = payload && typeof payload === 'object' ? payload : {};
      const settings = sanitizeSettings(source.settings);
      if (!settings.enabled) {
        return { ok: true, candidates: [], skipped: true, reason: 'disabled' };
      }
      const candidates = Array.isArray(source.candidates)
        ? source.candidates.map(sanitizeCandidate).filter(Boolean).slice(0, 80)
        : [];
      const reference = source.reference && typeof source.reference === 'object'
        ? {
            id: text(source.reference.id, 160),
            title: text(source.reference.title, 500),
            year: text(source.reference.year, 32),
            doi: text(source.reference.doi, 240)
          }
        : null;
      const ranked = localAssistant.rankCandidates(candidates, { reference }, settings);
      return {
        ok: true,
        candidates: ranked,
        status: localAssistant.getStatus(settings)
      };
    },
    composeCells(payload) {
      const source = payload && typeof payload === 'object' ? payload : {};
      const settings = sanitizeSettings(source.settings);
      if (!settings.enabled || !settings.composeCells) {
        return { ok: true, candidates: [], skipped: true, reason: settings.enabled ? 'compose-disabled' : 'disabled' };
      }
      const candidates = Array.isArray(source.candidates)
        ? source.candidates.map(sanitizeCandidate).filter(Boolean).slice(0, 80)
        : [];
      const reference = source.reference && typeof source.reference === 'object'
        ? {
            id: text(source.reference.id, 160),
            title: text(source.reference.title, 500),
            year: text(source.reference.year, 32),
            doi: text(source.reference.doi, 240)
          }
        : null;
      const composed = localAssistant.composeCells(candidates, { reference }, settings);
      return {
        ok: true,
        candidates: composed.map(sanitizeCandidate).filter(Boolean),
        status: localAssistant.getStatus(settings)
      };
    }
  };
}

module.exports = {
  createLocalMatrixAssistantService,
  sanitizeCandidate,
  sanitizeSettings
};
