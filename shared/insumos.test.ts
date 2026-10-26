import { describe, expect, it } from 'vitest';
import {
  consumoDeVenta, conteoATotal, descuadre, descuadreAlerts, formatCantidad, insumoRitmoAlerts, insumoStockAlerts,
  listaComprasTexto, nivelInsumo, proyeccionCompra, stockActual, tragosDisponibles, tragosPorInsumo, type Insumo, type RecetaLinea,
} from './insumos';

const ron: Insumo = { id: 1, name: 'Ron', unit: 'ml', containerSize: 750, containerLabel: 'botella', costPerContainer: 8000, alertDrinks: 15 };
const coca: Insumo = { id: 2, name: 'Coca-Cola', unit: 'ml', containerSize: 3000, containerLabel: 'botella', costPerContainer: 3000, alertDrinks: 10 };
const limon: Insumo = { id: 3, name: 'Limón', unit: 'un', containerSize: 1, containerLabel: 'unidad', costPerContainer: 150, alertDrinks: 0 };

// Cuba libre (1) y Mojito (2) comparten el ron.
const recetas: RecetaLinea[] = [
  { ticketTypeId: 1, insumoId: 1, amount: 60 },
  { ticketTypeId: 1, insumoId: 2, amount: 150 },
  { ticketTypeId: 2, insumoId: 1, amount: 45 },
  { ticketTypeId: 2, insumoId: 3, amount: 1 },
];

describe('consumoDeVenta', () => {
  it('suma en un solo movimiento la base que comparten dos tragos', () => {
    const out = consumoDeVenta([{ ticketTypeId: 1, quantity: 2 }, { ticketTypeId: 2, quantity: 3 }], recetas);
    expect(out).toEqual(expect.arrayContaining([
      { insumoId: 1, delta: -(120 + 135) },
      { insumoId: 2, delta: -300 },
      { insumoId: 3, delta: -3 },
    ]));
    expect(out).toHaveLength(3);
  });

  it('un producto sin receta no descuenta nada', () => {
    expect(consumoDeVenta([{ ticketTypeId: 99, quantity: 5 }], recetas)).toEqual([]);
  });
});

describe('stock y tragos disponibles', () => {
  const stock = stockActual([
    { insumoId: 1, delta: 1500 }, { insumoId: 1, delta: '-255' }, { insumoId: 1, delta: 60 }, // venta y anulación
    { insumoId: 2, delta: 3000 }, { insumoId: 3, delta: 4 },
  ]);

  it('el stock es la suma del libro', () => {
    expect(stock.get(1)).toBe(1305);
  });

  it('el insumo que se acaba primero manda', () => {
    expect(tragosDisponibles(recetas.filter((r) => r.ticketTypeId === 1), stock)).toEqual({ drinks: 20, limitingInsumoId: 2 });
    expect(tragosDisponibles(recetas.filter((r) => r.ticketTypeId === 2), stock)).toEqual({ drinks: 4, limitingInsumoId: 3 });
    expect(tragosDisponibles([], stock)).toBeNull();
  });

  it('nunca da negativo', () => {
    expect(tragosDisponibles([{ insumoId: 1, amount: 60 }], new Map([[1, -50]]))?.drinks).toBe(0);
  });

  it('tragos por insumo usa el promedio de las recetas que lo usan', () => {
    expect(tragosPorInsumo(1, 1050, recetas)).toBe(20); // 1050 / 52.5
    expect(tragosPorInsumo(42, 1000, recetas)).toBeNull();
  });

  it('semáforo', () => {
    expect(nivelInsumo(0, 15)).toBe('agotado');
    expect(nivelInsumo(5, 15)).toBe('bajo');
    expect(nivelInsumo(30, 15)).toBe('ok');
    expect(nivelInsumo(null, 15)).toBe('sin_uso');
  });
});

describe('conteo', () => {
  it('cerradas + fracción de la abierta', () => {
    expect(conteoATotal(3, 0.5, 750)).toBe(2625);
    expect(conteoATotal(0, 0.25, 750)).toBe(187.5);
    expect(conteoATotal(2, 3 / 10, 750)).toBe(1725); // 2 cerradas + 3/10 de la abierta
    expect(conteoATotal(-2, 3, 750)).toBe(750);
  });

  it('descuadre negativo = falta', () => {
    expect(descuadre(2000, 1800)).toEqual({ diff: -200, pct: -10 });
    expect(descuadre(0, 0)).toEqual({ diff: 0, pct: 0 });
  });

  it('formato legible', () => {
    expect(formatCantidad(2625, ron)).toBe('3 botellas + 375 ml');
    expect(formatCantidad(750, ron)).toBe('1 botella');
    expect(formatCantidad(300, ron)).toBe('300 ml');
    expect(formatCantidad(12, limon)).toBe('12 un');
    expect(formatCantidad(-40, ron)).toBe('−40 ml');
  });
});

describe('proyeccionCompra', () => {
  const base = {
    historico: [
      { personas: 100, ventas: [{ name: 'Cuba Libre', quantity: 150 }, { name: 'Mojito', quantity: 50 }] },
      { personas: 100, ventas: [{ name: 'cuba libre', quantity: 150 }, { name: 'Mojito ', quantity: 50 }, { name: 'Cerveza', quantity: 200 }] },
    ],
    productos: [
      { id: 1, name: 'Cuba Libre', receta: recetas.filter((r) => r.ticketTypeId === 1) },
      { id: 2, name: 'Mojito', receta: recetas.filter((r) => r.ticketTypeId === 2) },
    ],
    insumos: [ron, coca, limon],
    stock: new Map([[1, 7500], [2, 0], [3, 20]]),
    personasObjetivo: 300,
  };

  it('escala tragos por persona y mix de esta carta a 300 personas', () => {
    const p = proyeccionCompra(base);
    expect(p.tragosPorPersona).toBe(3); // 600 vendidos / 200 personas (incluye la cerveza)
    expect(p.totalTragos).toBe(900);
    expect(p.productos.find((x) => x.id === 1)?.quantity).toBe(675); // 75 % de 900
    expect(p.productos.find((x) => x.id === 2)?.quantity).toBe(225);
    const r = p.insumos.find((i) => i.insumoId === 1)!;
    expect(r.need).toBe(675 * 60 + 225 * 45);
    expect(r.missing).toBe(r.need - 7500);
    expect(r.containersToBuy).toBe(Math.ceil(r.missing / 750));
    expect(r.cost).toBe(r.containersToBuy * 8000);
    expect(p.sinHistorial).toEqual([]);
  });

  it('respeta cantidades a mano y el factor', () => {
    const p = proyeccionCompra({ ...base, factor: 1.1, overrides: { 2: 100 } });
    expect(p.totalTragos).toBe(990);
    expect(p.productos.find((x) => x.id === 2)?.quantity).toBe(100);
    expect(p.productos.find((x) => x.id === 1)?.quantity).toBe(890);
  });

  it('sin historial reparte parejo con los tragos por persona dados', () => {
    const p = proyeccionCompra({ ...base, historico: [], tragosPorPersona: 2 });
    expect(p.totalTragos).toBe(600);
    expect(p.productos.every((x) => x.quantity === 300)).toBe(true);
    expect(p.sinHistorial).toHaveLength(2);
  });

  it('no compra lo que ya hay', () => {
    const p = proyeccionCompra({ ...base, stock: new Map([[1, 1e6], [2, 1e6], [3, 1e6]]) });
    expect(p.insumos.every((i) => i.containersToBuy === 0)).toBe(true);
    expect(listaComprasTexto(p, base.insumos, 300)).toContain('no falta nada');
  });

  it('texto para WhatsApp', () => {
    const txt = listaComprasTexto(proyeccionCompra(base), base.insumos, 300);
    expect(txt).toContain('300 personas');
    expect(txt).toMatch(/Ron: \d+ botellas/);
  });
});

describe('alertas', () => {
  it('avisa al cruzar "alcanza para menos de N tragos", no después', () => {
    const cross = insumoStockAlerts([{ insumo: ron, before: 800, after: 740, reference: null }], recetas, 7);
    expect(cross.map((d) => d.kind)).toEqual(['insumo_low']);
    expect(insumoStockAlerts([{ insumo: ron, before: 700, after: 640, reference: null }], recetas, 7)).toEqual([]);
  });

  it('avisa al 25 % y al 10 % del stock de apertura', () => {
    const d = insumoStockAlerts([{ insumo: { ...ron, alertDrinks: 0 }, before: 2600, after: 2400, reference: 10000 }], recetas, 7);
    expect(d.map((x) => x.dedupeKey)).toEqual(['insumo_pct:7:1:25']);
    const both = insumoStockAlerts([{ insumo: { ...ron, alertDrinks: 0 }, before: 2600, after: 900, reference: 10000 }], recetas, 7);
    expect(both.map((x) => x.dedupeKey)).toEqual(['insumo_pct:7:1:25', 'insumo_pct:7:1:10']);
  });

  it('agotado gana sobre el resto', () => {
    const d = insumoStockAlerts([{ insumo: ron, before: 50, after: -10, reference: 10000 }], recetas, 7);
    expect(d.map((x) => x.kind)).toEqual(['insumo_out']);
  });

  it('ritmo: se acaba antes del cierre', () => {
    const now = new Date('2026-11-01T04:00:00Z');
    const d = insumoRitmoAlerts([{ insumo: ron, stock: 1500, usedLastWindow: 1500 }], 120, 7, now);
    expect(d).toHaveLength(1);
    expect(insumoRitmoAlerts([{ insumo: ron, stock: 1500, usedLastWindow: 500 }], 120, 7, now)).toEqual([]);
    expect(insumoRitmoAlerts([{ insumo: ron, stock: 1500, usedLastWindow: 1500 }], 0, 7, now)).toEqual([]);
  });

  it('descuadre: solo faltantes grandes', () => {
    const lines = [
      { insumo: ron, expected: 3000, counted: 2500 }, // falta 500 ml, 16 %
      { insumo: coca, expected: 6000, counted: 5900 }, // falta poco
      { insumo: limon, expected: 10, counted: 14 }, // sobra
    ];
    const d = descuadreAlerts(lines, 55, 'Ana', 7);
    expect(d).toHaveLength(1);
    expect(d[0].body).toContain('Ron');
    expect(d[0].body).not.toContain('Coca');
    expect(descuadreAlerts([lines[1]], 55, 'Ana', 7)).toEqual([]);
  });
});

describe('botellas de distintos tamaños', () => {
  it('los tamaños del insumo incluyen el de compra, ordenados', async () => {
    const { insumoSizes } = await import('./insumos');
    expect(insumoSizes({ containerSize: 750, sizes: [1500, 1000] })).toEqual([750, 1000, 1500]);
    expect(insumoSizes({ containerSize: 750, sizes: null })).toEqual([750]);
  });

  it('el conteo suma cerradas por tamaño y abiertas con su propio tamaño', async () => {
    const { detalleATotal } = await import('./insumos');
    const total = detalleATotal({
      closed: [{ size: 750, count: 2 }, { size: 1000, count: 1 }, { size: 1500, count: 3 }],
      open: [{ size: 750, portions: 5 }, { size: 1500, portions: 2 }],
    });
    expect(total).toBe(1500 + 1000 + 4500 + 375 + 300);
  });

  it('formato y nota de compra', async () => {
    const { formatSize, describirBotellas } = await import('./insumos');
    expect(formatSize(750, 'ml')).toBe('750 ml');
    expect(formatSize(1000, 'ml')).toBe('1 L');
    expect(formatSize(1500, 'ml')).toBe('1,5 L');
    expect(describirBotellas([{ size: 750, count: 2 }, { size: 1500, count: 0 }, { size: 1000, count: 1 }], 'ml')).toBe('2 × 750 ml, 1 × 1 L');
  });
});

describe('vaso de cada trago', () => {
  // Mojito sale en vaso de 500 ml; el espumante en copa de 400 ml.
  const carta: RecetaLinea[] = [
    { ticketTypeId: 2, insumoId: 1, amount: 60, glass: 'vaso' },
    { ticketTypeId: 2, insumoId: 2, amount: 200, glass: 'vaso' },
    { ticketTypeId: 5, insumoId: 4, amount: 150, glass: 'copa' },
    { ticketTypeId: 6, insumoId: 1, amount: 30 }, // recetas de antes (sin vaso): vaso
  ];

  it('cada trago descuenta su propia receta, sea cual sea su vaso', () => {
    expect(consumoDeVenta([{ ticketTypeId: 5, quantity: 2 }], carta)).toEqual([{ insumoId: 4, delta: -300 }]);
    expect(consumoDeVenta([{ ticketTypeId: 2, quantity: 1 }, { ticketTypeId: 6, quantity: 2 }], carta).find((c) => c.insumoId === 1)?.delta).toBe(-120);
  });

  it('el vaso de un trago sale de su receta (vaso si no dice)', async () => {
    const { recetaDe } = await import('./insumos');
    expect(recetaDe(carta, 5).glass).toBe('copa');
    expect(recetaDe(carta, 2).glass).toBe('vaso');
    expect(recetaDe(carta, 6).glass).toBe('vaso');
    expect(recetaDe(carta, 99).lines).toEqual([]);
  });

  it('suma los ml de la receta contra la capacidad del vaso', async () => {
    const { mlDeReceta, glassInfo } = await import('./insumos');
    const unit = (id: number) => (id === 3 ? 'un' : 'ml') as 'ml' | 'un';
    expect(mlDeReceta([{ insumoId: 1, amount: 60 }, { insumoId: 2, amount: 200 }, { insumoId: 3, amount: 1 }], unit)).toBe(260);
    expect(glassInfo('vaso')?.ml).toBe(500);
    expect(glassInfo('copa')?.ml).toBe(400);
    expect(glassInfo('shot')?.ml).toBe(30);
    expect(glassInfo(null)?.id).toBe('vaso');
  });
});

describe('jigger', () => {
  it('1 jigger son 30 ml y las recetas se guardan en ml', async () => {
    const { JIGGER_ML, jiggersAMl, mlAJiggers, esJiggerExacto, formatPorcion } = await import('./insumos');
    expect(JIGGER_ML).toBe(30);
    expect(jiggersAMl(1.5)).toBe(45);
    expect(jiggersAMl(0.25)).toBe(7.5);
    expect(mlAJiggers(60)).toBe(2);
    expect(esJiggerExacto(45)).toBe(true);
    expect(esJiggerExacto(200)).toBe(false);
    expect(formatPorcion(45, 'ml')).toBe('1,5 jiggers (45 ml)');
    expect(formatPorcion(30, 'ml')).toBe('1 jigger (30 ml)');
    expect(formatPorcion(200, 'ml')).toBe('200 ml');
    expect(formatPorcion(2, 'un')).toBe('2 un');
  });
});
