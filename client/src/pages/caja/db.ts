import Dexie, { type Table } from 'dexie';

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
  access: { ticketCode: string; status: string; typeName: string }[];
  extras: { displayCode: string | null; status: string; typeName: string }[];
}

export interface CajaCatalogItem {
  id: number;
  name: string;
  price: number;
  color: string | null;
  internalCode: string | null;
}

interface CajaCodeIndex {
  code: string; // ticketCode o displayCode, en mayúsculas
  orderId: number;
}

export type QueuedOp =
  | { opId: string; type: 'redeem'; displayCode: string; clientAt: string }
  | { opId: string; type: 'sale'; items: { ticketTypeId: number; quantity: number }[]; paymentMethod: 'efectivo' | 'debito' | 'credito'; clientAt: string };

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
  }
}

export const cajaDB = new CajaDexie();

export async function saveSnapshot(snapshot: {
  event: { id: number; title: string; slug: string };
  attendees: CajaAttendee[];
  catalog: CajaCatalogItem[];
  serverTime: string;
}) {
  await cajaDB.transaction('rw', cajaDB.attendees, cajaDB.codes, cajaDB.catalog, cajaDB.meta, async () => {
    await cajaDB.attendees.clear();
    await cajaDB.codes.clear();
    await cajaDB.catalog.clear();
    await cajaDB.attendees.bulkAdd(snapshot.attendees);

    const codes: CajaCodeIndex[] = [];
    for (const a of snapshot.attendees) {
      for (const acc of a.access) codes.push({ code: acc.ticketCode.toUpperCase(), orderId: a.orderId });
      for (const ex of a.extras) if (ex.displayCode) codes.push({ code: ex.displayCode.toUpperCase(), orderId: a.orderId });
    }
    await cajaDB.codes.bulkAdd(codes);
    await cajaDB.catalog.bulkAdd(snapshot.catalog);
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

export async function getLocalCatalog(): Promise<CajaCatalogItem[]> {
  return cajaDB.catalog.toArray();
}

/** Encola una operación offline y actualiza el estado local al instante
 * (UI optimista, §6.3) -- la cajera nunca espera a la red. */
export async function enqueueOp(op: QueuedOp) {
  await cajaDB.opsQueue.add({ opId: op.opId, op, status: 'pending', createdAt: Date.now() });

  if (op.type === 'redeem') {
    const idx = await cajaDB.codes.get(op.displayCode.toUpperCase());
    if (idx) {
      const attendee = await cajaDB.attendees.get(idx.orderId);
      if (attendee) {
        attendee.extras = attendee.extras.map((e) =>
          e.displayCode?.toUpperCase() === op.displayCode.toUpperCase() ? { ...e, status: 'used' } : e
        );
        await cajaDB.attendees.put(attendee);
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
