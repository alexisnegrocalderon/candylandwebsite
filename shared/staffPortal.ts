/* La app del staff: quien trabaja en una fiesta entra a «Mi cuenta» con su
 * correo (el que se carga en Finanzas → Equipo) y ve su credencial con QR, sus
 * turnos, la información del evento y sus herramientas. Acá vive lo PURO: el
 * código de la credencial, qué herramientas le tocan a cada rol y la forma de
 * la información de cada evento (server/staffPortal.ts la guarda). */

/** El QR de la credencial: `STAFF-<id persona>-<id evento>-<firma>`. Pasa por
 * `parseTicketCodeFromQr` como un código cualquiera, y la puerta lo reconoce
 * por el prefijo. La firma (6 caracteres) la pone el servidor. */
export const STAFF_CODE_RE = /^STAFF-(\d{1,9})-(\d{1,9})-([A-Z0-9]{6})$/;

export function parseStaffCode(code: string | null | undefined): { staffId: number; eventId: number; sig: string } | null {
  const m = (code ?? '').trim().toUpperCase().match(STAFF_CODE_RE);
  return m ? { staffId: Number(m[1]), eventId: Number(m[2]), sig: m[3] } : null;
}

export function isStaffCode(code: string | null | undefined): boolean {
  return parseStaffCode(code) !== null;
}

export type StaffToolKey = 'puerta' | 'caja' | 'cocina' | 'guardarropia';
export interface StaffTool { key: StaffToolKey; label: string; href: string; emoji: string }

const TOOLS: Record<StaffToolKey, StaffTool> = {
  puerta: { key: 'puerta', label: 'Puerta', href: '/puerta', emoji: '🚪' },
  caja: { key: 'caja', label: 'Caja', href: '/caja', emoji: '💳' },
  cocina: { key: 'cocina', label: 'Cocina', href: '/cocina', emoji: '🍔' },
  guardarropia: { key: 'guardarropia', label: 'Guardarropía', href: '/guardarropia', emoji: '🧥' },
};

function plain(text: string | null | undefined): string {
  return (text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Las herramientas de un rol, por palabras clave (el rol se escribe libre en Finanzas → Equipo).
 * Quien coordina (admin, supervisor, encargado, producción) las ve todas. */
export function staffToolsForRole(role: string | null | undefined): StaffTool[] {
  const r = plain(role);
  if (!r) return [];
  if (/(admin|supervis|encargad|coordin|produc|jef)/.test(r)) return Object.values(TOOLS);
  const out: StaffTool[] = [];
  if (/(puerta|acceso|seguridad|guardia|anfitri|host|recepci)/.test(r)) out.push(TOOLS.puerta);
  if (/(caja|cajer|barra|bar\b|bartender|barman|copero)/.test(r)) out.push(TOOLS.caja);
  if (/(cocina|cociner|comida|chef)/.test(r)) out.push(TOOLS.cocina);
  if (/(guardarrop|locker|ropero)/.test(r)) out.push(TOOLS.guardarropia);
  return out;
}

/** Une las herramientas del rol (Finanzas → Equipo) con los sistemas en que la persona es operador del
 * evento activo (Admin → Operadores, `staffSystemsFor`). Cuando hay operador, el link lleva su id para
 * que el login de PIN abra con el nombre ya elegido (client/src/lib/staffLink.ts); `desde=app` muestra
 * «Volver a mi cuenta». */
export function linkStaffTools(roleTools: StaffTool[], operatorSystems: { key: StaffToolKey; operatorId: number }[]): StaffTool[] {
  const keys = new Set<StaffToolKey>([...roleTools.map((t) => t.key), ...operatorSystems.map((s) => s.key)]);
  return (Object.keys(TOOLS) as StaffToolKey[]).filter((k) => keys.has(k)).map((k) => {
    const op = operatorSystems.find((s) => s.key === k);
    return { ...TOOLS[k], href: op ? `${TOOLS[k].href}?op=${op.operatorId}&desde=app` : `${TOOLS[k].href}?desde=app` };
  });
}

/** La clave con que se guarda la nota de un rol: «Barra», «barra » y «BARRA» son el mismo. */
export function roleKey(role: string | null | undefined): string {
  return plain(role).replace(/\s+/g, ' ');
}

export interface StaffContact { label: string; phone: string }

/** Lo que el staff ve de un evento, más lo de cada turno (hora de citación y llegada por persona). */
export interface StaffEventInfo {
  /** Para todo el staff: horario, reglas, cómo llegar… */
  general: string;
  dressCode: string;
  contacts: StaffContact[];
  /** Nota extra por rol (clave: `roleKey`). */
  byRole: Record<string, string>;
  /** Hora de citación por persona («21:30»), clave: id de la persona. */
  callTimes: Record<string, string>;
  /** Cuándo llegó cada persona (la puerta escaneó su credencial), clave: id de la persona. */
  arrivals: Record<string, string>;
}

const LIMITS = { general: 3000, dressCode: 300, role: 1500, contactLabel: 60, contactPhone: 30, contacts: 6 };

export function isValidCallTime(time: string | null | undefined): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? '');
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function record(value: unknown, keep: (k: string, v: string) => boolean, max: number): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const s = str(v, max);
    if (s && keep(k, s)) out[k] = s;
  }
  return out;
}

export function normalizeStaffEventInfo(raw: unknown): StaffEventInfo {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const contacts = (Array.isArray(r.contacts) ? r.contacts : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({ label: str(c.label, LIMITS.contactLabel), phone: str(c.phone, LIMITS.contactPhone) }))
    .filter((c) => c.label || c.phone)
    .slice(0, LIMITS.contacts);
  return {
    general: str(r.general, LIMITS.general),
    dressCode: str(r.dressCode, LIMITS.dressCode),
    contacts,
    byRole: record(r.byRole, (k) => k === roleKey(k) && k.length > 0, LIMITS.role),
    callTimes: record(r.callTimes, (k, v) => /^\d+$/.test(k) && isValidCallTime(v), 5),
    arrivals: record(r.arrivals, (k, v) => /^\d+$/.test(k) && !Number.isNaN(Date.parse(v)), 40),
  };
}

/** La nota que le toca a alguien según su rol (vacía si no hay). */
export function noteForRole(info: StaffEventInfo, role: string | null | undefined): string {
  const key = roleKey(role);
  return key ? info.byRole[key] ?? '' : '';
}

/** Teléfono para un link `tel:` o de WhatsApp: solo dígitos y el «+». */
export function dialable(phone: string): string {
  return (phone ?? '').replace(/[^\d+]/g, '');
}
