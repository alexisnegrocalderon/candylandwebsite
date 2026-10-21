import { describe, expect, it } from 'vitest';
import { buildHomeAlerts } from './homeAlerts';

describe('buildHomeAlerts', () => {
  it('sin nada que avisar devuelve lista vacía', () => {
    expect(buildHomeAlerts({})).toEqual([]);
    expect(buildHomeAlerts({ tickets: [{ name: 'Dúo', remaining: 80, total: 100 }], emailDaily: { remaining: 900, cap: 1000 } })).toEqual([]);
  });

  it('ordena por gravedad y respeta el orden dentro de cada nivel', () => {
    const a = buildHomeAlerts({
      badges: { instagram: 2, denuncias: 1 },
      cashPending: 3,
      siiNext: { title: 'F29 de octubre', daysLeft: 1, status: 'pendiente', kind: 'f29' },
    });
    expect(a.map((x) => x.id)).toEqual(['sii', 'denuncias', 'cash-pending', 'ig']);
    expect(a.map((x) => x.level)).toEqual(['danger', 'danger', 'warning', 'info']);
  });

  it('el F29 avisa 5 días antes, hoy y vencido; no avisa si ya está declarado o falta mucho', () => {
    const f = (daysLeft: number, status: string | null = 'pendiente') => buildHomeAlerts({ siiNext: { title: 'F29', daysLeft, status, kind: 'f29' } });
    expect(f(10)).toEqual([]);
    expect(f(5)[0]).toMatchObject({ level: 'warning', text: 'F29 vence en 5 días.' });
    expect(f(0)[0]).toMatchObject({ level: 'danger', text: 'Hoy vence F29.' });
    expect(f(-3)[0]).toMatchObject({ level: 'danger', text: 'F29 venció hace 3 días.' });
    expect(f(2, 'declarado')).toEqual([]);
  });

  it('avisa entradas por agotarse (≤10 o ≥90 % vendido) y agotadas, pero no las ocultas', () => {
    const a = buildHomeAlerts({ tickets: [
      { name: 'Dúo', remaining: 8, total: 100 },
      { name: 'Grupo', remaining: 0, total: 40 },
      { name: 'Soltera', remaining: 30, total: 150 },
      { name: 'Trío', remaining: 5, total: 50, status: 'hidden' },
    ] });
    expect(a.map((x) => x.text)).toEqual(['Dúo: quedan 8 (92% vendido).', 'Grupo: agotada.']);
  });

  it('cupo de correos: avisa con 10 % o menos', () => {
    expect(buildHomeAlerts({ emailDaily: { remaining: 100, cap: 1000 } })[0]).toMatchObject({ level: 'warning' });
    expect(buildHomeAlerts({ emailDaily: { remaining: 0, cap: 1000 } })[0]).toMatchObject({ level: 'danger' });
  });

  it('limita la cantidad y usa el singular cuando es 1', () => {
    const a = buildHomeAlerts({ cashPending: 1, badges: { instagram: 1 } });
    expect(a.map((x) => x.text)).toEqual(['1 movimiento de Mercado Pago o banco por clasificar.', '1 chat de Instagram sin leer.']);
    const many = buildHomeAlerts({ liveAlerts: Array.from({ length: 20 }, () => ({ level: 'info' as const, text: 'x' })) }, 5);
    expect(many).toHaveLength(5);
  });
});
