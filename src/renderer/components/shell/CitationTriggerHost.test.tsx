import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { CitationTriggerHost, isWindowsCitationSlashSequence } from './CitationTriggerHost';

describe('CitationTriggerHost Windows slash fallback', () => {
  const init = vi.fn();
  const openFromEditorTrigger = vi.fn(() => true);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows NT 10.0' });
    init.mockClear();
    openFromEditorTrigger.mockClear();
    (window as any).AQCitationRuntime = { init, openFromEditorTrigger };
    (window as any).editor = { state: { selection: { from: 14, to: 14 } } };
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete (window as any).AQCitationRuntime;
    delete (window as any).editor;
    delete (window as any).editorTrigRange;
    delete (window as any).__aqCitationTriggerMode;
  });

  it('recognizes only a recent /r or /t sequence', () => {
    expect(isWindowsCitationSlashSequence(1000, 'r', 2500)).toBe(true);
    expect(isWindowsCitationSlashSequence(1000, 'T', 2500)).toBe(true);
    expect(isWindowsCitationSlashSequence(1000, 'x', 2500)).toBe(false);
    expect(isWindowsCitationSlashSequence(1000, 'r', 4001)).toBe(false);
  });

  it.each([
    ['r', 'inline'],
    ['t', 'textual'],
  ] as const)('opens /%s directly from the AQ Engine capture key events', (key, mode) => {
    render(<CitationTriggerHost />);
    document.getElementById('trig')?.classList.add('aq-hidden');
    const capture = document.createElement('textarea');
    capture.className = 'aq-input-capture';
    document.body.appendChild(capture);

    fireEvent.keyDown(capture, { key: '/' });
    vi.advanceTimersByTime(20);
    fireEvent.keyDown(capture, { key });
    vi.runOnlyPendingTimers();

    expect(openFromEditorTrigger).toHaveBeenCalledWith({
      query: '',
      mode,
      triggerMode: key,
      from: 12,
      to: 14,
    });
    expect(document.getElementById('trig')).toHaveClass('show');
    expect(document.getElementById('trig')).not.toHaveClass('aq-hidden');
    expect(document.getElementById('trig')).toHaveStyle({ display: 'block', visibility: 'visible' });
  });

  it('recognizes the Windows writing-assist bridge as an editor input target', () => {
    render(<CitationTriggerHost />);
    const bridge = document.createElement('div');
    bridge.className = 'aq-writing-assist-bridge';
    bridge.contentEditable = 'true';
    document.body.appendChild(bridge);

    fireEvent.keyDown(bridge, { key: '/' });
    fireEvent.keyDown(bridge, { key: 't' });
    vi.runOnlyPendingTimers();

    expect(openFromEditorTrigger).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'textual',
      triggerMode: 't',
    }));
  });

  it('ignores slash sequences typed outside the editor', () => {
    render(<CitationTriggerHost />);
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    fireEvent.keyDown(outside, { key: '/' });
    fireEvent.keyDown(outside, { key: 'r' });
    vi.runOnlyPendingTimers();
    expect(openFromEditorTrigger).not.toHaveBeenCalled();
  });
});
