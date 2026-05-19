import { Plus } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

type OutlineEntry = {
  id: string;
  type?: string;
  level?: number | string;
  label?: string;
  text?: string;
  title?: string;
  blockIndex?: number;
};

const NEW_SECTION_TITLE = 'Yeni Bölüm';

function getEditor(): any {
  return (window as any).editor || null;
}

function getOutlineApi(): any {
  return (window as any).AQDocumentOutline || null;
}

function getEditorRoot(): HTMLElement | null {
  return document.getElementById('apaed');
}

function getEntryLabel(entry: OutlineEntry): string {
  return String(entry.label || entry.text || entry.title || '').trim();
}

function getTabLabel(entry: OutlineEntry): string {
  return Array.from(getEntryLabel(entry)).slice(0, 10).join('');
}

function blockTextLength(block: any): number {
  if (!block) return 0;
  if (typeof block.text === 'string') return block.text.length;
  if (!Array.isArray(block.runs)) return 0;
  return block.runs.reduce((total: number, run: any) => total + String(run?.text || '').length, 0);
}

function getBlockStartOffset(editor: any, blockIndex: number): number | null {
  const blocks = editor?._docModel?.get?.()?.blocks;
  if (!Array.isArray(blocks) || blockIndex < 0 || blockIndex >= blocks.length) return null;
  let offset = 0;
  for (let index = 0; index < blockIndex; index += 1) {
    offset += blockTextLength(blocks[index]) + 1;
  }
  return offset;
}

function restoreRange(editor: any, from: number, to = from) {
  if (!editor || typeof editor._restoreSelection !== 'function') return;
  editor.commands?.focus?.();
  editor._restoreSelection({ type: 'aq', from, to, anchor: from, focus: to });
}

function cssEscape(value: string): string {
  const api = (window as any).CSS;
  if (api && typeof api.escape === 'function') return api.escape(value);
  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function scrollNodeIntoView(node: Element) {
  if (typeof (node as HTMLElement).scrollIntoView !== 'function') return false;
  (node as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
  node.classList?.add?.('aq-outline-target-flash');
  window.setTimeout(() => {
    try {
      node.classList?.remove?.('aq-outline-target-flash');
    } catch (_error) {}
  }, 1500);
  return true;
}

function scrollAQBlockIntoView(editor: any, entry: OutlineEntry): boolean {
  if (typeof entry.blockIndex !== 'number') return false;
  const stage = editor?._stageEl || document.querySelector('.aq-engine-stage, .aq-engine-root');
  if (!stage || typeof stage.querySelector !== 'function') return false;
  const selectors = [
    `.aq-engine-line[data-block-index="${entry.blockIndex}"]`,
    `[data-block-index="${entry.blockIndex}"]`,
    entry.id ? `[data-ref-id="${cssEscape(entry.id)}"]` : '',
    entry.id ? `#${cssEscape(entry.id)}` : ''
  ].filter(Boolean);
  for (const selector of selectors) {
    try {
      const node = stage.querySelector(selector);
      if (node && scrollNodeIntoView(node)) return true;
    } catch (_error) {}
  }
  return false;
}

function scrollEntryIntoView(entry: OutlineEntry) {
  const api = getOutlineApi();
  const editor = getEditor();
  const root = getEditorRoot();
  const scrolledByBlock = scrollAQBlockIntoView(editor, entry);
  if (!scrolledByBlock && api && typeof api.scrollToEntry === 'function') {
    api.scrollToEntry({ root, editor, document, id: entry.id });
  }
}

function collectH1Entries(): OutlineEntry[] {
  const api = getOutlineApi();
  if (!api || typeof api.collectEntries !== 'function') return [];
  const root = getEditorRoot();
  const editor = getEditor();
  const entries = api.collectEntries({ root, editor, document }) || [];
  return entries
    .filter((entry: OutlineEntry) => entry?.type === 'heading' && Number(entry.level || 1) === 1)
    .filter((entry: OutlineEntry) => getEntryLabel(entry).length > 0);
}

export function SectionTabs() {
  const [entries, setEntries] = useState<OutlineEntry[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const refreshTimerRef = useRef<number | null>(null);
  const savedSelectionRef = useRef<any>(null);

  const refresh = () => {
    const nextEntries = collectH1Entries();
    setEntries(nextEntries);
    const api = getOutlineApi();
    if (api && typeof api.findActiveEntry === 'function') {
      const active = api.findActiveEntry(nextEntries, {
        root: getEditorRoot(),
        editor: getEditor(),
        document
      });
      setActiveId(active?.id || '');
    } else if (nextEntries.length === 1) {
      setActiveId(nextEntries[0].id);
    } else {
      setActiveId((current) => nextEntries.some((entry) => entry.id === current) ? current : '');
    }
  };

  const scheduleRefresh = () => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(refresh, 120);
  };

  useEffect(() => {
    refresh();
    const schedule = () => scheduleRefresh();
    const interval = window.setInterval(refresh, 1200);
    document.addEventListener('keyup', schedule, true);
    document.addEventListener('mouseup', schedule, true);
    document.addEventListener('selectionchange', schedule);
    window.addEventListener('aq:react-sync', schedule);
    window.addEventListener('aq:word-import-committed', schedule);
    return () => {
      window.clearInterval(interval);
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      document.removeEventListener('keyup', schedule, true);
      document.removeEventListener('mouseup', schedule, true);
      document.removeEventListener('selectionchange', schedule);
      window.removeEventListener('aq:react-sync', schedule);
      window.removeEventListener('aq:word-import-committed', schedule);
    };
  }, []);

  const jumpToEntry = (entry: OutlineEntry) => {
    const editor = getEditor();
    if (typeof entry.blockIndex === 'number') {
      const offset = getBlockStartOffset(editor, entry.blockIndex);
      if (offset !== null) restoreRange(editor, offset);
    }
    editor?.commands?.focus?.();
    scrollEntryIntoView(entry);
    window.setTimeout(() => scrollEntryIntoView(entry), 80);
    window.setTimeout(() => scrollEntryIntoView(entry), 220);
    setActiveId(entry.id);
  };

  const preserveEditorSelection = (event: ReactMouseEvent) => {
    event.preventDefault();
    const editor = getEditor();
    if (editor && typeof editor._captureSelection === 'function') {
      savedSelectionRef.current = editor._captureSelection();
    }
  };

  const addSection = () => {
    const editor = getEditor();
    if (!editor?.commands || typeof editor.commands.insertContent !== 'function') return;
    const selection = savedSelectionRef.current || (typeof editor._captureSelection === 'function' ? editor._captureSelection() : null);
    editor.commands.focus?.();
    if (selection && typeof editor._restoreSelection === 'function') {
      editor._restoreSelection(selection);
    }
    editor.commands.insertContent(`<h1>${NEW_SECTION_TITLE}</h1><p><br></p>`);
    (window as any).runEditorMutationEffects?.({ layout: true, syncChrome: true, refreshTrigger: false });
    window.setTimeout(() => {
      const nextEntries = collectH1Entries();
      const created = [...nextEntries].reverse().find((entry) => getEntryLabel(entry) === NEW_SECTION_TITLE);
      setEntries(nextEntries);
      if (created) {
        jumpToEntry(created);
        if (typeof created.blockIndex === 'number') {
          const offset = getBlockStartOffset(editor, created.blockIndex);
          if (offset !== null) restoreRange(editor, offset, offset + NEW_SECTION_TITLE.length);
        }
      }
    }, 80);
  };

  return (
    <div className="flex h-8 w-full items-end overflow-hidden border-b border-aq-line bg-[#fbfaf7] px-1">
      <div className="flex min-w-0 flex-1 items-end overflow-x-auto overflow-y-hidden">
        {entries.length === 0 ? (
          <button
            type="button"
            onMouseDown={preserveEditorSelection}
            onClick={addSection}
            className="mb-0 flex h-7 max-w-[220px] items-center gap-2 rounded-t-md border border-b-0 border-dashed border-aq-line bg-white/65 px-3 text-[12px] text-aq-muted transition hover:bg-white hover:text-aq-ink"
            title="Yeni H1 bölüm ekle"
          >
            <Plus size={13} />
            Bölüm ekle
          </button>
        ) : entries.map((entry) => {
          const label = getEntryLabel(entry);
          const tabLabel = getTabLabel(entry);
          const active = entry.id === activeId;
          return (
            <button
              key={entry.id}
              type="button"
              onMouseDown={preserveEditorSelection}
              onClick={() => jumpToEntry(entry)}
              className={[
                'mb-0 flex h-7 max-w-[260px] shrink-0 items-center rounded-t-md border border-b-0 px-3 text-left text-[12px] leading-none transition',
                active
                  ? 'border-aq-line bg-white font-semibold text-aq-navy shadow-sm'
                  : 'border-transparent bg-transparent text-aq-muted hover:border-aq-line hover:bg-white/75 hover:text-aq-ink'
              ].join(' ')}
              title={label}
            >
              <span className="truncate">{tabLabel}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onMouseDown={preserveEditorSelection}
        onClick={addSection}
        className="mb-0 grid h-7 w-8 shrink-0 place-items-center rounded-t-md border border-b-0 border-transparent text-aq-muted transition hover:border-aq-line hover:bg-white hover:text-aq-ink"
        title="Yeni H1 bölüm ekle"
        aria-label="Yeni H1 bölüm ekle"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
