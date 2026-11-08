// Small formatting helpers for the logbook (pure).

const p2 = (n: number) => String(n).padStart(2, '0');

/** epoch ms → value for <input type="datetime-local"> in local time. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** datetime-local string → epoch ms, or null if unparsable. */
export function fromLocalInput(s: string): number | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

export function fmtDate(ms: number, withTime = true): string {
  const d = new Date(ms);
  return withTime
    ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Parse a numeric form field; '' / garbage → undefined. */
export function num(s: string): number | undefined {
  if (s.trim() === '') return undefined;
  const v = Number(s);
  return Number.isFinite(v) ? v : undefined;
}

/** Number → short string for a form field; undefined → ''. */
export function str(v: number | undefined, dp?: number): string {
  if (v == null || !Number.isFinite(v)) return '';
  if (dp != null) return Number(v.toFixed(dp)).toString();
  return String(v);
}
