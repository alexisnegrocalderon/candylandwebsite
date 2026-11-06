import { describe, expect, it } from 'vitest';
import { computeWebNet, paidThroughMercadoPago, type NetOrder } from './mpNet';

const web = (total: number, paymentId: string | null, paymentMethod: string | null = 'visa'): NetOrder => ({ total, channel: 'web', paymentMethod, paymentId });

describe('lo que llega a la cuenta (Ventas Web)', () => {
  it('el caso real: $44.000 cobrados, Mercado Pago informa $42.328 → se queda $1.672 (3,8 %)', () => {
    const r = computeWebNet([web(44000, '188046742156')], new Map([['188046742156', 1672]]), 3.5);
    expect(r.gross).toBe(44000);
    expect(r.fee).toBe(1672);
    expect(r.net).toBe(42328);
    expect(r.feePercent).toBe(3.8);
    expect(r.realCount).toBe(1);
    expect(r.estimatedCount).toBe(0);
    expect(r.estimateSource).toBeNull();
  });

  it('un pago que Mercado Pago todavía no informó se estima con el % de Ajustes si hay pocos reales', () => {
    const r = computeWebNet([web(44000, '1'), web(10000, '2')], new Map([['1', 1672]]), 3.5);
    expect(r.fee).toBe(1672 + 350);
    expect(r.estimatedCount).toBe(1);
    expect(r.estimateSource).toBe('ajustes');
  });

  it('con 5 o más pagos reales, lo no informado se estima con el % que Mercado Pago viene cobrando de verdad', () => {
    const real = new Map<string, number>();
    const orders: NetOrder[] = [];
    for (let i = 0; i < 5; i++) { real.set(`p${i}`, 380); orders.push(web(10000, `p${i}`)); } // 3,8 %
    orders.push(web(20000, 'nuevo'));
    const r = computeWebNet(orders, real, 3.5);
    expect(r.realCount).toBe(5);
    expect(r.fee).toBe(5 * 380 + 760); // el nuevo, a 3,8 %
    expect(r.estimateSource).toBe('real');
    expect(r.net).toBe(70000 - r.fee);
  });

  it('lo que no pasó por Mercado Pago (invitaciones, transferencias manuales) no paga comisión', () => {
    const r = computeWebNet([
      web(44000, '1'),
      { total: 30000, channel: 'web', paymentMethod: 'Manual: Transferencia', paymentId: null },
      { total: 15000, channel: 'import', paymentMethod: 'Importado - ticketera anterior', paymentId: null },
    ], new Map([['1', 1672]]), 3.5);
    expect(r.gross).toBe(89000);
    expect(r.fee).toBe(1672);
    expect(r.net).toBe(87328);
    expect(r.notMercadoPago).toBe(45000);
    expect(r.feePercent).toBe(3.8); // sobre lo que sí pasó por Mercado Pago
  });

  it('las compras de $0 (cortesías) no cuentan', () => {
    const r = computeWebNet([web(0, null)], new Map(), 3.5);
    expect(r).toMatchObject({ gross: 0, fee: 0, net: 0, estimatedCount: 0 });
  });

  it('sin ninguna venta todo es cero', () => {
    expect(computeWebNet([], new Map(), 3.5)).toMatchObject({ gross: 0, fee: 0, net: 0, feePercent: 0 });
  });

  it('mismo criterio que el P&L: la web cuenta; lo manual y la caja no', () => {
    expect(paidThroughMercadoPago({ channel: 'web', paymentMethod: 'visa' })).toBe(true);
    expect(paidThroughMercadoPago({ channel: 'web', paymentMethod: 'Manual: Invitación especial' })).toBe(false);
    expect(paidThroughMercadoPago({ channel: 'web', paymentMethod: 'Prueba' })).toBe(false);
    expect(paidThroughMercadoPago({ channel: 'caja', paymentMethod: 'debito' })).toBe(false);
  });
});

import { cardFeeBaseFromOrders, cardFeeForOrders, type CardFeeOrder } from './mpNet';

describe('comisión de tarjeta del evento (resultado)', () => {
  const caja = (total: number, paymentMethod: string): CardFeeOrder => ({ total, channel: 'caja', paymentMethod, paymentId: null });

  it('la base es la misma de siempre: web por Mercado Pago + caja con tarjeta; sin manuales ni efectivo; con el copago de Misión 300', () => {
    const rows: CardFeeOrder[] = [
      web(44000, '1'),
      { ...web(10000, '2'), missionTopupStatus: 'paid', missionTopupAmount: 5000 },
      { total: 20000, channel: 'web', paymentMethod: 'Manual: Invitación especial', paymentId: null },
      caja(8000, 'debito'), caja(2000, 'qr'), caja(5000, 'efectivo'),
    ];
    expect(cardFeeBaseFromOrders(rows)).toBe(44000 + 15000 + 8000 + 2000);
  });

  it('la web usa la comisión REAL de Mercado Pago; la caja con tarjeta, el % de Ajustes', () => {
    const rows = [web(44000, '188046742156'), caja(10000, 'debito')];
    const r = cardFeeForOrders(rows, new Map([['188046742156', 1672]]), 3.5);
    expect(r.base).toBe(54000);
    expect(r.amount).toBe(1672 + 350); // real en la web + 3,5 % de $10.000 en la caja
  });

  it('con la comisión real el resultado difiere del estimado fijo (3,5 %): es más exacto', () => {
    const rows = [web(44000, '188046742156')];
    expect(cardFeeForOrders(rows, new Map([['188046742156', 1672]]), 3.5).amount).toBe(1672);
    expect(Math.round(44000 * 3.5 / 100)).toBe(1540); // la estimación de antes se quedaba corta por $132
  });

  it('sin datos reales todo se estima con el % de Ajustes, como antes', () => {
    const rows = [web(44000, 'x'), caja(10000, 'credito')];
    expect(cardFeeForOrders(rows, new Map(), 3.5).amount).toBe(Math.round(54000 * 3.5 / 100));
  });

  it('el copago de Misión 300 se estima al % que Mercado Pago viene cobrando', () => {
    const rows: CardFeeOrder[] = [{ ...web(44000, '1'), missionTopupStatus: 'paid', missionTopupAmount: 10000 }];
    const r = cardFeeForOrders(rows, new Map([['1', 1672]]), 3.5);
    expect(r.amount).toBe(1672 + 380); // 3,8 % de $10.000
  });
});
