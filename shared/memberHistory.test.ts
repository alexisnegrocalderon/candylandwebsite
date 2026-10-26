import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, formatHistoryAmount, formatHistoryBalance, historyDayKey, historyDayLabel, matchesFilter, mergeHistory, playcoinsTitle, prepaidTitle, sourcesFor, summarizeItems, type HistoryItem } from './memberHistory';

const item = (id: string, at: string, kind: HistoryItem['kind'] = 'compra', extra: Partial<HistoryItem> = {}): HistoryItem => ({ id, at, kind, title: id, ...extra });

describe('etiquetas', () => {
  it('el saldo y los Playcoins se explican en lenguaje de cliente', () => {
    expect(prepaidTitle('topup_web')).toBe('Recargaste saldo');
    expect(prepaidTitle('spend_caja')).toBe('Pagaste con tu saldo');
    expect(playcoinsTitle('earn_web', 100)).toBe('Ganaste Playcoins por tu compra');
    expect(playcoinsTitle('redeem_caja', -500)).toBe('Canjeaste Playcoins en caja');
  });
  it('un ajuste manual nunca deja ver la nota interna: solo una etiqueta fija', () => {
    expect(prepaidTitle('manual_adjust')).toBe('Ajuste de tu saldo');
    expect(playcoinsTitle('manual_adjust', 300)).toBe('Playcoins de regalo');
    expect(playcoinsTitle('manual_adjust', -300)).toBe('Ajuste de tus Playcoins');
    expect(prepaidTitle('algo_raro')).toBe('Ajuste de tu saldo');
  });
  it('resume los ítems sumando los repetidos', () => {
    expect(summarizeItems([{ name: 'Dúo', quantity: 2 }, { name: 'Estacionamiento', quantity: 1 }, { name: 'Dúo', quantity: 1 }])).toBe('3× Dúo · 1× Estacionamiento');
    expect(summarizeItems([{ name: ' ', quantity: 1 }, { name: 'Piscola', quantity: 0 }])).toBe('');
  });
});

describe('filtros', () => {
  it('cada filtro deja sus tipos, y un cobro con saldo también cuenta como compra', () => {
    expect(matchesFilter({ kind: 'saldo' }, 'saldo')).toBe(true);
    expect(matchesFilter({ kind: 'saldo' }, 'compras')).toBe(false);
    expect(matchesFilter({ kind: 'saldo', alsoIn: ['compra'] }, 'compras')).toBe(true);
    expect(matchesFilter({ kind: 'ingreso' }, 'canjes')).toBe(true);
    expect(matchesFilter({ kind: 'guardarropia' }, 'canjes')).toBe(true);
    expect(matchesFilter({ kind: 'playcoins' }, 'canjes')).toBe(false);
    expect(matchesFilter({ kind: 'playcoins' }, 'todo')).toBe(true);
  });
  it('solo se leen las fuentes que el filtro necesita', () => {
    expect(sourcesFor('playcoins')).toEqual({ orders: false, prepaid: false, playcoins: true, uses: false, onSite: false });
    expect(sourcesFor('canjes')).toMatchObject({ uses: true, onSite: true, orders: false });
    expect(sourcesFor('todo')).toEqual({ orders: true, prepaid: true, playcoins: true, uses: true, onSite: true });
  });
});

describe('mezcla y paginación', () => {
  const a = [item('o1', '2026-10-20T20:00:00Z'), item('o2', '2026-10-10T20:00:00Z')];
  const b = [item('p1', '2026-10-25T20:00:00Z', 'saldo'), item('p2', '2026-10-15T20:00:00Z', 'saldo')];
  it('ordena todo del más nuevo al más viejo', () => {
    expect(mergeHistory([a, b]).items.map((i) => i.id)).toEqual(['p1', 'o1', 'p2', 'o2']);
  });
  it('aplica el filtro', () => {
    expect(mergeHistory([a, b], { filter: 'saldo' }).items.map((i) => i.id)).toEqual(['p1', 'p2']);
  });
  it('no repite una fila que llega por dos fuentes', () => {
    expect(mergeHistory([a, a]).items).toHaveLength(2);
  });
  it('pagina con cursor sin perder ni repetir filas que empatan en la fecha', () => {
    const same = [item('a', '2026-10-01T10:00:00Z'), item('b', '2026-10-01T10:00:00Z'), item('c', '2026-10-01T10:00:00Z'), item('d', '2026-09-30T10:00:00Z')];
    const p1 = mergeHistory([same], { limit: 2 });
    expect(p1.items.map((i) => i.id)).toEqual(['c', 'b']);
    expect(p1.next).not.toBeNull();
    const p2 = mergeHistory([same], { limit: 2, cursor: p1.next });
    expect(p2.items.map((i) => i.id)).toEqual(['a', 'd']);
    expect(p2.next).toBeNull();
  });
  it('cursor roto: se ignora y entrega la primera página', () => {
    expect(decodeCursor('basura')).toBeNull();
    expect(decodeCursor('no-fecha|x')).toBeNull();
    expect(mergeHistory([a], { cursor: 'basura' }).items).toHaveLength(2);
  });
  it('el cursor lleva fecha e id', () => {
    const c = encodeCursor({ at: '2026-10-01T10:00:00Z', id: 'x|y' });
    expect(decodeCursor(c)).toEqual({ at: '2026-10-01T10:00:00Z', id: 'x|y' });
  });
});

describe('cómo se muestra', () => {
  it('agrupa por día en hora de Chile (de noche en Chile ya es el día siguiente en UTC)', () => {
    expect(historyDayKey('2026-10-24T23:30:00-03:00')).toBe('2026-10-24');
    expect(historyDayKey('2026-10-25T02:30:00Z')).toBe('2026-10-24');
    expect(historyDayKey('2026-10-25T04:00:00Z')).toBe('2026-10-25');
  });
  it('rotula Hoy, Ayer y el resto con su fecha', () => {
    const now = new Date('2026-10-25T15:00:00Z');
    expect(historyDayLabel('2026-10-25', now)).toBe('Hoy');
    expect(historyDayLabel('2026-10-24', now)).toBe('Ayer');
    expect(historyDayLabel('2026-10-20', now)).toMatch(/20 oct/);
    expect(historyDayLabel('2025-12-31', now)).toMatch(/2025/);
  });
  it('da formato a montos y saldos', () => {
    expect(formatHistoryAmount(20000, 'clp')).toBe('+$20.000');
    expect(formatHistoryAmount(-16000, 'clp')).toBe('−$16.000');
    expect(formatHistoryAmount(640, 'pc')).toBe('+640 pc');
    expect(formatHistoryAmount(null, 'clp')).toBeNull();
    expect(formatHistoryAmount(5, null)).toBeNull();
    expect(formatHistoryBalance(4000, 'clp')).toBe('Saldo $4.000');
    expect(formatHistoryBalance(420, 'pc')).toBe('Saldo 420 pc');
    expect(formatHistoryBalance(undefined, 'pc')).toBeNull();
  });
});
