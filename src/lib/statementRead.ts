// Lazy file readers for statement import. xlsx and pdfjs-dist are dynamically
// imported so they never weigh down the main bundle — they load only when the
// user actually imports a statement on this screen.

export interface RawTable {
  rows: string[][];
}

export async function readStatementFile(file: File): Promise<RawTable> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return readPdf(file);
  return readSheet(file);
}

async function readSheet(file: File): Promise<RawTable> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, raw: false });
  return { rows: grid.map((r) => (r ?? []).map((c) => (c == null ? '' : String(c)))) };
}

async function readPdf(file: File): Promise<RawTable> {
  const pdfjs = await import('pdfjs-dist');
  // Worker, also lazily resolved to its URL.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const rows: string[][] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items as Array<{ str: string; transform: number[] }>;

    // Group text items into lines by their y position (pdf y grows upward).
    const lines = new Map<number, { x: number; str: string }[]>();
    for (const it of items) {
      const str = (it.str ?? '').trim();
      if (!str) continue;
      const x = it.transform[4];
      const yKey = Math.round(it.transform[5] / 2) * 2;
      const arr = lines.get(yKey) ?? [];
      arr.push({ x, str });
      lines.set(yKey, arr);
    }
    for (const y of [...lines.keys()].sort((a, b) => b - a)) {
      const its = lines.get(y)!.sort((a, b) => a.x - b.x);
      // Split a line into cells wherever there's a wide horizontal gap.
      const cells: string[] = [];
      let cur = its[0].str;
      let lastX = its[0].x;
      for (let i = 1; i < its.length; i++) {
        if (its[i].x - lastX > 40) cells.push(cur), (cur = its[i].str);
        else cur += ' ' + its[i].str;
        lastX = its[i].x;
      }
      cells.push(cur);
      rows.push(cells);
    }
  }
  return { rows };
}

/** Read a File as a base64 string (for storing an attachment). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
