/**
 * Citation finder — candidate ranking (pure, testable).
 *
 * Composite score favouring: API relevance, (influential) citation count,
 * journal quality (Scimago quartile when known), recency, and Open Access
 * (which is both legally accessible and lets us extract the supporting
 * sentence from the full text).
 */

export interface PaperCandidate {
  id: string;
  title: string;
  authors: string[];
  year?: number | null;
  venue?: string;
  citationCount?: number;
  influentialCitationCount?: number;
  isOpenAccess?: boolean;
  oaPdfUrl?: string | null;
  abstract?: string;
  doi?: string | null;
  quartile?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null;
  /** 0-based position in the source API's own relevance order (lower = better). */
  apiRank?: number;
  source?: 'crossref' | 'semanticscholar' | 'dergipark' | string;
}

export interface RankOptions {
  currentYear?: number;
  preferOpenAccess?: boolean; // default true
}

const QUARTILE_SCORE: Record<string, number> = { Q1: 1, Q2: 0.7, Q3: 0.4, Q4: 0.2 };

export function scoreCandidate(c: PaperCandidate, opts: RankOptions = {}): number {
  const currentYear = opts.currentYear ?? new Date().getFullYear();
  const preferOA = opts.preferOpenAccess !== false;

  const rel = 1 / (1 + Math.max(0, Number(c.apiRank) || 0));
  const cites = Math.max(0, Number(c.citationCount) || 0);
  const citeScore = Math.min(1, Math.log10(cites + 1) / 3); // ~1000 cites → ~1.0
  const infl = Math.max(0, Number(c.influentialCitationCount) || 0);
  const inflBonus = Math.min(0.5, Math.log10(infl + 1) / 2);
  const qual = c.quartile && QUARTILE_SCORE[c.quartile] != null ? QUARTILE_SCORE[c.quartile] : 0.3;
  const year = Number(c.year) || 0;
  const recency = year ? Math.max(0, Math.min(1, (year - (currentYear - 25)) / 25)) : 0.3;
  const oaBonus = preferOA && c.isOpenAccess ? 0.3 : 0;

  return 0.4 * rel + 0.25 * citeScore + inflBonus + 0.15 * qual + 0.1 * recency + oaBonus;
}

export function rankCandidates(candidates: PaperCandidate[], opts: RankOptions = {}): PaperCandidate[] {
  return [...(candidates || [])].sort((a, b) => scoreCandidate(b, opts) - scoreCandidate(a, opts));
}

/** Merge candidates from multiple sources, de-duped by DOI (or normalized title). */
export function mergeCandidates(...lists: PaperCandidate[][]): PaperCandidate[] {
  const byKey = new Map<string, PaperCandidate>();
  for (const list of lists) {
    for (const c of list || []) {
      if (!c) continue;
      const key = (c.doi && String(c.doi).toLowerCase()) ||
        String(c.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key) continue;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...c });
      } else {
        // keep the richer record (more citations / has OA pdf / has abstract)
        byKey.set(key, {
          ...existing,
          ...c,
          citationCount: Math.max(existing.citationCount || 0, c.citationCount || 0),
          influentialCitationCount: Math.max(existing.influentialCitationCount || 0, c.influentialCitationCount || 0),
          isOpenAccess: existing.isOpenAccess || c.isOpenAccess,
          oaPdfUrl: existing.oaPdfUrl || c.oaPdfUrl,
          abstract: existing.abstract || c.abstract,
          quartile: existing.quartile || c.quartile
        });
      }
    }
  }
  return Array.from(byKey.values());
}
