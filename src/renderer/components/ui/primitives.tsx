import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`rounded-md border border-aq-line bg-white px-3 py-2 text-sm font-semibold transition hover:bg-aq-panel active:translate-y-px ${className}`} />;
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-9 rounded-md border border-aq-line bg-white px-3 text-sm outline-none focus:border-aq-navy ${className}`} />;
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`rounded-md border border-aq-line bg-white px-3 py-2 text-sm outline-none focus:border-aq-navy ${className}`} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`h-9 rounded-md border border-aq-line bg-white px-2 text-sm outline-none focus:border-aq-navy ${className}`} />;
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...props} />{label}</label>;
}

export function Switch({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return <label className="flex items-center justify-between gap-3 text-sm"><span>{label}</span><input type="checkbox" role="switch" {...props} /></label>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'danger' }) {
  const toneClass = tone === 'ok' ? 'bg-green-50 text-green-700' : tone === 'warn' ? 'bg-amber-50 text-amber-700' : tone === 'danger' ? 'bg-red-50 text-red-700' : 'bg-aq-panel text-aq-muted';
  return <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-aq-line border-t-aq-navy" />;
}

export function EmptyState({ title, detail }: { title: ReactNode; detail?: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-aq-line bg-white p-6 text-center text-sm text-aq-muted"><strong className="block text-aq-ink">{title}</strong>{detail ? <span className="mt-1 block">{detail}</span> : null}</div>;
}

export function ErrorState({ title, detail }: { title: ReactNode; detail?: ReactNode }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>{title}</strong>{detail ? <p className="mt-1">{detail}</p> : null}</div>;
}

export function ProgressBar({ value = 0 }: { value?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return <div className="h-2 overflow-hidden rounded-full bg-aq-panel"><div className="h-full bg-aq-navy" style={{ width: `${pct}%` }} /></div>;
}

export function KeyboardShortcutHint({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-aq-line bg-aq-panel px-1.5 py-0.5 text-[10px] font-semibold text-aq-muted">{children}</kbd>;
}

export function FormField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <label className="block text-xs font-semibold text-aq-muted">{label}<div className="mt-1">{children}</div></label>;
}

export function SplitPane({ left, right }: { left: ReactNode; right: ReactNode }) {
  return <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">{left}{right}</div>;
}

export function ResizablePanel({ children }: { children: ReactNode }) {
  return <div className="min-h-0 resize overflow-auto rounded-md border border-aq-line bg-white">{children}</div>;
}
