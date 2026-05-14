import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  renderDuplicateReviewFallback,
  renderMetadataHealthFallback,
  openQualitySurface,
  handleDuplicateReviewClick,
  handleMetadataHealthClick,
  runMetadataHealthAction,
  runDuplicateAction,
  filterMetadataHealth,
  _internal
} from './quality-surface';

const {
  dismissedDuplicateMap,
  currentDuplicateGroups,
  reasonLabel,
  mergeReferencesIntoPrimary,
  findLegacyReference
} = _internal;

function buildModalDom() {
  document.body.innerHTML = `
    <div id="dupModal"></div>
    <div id="metaHealthModal"></div>
    <div id="dupSummary"></div>
    <div id="dupGroups"></div>
    <div id="metaHealthList"></div>
    <div id="metaHealthSummary"></div>
    <div id="metaHealthCountAll"></div>
    <div id="metaHealthCountIncomplete"></div>
    <div id="metaHealthCountSuspicious"></div>
    <div id="metaHealthCountComplete"></div>
    <div id="metaHealthSortBar">
      <button data-mh-sort="all">All</button>
      <button data-mh-sort="incomplete">Incomplete</button>
    </div>
  `;
}

function setWorkspace(refs: any[]) {
  (window as any).S = {
    cur: 'ws-1',
    wss: [{ id: 'ws-1', lib: refs }]
  };
}

beforeEach(() => {
  buildModalDom();
  setWorkspace([]);
  (window as any).setDst = vi.fn();
});

afterEach(() => {
  delete (window as any).S;
  delete (window as any).__aqDismissedDuplicateSignatures;
  delete (window as any).AQDuplicateDetection;
  delete (window as any).AQMetadataHealth;
  delete (window as any).duplicateReviewState;
  delete (window as any).setDst;
  delete (window as any).fetchCR;
  delete (window as any).editRefMetadata;
  delete (window as any).openReferenceEditor;
  delete (window as any).hideM;
  delete (window as any).findRef;
  delete (window as any).openDuplicateReview;
  delete (window as any).openMetadataHealthCenter;
  delete (window as any).__removeDuplicateGroup;
  delete (window as any).__renderDuplicateReviewModal;
  delete (window as any).__mergeDuplicateGroup;
  delete (window as any).__duplicateDismissedMap;
  delete (window as any).normalizeRefRecord;
  delete (window as any).mergeRefFields;
  document.body.innerHTML = '';
});

// ─── Internal helpers ───────────────────────────────────────────────────────

describe('dismissedDuplicateMap', () => {
  it('returns workspace-keyed dismissed-signature map', () => {
    const map = dismissedDuplicateMap();
    expect(map).toEqual({});
    map['sig1'] = true;
    expect(dismissedDuplicateMap()).toEqual({ sig1: true });
  });

  it('isolates dismissed maps per workspace', () => {
    dismissedDuplicateMap()['sig1'] = true;
    (window as any).S.cur = 'ws-2';
    expect(dismissedDuplicateMap()).toEqual({});
    (window as any).S.cur = 'ws-1';
    expect(dismissedDuplicateMap()).toEqual({ sig1: true });
  });

  it('uses "default" key when no workspace selected', () => {
    delete (window as any).S;
    const map = dismissedDuplicateMap();
    map['x'] = true;
    expect((window as any).__aqDismissedDuplicateSignatures.default).toEqual({ x: true });
  });
});

describe('reasonLabel', () => {
  it('translates known reason codes to Turkish', () => {
    expect(reasonLabel('doi_exact')).toMatch(/DOI/);
    expect(reasonLabel('title_exact')).toMatch(/Başlık/);
    expect(reasonLabel('author_year_similar_title')).toMatch(/Yazar/);
    expect(reasonLabel('pdf_signature')).toMatch(/PDF/);
  });
  it('returns unknown code unchanged or fallback when empty', () => {
    expect(reasonLabel('mystery_code')).toBe('mystery_code');
    expect(reasonLabel('')).toMatch(/benzer/);
  });
});

describe('currentDuplicateGroups', () => {
  it('returns legacy state groups when present', () => {
    (window as any).duplicateReviewState = { groups: [{ signature: 'a' }] };
    const groups = currentDuplicateGroups();
    expect(groups).toEqual([{ signature: 'a' }]);
  });
  it('falls back to AQDuplicateDetection.detectDuplicateGroups', () => {
    setWorkspace([{ id: 'r1', title: 'X' }]);
    const detect = vi.fn(() => [{ signature: 'detected', records: [] }]);
    (window as any).AQDuplicateDetection = { detectDuplicateGroups: detect };
    const groups = currentDuplicateGroups();
    expect(detect).toHaveBeenCalledTimes(1);
    expect((detect.mock.calls[0] as any[])[0]).toEqual([{ id: 'r1', title: 'X' }]);
    expect(groups).toEqual([{ signature: 'detected', records: [] }]);
  });
  it('returns [] when no source available', () => {
    expect(currentDuplicateGroups()).toEqual([]);
  });
});

describe('findLegacyReference', () => {
  it('uses window.findRef when present', () => {
    (window as any).findRef = vi.fn((id) => ({ id, found: 'via-findRef' }));
    const ref = findLegacyReference('r1');
    expect(ref).toEqual({ id: 'r1', found: 'via-findRef' });
  });
  it('falls back to current workspace lib lookup', () => {
    setWorkspace([{ id: 'r1', title: 'Match' }, { id: 'r2', title: 'Other' }]);
    expect(findLegacyReference('r1')).toEqual({ id: 'r1', title: 'Match' });
  });
  it('returns null when not found', () => {
    expect(findLegacyReference('missing')).toBe(null);
  });
});

describe('mergeReferencesIntoPrimary', () => {
  it('returns primary unchanged when secondary is null', () => {
    const primary = { id: 'p', title: 'P' };
    expect(mergeReferencesIntoPrimary(primary, null)).toBe(primary);
    expect(primary.title).toBe('P');
  });
  it('returns primary unchanged when primary === secondary', () => {
    const ref = { id: 'p' };
    expect(mergeReferencesIntoPrimary(ref, ref)).toBe(ref);
  });
  it('uses AQDuplicateDetection.mergeRecords when present', () => {
    const merger = vi.fn();
    (window as any).AQDuplicateDetection = { mergeRecords: merger };
    const primary = { id: 'p' };
    const secondary = { id: 's' };
    mergeReferencesIntoPrimary(primary, secondary);
    expect(merger).toHaveBeenCalledWith(primary, secondary);
  });
  it('falls back to manual field merge when no detection API', () => {
    const primary: any = { id: 'p', title: 'P' };
    const secondary: any = {
      id: 's', title: 'IGNORED', year: '2020', journal: 'Nature',
      authors: ['Smith'], labels: ['x']
    };
    mergeReferencesIntoPrimary(primary, secondary);
    expect(primary.title).toBe('P');         // existing preserved
    expect(primary.year).toBe('2020');       // missing filled
    expect(primary.journal).toBe('Nature');
    expect(primary.authors).toContain('Smith');
    expect(primary.labels).toContain('x');
  });
  it('unions author and label arrays', () => {
    const primary: any = { authors: ['A'], labels: ['x'] };
    const secondary: any = { authors: ['A', 'B'], labels: ['x', 'y'] };
    mergeReferencesIntoPrimary(primary, secondary);
    expect(primary.authors.sort()).toEqual(['A', 'B']);
    expect(primary.labels.sort()).toEqual(['x', 'y']);
  });
});

// ─── Renderers ──────────────────────────────────────────────────────────────

describe('renderDuplicateReviewFallback', () => {
  it('reports zero groups in summary + empty-state list', () => {
    renderDuplicateReviewFallback();
    expect(document.getElementById('dupSummary')!.textContent).toMatch(/bulunamadı/);
    expect(document.getElementById('dupGroups')!.innerHTML).toMatch(/Şüpheli duplicate/);
  });

  it('renders group cards with merge/keep/dismiss buttons', () => {
    (window as any).duplicateReviewState = {
      groups: [{
        signature: 'sig-1',
        confidence: 0.92,
        reasons: ['doi_exact'],
        records: [
          { id: 'r1', title: 'A', authors: ['Smith'], year: '2020', journal: 'Nature', doi: '10.1/a' },
          { id: 'r2', title: 'A', authors: ['Smith'], year: '2020', journal: 'Nature', doi: '10.1/a' }
        ],
        ids: ['r1', 'r2']
      }]
    };
    renderDuplicateReviewFallback();
    const list = document.getElementById('dupGroups')!;
    expect(list.querySelectorAll('.dup-group-card').length).toBe(1);
    expect(list.querySelector('[data-dup-action="merge"]')).not.toBeNull();
    expect(list.querySelector('[data-dup-action="keep"]')).not.toBeNull();
    expect(list.querySelector('[data-dup-action="dismiss"]')).not.toBeNull();
    expect(list.innerHTML).toContain('92%');
    expect(list.innerHTML).toContain('DOI aynı');
  });

  it('no-ops when modal DOM is missing', () => {
    document.body.innerHTML = '';
    expect(() => renderDuplicateReviewFallback()).not.toThrow();
  });

  it('HTML-escapes ref fields to block XSS via reference title', () => {
    (window as any).duplicateReviewState = {
      groups: [{
        signature: '<x>',
        records: [
          { id: 'r1', title: '<script>x</script>', authors: ['<X>'], year: '"', journal: '<>', doi: '"' }
        ],
        ids: ['r1']
      }]
    };
    renderDuplicateReviewFallback();
    const html = document.getElementById('dupGroups')!.innerHTML;
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('renderMetadataHealthFallback', () => {
  it('handles empty refs list', () => {
    renderMetadataHealthFallback();
    expect(document.getElementById('metaHealthList')!.innerHTML).toMatch(/Kaynak bulunamadı/);
  });

  it('renders cards with status badges + counts when AQMetadataHealth provides analysis', () => {
    setWorkspace([
      { id: 'r1', title: 'Complete ref', authors: ['Smith'], year: '2020', journal: 'Nature', doi: '10.1/c' },
      { id: 'r2', title: 'Incomplete ref', authors: [], year: '', journal: '' }
    ]);
    (window as any).AQMetadataHealth = {
      analyzeReference: (ref: any) => ref.id === 'r1'
        ? { status: 'complete', issues: [] }
        : { status: 'incomplete', issues: [{ message: 'Eksik yazar' }] },
      summarizeHealth: () => ({ total: 2, complete: 1, incomplete: 1, suspicious: 0, issueCounts: { missing_author: 1 } })
    };
    renderMetadataHealthFallback();
    expect(document.getElementById('metaHealthCountAll')!.textContent).toBe('2');
    expect(document.getElementById('metaHealthCountIncomplete')!.textContent).toBe('1');
    expect(document.getElementById('metaHealthCountComplete')!.textContent).toBe('1');
    const list = document.getElementById('metaHealthList')!;
    expect(list.querySelectorAll('.mh-card').length).toBe(2);
    expect(list.innerHTML).toContain('Eksik yazar');
  });

  it('no-ops when modal DOM is missing', () => {
    document.body.innerHTML = '';
    expect(() => renderMetadataHealthFallback()).not.toThrow();
  });
});

// ─── Open dispatch + click handlers ─────────────────────────────────────────

describe('openQualitySurface', () => {
  it('opens duplicate modal and tries legacy openDuplicateReview', () => {
    const openLegacy = vi.fn();
    (window as any).openDuplicateReview = openLegacy;
    openQualitySurface('duplicate');
    expect(openLegacy).toHaveBeenCalled();
    expect(document.getElementById('dupModal')!.classList.contains('show')).toBe(true);
  });

  it('opens metadata-health modal and tries legacy openMetadataHealthCenter', () => {
    const openLegacy = vi.fn();
    (window as any).openMetadataHealthCenter = openLegacy;
    openQualitySurface('metadata');
    expect(openLegacy).toHaveBeenCalled();
    expect(document.getElementById('metaHealthModal')!.classList.contains('show')).toBe(true);
  });

  it('does not throw when legacy handlers absent', () => {
    expect(() => openQualitySurface('duplicate')).not.toThrow();
    expect(() => openQualitySurface('metadata')).not.toThrow();
  });
});

describe('handleDuplicateReviewClick', () => {
  it('runs duplicate action when [data-dup-action] target clicked', () => {
    (window as any).duplicateReviewState = {
      groups: [{ signature: 'sig', records: [], ids: [] }]
    };
    (window as any).__removeDuplicateGroup = vi.fn();
    const list = document.getElementById('dupGroups')!;
    const btn = document.createElement('button');
    btn.setAttribute('data-dup-action', 'dismiss');
    btn.setAttribute('data-dup-signature', 'sig');
    list.appendChild(btn);
    const ev = { target: btn, preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
    handleDuplicateReviewClick(ev);
    expect((window as any).__aqDismissedDuplicateSignatures['ws-1']['sig']).toBe(true);
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('does nothing when click target is not a data-dup-action button', () => {
    const ev = {
      target: document.createElement('div'),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as any;
    handleDuplicateReviewClick(ev);
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });
});

describe('runDuplicateAction', () => {
  it('returns early when button is null', () => {
    expect(() => runDuplicateAction(null)).not.toThrow();
  });

  it('returns early when signature attribute missing', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-dup-action', 'dismiss');
    runDuplicateAction(btn);
    // No signature → no dismissed signature recorded
    expect((window as any).__aqDismissedDuplicateSignatures || {}).toEqual({});
  });

  it('dismiss action adds signature to dismissed map', () => {
    (window as any).__removeDuplicateGroup = vi.fn();
    const btn = document.createElement('button');
    btn.setAttribute('data-dup-action', 'dismiss');
    btn.setAttribute('data-dup-signature', 'sigA');
    runDuplicateAction(btn);
    expect((window as any).__aqDismissedDuplicateSignatures['ws-1']['sigA']).toBe(true);
  });
});

describe('runMetadataHealthAction', () => {
  it('returns early when button is null', () => {
    expect(() => runMetadataHealthAction(null)).not.toThrow();
  });

  it('reports "Kaynak bulunamadı" when ref id does not match', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-mh-action', 'normalize');
    btn.setAttribute('data-ref-id', 'missing');
    runMetadataHealthAction(btn);
    expect((window as any).setDst).toHaveBeenCalledWith('Kaynak bulunamadı.', 'er');
  });

  it('normalize action applies AQMetadataHealth.applyConservativeRepairs', () => {
    setWorkspace([{ id: 'r1', title: 'Old' }]);
    (window as any).AQMetadataHealth = {
      applyConservativeRepairs: (ref: any) => ({ ref: { ...ref, title: 'New', normalized: true } })
    };
    const btn = document.createElement('button');
    btn.setAttribute('data-mh-action', 'normalize');
    btn.setAttribute('data-ref-id', 'r1');
    runMetadataHealthAction(btn);
    expect((window as any).S.wss[0].lib[0].title).toBe('New');
    expect((window as any).S.wss[0].lib[0].normalized).toBe(true);
    expect((window as any).setDst).toHaveBeenCalledWith('Kayıt normalize edildi.', 'ok');
  });

  it('refetch reports error when ref has no DOI', () => {
    setWorkspace([{ id: 'r1', title: 'No DOI' }]);
    const btn = document.createElement('button');
    btn.setAttribute('data-mh-action', 'refetch');
    btn.setAttribute('data-ref-id', 'r1');
    runMetadataHealthAction(btn);
    expect((window as any).setDst).toHaveBeenCalledWith(
      'DOI olmayan kaynakta yeniden çekme yapılamaz.',
      'er'
    );
  });
});

describe('handleMetadataHealthClick', () => {
  it('handles [data-mh-action] button via runMetadataHealthAction', () => {
    setWorkspace([{ id: 'r1', title: 'Test' }]);
    (window as any).editRefMetadata = vi.fn();
    const btn = document.createElement('button');
    btn.setAttribute('data-mh-action', 'edit');
    btn.setAttribute('data-ref-id', 'r1');
    const ev = { target: btn, preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
    handleMetadataHealthClick(ev);
    expect((window as any).editRefMetadata).toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalled();
  });
});

describe('filterMetadataHealth', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="metaHealthSortBar">
        <button data-mh-sort="all">All</button>
        <button data-mh-sort="incomplete">Incomplete</button>
        <button data-mh-sort="complete">Complete</button>
      </div>
      <div id="metaHealthList">
        <div class="mh-card"><span class="mh-status mh-complete"></span></div>
        <div class="mh-card"><span class="mh-status mh-incomplete"></span></div>
        <div class="mh-card"><span class="mh-status mh-suspicious"></span></div>
      </div>
    `;
  });

  it('all shows everything', () => {
    filterMetadataHealth('all');
    document.querySelectorAll<HTMLElement>('#metaHealthList .mh-card').forEach((card) => {
      expect(card.style.display).toBe('');
    });
  });

  it('incomplete hides complete + suspicious', () => {
    filterMetadataHealth('incomplete');
    const cards = document.querySelectorAll<HTMLElement>('#metaHealthList .mh-card');
    expect(cards[0]!.style.display).toBe('none');     // complete → hidden
    expect(cards[1]!.style.display).toBe('');         // incomplete → shown
    expect(cards[2]!.style.display).toBe('none');     // suspicious → hidden
  });

  it('marks the active sort button .on', () => {
    filterMetadataHealth('incomplete');
    const buttons = document.querySelectorAll<HTMLElement>('#metaHealthSortBar [data-mh-sort]');
    expect(buttons[0]!.classList.contains('on')).toBe(false);  // all
    expect(buttons[1]!.classList.contains('on')).toBe(true);   // incomplete
    expect(buttons[2]!.classList.contains('on')).toBe(false);  // complete
  });
});
