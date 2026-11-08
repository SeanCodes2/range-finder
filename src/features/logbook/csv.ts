// Minimal RFC 4180 CSV writer.
export type CsvValue = string | number | boolean | null | undefined;

export function csvField(v: CsvValue): string {
  if (v == null) return '';
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows → CSV text with a header. Columns default to the keys in first-seen order. CRLF line endings. */
export function toCsv(rows: Record<string, CsvValue>[], columns?: string[]): string {
  const cols = columns ?? (() => {
    const seen: string[] = [];
    for (const r of rows) for (const k of Object.keys(r)) if (!seen.includes(k)) seen.push(k);
    return seen;
  })();
  if (!cols.length) return '';
  const lines = [cols.map(csvField).join(',')];
  for (const r of rows) lines.push(cols.map(c => csvField(r[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}
