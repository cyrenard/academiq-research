import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveEditorSelection,
  restoreEditorSelection,
  captureEditorListStyleSelection,
  restoreEditorListStyleSelection,
  getCapturedPmSelection,
  setCapturedPmSelection,
  getCapturedRange,
  setCapturedRange,
  runEditorMutationEffects,
  isTrackChangesEnabled,
  setTrackChangesMode,
  toggleTrackChangesMode
} from './editor-commands-core';

describe('saveEditorSelection & restoreEditorSelection', () => {
  beforeEach(() => {
    setCapturedRange(null);
    setCapturedPmSelection(null);
  });

  it('saves and restores window selection ranges correctly', () => {
    const fakeRange = {
      commonAncestorContainer: {},
      cloneRange: () => fakeRange
    } as any;
    
    const mockSelection = {
      rangeCount: 1,
      getRangeAt: () => fakeRange,
      removeAllRanges: vi.fn(),
      addRange: vi.fn()
    };
    
    const mockElement = {
      contains: () => true
    };
    
    const deps = {
      getSelection: () => mockSelection as any,
      getElementById: (id: string) => id === 'apaed' ? mockElement as any : null
    };

    saveEditorSelection(deps);
    expect(getCapturedRange()).toBe(fakeRange);

    const restored = restoreEditorSelection(deps);
    expect(restored).toBe(true);
    expect(mockSelection.removeAllRanges).toHaveBeenCalled();
    expect(mockSelection.addRange).toHaveBeenCalledWith(fakeRange);
    expect(getCapturedRange()).toBeNull();
  });
});

describe('captureEditorListStyleSelection & restoreEditorListStyleSelection', () => {
  beforeEach(() => {
    setCapturedRange(null);
    setCapturedPmSelection(null);
  });

  it('captures aq-engine selection first if available', () => {
    const fakeRange = { someRange: true };
    const mockEditor = {
      _aqEngine: {},
      _captureSelection: vi.fn(() => fakeRange)
    };
    const deps = {
      editor: mockEditor,
      getSelection: () => null,
      getElementById: () => null
    };

    captureEditorListStyleSelection(deps);
    expect(getCapturedPmSelection()).toEqual({
      type: 'aq',
      editor: mockEditor,
      range: fakeRange
    });
  });

  it('falls back to AQEditorCore if present', () => {
    const fakeSelection = { pmSel: true };
    const mockAQEditorCore = {
      captureSelection: vi.fn(() => fakeSelection)
    };
    const deps = {
      AQEditorCore: mockAQEditorCore,
      getSelection: () => null,
      getElementById: () => null
    };

    captureEditorListStyleSelection(deps);
    expect(getCapturedPmSelection()).toBe(fakeSelection);
  });

  it('falls back to editor state selection', () => {
    const mockEditor = {
      state: {
        selection: { from: 10, to: 20 }
      }
    };
    const deps = {
      editor: mockEditor,
      getSelection: () => null,
      getElementById: () => null
    };

    captureEditorListStyleSelection(deps);
    expect(getCapturedPmSelection()).toEqual({
      type: 'pm',
      from: 10,
      to: 20
    });
  });

  it('restores aq selection', () => {
    const mockEditor = {
      _restoreSelection: vi.fn(() => true)
    };
    setCapturedPmSelection({
      type: 'aq',
      editor: mockEditor,
      range: 'range-data'
    });

    const restored = restoreEditorListStyleSelection({ editor: mockEditor });
    expect(restored).toBe(true);
    expect(mockEditor._restoreSelection).toHaveBeenCalledWith('range-data');
    expect(getCapturedPmSelection()).toBeNull();
  });
});

describe('runEditorMutationEffects', () => {
  it('delegates to AQTipTapWordBridge if present', () => {
    const mockBridge = {
      runEditorMutationEffects: vi.fn(() => true)
    };
    const mockTrackBar = vi.fn();
    const deps = {
      AQTipTapWordBridge: mockBridge,
      scheduleTrackReviewBarUpdate: mockTrackBar
    };

    const run = runEditorMutationEffects({ layout: true, syncRefs: true }, deps);
    expect(run).toBe(true);
    expect(mockBridge.runEditorMutationEffects).toHaveBeenCalled();
    expect(mockTrackBar).toHaveBeenCalled();
  });

  it('executes individual callbacks if no bridge present', () => {
    const mockUpdatePage = vi.fn();
    const mockSave = vi.fn();
    const mockOnApplied = vi.fn();
    const deps = {
      updatePageHeight: mockUpdatePage,
      save: mockSave,
    };

    const run = runEditorMutationEffects({
      layout: true,
      syncChrome: true,
      onApplied: mockOnApplied
    }, deps);

    expect(run).toBe(true);
    expect(mockUpdatePage).toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalled();
    expect(mockOnApplied).toHaveBeenCalled();
  });
});

describe('Track Changes Mode Commands', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      delete (window as any).__aqTrackChangesState;
      delete (window as any).AQTipTapWordCommands;
    }
  });

  it('reads state from AQTipTapWordCommands if present', () => {
    const mockCommands = {
      isTrackChangesEnabled: vi.fn(() => true)
    };
    const deps = {
      AQTipTapWordCommands: mockCommands
    };
    expect(isTrackChangesEnabled(deps)).toBe(true);
  });

  it('falls back to window global state if no commands', () => {
    (globalThis as any).window.__aqTrackChangesState = { enabled: true };
    expect(isTrackChangesEnabled()).toBe(true);
  });

  it('sets track changes mode via setTrackChangesMode', () => {
    const mockCommands = {
      setTrackChangesEnabled: vi.fn((enabled) => enabled)
    };
    const mockDoc = {
      body: {
        classList: {
          toggle: vi.fn()
        }
      }
    };
    const mockDocRec = { trackChangesEnabled: false };
    const mockSave = vi.fn();
    const mockSetSL = vi.fn();
    
    const deps = {
      AQTipTapWordCommands: mockCommands,
      document: mockDoc,
      getCurrentDocRecord: () => mockDocRec,
      ensureDocAuxFields: (d: any) => d,
      save: mockSave,
      setSL: mockSetSL
    };

    const enabled = setTrackChangesMode(true, 'shortcut', deps);
    expect(enabled).toBe(true);
    expect(mockCommands.setTrackChangesEnabled).toHaveBeenCalledWith(true, { source: 'shortcut' });
    expect(mockDocRec.trackChangesEnabled).toBe(true);
    expect(mockSave).toHaveBeenCalled();
    expect(mockSetSL).toHaveBeenCalledWith('İnceleme modu açık', 'warn');
  });

  it('toggles mode using toggleTrackChangesMode', () => {
    const mockCommands = {
      isTrackChangesEnabled: vi.fn(() => true),
      setTrackChangesEnabled: vi.fn((enabled) => enabled)
    };
    const deps = {
      AQTipTapWordCommands: mockCommands
    };

    const next = toggleTrackChangesMode(deps);
    expect(next).toBe(false);
    expect(mockCommands.setTrackChangesEnabled).toHaveBeenCalledWith(false, { source: 'shortcut' });
  });
});
