export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignorado, el \n que sigue cierra la fila
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Detecta la columna de email en un CSV externo (ej. export de "delivered
 * emails" de Resend, que usa "to") por nombre de header, sin asumir un
 * formato fijo de columnas -- probamos cada hint en orden, case-insensitive.
 * Devuelve emails únicos, en minúscula, no vacíos. */
export function extractEmailColumn(rows: string[][], columnNameHints: string[]): string[] {
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  const normalizedHeader = header.map((h) => h.trim().toLowerCase());

  let columnIndex = -1;
  for (const hint of columnNameHints) {
    const idx = normalizedHeader.indexOf(hint.toLowerCase());
    if (idx !== -1) {
      columnIndex = idx;
      break;
    }
  }
  if (columnIndex === -1) return [];

  const emails = new Set<string>();
  for (const row of dataRows) {
    const value = row[columnIndex]?.trim().toLowerCase();
    if (value) emails.add(value);
  }
  return Array.from(emails);
}
