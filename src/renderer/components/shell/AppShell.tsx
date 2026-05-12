import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';

type AppShellProps = {
  activeView: 'library' | 'notes' | 'pdf' | 'focus' | 'settings';
  onViewChange: (view: AppShellProps['activeView']) => void;
  onExportPDF: () => void;
  onExportDOCX: () => void;
  onExportPreview: () => void;
  onExportAnnotatedPDF: () => void;
  onExportBIB: () => void;
  onExportRIS: () => void;
  onExportCSL: () => void;
  onExportNotes: () => void;
  onExportLibrary: () => void;
  workspaceBar: ReactNode;
  documentBar: ReactNode;
  left: ReactNode;
  leftVisible: boolean;
  toolbar: ReactNode;
  editor: ReactNode;
  right: ReactNode;
  rightVisible: boolean;
  status: ReactNode;
};

const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 380;
const DEFAULT_SIDEBAR_WIDTH = 280;

function clampSidebarWidth(value: number) {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(value)));
}

function readSidebarWidth(key: string) {
  if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH;
  const raw = window.localStorage.getItem(key);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : DEFAULT_SIDEBAR_WIDTH;
}

export function AppShell({
  activeView,
  onViewChange,
  onExportPDF,
  onExportDOCX,
  onExportPreview,
  onExportAnnotatedPDF,
  onExportBIB,
  onExportRIS,
  onExportCSL,
  onExportNotes,
  onExportLibrary,
  workspaceBar,
  documentBar,
  left,
  leftVisible,
  toolbar,
  editor,
  right,
  rightVisible,
  status
}: AppShellProps) {
  const [leftWidth, setLeftWidth] = useState(() => readSidebarWidth('aq.shell.leftSidebarWidth'));
  const [rightWidth, setRightWidth] = useState(() => readSidebarWidth('aq.shell.rightSidebarWidth'));
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    window.localStorage.setItem('aq.shell.leftSidebarWidth', String(leftWidth));
  }, [leftWidth]);

  useEffect(() => {
    window.localStorage.setItem('aq.shell.rightSidebarWidth', String(rightWidth));
  }, [rightWidth]);

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  useEffect(() => {
    if (!exportMenuOpen) return undefined;
    const close = () => setExportMenuOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [exportMenuOpen]);

  const runExportAction = (action: () => void) => {
    setExportMenuOpen(false);
    action();
  };

  const beginSidebarResize = (side: 'left' | 'right', event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeCleanupRef.current?.();

    const startX = event.clientX;
    const startWidth = side === 'left' ? leftWidth : rightWidth;

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = side === 'left' ? startWidth + delta : startWidth - delta;
      if (side === 'left') {
        setLeftWidth(clampSidebarWidth(nextWidth));
      } else {
        setRightWidth(clampSidebarWidth(nextWidth));
      }
    };

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      resizeCleanupRef.current = null;
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    resizeCleanupRef.current = onPointerUp;
  };

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `${leftVisible ? leftWidth : 0}px minmax(560px, 1fr) ${rightVisible ? rightWidth : 0}px`
  };

  const navButton = (view: AppShellProps['activeView'], label: string, bordered = false) => (
    <button
      type="button"
      onClick={() => onViewChange(view)}
      className={[
        'h-8 rounded-md px-3 transition hover:bg-aq-panel active:translate-y-px',
        bordered ? 'border border-aq-line bg-white px-4 font-semibold text-aq-ink' : '',
        activeView === view ? 'bg-aq-panel text-aq-ink' : ''
      ].join(' ')}
    >
      {label}
    </button>
  );

  const windowButton = (label: string, title: string, action: () => void, danger = false) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={action}
      className={[
        'aq-window-control flex h-8 w-9 items-center justify-center rounded-md text-[14px] leading-none transition active:translate-y-px',
        danger ? 'hover:bg-red-500 hover:text-white' : 'hover:bg-aq-panel hover:text-aq-ink'
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <div className="aq-soft-shell grid h-screen grid-rows-[38px_38px_1fr_22px] overflow-hidden bg-[#fbfaf7] text-aq-ink">
      <header className="aq-titlebar flex items-center justify-between border-b border-aq-line bg-white pl-5 pr-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-aq-navy text-[12px] font-semibold text-white">A</div>
          <div className="text-[16px] font-semibold leading-none">AcademiQ</div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.34em] text-aq-muted">Research Studio</div>
        </div>
        <div className="flex h-full items-center gap-2 text-xs text-aq-muted">
          <div className="relative" onPointerDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setExportMenuOpen((value) => !value)}
              className="h-8 rounded-md bg-aq-navy px-4 font-semibold text-white shadow-sm transition hover:bg-[#172852] active:translate-y-px"
            >
              Dışa Aktar <span className="ml-1 text-[10px]">▼</span>
            </button>
            {exportMenuOpen ? (
              <div className="absolute right-0 top-9 z-[3000] w-56 rounded-lg border border-aq-line bg-white p-1 text-[12px] text-aq-ink shadow-xl">
                <button type="button" className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel" onClick={() => runExportAction(onExportPreview)}>PDF önizleme</button>
                <button type="button" className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel" onClick={() => runExportAction(onExportPDF)}>PDF olarak aktar</button>
                <button type="button" className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel" onClick={() => runExportAction(onExportDOCX)}>DOCX olarak aktar</button>
                <button type="button" className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel" onClick={() => runExportAction(onExportAnnotatedPDF)}>Annotationlı PDF aktar</button>
                <div className="my-1 border-t border-aq-line" />
                <button type="button" className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel" onClick={() => runExportAction(onExportBIB)}>Kaynakça BibTeX aktar</button>
                <button type="button" className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel" onClick={() => runExportAction(onExportRIS)}>Kaynakça RIS aktar</button>
                <button type="button" className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel" onClick={() => runExportAction(onExportCSL)}>Kaynakça CSL JSON aktar</button>
                <div className="my-1 border-t border-aq-line" />
                <button type="button" className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel" onClick={() => runExportAction(onExportNotes)}>Notları aktar</button>
                <button type="button" className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel" onClick={() => runExportAction(onExportLibrary)}>Kütüphaneyi aktar</button>
              </div>
            ) : null}
          </div>
          {navButton('focus', 'Odak')}
          {navButton('settings', 'Ayarlar')}
          {navButton('pdf', 'PDF')}
          {navButton('library', 'Kütüphane', true)}
          {navButton('notes', 'Not & Refs', true)}
          <div className="ml-1 flex h-full items-center gap-0.5 border-l border-aq-line pl-1 text-aq-muted">
            {windowButton('−', 'Küçült', () => window.electronAPI?.minimizeWindow?.())}
            {windowButton('□', 'Büyüt / geri al', () => window.electronAPI?.toggleMaximizeWindow?.())}
            {windowButton('×', 'Kapat', () => window.electronAPI?.closeWindow?.(), true)}
          </div>
        </div>
      </header>
      <div className="min-w-0 border-b border-aq-line bg-white">
        {workspaceBar}
        <div className="hidden">{documentBar}</div>
      </div>
      <main className="grid min-h-0" style={gridStyle}>
        <div className="relative min-h-0 min-w-0 shadow-[8px_0_22px_rgba(31,42,68,0.08)]">
          {leftVisible ? left : null}
          {leftVisible ? (
            <div
              role="separator"
              aria-label="Sol panel genişliğini ayarla"
              aria-orientation="vertical"
              onPointerDown={(event) => beginSidebarResize('left', event)}
              className="absolute inset-y-0 right-[-4px] z-30 w-2 cursor-col-resize bg-transparent transition hover:bg-aq-navy/10"
            />
          ) : null}
        </div>
        <section id="react-editor-frame" className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#fbfaf7]">
          <div className="shrink-0">
            {toolbar}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {editor}
          </div>
        </section>
        <div className="relative min-h-0 min-w-0 shadow-[-8px_0_22px_rgba(31,42,68,0.08)]">
          {rightVisible ? (
            <div
              role="separator"
              aria-label="Sağ panel genişliğini ayarla"
              aria-orientation="vertical"
              onPointerDown={(event) => beginSidebarResize('right', event)}
              className="absolute inset-y-0 left-[-4px] z-30 w-2 cursor-col-resize bg-transparent transition hover:bg-aq-navy/10"
            />
          ) : null}
          {rightVisible ? right : null}
        </div>
      </main>
      {status}
    </div>
  );
}
