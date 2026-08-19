import { useLayoutEffect } from 'react';

type CitationRuntimeWindow = typeof window & {
  AQCitationRuntime?: { init?: () => void };
  setCM?: (mode: string, button: HTMLButtonElement) => void;
};

function setCitationMode(mode: 'inline' | 'footnote', button: HTMLButtonElement) {
  const legacySetMode = (window as CitationRuntimeWindow).setCM;
  legacySetMode?.(mode, button);
}

/**
 * The slash-citation popup must exist as soon as the editor accepts input.
 * Keeping it outside the lazy legacy host avoids a WebView2 race where /r or
 * /t is detected before the compatibility chunk has mounted this DOM.
 */
export function CitationTriggerHost() {
  useLayoutEffect(() => {
    (window as CitationRuntimeWindow).AQCitationRuntime?.init?.();
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
