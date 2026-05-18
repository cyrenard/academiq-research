import { useEffect, useState } from 'react';

type PopupAction = {
  label: string;
  run: () => void;
};

type InlinePopup = {
  title: string;
  x: number;
  y: number;
  actions: PopupAction[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function closest(target: EventTarget | null, selector: string) {
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
}

function attr(el: HTMLElement | null, names: string[]) {
  if (!el) return '';
  for (const name of names) {
    const value = el.getAttribute(name) || (el.dataset as Record<string, string | undefined>)[name];
    if (value) return value;
  }
  return '';
}

function callWindow(name: string, ...args: unknown[]) {
  const fn = (window as any)[name];
  if (typeof fn !== 'function') return false;
  try {
    fn(...args);
    return true;
  } catch (error) {
    console.error('[inline-interaction]', name, error);
    return false;
  }
}

function runModule(moduleName: string, methodName: string, ...args: unknown[]) {
  const mod = (window as any)[moduleName];
  const method = mod && mod[methodName];
  if (typeof method !== 'function') return false;
  try {
    method(...args);
    return true;
  } catch (error) {
    console.error('[inline-interaction]', moduleName, methodName, error);
    return false;
  }
}

export function InlineInteractionHandler() {
  const [popup, setPopup] = useState<InlinePopup | null>(null);

  useEffect(() => {
    const openPopup = (event: MouseEvent, title: string, actions: PopupAction[]) => {
      setPopup({
        title,
        actions,
        x: clamp(event.clientX + 8, 8, window.innerWidth - 260),
        y: clamp(event.clientY + 8, 8, window.innerHeight - 220)
      });
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (closest(target, '[data-inline-interaction-popup]')) return;
      if (closest(target, '.aq-spell-error, .aq-spell, .aq-spell-mistake')) return;

      const citation = closest(target, '.aq-citation, .cit, [data-cit], [data-citation-id]');
      if (citation) {
        const refId = attr(citation, ['refId', 'ref-id', 'cit', 'citationId', 'citation-id']);
        event.preventDefault();
        event.stopPropagation();
        openPopup(event, 'Atıf', [
          {
            label: 'Kaynağı düzenle',
            run: () => window.dispatchEvent(new CustomEvent('aq:react-edit-reference', { detail: { refId } }))
          },
          {
            label: 'Kaynakçaya git',
            run: () => {
              if (!callWindow('scrollToBibliographyReference', refId)) callWindow('insRefs');
            }
          }
        ]);
        return;
      }

      const footnote = closest(target, '.aq-fn-ref, [data-fnid]');
      if (footnote) {
        event.preventDefault();
        event.stopPropagation();
        openPopup(event, 'Dipnot', [
          { label: 'Dipnot paneline git', run: () => callWindow('focusFootnoteById', attr(footnote, ['fnid'])) || runModule('AQFootnotes', 'scrollToFootnote', attr(footnote, ['fnid'])) },
          { label: 'Dipnot ekle', run: () => runModule('AQFootnotes', 'insertFootnote', 'footnote') }
        ]);
        return;
      }

      const crossRef = closest(target, '.aq-cross-ref, [data-ref-id]');
      if (crossRef && !closest(target, '.mh-card,.ref-card,.refe')) {
        event.preventDefault();
        event.stopPropagation();
        const targetId = attr(crossRef, ['refId', 'ref-id', 'targetId', 'target-id']);
        openPopup(event, 'Çapraz referans', [
          { label: 'Hedefe git', run: () => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) },
          { label: 'Referans penceresi', run: () => runModule('AQFootnotes', 'showCrossRefDialog') }
        ]);
        return;
      }

      const link = closest(target, '[data-href], .aq-link, a[href]');
      if (link) {
        const url = attr(link, ['href']) || (link as HTMLAnchorElement).href || '';
        if (/^https?:\/\//i.test(url)) {
          event.preventDefault();
          event.stopPropagation();
          openPopup(event, 'Bağlantı', [
            { label: 'Tarayıcıda aç', run: () => window.electronAPI?.openExternalUrl?.(url) },
            { label: 'URL kopyala', run: () => navigator.clipboard?.writeText(url) }
          ]);
          return;
        }
      }

      const image = closest(target, '.aq-engine-image, img');
      if (image && closest(image, '[data-aq-engine-editor], #apaed, .ProseMirror')) {
        runModule('AQTipTapWordMedia', 'init');
        event.preventDefault();
        event.stopPropagation();
        openPopup(event, 'Görsel', [
          { label: 'Görsel kontrollerini göster', run: () => image.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) },
          { label: 'Seçimi temizle', run: () => runModule('AQTipTapWordMedia', 'clearSelection') }
        ]);
        return;
      }

      const tableCell = closest(target, '.aq-engine-table-cell, td, th');
      if (tableCell && closest(tableCell, '[data-aq-engine-editor], #apaed, .ProseMirror')) {
        runModule('AQTipTapWordTables', 'init');
        event.preventDefault();
        event.stopPropagation();
        openPopup(event, 'Tablo', [
          { label: 'Tablo araçlarını göster', run: () => tableCell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) },
          { label: 'Tablo ekle', run: () => callWindow('openTableWizard') || callWindow('showM', 'wiz') }
        ]);
        return;
      }

      setPopup(null);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  if (!popup) return null;

  return (
    <div
      data-inline-interaction-popup
      role="menu"
      aria-label={popup.title}
      className="fixed z-[3600] w-56 rounded-md border border-aq-line bg-white p-1.5 text-[12px] text-aq-ink shadow-xl"
      style={{ left: popup.x, top: popup.y }}
    >
      <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-aq-muted">{popup.title}</div>
      {popup.actions.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          className="block w-full rounded px-2 py-1.5 text-left hover:bg-aq-panel"
          onClick={() => {
            action.run();
            setPopup(null);
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
