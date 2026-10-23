export type Row = Record<string, string | number>;

// xlsx is heavy, so it is loaded on demand — only when the user actually exports.

/** Download rows as an .xlsx workbook. */
export async function exportXlsx(filename: string, sheetName: string, rows: Row[]): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Sheet1');
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** Download rows as a .csv file. */
export async function exportCsv(filename: string, rows: Row[]): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Open a clean, printable window (the user can "Save as PDF" from the print
 * dialog). Content is escaped by the caller; this only frames and prints it.
 */
export function printDocument(title: string, bodyHtml: string): void {
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      *{box-sizing:border-box} body{font-family:Inter,system-ui,Arial,sans-serif;color:#0F172A;margin:32px;}
      h1{font-size:20px;margin:0 0 2px} .sub{color:#64748B;font-size:12px;margin-bottom:18px}
      table{width:100%;border-collapse:collapse;font-size:12px} th{text-align:left;color:#64748B;border-bottom:2px solid #E7EAF0;padding:7px 8px;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
      td{padding:7px 8px;border-bottom:1px solid #EEF1F6} .r{text-align:right;font-variant-numeric:tabular-nums}
      .tot{font-weight:700} .muted{color:#94A3B8}
      @media print{body{margin:12mm}}
    </style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
  }, 300);
}

/** Minimal HTML escape for building print documents. */
export function esc(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
