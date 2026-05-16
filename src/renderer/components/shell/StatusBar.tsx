import type { ReactNode } from 'react';

type StatusBarProps = {
  message: string;
  wordCount?: string;
  apaLabel?: string;
  apaTone?: 'ok' | 'warning' | 'error' | 'saving';
  issuesLabel?: string;
  issuesTone?: 'ok' | 'warning' | 'error' | 'saving';
  spellLabel?: string;
  spellTone?: 'ok' | 'warning' | 'error' | 'saving';
  saveLabel?: string;
  saveTone?: 'ok' | 'warning' | 'error' | 'saving';
  pdfProgressLabel?: string;
  onOpenApa?: () => void;
  onOpenIssues?: () => void;
  onOpenSpell?: () => void;
  onOpenSave?: () => void;
};

function toneClass(tone: StatusBarProps['apaTone']) {
  if (tone === 'error') return 'text-red-700 hover:text-red-800';
  if (tone === 'warning' || tone === 'saving') return 'text-amber-700 hover:text-amber-800';
  return 'text-emerald-700 hover:text-emerald-800';
}

function StatusButton({
  children,
  tone = 'ok',
  onClick
}: {
  children: ReactNode;
  tone?: StatusBarProps['apaTone'];
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-5 items-center gap-1 rounded px-1.5 font-medium transition ${toneClass(tone)} ${onClick ? 'hover:bg-aq-panel' : 'cursor-default'}`}
    >
      {children}
    </button>
  );
}

export function StatusBar({
  message,
  wordCount = '1824',
  apaLabel = 'APA 7 ok',
  apaTone = 'ok',
  issuesLabel = '0 uyarı',
  issuesTone = 'ok',
  spellLabel,
  spellTone = 'ok',
  saveLabel,
  saveTone = 'ok',
  pdfProgressLabel = '',
  onOpenApa,
  onOpenIssues,
  onOpenSpell,
  onOpenSave
}: StatusBarProps) {
  return (
    <footer className="aq-status-bar flex h-6 items-center justify-between border-t border-aq-line bg-white px-4 text-[11px] text-aq-muted">
      <div className="flex min-w-0 items-center gap-2">
        {pdfProgressLabel ? (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
            {pdfProgressLabel}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span>{wordCount} kelime</span>
        <StatusButton tone={apaTone} onClick={onOpenApa || onOpenIssues}>{apaLabel}</StatusButton>
        <StatusButton tone={issuesTone} onClick={onOpenIssues}>{issuesLabel}</StatusButton>
        {spellLabel ? (
          <StatusButton tone={spellTone} onClick={onOpenSpell}>{spellLabel}</StatusButton>
        ) : null}
        <StatusButton tone={saveTone} onClick={onOpenSave}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {saveLabel || message || 'kaydedildi'}
        </StatusButton>
      </div>
    </footer>
  );
}
