/**
 * Shared formatting + safe-cast utilities for the FeatureModals modals.
 * Extracted from FeatureModals.tsx so each sub-modal can import the
 * same helpers without circular imports.
 */

/** Format a unix-ms timestamp as Turkish locale date+time, or '-'. */
export function formatDate(value: unknown) {
  const stamp = Number(value || 0);
  if (!stamp) return '-';
  try { return new Date(stamp).toLocaleString('tr-TR'); } catch (_error) { return String(value); }
}

/** Friendly Turkish "X dk önce" / "X sa önce" / "X gün önce" age string. */
export function formatAge(value: unknown) {
  const stamp = Number(value || 0);
  if (!stamp) return '-';
  const diff = Date.now() - stamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'az önce';
  if (diff < hour) return `${Math.max(1, Math.round(diff / minute))} dk önce`;
  if (diff < day) return `${Math.max(1, Math.round(diff / hour))} sa önce`;
  return `${Math.max(1, Math.round(diff / day))} gün önce`;
}

/** Safely coerce an unknown value to a Record<string, any>. */
export function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

/**
 * Pluck the most descriptive status text from a result-like object.
 * Tries lifecycle / lifecycleState / state / status, falling back to
 * an ok/error indicator.
 */
export function statusText(value: unknown) {
  const record = asRecord(value);
  return String(
    record.lifecycle
    || record.lifecycleState
    || record.state
    || record.status
    || (record.ok === false ? 'hata' : record.ok === true ? 'ok' : '-')
  );
}
