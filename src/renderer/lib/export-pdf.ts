type ExportOptions = {
  runningHead?: string;
  pageSize?: 'A4' | 'Letter';
  marginsPt?: [number, number, number, number];
};

type ExportResult = {
  ok: boolean;
  bytes: number[];
  warnings: string[];
  fontSubstituted: boolean;
  substitutedFontWarning?: string | null;
};

function readLayout(source: unknown): unknown {
  if (!source) return source;
  if (typeof source === 'object' && 'layout' in source) {
    const layout = (source as { layout?: unknown }).layout;
    if (typeof layout === 'function') return layout.call(source);
    return layout;
  }
  if (typeof source === 'object' && 'paginate' in source) {
    const paginate = (source as { paginate?: unknown }).paginate;
    if (typeof paginate === 'function') return paginate.call(source);
  }
  return source;
}

export async function exportAqLayoutPdf(
  layoutOrEngine: unknown,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;
  if (!api?.export?.pdf) throw new Error('tauri_pdf_export_unavailable');
  const layout = readLayout(layoutOrEngine);
  const result = await api.export.pdf(JSON.stringify(layout || {}), options);
  if (result?.warnings?.length) {
    window.dispatchEvent(new CustomEvent('academiq:export-warning', { detail: result.warnings }));
  }
  return result;
}
