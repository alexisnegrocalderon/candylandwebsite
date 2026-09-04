import Dexie, { type Table } from 'dexie';
import { formatKitchenTicketNumber } from '@shared/kitchen';
import { formatLockerTagNumber } from '@shared/locker';

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
  /** Titular + acompañantes, cada uno con su propio nombre y RUT -- es lo
   * que el anfitrión compara persona por persona contra la cédula en la
   * puerta. `rut` es `null` si esa persona no lo tiene capturado. */
  attendees: { name: string; rut: string | null }[];
  access: { ticketCode: string; status: string; typeName: string; accesoSlug: string | null; groupSize: number | null }[];
  extras: { displayCode: string | null; status: string; typeName: string }[];
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
  | { opId: string; type: 'checkin'; ticketCode: string; clientAt: string }
  | { opId: string; type: 'parking_paid'; ticketCode: string; paymentMethod: 'efectivo' | 'debito' | 'credito'; clientAt: string }
  | {
      opId: string; type: 'sale'; items: { ticketTypeId: number; quantity: number }[];
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
  status: 'pending' | 'synced' | 'error';
  result?: string;
  conflictNote?: string;
  createdAt: number;
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
  serverTime: string;
}) {
  await cajaDB.transaction('rw', [cajaDB.attendees, cajaDB.codes, cajaDB.catalog, cajaDB.gifts, cajaDB.staffComps, cajaDB.meta], async () => {
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
  });
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

  const all = await cajaDB.attendees.toArray();
  return all
    .filter((a) => a.access.some((acc) => acc.status === 'used'))
    .filter((a) => a.buyerName.toLowerCase().includes(q) || a.attendees.some((p) => p.name.toLowerCase().includes(q)))
    .slice(0, 20);
}

export async function getLocalCatalog(): Promise<CajaCatalogItem[]> {
  return cajaDB.catalog.toArray();
}

/** Encola una operación offline y actualiza el estado local al instante
 * (UI optimista, §6.3) -- la cajera nunca espera a la red. */
export async function enqueueOp(op: QueuedOp) {
  await cajaDB.opsQueue.add({ opId: op.opId, op, status: 'pending', createdAt: Date.now() });

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
