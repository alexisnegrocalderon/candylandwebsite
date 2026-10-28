import Dexie, { type Table } from 'dexie';
import { formatKitchenTicketNumber } from '@shared/kitchen';
import { formatLockerTagNumber } from '@shared/locker';
import { personasForTicket } from '@shared/mission300';
import { vipParkingCounts, type DoorParkingOption } from '@shared/parking';
import type { DosierFichas } from '@shared/dosierFicha';
import { consumoDeVenta, type InsumoUnit, type OpcionGrupo, type RecetaLinea } from '@shared/insumos';

/* Snapshot local + cola de operaciones para el modo offline de /caja
 * (docs/ARQUITECTURA-CAJA.md §6.2-§6.3). Todo lo que la tablet necesita para
 * buscar/canjear/vender sin red vive acá; el servidor sigue siendo la
 * fuente de verdad -- esto es solo una caché operativa con cola de escritura. */

export interface CajaAttendee {
  orderId: number;
  orderNumber: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  /** Titular + acompañantes, cada uno con su propio nombre y documento -- es
   * lo que el anfitrión compara persona por persona contra la cédula o el
   * pasaporte en la puerta. `rut` es `null` si esa persona no lo tiene
   * capturado. `docType` indica si ese valor es un RUT chileno o un
   * pasaporte (selector elegido en el checkout, ver Checkout.tsx). */
  attendees: { name: string; rut: string | null; docType: 'rut' | 'passport' }[];
  access: { ticketCode: string; status: string; typeName: string; accesoSlug: string | null; groupSize: number | null }[];
  extras: { displayCode: string | null; status: string; typeName: string; /** Cobrado en la puerta (no era un VIP reservado de antes). */ atDoor?: boolean }[];
  /** Compra por el link de una campaña aliada (ej. comunidad electrónica):
   * gente que viene por primera vez. Opcional: snapshots viejos no lo traen. */
  partnerBadge?: { label: string; emoji: string; refLabel: string | null } | null;
  /** Coincide con la lista de bloqueados: `block` = dato duro (RUT, teléfono,
   * Instagram o correo) → no permitir ingreso; `review` = solo el nombre. */
  blockedAlert?: { level: 'block' | 'review'; matches: { name: string | null; by: string; venue: string | null }[] } | null;
}

export interface CajaCatalogItem {
  id: number;
  name: string;
  price: number;
  color: string | null;
  internalCode: string | null;
  /** Ícono grande del botón. El dueño eligió emoji + color en vez de fotos:
   *  se lee mejor que una miniatura en una tablet a oscuras, y no obliga a
   *  construir subida de imágenes (que hoy no existe en el proyecto). */
  emoji: string | null;
  /** Sección de la carta ("Tragos", "Comida", ...) -- arma las pestañas. */
  groupName: string | null;
  /** Ingredientes/sabores especiales, para responder preguntas del cliente
   * al mantener presionada la tarjeta -- mismo campo `description` que ya
   * carga el admin en la Carta de la Fiesta. */
  description: string | null;
  category: string;
  /** Con qué va / qué variante es: se elige al vender y descuenta el insumo elegido. */
  opciones?: OpcionGrupo[];
  /** 'soldout' = botón de emergencia de cocina o admin -- bloquea la venta
   * de verdad en la tarjeta, a diferencia del aviso suave de `totalStock -
   * soldCount <= 0`. 'hidden' no llega acá (getCajaSnapshot lo excluye). */
  status: 'active' | 'soldout' | 'hidden';
  totalStock: number;
  soldCount: number;
  /** Genera comanda en /cocina al venderse. */
  toKitchen: boolean;
  sortOrder: number;
}

interface CajaCodeIndex {
  code: string; // ticketCode o displayCode, en mayúsculas
  orderId: number;
}

/** Trago que alguien invitó en la fiesta y todavía no se retira de la
 * barra. Va aparte de `attendees` porque puede venir de un evento ANTERIOR
 * (el dueño decidió que un trago no cobrado siga válido para la próxima
 * fiesta) y por lo tanto no pertenece a ninguna orden de esta noche.
 * Viaja autocontenido para poder cobrarse sin señal. */
export interface CajaGift {
  displayCode: string;
  drinkName: string;
  toAlias: string;
  fromAlias: string;
  eventId: number;
  status: string;
}

/** Consumo gratis invitado a alguien del staff (Accesos Manuales →
 * "Invitar consumo gratis a staff"), pendiente de canjear en /caja. Igual
 * que `CajaGift`: autocontenido, para buscar y canjear sin señal. */
export interface CajaStaffComp {
  displayCode: string;
  productName: string;
  staffName: string;
  status: string;
}

export type QueuedOp =
  | { opId: string; type: 'redeem'; displayCode: string; clientAt: string }
  | { opId: string; type: 'undo_redeem'; displayCode: string; clientAt: string }
  | { opId: string; type: 'checkin'; ticketCode: string; clientAt: string; /** La puerta tocó «Verifiqué las cédulas» (queda en el ledger). */ idVerified?: boolean }
  | { opId: string; type: 'parking_paid'; ticketCode: string; paymentMethod: 'efectivo' | 'debito' | 'credito'; ticketTypeId?: number; clientAt: string }
  | {
      opId: string; type: 'sale'; items: { ticketTypeId: number; quantity: number; opciones?: string[] }[];
      paymentMethod: 'efectivo' | 'debito' | 'credito' | 'qr'; clientAt: string;
      // Playcoins (pedido explícito del usuario): captura opcional del email
      // del cliente para que la venta también gane puntos, y canje opcional
      // de puntos ya ganados como descuento.
      buyerEmail?: string; redeemPlaycoins?: number;
      // Código de descuento aplicado en el carrito (se revalida server-side).
      discountCode?: string;
      // Número de percha de guardarropía (ver `nextLockerTagNumber`), si el
      // carrito tiene un producto category='locker'.
      lockerTag?: string;
      // Nombre que la cajera le pide al cliente al vender guardarropía --
      // para poder ubicar la prenda por nombre en vez de por número.
      lockerCustomerName?: string;
      // Número de comanda de cocina (ver `nextKitchenTicketNumber`), si el
      // carrito tiene algún producto `toKitchen`.
      kitchenTicketNumber?: string;
      // Nombre que la cajera le pide al cliente al vender algo `toKitchen` --
      // lo que ve cocina en pantalla en vez del número de comanda.
      customerName?: string;
    };

export interface CajaOpRecord {
  opId: string;
  op: QueuedOp;
  /** 'error' = el servidor la rechazó (ej. catálogo desactualizado): queda
   * guardada para rehacerla o descartarla a mano, no se borra sola. */
  status: 'pending' | 'synced' | 'error';
  result?: string;
  conflictNote?: string;
  createdAt: number;
  /** Evento contra el que se hizo (real o de pruebas). Se sincroniza contra
   * ESE evento aunque la tablet haya cambiado de evento entremedio. Las ops
   * viejas (sin el campo) usan el evento actual, como antes. */
  eventId?: number;
}

interface CajaMetaRow {
  key: string;
  value: unknown;
}

class CajaDexie extends Dexie {
  attendees!: Table<CajaAttendee, number>;
  codes!: Table<CajaCodeIndex, string>;
  catalog!: Table<CajaCatalogItem, number>;
  gifts!: Table<CajaGift, string>;
  staffComps!: Table<CajaStaffComp, string>;
  opsQueue!: Table<CajaOpRecord, string>;
  meta!: Table<CajaMetaRow, string>;

  constructor() {
    super('mansion-playroom-caja');
    this.version(1).stores({
      attendees: 'orderId, buyerName, buyerEmail, buyerPhone',
      codes: 'code, orderId',
      catalog: 'id',
      opsQueue: 'opId, status, createdAt',
      meta: 'key',
    });
    // v2: tragos invitados durante la fiesta, que la barra cobra por código.
    this.version(2).stores({
      gifts: 'displayCode, toAlias',
    });
    // v3: consumos gratis invitados al staff.
    this.version(3).stores({
      staffComps: 'displayCode, staffName',
    });
  }
}

export const cajaDB = new CajaDexie();

export async function saveSnapshot(snapshot: {
  event: { id: number; title: string; slug: string };
  attendees: CajaAttendee[];
  catalog: CajaCatalogItem[];
  gifts?: { displayCode: string; drinkName: string; toAlias: string; fromAlias: string; eventId: number }[];
  staffComps?: { displayCode: string; productName: string; staffName: string; status: string }[];
  /** Solo la puerta lo trae: los estacionamientos del evento (normal y VIP,
   * con su precio) y lo del local por auto. */
  parking?: { options: DoorParkingOption[]; venueFeePerCarClp: number };
  /** Solo la puerta lo trae: el staff del evento con el código de su credencial. */
  staff?: DoorStaff[];
  /** Solo la puerta lo trae: los contactos de la noche (para llamar si no hay señal). */
  contacts?: { label: string; phone: string }[];
  /** Solo la caja lo trae: stock de la barra por insumos (`null` = no se usa). */
  barra?: CajaBarra | null;
  /** Solo la caja lo trae: las fichas del dosier de barra para abrirlas sin señal. */
  dosier?: DosierFichas | null;
  serverTime: string;
}) {
  await cajaDB.transaction('rw', [cajaDB.attendees, cajaDB.codes, cajaDB.catalog, cajaDB.gifts, cajaDB.staffComps, cajaDB.meta, cajaDB.opsQueue], async () => {
    await cajaDB.attendees.clear();
    await cajaDB.codes.clear();
    await cajaDB.catalog.clear();
    await cajaDB.gifts.clear();
    await cajaDB.staffComps.clear();
    await cajaDB.attendees.bulkAdd(snapshot.attendees);

    const codes: CajaCodeIndex[] = [];
    for (const a of snapshot.attendees) {
      for (const acc of a.access) codes.push({ code: acc.ticketCode.toUpperCase(), orderId: a.orderId });
      for (const ex of a.extras) if (ex.displayCode) codes.push({ code: ex.displayCode.toUpperCase(), orderId: a.orderId });
    }
    await cajaDB.codes.bulkAdd(codes);
    await cajaDB.catalog.bulkAdd(snapshot.catalog);
    await cajaDB.gifts.bulkAdd((snapshot.gifts ?? []).map((g) => ({ ...g, displayCode: g.displayCode.toUpperCase(), status: 'valid' })));
    await cajaDB.staffComps.bulkAdd((snapshot.staffComps ?? []).map((c) => ({ ...c, displayCode: c.displayCode.toUpperCase() })));
    await cajaDB.meta.put({ key: 'event', value: snapshot.event });
    // Reloj del dispositivo desviado (docs/ARQUITECTURA-CAJA.md §13, riesgo 5)
    // -- se guarda cuánto se adelanta/atrasa el reloj local respecto al
    // servidor para corregir clientAt en cada operación (ver correctedNow()).
    await cajaDB.meta.put({ key: 'serverTimeOffsetMs', value: new Date(snapshot.serverTime).getTime() - Date.now() });
    await cajaDB.meta.put({ key: 'lastSnapshotAt', value: Date.now() });
    if (snapshot.parking) await cajaDB.meta.put({ key: 'parking', value: snapshot.parking });
    if (snapshot.staff) await cajaDB.meta.put({ key: 'staff', value: { eventId: snapshot.event.id, list: snapshot.staff } });
    if (snapshot.contacts) await cajaDB.meta.put({ key: 'contacts', value: { eventId: snapshot.event.id, list: snapshot.contacts } });
    if (snapshot.barra !== undefined) await cajaDB.meta.put({ key: 'barra', value: snapshot.barra });
    if (snapshot.dosier !== undefined) await cajaDB.meta.put({ key: 'dosier', value: snapshot.dosier });

    // El snapshot llega del servidor SIN lo que esta tablet todavía no
    // sincronizó: sin esto, un código recién canjeado volvía a "válido" (y se
    // podía canjear dos veces) y el stock vendido sin señal se reseteaba.
    // Se vuelven a aplicar los efectos locales de lo pendiente del mismo evento.
    const pending = await cajaDB.opsQueue.where('status').equals('pending').toArray();
    for (const rec of pending) {
      if (rec.eventId === undefined || rec.eventId === snapshot.event.id) await applyOptimistic(rec.op);
    }
  });
}

/** Estacionamientos del evento (con su precio) y lo del local por auto, del
 * último snapshot de la puerta (`null` si todavía no se bajó o la caja nunca
 * lo pidió, o si es un dato viejo sin las opciones). */
export async function getLocalParking(): Promise<{ options: DoorParkingOption[]; venueFeePerCarClp: number } | null> {
  const row = await cajaDB.meta.get('parking');
  const value = row?.value as any;
  return value && Array.isArray(value.options) ? value : null;
}

/** Los contactos de la noche del último snapshot de la puerta (sirven sin señal). */
export async function getLocalContacts(eventId: number): Promise<{ label: string; phone: string }[]> {
  const row = await cajaDB.meta.get('contacts');
  const value = row?.value as { eventId: number; list: { label: string; phone: string }[] } | undefined;
  return value && value.eventId === eventId ? value.list : [];
}

export interface DoorStaff { code: string; name: string; role: string | null }

/** Stock de la barra por insumos (server/insumos.ts `cajaInsumoSnapshot`):
 * con esto la grilla muestra "quedan ~N" también sin señal. */
export interface CajaBarra {
  insumos: { id: number; name: string; unit: InsumoUnit; containerSize: number; containerLabel: string; stock: number; alertDrinks: number; sinComprar?: boolean }[];
  recetas: RecetaLinea[];
  /** Opciones al vender por producto (con qué bebida va…): para el descuento local. */
  opciones?: Record<number, OpcionGrupo[]>;
}

/** El dosier de barra del último snapshot (`null` si todavía no se bajó). */
export async function getLocalDosier(): Promise<DosierFichas | null> {
  const row = await cajaDB.meta.get('dosier');
  return (row?.value as DosierFichas | null | undefined) ?? null;
}

/** `null` si el evento no usa insumos (o la base todavía no tiene las tablas). */
export async function getLocalBarra(): Promise<CajaBarra | null> {
  const row = await cajaDB.meta.get('barra');
  const value = row?.value as CajaBarra | null | undefined;
  return value && Array.isArray(value.insumos) && Array.isArray(value.recetas) ? value : null;
}

/** La persona del staff dueña de esa credencial, del último snapshot de la puerta
 * (sirve sin señal). `null` si no está o si el snapshot es de otro evento. */
export async function findLocalStaff(code: string, eventId: number): Promise<DoorStaff | null> {
  const row = await cajaDB.meta.get('staff');
  const value = row?.value as { eventId: number; list: DoorStaff[] } | undefined;
  if (!value || value.eventId !== eventId || !Array.isArray(value.list)) return null;
  return value.list.find((s) => s.code.toUpperCase() === code.toUpperCase()) ?? null;
}

export async function getLocalEvent(): Promise<{ id: number; title: string; slug: string } | null> {
  const row = await cajaDB.meta.get('event');
  return (row?.value as any) ?? null;
}

/** Hora corregida con el offset del último snapshot (§13, riesgo 5) -- usar
 * siempre esto para `clientAt`, nunca `new Date()` directo, para que el
 * reloj desviado de una tablet no distorsione el orden real del ledger. */
export async function correctedNow(): Promise<Date> {
  const row = await cajaDB.meta.get('serverTimeOffsetMs');
  const offset = (row?.value as number) ?? 0;
  return new Date(Date.now() + offset);
}

/** Tragos invitados que la barra puede cobrar, por código o por el alias
 * de quien lo recibe -- que es lo que la persona dice al llegar. */
/* REVISAR: hoy sin llamadas. Su único consumidor era un estado en
 * pages/caja/index.tsx que se escribía y nunca se renderizaba, así que corría
 * una lectura de IndexedDB por cada tecla del buscador para nada. Se conserva
 * porque el canje de tragos invitados SÍ está vivo (ver `cajaDB.gifts` en
 * redeemLocal) y la tabla indexa `toAlias` justamente para esta búsqueda: falta
 * la UI, no la capacidad. Si se decide que no va, borrar esta función. */
export async function searchGiftsLocal(query: string): Promise<CajaGift[]> {
  const q = query.trim();
  if (!q) return [];

  const exact = await cajaDB.gifts.get(q.toUpperCase());
  if (exact) return [exact];

  // Por alias: quien llega a la barra dice su alias, no el código.
  const needle = q.toLowerCase();
  const all = await cajaDB.gifts.toArray();
  return all.filter((g) => g.toAlias.toLowerCase().includes(needle)).slice(0, 10);
}

/** Consumos gratis de staff, por código o por el nombre de la persona a la
 * que corresponde -- que es lo que dice al llegar a la caja. */
export async function searchStaffCompsLocal(query: string): Promise<CajaStaffComp[]> {
  const q = query.trim();
  if (!q) return [];

  const exact = await cajaDB.staffComps.get(q.toUpperCase());
  if (exact) return [exact];

  const needle = q.toLowerCase();
  const all = await cajaDB.staffComps.toArray();
  return all.filter((c) => c.staffName.toLowerCase().includes(needle)).slice(0, 10);
}

/** Búsqueda 100% local (<50ms, funciona offline): primero match exacto por
 * código, si no por nombre/email/teléfono. */
export async function searchLocal(query: string): Promise<CajaAttendee[]> {
  const q = query.trim();
  if (!q) return [];

  const byCode = await cajaDB.codes.get(q.toUpperCase());
  if (byCode) {
    const attendee = await cajaDB.attendees.get(byCode.orderId);
    return attendee ? [attendee] : [];
  }

  const needle = q.toLowerCase();
  const all = await cajaDB.attendees.toArray();
  return all
    .filter((a) => a.buyerName.toLowerCase().includes(needle) || a.buyerEmail.toLowerCase().includes(needle) || (a.buyerPhone && a.buyerPhone.includes(q)))
    .slice(0, 20);
}

/** Personas que ya entraron y personas esperadas (accesos válidos o usados,
 * sin los anulados), según el snapshot local. Incluye al instante los
 * check-in de este mismo celular que todavía no se sincronizan. */
export async function countCheckedInPersonas(): Promise<{ entered: number; expected: number }> {
  const all = await cajaDB.attendees.toArray();
  let entered = 0;
  let expected = 0;
  for (const a of all) {
    for (const acc of a.access) {
      if (acc.status !== 'valid' && acc.status !== 'used') continue;
      const n = personasForTicket(acc.groupSize, acc.accesoSlug);
      expected += n;
      if (acc.status === 'used') entered += n;
    }
  }
  return { entered, expected };
}

/** Estacionamientos VIP reservados de antes / ya llegaron / por llegar, según el snapshot local (incluye al instante
 * los check-in de este mismo celular que todavía no se sincronizan). */
export async function countVipParking() {
  return vipParkingCounts(await cajaDB.attendees.toArray());
}

export async function getLocalAttendee(orderId: number): Promise<CajaAttendee | undefined> {
  return cajaDB.attendees.get(orderId);
}

/** Búsqueda por nombre entre los clientes que YA ENTRARON a la fiesta (al
 * menos un acceso con status 'used' -- activado con su QR en la puerta), para
 * asociar la venta a un Playcoins sin depender de que el cliente traiga a
 * mano el email o el código. 100% local, funciona sin señal: no hace falta
 * un endpoint nuevo, el snapshot ya trae el status de cada acceso. */
export async function searchInsideAttendeesLocal(query: string): Promise<CajaAttendee[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const normRut = (v: string) => v.replace(/[.\-\s]/g, '').toLowerCase();
  const rutQ = q.length >= 4 ? normRut(q) : '';

  const all = await cajaDB.attendees.toArray();
  return all
    .filter((a) => a.access.some((acc) => acc.status === 'used'))
    .filter((a) => a.buyerName.toLowerCase().includes(q) || a.buyerEmail.toLowerCase().includes(q) || (a.buyerPhone?.includes(query.trim()) ?? false)
      || a.attendees.some((p) => p.name.toLowerCase().includes(q) || (!!rutQ && !!p.rut && normRut(p.rut).includes(rutQ))))
    .slice(0, 20);
}

export async function getLocalCatalog(): Promise<CajaCatalogItem[]> {
  return cajaDB.catalog.toArray();
}

/** Encola una operación offline y actualiza el estado local al instante
 * (UI optimista, §6.3) -- la cajera nunca espera a la red. */
export async function enqueueOp(op: QueuedOp, eventId?: number) {
  await cajaDB.opsQueue.add({ opId: op.opId, op, status: 'pending', createdAt: Date.now(), eventId });
  await applyOptimistic(op);
}

/** Efecto local de una operación (código usado, entrada marcada, stock
 * vendido). Se aplica al encolar y otra vez después de cada snapshot
 * mientras la operación siga pendiente. */
async function applyOptimistic(op: QueuedOp) {
  if (op.type === 'redeem') {
    const code = op.displayCode.toUpperCase();

    const idx = await cajaDB.codes.get(code);
    if (idx) {
      const attendee = await cajaDB.attendees.get(idx.orderId);
      if (attendee) {
        attendee.extras = attendee.extras.map((e) =>
          e.displayCode?.toUpperCase() === code ? { ...e, status: 'used' } : e
        );
        await cajaDB.attendees.put(attendee);
      }
    }

    // El mismo código puede ser un trago invitado en la fiesta, que vive en
    // su propia tabla porque puede venir de un evento anterior.
    const gift = await cajaDB.gifts.get(code);
    if (gift) await cajaDB.gifts.update(code, { status: 'used' });

    // O un consumo gratis invitado a alguien del staff.
    const comp = await cajaDB.staffComps.get(code);
    if (comp) await cajaDB.staffComps.update(code, { status: 'used' });
  }

  // Deshacer el canje de hace instantes (el «Deshacer» de 60 s): el código vuelve a quedar por canjear.
  if (op.type === 'undo_redeem') {
    const code = op.displayCode.toUpperCase();
    const idx = await cajaDB.codes.get(code);
    if (idx) {
      const attendee = await cajaDB.attendees.get(idx.orderId);
      if (attendee) {
        attendee.extras = attendee.extras.map((e) =>
          e.displayCode?.toUpperCase() === code && e.status === 'used' ? { ...e, status: 'valid' } : e
        );
        await cajaDB.attendees.put(attendee);
      }
    }
  }

  if (op.type === 'checkin') {
    const idx = await cajaDB.codes.get(op.ticketCode.toUpperCase());
    if (idx) {
      const attendee = await cajaDB.attendees.get(idx.orderId);
      if (attendee) {
        attendee.access = attendee.access.map((a) =>
          a.ticketCode.toUpperCase() === op.ticketCode.toUpperCase() ? { ...a, status: 'used' } : a
        );
        await cajaDB.attendees.put(attendee);
      }
    }
  }

  // Estacionamiento cobrado en la puerta: se agrega localmente al toque para
  // que un re-escaneo en la misma sesión ya lo vea pagado (server/caja/
  // parkingPaid.ts hace lo mismo del lado del servidor, esto solo evita
  // esperar la próxima sincronización de 60s del snapshot).
  if (op.type === 'parking_paid') {
    const idx = await cajaDB.codes.get(op.ticketCode.toUpperCase());
    if (idx) {
      const attendee = await cajaDB.attendees.get(idx.orderId);
      if (attendee) {
        attendee.extras = [...attendee.extras, { displayCode: null, status: 'used', typeName: 'Estacionamiento' }];
        await cajaDB.attendees.put(attendee);
      }
    }
  }

  // La venta descuenta el stock local. Sin esto, sin señal el aviso de "sin
  // stock" se congela en el valor del último snapshot (que se re-descarga
  // cada 60s, o nunca si no hay red) y la cajera no ve que algo se está
  // acabando durante la noche. El aviso igual nunca bloquea la venta.
  if (op.type === 'sale') {
    for (const item of op.items) {
      const product = await cajaDB.catalog.get(item.ticketTypeId);
      if (product) {
        await cajaDB.catalog.update(item.ticketTypeId, { soldCount: product.soldCount + item.quantity });
      }
    }
    // Y gasta los insumos de su receta: dos tragos con ron bajan el mismo ron.
    const barra = await getLocalBarra();
    if (barra) {
      const used = new Map(consumoDeVenta(op.items, barra.recetas, barra.opciones).map((c) => [c.insumoId, c.delta]));
      if (used.size > 0) {
        await cajaDB.meta.put({ key: 'barra', value: { ...barra, insumos: barra.insumos.map((i) => ({ ...i, stock: i.stock + (used.get(i.id) ?? 0) })) } });
      }
    }
  }
}

export async function pendingOpsCount(): Promise<number> {
  return cajaDB.opsQueue.where('status').equals('pending').count();
}

export async function getPendingOps(): Promise<CajaOpRecord[]> {
  return cajaDB.opsQueue.where('status').equals('pending').sortBy('createdAt');
}

export async function markOpSynced(opId: string, result: string, conflictNote?: string) {
  await cajaDB.opsQueue.update(opId, { status: 'synced', result, conflictNote });
}

/** El servidor rechazó la operación: queda como 'error' para rehacerla. */
export async function markOpRejected(opId: string, conflictNote?: string) {
  await cajaDB.opsQueue.update(opId, { status: 'error', result: 'rejected', conflictNote });
}

export async function getRejectedOps(): Promise<CajaOpRecord[]> {
  return cajaDB.opsQueue.where('status').equals('error').sortBy('createdAt');
}

export async function discardOp(opId: string) {
  await cajaDB.opsQueue.delete(opId);
}

export async function clearSyncedOps() {
  await cajaDB.opsQueue.where('status').equals('synced').delete();
}

/** Prefijo propio de ESTE dispositivo/instalación, generado una sola vez y
 * reusado siempre después (persiste en `meta`, sobrevive a que cambie de
 * caja física/registerId). Antes el prefijo era directamente el
 * `registerId`, asumiendo que identifica una tablet -- pero dos tablets
 * pueden terminar operando bajo el mismo registerId, y si el storage local
 * de una tablet se borra (reinstalar la PWA, limpiar datos) su contador
 * vuelve a 1 mientras el servidor ya tiene ticketNumbers viejos con ese
 * mismo registerId, chocando contra la restricción única. Un prefijo
 * aleatorio por dispositivo hace esa colisión prácticamente imposible sin
 * depender de que el registerId sea realmente único. */
async function getDevicePrefix(): Promise<number> {
  const key = 'devicePrefix';
  const row = await cajaDB.meta.get(key);
  if (row?.value) return Number(row.value);
  const prefix = 1000 + Math.floor(Math.random() * 9000); // 1000-9999
  await cajaDB.meta.put({ key, value: prefix });
  return prefix;
}

/** Número de comanda de cocina, generado EN LA TABLET al confirmar la venta
 * (nunca por el servidor -- así funciona sin señal). El correlativo se
 * lleva acá, en `meta`, prefijado con el ID aleatorio propio del
 * dispositivo (`getDevicePrefix`) -- los dos últimos dígitos visibles
 * siguen siendo correlativos y son los que se leen en pantalla en /cocina. */
export async function nextKitchenTicketNumber(): Promise<string> {
  const prefix = await getDevicePrefix();
  const key = `kitchenCounter:${prefix}`;
  const row = await cajaDB.meta.get(key);
  const next = (Number(row?.value) || 0) + 1;
  await cajaDB.meta.put({ key, value: next });
  return formatKitchenTicketNumber(prefix, next);
}

/** Número de percha de guardarropía, generado EN LA TABLET al confirmar la
 * venta -- mismo patrón que `nextKitchenTicketNumber` (contador propio en
 * `meta`, prefijado con el mismo ID aleatorio del dispositivo). */
export async function nextLockerTagNumber(): Promise<string> {
  const prefix = await getDevicePrefix();
  const key = `lockerCounter:${prefix}`;
  const row = await cajaDB.meta.get(key);
  const next = (Number(row?.value) || 0) + 1;
  await cajaDB.meta.put({ key, value: next });
  return formatLockerTagNumber(prefix, next);
}
