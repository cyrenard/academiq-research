import { useLayoutEffect } from 'react';

type CitationRuntimeWindow = typeof window & {
  AQCitationRuntime?: {
    init?: () => void;
    openFromEditorTrigger?: (trigger: {
      query: string;
      mode: 'inline' | 'textual';
      triggerMode: 'r' | 't';
      from: number;
      to: number;
    }) => boolean;
    openFromSlash?: (query?: string, mode?: string) => void;
  };
  AQEditorCore?: { getEditor?: () => unknown };
  editor?: unknown;
  editorTrigRange?: { from: number; to: number; mode: 'r' | 't' };
  __aqCitationTriggerMode?: 'inline' | 'textual';
  setCM?: (mode: string, button: HTMLButtonElement) => void;
};

type CitationEditor = {
  state?: { selection?: { from?: number; to?: number } };
};

function isWindowsRuntime() {
  const runtimeNavigator = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = String(
    runtimeNavigator.userAgentData?.platform
      || runtimeNavigator.platform
      || runtimeNavigator.userAgent
      || '',
  ).toLocaleLowerCase('en');
  return platform.includes('windows') || platform.startsWith('win32') || platform.startsWith('win64');
}

export function isWindowsCitationSlashSequence(
  slashAt: number,
  key: string,
  now: number,
) {
  return slashAt > 0
    && now - slashAt <= 2000
    && (key.toLocaleLowerCase('tr') === 'r' || key.toLocaleLowerCase('tr') === 't');
}

function isEditorKeyboardTarget(target: EventTarget | null) {
  return target instanceof Element
    && Boolean(target.closest('.aq-input-capture,#aq-engine-host,.aq-engine-stage,[data-aq-engine-editor]'));
}

function openCitationFromWindowsKeys(triggerMode: 'r' | 't') {
  const win = window as CitationRuntimeWindow;
  const runtime = win.AQCitationRuntime;
  runtime?.init?.();

  const editor = (win.editor || win.AQEditorCore?.getEditor?.()) as CitationEditor | undefined;
  const caret = Number(editor?.state?.selection?.from);
  const to = Number.isFinite(caret) ? caret : 2;
  const from = Math.max(0, to - 2);
  const mode = triggerMode === 't' ? 'textual' : 'inline';
  const trigger = { query: '', mode, triggerMode, from, to } as const;

  win.editorTrigRange = { from, to, mode: triggerMode };
  win.__aqCitationTriggerMode = mode;
  const opened = runtime?.openFromEditorTrigger?.(trigger);
  if (!opened) runtime?.openFromSlash?.('', mode);

  window.requestAnimationFrame(() => {
    const box = document.getElementById('trig');
    if (!box) return;
    box.classList.add('show');
    box.style.display = 'block';
    box.style.visibility = 'visible';
    box.style.pointerEvents = 'auto';
  });
}

function setCitationMode(mode: 'inline' | 'footnote', button: HTMLButtonElement) {
  (window as CitationRuntimeWindow).setCM?.(mode, button);
}

/**
 * The packaged WebView must have the citation popup before the lazy legacy
 * compatibility tree mounts. This is the ownership model used by the last
 * Windows build that opened /r and /t reliably.
 */
export function CitationTriggerHost() {
  useLayoutEffect(() => {
    const win = window as CitationRuntimeWindow;
    win.AQCitationRuntime?.init?.();

    if (!isWindowsRuntime()) return undefined;
    let slashAt = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !isEditorKeyboardTarget(event.target)) return;
      const key = String(event.key || '');
      if (key === '/') {
        slashAt = Date.now();
        return;
      }
      if (!isWindowsCitationSlashSequence(slashAt, key, Date.now())) {
        if (key.length === 1) slashAt = 0;
        return;
      }
      slashAt = 0;
      const triggerMode = key.toLocaleLowerCase('tr') === 't' ? 't' : 'r';
      window.setTimeout(() => openCitationFromWindowsKeys(triggerMode), 0);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return (
    <div id="trig" data-aq-eager-citation-host>
      <div className="tgh">
        <span className="tgtag">Kaynak Seç</span>
        <span id="tgq" />
        <span id="tgsel" />
      </div>
      <div className="tgmodes">
        <button
          className="tgm on"
          id="citationInlineModeBtn"
          type="button"
          onClick={(event) => setCitationMode('inline', event.currentTarget)}
        >
          (Yazar, Yıl)
        </button>
        <button
          className="tgm"
          id="citationFootnoteModeBtn"
          type="button"
          onClick={(event) => setCitationMode('footnote', event.currentTarget)}
        >
          Dipnot*
        </button>
      </div>
      <input id="tgs" type="text" placeholder="Yazar, başlık, yıl..." />
      <div id="tgl" />
      <div className="tghint">Oklarla gez, Enter metne ekle, Esc kapat</div>
    </div>
  );
}
