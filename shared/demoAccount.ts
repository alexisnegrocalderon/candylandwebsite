/* Cuenta de prueba de la App (admin → Noche → «Cuenta de prueba»). Arma una cuenta con todo lo que
 * la App puede mostrar, colgado de eventos OCULTOS (`draft`) con slugs fijos: así crear y borrar es
 * exacto y jamás toca un evento real. Mismo criterio que «Probar Playmatch» (shared/playmatchTest.ts).
 *
 * Nada de esto mueve plata real: todo vale $0, los cupones solo sirven en el evento de prueba y el
 * código del embajador de prueba no da descuento en ninguna compra (`isDemoAmbassadorCode`). */

import type { PartyGender, PartyZone } from './party';

export const DEMO_EVENT_SLUG = 'cuenta-demo';
export const DEMO_PAST_SLUG_PREFIX = 'cuenta-demo-pasada-';
export const DEMO_EVENT_TITLE = 'Aniversario PlayRoom · DEMO';
/** Las fiestas pasadas que le dan sellos a la tarjeta (1 de regalo + 3 = 4 de 6). */
export const DEMO_PAST_EVENTS = 3;

/** Correo de las entradas de los invitados falsos de Playmatch (no recibe nada: .invalid). */
export const DEMO_GUESTS_EMAIL = 'invitados@cuenta-demo.invalid';

/** ¿Es un slug de la cuenta de prueba? */
export function isDemoSlug(slug: string | null | undefined): boolean {
  return !!slug && (slug === DEMO_EVENT_SLUG || slug.startsWith(DEMO_PAST_SLUG_PREFIX));
}

/** Los códigos de la cuenta de prueba empiezan con «DEMO-» (con guion, para no chocar con un código real
 * como DEMONIO): el de embajador nunca da descuento ni comisión. */
export const DEMO_CODE_PREFIX = 'DEMO-';
export function isDemoAmbassadorCode(code: string | null | undefined): boolean {
  return (code ?? '').trim().toUpperCase().startsWith(DEMO_CODE_PREFIX);
}

/** MP-DEMO-0001… las de la cuenta; MP-DEMO-0101… las de los invitados falsos. */
export function demoTicketCode(n: number): string {
  return `MP-DEMO-${String(n).padStart(4, '0')}`;
}

export type DemoPhase = 'antes' | 'durante';

/** Fechas del evento de prueba. `antes`: la fiesta es en 3 días (cuenta regresiva, QR, inscripción a
 * Playmatch). `durante`: empezó hace una hora y dura todo el día (Playmatch abierto). */
export function demoEventWindow(phase: DemoPhase, now: Date = new Date()) {
  const H = 60 * 60 * 1000;
  if (phase === 'durante') {
    const start = new Date(now.getTime() - H);
    return { eventDate: start, doorsOpen: start, eventEnd: new Date(now.getTime() + 12 * H) };
  }
  const start = new Date(now.getTime() + 3 * 24 * H);
  start.setUTCHours(1, 0, 0, 0); // 22:00 en Chile
  return { eventDate: start, doorsOpen: start, eventEnd: new Date(start.getTime() + 7 * H) };
}

/** Lo que trae la entrada de prueba: el acceso con acompañantes y uno de cada extra. El nombre del
 * estacionamiento tiene que decir «Estacionamiento» (así lo reconoce ticketKind). */
export const DEMO_TICKET_TYPES = [
  { key: 'acceso', name: 'Acceso Trío', category: 'acceso' },
  { key: 'auto', name: 'Estacionamiento', category: 'extra' },
  { key: 'locker', name: 'Guardarropía', category: 'locker' },
  { key: 'consumo', name: 'Consumo · 2 tragos', category: 'consumo' },
  { key: 'merch', name: 'Polera PlayRoom', category: 'merch' },
  { key: 'extra', name: 'Pack Glow', category: 'extra' },
] as const;

export const DEMO_COMPANIONS = [
  { nombre: 'Javier Soto', rut: '12.345.678-5' },
  { nombre: 'Daniela Paz', rut: '16.789.012-3' },
];

/** Los campos del formulario de compra con los acompañantes (formato de `companionsFromCampos`). */
export function demoAttendeeData(): string {
  const campos: Record<string, string> = {};
  DEMO_COMPANIONS.forEach((c, i) => {
    campos[`acceso__acomp${i + 1}_nombre`] = c.nombre;
    campos[`acceso__acomp${i + 1}_rut`] = c.rut;
    campos[`acceso__acomp${i + 1}_docTipo`] = 'rut';
  });
  return JSON.stringify({ campos });
}

/** Qué hace cada invitado falso con la cuenta cuando la fiesta está «durante» (si ya se inscribió en
 * Playmatch): mandarle un Caramelo, darle ♥ (para que «Les gustas a N» y el match funcionen), o ya ser
 * match con mensajes sin leer. */
export type DemoGuestRole = 'caramelo' | 'like' | 'match' | 'nada';

export const DEMO_GUESTS: { alias: string; gender: PartyGender; costume: string; zone: PartyZone; role: DemoGuestRole }[] = [
  { alias: 'Bruja Candy', gender: 'mujer', costume: 'Bruja neón', zone: 'piscina', role: 'caramelo' },
  { alias: 'Diablo Rojo', gender: 'hombre', costume: 'Diablo', zone: 'barra', role: 'like' },
  { alias: 'Gata Negra', gender: 'mujer', costume: 'Catwoman', zone: 'living', role: 'like' },
  { alias: 'Conde', gender: 'hombre', costume: 'Vampiro', zone: 'living', role: 'match' },
  { alias: 'Calavera', gender: 'hombre', costume: 'Calavera mexicana', zone: 'playground', role: 'nada' },
  { alias: 'Los Zombies', gender: 'pareja', costume: 'Pareja zombie', zone: 'barra', role: 'nada' },
];

export const DEMO_MATCH_MESSAGES = ['¡Hola! Me encantó tu disfraz 🦇', '¿En qué zona estás? Voy para allá'];
