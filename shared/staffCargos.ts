/* Los cargos del staff: una sola lista para la ficha (Admin → Noche → Staff),
 * la app de cada persona y los accesos a las pantallas de trabajo. Cada cargo
 * con `operatorRole` abre una pantalla (caja, puerta, cocina, guardarropía);
 * los demás solo tienen credencial, turnos e info en su app. */
import type { OperatorRole } from './cajaRoles';

export const STAFF_CARGO_KEYS = ['caja', 'barra', 'puerta', 'cocina', 'guardarropia', 'supervisor', 'dj', 'rrpp', 'produccion', 'anfitrion_playmatch', 'animador', 'otro'] as const;
export type StaffCargo = (typeof STAFF_CARGO_KEYS)[number];

export interface StaffCargoDef {
  key: StaffCargo;
  label: string;
  emoji: string;
  /** El rol de operador con que entra a su pantalla, o null si no usa ninguna. */
  operatorRole: OperatorRole | null;
  /** Lo que se explica en la ficha al elegirlo. */
  hint: string;
}

export const STAFF_CARGOS: StaffCargoDef[] = [
  { key: 'caja', label: 'Caja', emoji: '💳', operatorRole: 'caja', hint: 'Vende y canjea en /caja: es la única área que vende.' },
  { key: 'barra', label: 'Barra', emoji: '🍸', operatorRole: 'barra', hint: 'Prepara los pedidos: ve el dosier de barra y cuenta el inventario al abrir y al cerrar el turno (/barra). No usa la caja.' },
  { key: 'puerta', label: 'Puerta / Seguridad', emoji: '🚪', operatorRole: 'acceso', hint: 'Escanea entradas en /puerta.' },
  { key: 'cocina', label: 'Cocina', emoji: '🍔', operatorRole: 'cocina', hint: 'Recibe los pedidos en /cocina.' },
  { key: 'guardarropia', label: 'Guardarropía', emoji: '🧥', operatorRole: 'guardarropia', hint: 'Recibe y entrega en /guardarropia.' },
  { key: 'supervisor', label: 'Supervisor / Producción', emoji: '⭐', operatorRole: 'supervisor', hint: 'Entra a todas las pantallas, anula ventas y cierra turnos.' },
  { key: 'dj', label: 'DJ / Artista', emoji: '🎧', operatorRole: null, hint: 'Credencial, turnos y su link de ventas.' },
  { key: 'rrpp', label: 'RRPP / Promotor', emoji: '📣', operatorRole: null, hint: 'Credencial, turnos y su link de referido.' },
  { key: 'produccion', label: 'Montaje / Foto', emoji: '📸', operatorRole: null, hint: 'Credencial, turnos e info de la noche.' },
  { key: 'anfitrion_playmatch', label: 'Anfitrión Playmatch', emoji: '💘', operatorRole: null, hint: 'Ayuda a bajar la App y a armar el perfil; ve la meta de la noche de Playmatch.' },
  { key: 'animador', label: 'Animador / MC', emoji: '🎤', operatorRole: null, hint: 'Ve la pauta de dinámicas, el guion de la noche y la coordinación con el creador de contenido.' },
  { key: 'otro', label: 'Otro', emoji: '✨', operatorRole: null, hint: 'Escribe el cargo: credencial, turnos e info.' },
];

const BY_KEY = new Map(STAFF_CARGOS.map((c) => [c.key, c]));

export function isStaffCargo(value: unknown): value is StaffCargo {
  return typeof value === 'string' && BY_KEY.has(value as StaffCargo);
}

export function cargoDef(cargo: string | null | undefined): StaffCargoDef | null {
  return isStaffCargo(cargo) ? BY_KEY.get(cargo)! : null;
}

/** Lo que se muestra como cargo: el texto que escribió el admin, o el nombre del cargo. */
export function cargoTitle(cargo: string | null | undefined, role: string | null | undefined): string {
  return role?.trim() || cargoDef(cargo)?.label || 'Equipo';
}

export function operatorRoleForCargo(cargo: string | null | undefined): OperatorRole | null {
  return cargoDef(cargo)?.operatorRole ?? null;
}

function plain(text: string | null | undefined): string {
  return (text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** El cargo que corresponde al texto libre de antes («Bartender», «Seguridad»…). Sin match: «otro». */
export function cargoFromRole(role: string | null | undefined): StaffCargo | null {
  const r = plain(role);
  if (!r) return null;
  if (/(admin|supervis|encargad|coordin|jef)/.test(r)) return 'supervisor';
  // «Anfitrión Playmatch» no es de la puerta: va antes que «anfitri».
  if (/playmatch/.test(r)) return 'anfitrion_playmatch';
  if (/(puerta|acceso|seguridad|guardia|anfitri|host|recepci)/.test(r)) return 'puerta';
  if (/(caja|cajer)/.test(r)) return 'caja';
  if (/(barra|bar\b|bartender|barman|copero)/.test(r)) return 'barra';
  if (/(cocina|cociner|comida|chef)/.test(r)) return 'cocina';
  if (/(guardarrop|locker|ropero)/.test(r)) return 'guardarropia';
  if (/(animad|\bmc\b|maestro de ceremonia|presentador)/.test(r)) return 'animador';
  if (/(\bdj\b|artista|music|banda|show)/.test(r)) return 'dj';
  if (/(rrpp|promot|relacion)/.test(r)) return 'rrpp';
  if (/(produc|montaje|foto|video|tecnic|luces|sonido)/.test(r)) return 'produccion';
  return 'otro';
}

/** PIN que la persona elige para sus pantallas: 4 a 6 dígitos, sin los obvios. */
export function pinProblem(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return 'El PIN son 4 a 6 números.';
  if (/^(\d)\1+$/.test(pin)) return 'Ese PIN es muy fácil (todos iguales).';
  const asc = '0123456789012345';
  const desc = '9876543210987654';
  if (asc.includes(pin) || desc.includes(pin)) return 'Ese PIN es muy fácil (números seguidos).';
  return null;
}
