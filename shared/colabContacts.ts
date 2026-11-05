/* Planilla de contactos que sube el socio de una colab (nombre, correo, teléfono).
 * Acepta CSV o lo pegado desde Excel / Google Sheets (separado por coma, punto y coma o tabulación),
 * con o sin fila de encabezados. */
export const COLAB_CONTACTS_MAX = 5000;

export interface ColabContactRow { email: string; fullName: string | null; phone: string | null }
export interface ColabContactsParsed { rows: ColabContactRow[]; invalid: number; duplicates: number; tooMany: boolean }

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(field.trim()); field = ''; } else field += c;
  }
  out.push(field.trim());
  return out;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function parseColabContacts(text: string): ColabContactsParsed {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], invalid: 0, duplicates: 0, tooMany: false };
  const first = lines[0];
  const sep = [['\t', first.split('\t').length], [';', first.split(';').length], [',', first.split(',').length]]
    .sort((a, b) => (b[1] as number) - (a[1] as number))[0][0] as string;

  let nameCol = 0, emailCol = 1, phoneCol = 2;
  let start = 0;
  const head = splitLine(first, sep).map(norm);
  const hasHeader = !head.some((c) => EMAIL_RE.test(c));
  if (hasHeader) {
    start = 1;
    const find = (re: RegExp) => head.findIndex((c) => re.test(c));
    const e = find(/correo|mail|email/); const n = find(/nombre|name|cliente/); const p = find(/tel|cel|fono|phone|whats/);
    if (e >= 0) { emailCol = e; nameCol = n; phoneCol = p; }
  } else {
    // Sin encabezados: el correo es la columna que lo parece.
    const cols = splitLine(first, sep);
    const e = cols.findIndex((c) => EMAIL_RE.test(c));
    if (e >= 0) { emailCol = e; nameCol = e === 0 ? 1 : 0; phoneCol = [0, 1, 2].find((i) => i !== e && i !== nameCol) ?? 2; }
  }

  const seen = new Set<string>();
  const rows: ColabContactRow[] = [];
  let invalid = 0, duplicates = 0, tooMany = false;
  for (const line of lines.slice(start)) {
    const cols = splitLine(line, sep);
    const email = (cols[emailCol] ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 320) { invalid++; continue; }
    if (seen.has(email)) { duplicates++; continue; }
    if (rows.length >= COLAB_CONTACTS_MAX) { tooMany = true; continue; }
    seen.add(email);
    const name = (nameCol >= 0 ? cols[nameCol] : '')?.trim().slice(0, 255);
    const phone = (phoneCol >= 0 ? cols[phoneCol] : '')?.trim().replace(/[^\d+()\-\s]/g, '').slice(0, 40);
    rows.push({ email, fullName: name || null, phone: phone || null });
  }
  return { rows, invalid, duplicates, tooMany };
}
