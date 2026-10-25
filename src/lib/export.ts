/**
 * Dependency-free CSV serialisation and browser downloads for the export menu.
 * A value is quoted only when it contains a comma, a double quote or a line
 * break; embedded quotes are doubled (RFC 4180).
 */

export type CsvValue = string | number | boolean | null | undefined;

function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Rows of cells, the first row being the header, to CRLF-delimited CSV. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<CsvValue>>): string {
  if (rows.length === 0) return '';
  return `${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}

/** Save `text` as `filename` through a Blob and a short-lived object URL. */
export function download(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Safari needs the URL to outlive the click by a tick.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
