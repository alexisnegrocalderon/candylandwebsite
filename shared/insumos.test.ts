import { describe, expect, it } from 'vitest';
import {
  pasosSugeridos, pasosDeMetadata, fotoDeMetadata, metadataConPreparacion,
  metadataConOpciones, opcionesDeMetadata,
  productoSinInsumos, metadataConSinInsumos,
  consumoDeVenta, diagnosticoProducto, idSustitucion, sugerirReemplazos, sustitucionesDe, conteoATotal, descuadre, descuadreAlerts, formatCantidad, insumoRitmoAlerts, insumoStockAlerts,
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
    expect(p.cobertura).toBeCloseTo(2 / 3, 2); // la cerveza no está en esta carta: un tercio de lo vendido no cuenta
    expect(p.totalTragos).toBe(600);
    expect(p.productos.find((x) => x.id === 1)?.quantity).toBe(450); // 75 % de 600
    expect(p.productos.find((x) => x.id === 2)?.quantity).toBe(150);
    const r = p.insumos.find((i) => i.insumoId === 1)!;
    expect(r.need).toBe(450 * 60 + 150 * 45);
    expect(r.missing).toBe(r.need - 7500);
    expect(r.containersToBuy).toBe(Math.ceil(r.missing / 750));
    expect(r.cost).toBe(r.containersToBuy * 8000);
    expect(p.sinHistorial).toEqual([]);
  });

  it('respeta cantidades a mano y el factor', () => {
    const p = proyeccionCompra({ ...base, factor: 1.1, overrides: { 2: 100 } });
    expect(p.totalTragos).toBe(660); // 600 de esta carta + 10 % de margen
    expect(p.productos.find((x) => x.id === 2)?.quantity).toBe(100);
    expect(p.productos.find((x) => x.id === 1)?.quantity).toBe(560);
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

describe('proyección con cantidades fijadas a mano', () => {
  it('si fijas todos los tragos, el total es lo que sumaste', () => {
    const productos = [
      { id: 1, name: 'A', receta: [{ insumoId: 1, amount: 60 }] },
      { id: 2, name: 'B', receta: [{ insumoId: 1, amount: 90 }] },
    ];
    const p = proyeccionCompra({
      historico: [], productos, insumos: [{ id: 1, name: 'Ron', unit: 'ml', containerSize: 750, containerLabel: 'botella', costPerContainer: 8000, alertDrinks: 15 }],
      stock: new Map([[1, 1000]]), personasObjetivo: 300, tragosPorPersona: 2, overrides: { 1: 100, 2: 50 },
    });
    expect(p.totalTragos).toBe(150);
    expect(p.insumos[0].need).toBe(100 * 60 + 50 * 90);
    expect(p.insumos[0].missing).toBe(10500 - 1000);
    expect(p.insumos[0].containersToBuy).toBe(Math.ceil(9500 / 750));
  });

  it('los que no fijas se reparten el resto, parejo si no tienen historial', () => {
    const productos = [1, 2, 3].map((id) => ({ id, name: `T${id}`, receta: [{ insumoId: 1, amount: 30 }] }));
    const p = proyeccionCompra({
      historico: [], productos, insumos: [], stock: new Map(), personasObjetivo: 100, tragosPorPersona: 3, overrides: { 1: 100 },
    });
    expect(p.productos.find((x) => x.id === 1)?.quantity).toBe(100);
    expect(p.productos.find((x) => x.id === 2)?.quantity).toBe(100);
    expect(p.productos.find((x) => x.id === 3)?.quantity).toBe(100);
    expect(p.totalTragos).toBe(300);
  });
});

describe('proyección: tragos sin receta también se llevan su parte', () => {
  it('un trago popular sin receta no deja que los demás se lleven sus tragos', () => {
    const productos = [
      { id: 1, name: 'Piscolón', receta: [] as { insumoId: number; amount: number }[] }, // el más vendido, sin receta todavía
      { id: 2, name: 'Mojito', receta: [{ insumoId: 1, amount: 90 }] },
    ];
    const p = proyeccionCompra({
      historico: [{ personas: 100, ventas: [{ name: 'Piscolón', quantity: 270 }, { name: 'Mojito', quantity: 30 }] }],
      productos, insumos: [], stock: new Map(), personasObjetivo: 100,
    });
    expect(p.totalTragos).toBe(300);
    expect(p.productos.find((x) => x.id === 2)?.quantity).toBe(30); // su 10 %, no los 300
  });
});

describe('vista por botella base', () => {
  const rec: RecetaLinea[] = [
    { ticketTypeId: 1, insumoId: 10, amount: 90, glass: 'vaso' }, { ticketTypeId: 1, insumoId: 20, amount: 200, glass: 'vaso' },
    { ticketTypeId: 2, insumoId: 10, amount: 90, glass: 'vaso' },
    { ticketTypeId: 3, insumoId: 30, amount: 60, glass: 'copa' },
  ];

  it('agrega el insumo a los tragos marcados, corrige cantidades y lo quita de los desmarcados', async () => {
    const { aplicarUso } = await import('./insumos');
    const out = aplicarUso(rec, 10, [{ ticketTypeId: 1, amount: 60 }, { ticketTypeId: 3, amount: 45 }]);
    const by = (id: number) => out.find((c) => c.ticketTypeId === id)!;
    expect(by(1).lines).toEqual([{ insumoId: 20, amount: 200 }, { insumoId: 10, amount: 60 }]); // corrige 90 → 60 sin tocar la bebida
    expect(by(2).lines).toEqual([]); // dejó de usarlo
    expect(by(3)).toMatchObject({ glass: 'copa', lines: [{ insumoId: 30, amount: 60 }, { insumoId: 10, amount: 45 }] }); // conserva su vaso
    expect(out).toHaveLength(3);
  });

  it('no toca lo que no cambia, y un trago sin receta parte con el vaso de siempre', async () => {
    const { aplicarUso } = await import('./insumos');
    expect(aplicarUso(rec, 10, [{ ticketTypeId: 1, amount: 90 }, { ticketTypeId: 2, amount: 90 }])).toEqual([]);
    const nuevo = aplicarUso(rec, 10, [{ ticketTypeId: 1, amount: 90 }, { ticketTypeId: 2, amount: 90 }, { ticketTypeId: 9, amount: 30 }]);
    expect(nuevo).toEqual([{ ticketTypeId: 9, glass: 'vaso', lines: [{ insumoId: 10, amount: 30 }] }]);
    // cantidad 0 = no lo usa
    expect(aplicarUso(rec, 10, [{ ticketTypeId: 1, amount: 0 }, { ticketTypeId: 2, amount: 90 }])[0].lines).toEqual([{ insumoId: 20, amount: 200 }]);
  });
});

describe('exportar el stock', () => {
  const filas = [
    { name: 'Pisco', unit: 'ml' as const, containerSize: 1000, containerLabel: 'botella', stock: 5400, drinks: 60, level: 'ok' as const, costPerContainer: 9000 },
    { name: 'Ron', unit: 'ml' as const, containerSize: 750, containerLabel: 'botella', stock: 0, drinks: 0, level: 'agotado' as const },
    { name: 'Gin', unit: 'ml' as const, containerSize: 750, containerLabel: 'botella', stock: 300, drinks: 5, level: 'bajo' as const },
  ];

  it('el texto de WhatsApp pone primero lo urgente', async () => {
    const { stockTexto } = await import('./insumos');
    const t = stockTexto(filas, 'Stock de barra').split('\n');
    expect(t[0]).toBe('📦 Stock de barra');
    expect(t[1]).toContain('⛔ Ron');
    expect(t[2]).toContain('⚠️ Gin: 300 ml (~5 tragos)');
    expect(t[3]).toBe('✅ Pisco: 5 botellas + 400 ml (~60 tragos)');
  });

  it('el CSV trae una fila por insumo y escapa las comillas', async () => {
    const { stockCsv } = await import('./insumos');
    const csv = stockCsv([...filas, { ...filas[0], name: 'Pisco "Alto"' }]);
    expect(csv.split('\n')).toHaveLength(5);
    expect(csv).toContain('"Pisco ""Alto"""');
    expect(csv.split('\n')[1]).toContain('"Pisco","5 botellas + 400 ml","5400","60","OK","9000"');
  });
});

describe('merma de los conteos', () => {
  const insumos = [
    { id: 1, name: 'Pisco', unit: 'ml' as const, containerSize: 1000, containerLabel: 'botella', costPerContainer: 9000 },
    { id: 2, name: 'Limones', unit: 'un' as const, containerSize: 1, containerLabel: 'unidad', costPerContainer: null },
  ];
  const conteos = [
    { id: 1, kind: 'cierre', operatorName: 'Ana', createdAt: '2026-10-31T05:00:00Z', lines: [{ insumoId: 1, diff: -500 }, { insumoId: 2, diff: -3 }] },
    { id: 2, kind: 'cierre', operatorName: 'Beto', createdAt: '2026-10-31T06:00:00Z', lines: [{ insumoId: 1, diff: 200 }, { insumoId: 2, diff: 0 }] }, // sobra: no es merma
    { id: 3, kind: 'apertura', operatorName: 'Ana', createdAt: '2026-10-31T01:00:00Z', lines: [{ insumoId: 1, diff: -100 }] },
  ];

  it('suma lo que faltó con su costo, por conteo y por persona', async () => {
    const { mermaDeConteos } = await import('./insumos');
    const r = mermaDeConteos(conteos, insumos);
    const c1 = r.porConteo.find((c) => c.id === 1)!;
    expect(c1.faltantes.map((f) => [f.name, f.cantidad, f.costo])).toEqual([['Pisco', 500, 4500], ['Limones', 3, null]]);
    expect(c1.costo).toBe(4500);
    expect(r.porConteo.find((c) => c.id === 2)!.faltantes).toEqual([]);
    expect(r.porPersona[0]).toEqual({ operatorName: 'Ana', conteos: 2, faltantes: 3, costo: 5400 });
    expect(r.costoTotal).toBe(5400);
  });
});

describe('categorías de insumo', () => {
  it('agrupa por nombre y unidad', async () => {
    const { categoriaInsumo } = await import('./insumos');
    for (const n of ['Pisco Mistral 35 / Nobel', 'Ron blanco', 'Gin Beefeater', 'Whisky Johnnie Walker', 'Tequila Olmeca', 'Aperol', 'Espumante', 'Jack Daniels', 'José Cuervo dorado', 'Triple sec', 'Fireball / Jägermeister (shots)']) {
      expect(categoriaInsumo(n, 'ml'), n).toBe('licores');
    }
    for (const n of ['Goma', 'Sirope de arándanos', 'Sirope o pulpa de maracuyá', 'Pulpa de hibiscus', 'Pulpa tropical (Tropical Gin)']) {
      expect(categoriaInsumo(n, 'ml'), n).toBe('jarabes');
    }
    for (const n of ['Agua mineral', 'Ginger Ale', 'Sprite', 'Jugo de limón', 'Bebida de mezcla (cola, tónica…)']) {
      expect(categoriaInsumo(n, 'ml'), n).toBe('mezclas');
    }
    expect(categoriaInsumo('Peroni', 'un')).toBe('unidades');
    expect(categoriaInsumo('Red Bull Tropical (lata)', 'un')).toBe('unidades');
  });
});

describe('botella o lata: insumos que se parecen al producto', () => {
  const insumos = [
    { id: 1, name: 'Kunstmann Torobayo', unit: 'un' as const }, { id: 2, name: 'Peroni', unit: 'un' as const },
    { id: 3, name: 'Peroni Sin Alcohol', unit: 'un' as const }, { id: 4, name: 'Energética Score', unit: 'un' as const },
    { id: 5, name: 'Pisco Mistral 35 / Nobel', unit: 'ml' as const }, { id: 6, name: 'Agua mineral', unit: 'ml' as const },
  ];

  it('encuentra el insumo con el mismo nombre del producto, el más parecido primero', async () => {
    const { insumosParecidos } = await import('./insumos');
    expect(insumosParecidos('Kunstmann Torobayo', insumos).map((i) => i.id)).toEqual([1]);
    expect(insumosParecidos('Peroni Sin Alcohol', insumos).map((i) => i.id)).toEqual([3, 2]);
    expect(insumosParecidos('Peroni', insumos).map((i) => i.id)).toEqual([2, 3]);
    expect(insumosParecidos('Score', insumos).map((i) => i.id)).toEqual([4]);
    expect(insumosParecidos('Cerveza Royal Guard', insumos)).toEqual([]);
  });

  it('«Botella o lata» es un vaso más: no tiene capacidad y no se mide contra un vaso', async () => {
    const { glassInfo } = await import('./insumos');
    expect(glassInfo('botella')).toMatchObject({ label: 'Botella o lata', ml: 0 });
  });
});

describe('cantidad inicial al agregar un insumo', () => {
  it('licor 2 jiggers, jarabe y limón ½ jigger, bebida 120 ml, unidades 1', async () => {
    const { cantidadInicial } = await import('./insumos');
    expect(cantidadInicial('Vodka Absolut', 'ml')).toEqual({ jigger: true, value: 2 });
    expect(cantidadInicial('Goma', 'ml')).toEqual({ jigger: true, value: 0.5 });
    expect(cantidadInicial('Jugo de limón', 'ml')).toEqual({ jigger: true, value: 0.5 });
    expect(cantidadInicial('Bitter de naranja', 'ml')).toEqual({ jigger: true, value: 0.5 });
    expect(cantidadInicial('Agua mineral', 'ml')).toEqual({ jigger: false, value: 120 });
    expect(cantidadInicial('Ginger Ale', 'ml')).toEqual({ jigger: false, value: 120 });
    expect(cantidadInicial('Peroni', 'un')).toEqual({ jigger: false, value: 1 });
  });
});

describe('extras sin medida (Tajín, hielo…)', () => {
  it('lee y guarda los extras sin pisar el resto del metadata', async () => {
    const { extrasDeMetadata, metadataConExtras } = await import('./insumos');
    expect(extrasDeMetadata(null)).toEqual([]);
    expect(extrasDeMetadata('no es json')).toEqual([]);
    expect(extrasDeMetadata({ extras: ['Borde de Tajín', ' ', 5, 'Hielo frappé'] })).toEqual(['Borde de Tajín', 'Hielo frappé']);
    expect(extrasDeMetadata(JSON.stringify({ extras: ['Hielo en cubos'] }))).toEqual(['Hielo en cubos']);
    expect(metadataConExtras({ talla: 'M' }, ['Borde de Tajín', 'Borde de Tajín', ' '])).toEqual({ talla: 'M', extras: ['Borde de Tajín'] });
    expect(metadataConExtras({ talla: 'M', extras: ['x'] }, [])).toEqual({ talla: 'M' });
    expect(metadataConExtras({ extras: ['x'] }, [])).toBeNull();
    expect(metadataConExtras(null, ['Hielo frappé'])).toEqual({ extras: ['Hielo frappé'] });
  });

  it('el hielo es uno solo: cubos o frappé', async () => {
    const { conHielo } = await import('./insumos');
    expect(conHielo(['Borde de Tajín'], 'Hielo frappé')).toEqual(['Hielo frappé', 'Borde de Tajín']);
    expect(conHielo(['Hielo frappé', 'Borde de Tajín'], 'Hielo en cubos')).toEqual(['Hielo en cubos', 'Borde de Tajín']);
    expect(conHielo(['Hielo en cubos', 'Borde de Tajín'], null)).toEqual(['Borde de Tajín']);
  });
});

describe('productoSinInsumos', () => {
  it('merch y secciones que se venden solas no llevan insumos', () => {
    expect(productoSinInsumos('merch', null, null)).toBe(true);
    expect(productoSinInsumos('consumo', 'Cigarros', null)).toBe(true);
    expect(productoSinInsumos('consumo', 'Premios Cumpleañerxs', null)).toBe(true);
    expect(productoSinInsumos('consumo', 'Gin', null)).toBe(false);
  });
  it('lo marcado a mano manda sobre la deducción', () => {
    expect(productoSinInsumos('consumo', 'Gin', { sinInsumos: true })).toBe(true);
    expect(productoSinInsumos('merch', 'Merch', '{"sinInsumos":false}')).toBe(false);
    expect(metadataConSinInsumos({ extras: ['x'] }, true)).toEqual({ extras: ['x'], sinInsumos: true });
  });
});

describe('opciones al vender', () => {
  const recetas = [
    { ticketTypeId: 1, insumoId: 10, amount: 90 }, // pisco
    { ticketTypeId: 1, insumoId: 20, amount: 200 }, // bebida de mezcla
  ] as any;
  const grupos = { 1: [{ id: 'g', label: 'Acompañante', reemplaza: 20, choices: [
    { id: 'g-30', label: 'Coca Cola', insumoId: 30, amount: 200 }, { id: 'g-31', label: 'Sprite', insumoId: 31, amount: 200 },
  ] }] };
  it('la bebida elegida reemplaza a la de mezcla', () => {
    const r = consumoDeVenta([{ ticketTypeId: 1, quantity: 2, opciones: ['g-31'] }], recetas, grupos);
    expect(r).toEqual([{ insumoId: 10, delta: -180 }, { insumoId: 31, delta: -400 }]);
  });
  it('dos elecciones distintas del mismo trago descuentan cada una lo suyo', () => {
    const r = consumoDeVenta([{ ticketTypeId: 1, quantity: 1, opciones: ['g-30'] }, { ticketTypeId: 1, quantity: 1, opciones: ['g-31'] }], recetas, grupos);
    expect(r.find((x) => x.insumoId === 30)?.delta).toBe(-200);
    expect(r.find((x) => x.insumoId === 31)?.delta).toBe(-200);
    expect(r.find((x) => x.insumoId === 10)?.delta).toBe(-180);
  });
  it('sin elección queda la receta base', () => {
    expect(consumoDeVenta([{ ticketTypeId: 1, quantity: 1 }], recetas, grupos).map((x) => x.insumoId)).toEqual([10, 20]);
  });
  it('el metadata guarda y descarta lo mal formado', () => {
    const m = metadataConOpciones({ extras: ['x'] }, grupos[1] as any);
    expect(opcionesDeMetadata(m)).toEqual(grupos[1]);
    expect(opcionesDeMetadata({ opciones: [{ id: 'a', choices: [{ id: 'z' }] }] })).toEqual([]);
  });
});

describe('pasos sugeridos', () => {
  it('piscolón con bebida a elección', () => {
    const p = pasosSugeridos({
      glass: 'vaso', extras: ['Hielo en cubos'],
      lineas: [{ insumoId: 1, name: 'Pisco', unit: 'ml', amount: 90 }, { insumoId: 2, name: 'Bebida de mezcla', unit: 'ml', amount: 200 }],
      opciones: [{ id: 'g', label: 'Acompañante', reemplaza: 2, choices: [{ id: 'a', label: 'Coca Cola', insumoId: 3, amount: 200 }, { id: 'b', label: 'Sprite', insumoId: 4, amount: 200 }] }],
    });
    expect(p).toEqual([
      'Llenar el vaso de 500 ml con hielo en cubos.',
      'Servir 3 jiggers (90 ml) de Pisco.',
      'Completar con la bebida que eligió el cliente (Coca Cola, Sprite), unos 200 ml.',
      'Revolver suave con la bombilla.',
    ]);
  });
  it('FireRoom: borde de Tajín y decoración', () => {
    const p = pasosSugeridos({ glass: 'vaso', extras: ['Borde de Tajín', 'Rodaja de limón'], lineas: [{ insumoId: 1, name: 'Tequila', unit: 'ml', amount: 45 }], opciones: [] });
    expect(p[0]).toBe('Escarchar el borde de el vaso de 500 ml con Tajín.'.replace('de el', 'del'));
    expect(p).toContain('Servir 1½ jiggers (45 ml) de Tequila.');
    expect(p.at(-1)).toBe('Decorar: rodaja de limón.');
  });
  it('mojito con frappé y hierbabuena; copa XL', () => {
    const p = pasosSugeridos({ glass: 'copa_xl', extras: ['Hierbabuena (5 hojas)', 'Hielo frappé'], lineas: [{ insumoId: 1, name: 'Ron', unit: 'ml', amount: 60 }], opciones: [] });
    expect(p[0]).toMatch(/^Machacar/);
    expect(p[1]).toBe('Llenar la copa de 600 ml con hielo frappé.');
  });
  it('preparación en el metadata', () => {
    const m = metadataConPreparacion({ extras: ['x'] }, ['Paso 1', ' '], 'https://blob/foto.jpg');
    expect(pasosDeMetadata(m)).toEqual(['Paso 1']);
    expect(fotoDeMetadata(m)).toBe('https://blob/foto.jpg');
    expect(fotoDeMetadata(metadataConPreparacion(m, undefined, null))).toBeNull();
  });
});

// Gin con Gin: 3 jiggers de Beefeater + Ginger ale (sin comprar todavía). Tónica y Sprite sí tienen stock.
const gin: Insumo = { id: 10, name: 'Gin Beefeater', unit: 'ml', containerSize: 750, containerLabel: 'botella', costPerContainer: 15000, alertDrinks: 10 };
const ginger: Insumo = { id: 11, name: 'Ginger ale', unit: 'ml', containerSize: 1500, containerLabel: 'botella', costPerContainer: 2000, alertDrinks: 10 };
const tonica: Insumo = { id: 12, name: 'Tónica', unit: 'ml', containerSize: 1500, containerLabel: 'botella', costPerContainer: 2000, alertDrinks: 10 };
const hielo: Insumo = { id: 13, name: 'Hielo', unit: 'un', containerSize: 1, containerLabel: 'bolsa', costPerContainer: 0, alertDrinks: 0 };
const ginConGin = [{ insumoId: 10, amount: 90 }, { insumoId: 11, amount: 120 }];
const info = [gin, ginger, tonica].map((i) => ({ id: i.id, name: i.name, alertDrinks: i.alertDrinks, sinComprar: i.id === 11 }));
const stockGin = new Map<number, number>([[10, 1050], [12, 3000]]);

describe('diagnosticoProducto', () => {
  it('dice qué insumo falta aunque el gin alcance', () => {
    const d = diagnosticoProducto(ginConGin, info, stockGin)!;
    expect(d.estado).toBe('agotado');
    expect(d.drinks).toBe(0);
    expect(d.limitante).toMatchObject({ insumoId: 11, name: 'Ginger ale', sinComprar: true });
    expect(d.faltantes.map((f) => f.name)).toEqual(['Ginger ale']);
  });
  it('con todo cargado, manda el que se acaba primero y avisa si queda poco', () => {
    const d = diagnosticoProducto(ginConGin, info, new Map([[10, 1050], [11, 600]]))!;
    expect(d.drinks).toBe(5);
    expect(d.limitante.name).toBe('Ginger ale');
    expect(d.estado).toBe('bajo');
    expect(diagnosticoProducto(ginConGin, info, new Map([[10, 5000], [11, 5000]]))!.estado).toBe('ok');
  });
  it('sin líneas con cantidad no hay diagnóstico', () => {
    expect(diagnosticoProducto([], info, stockGin)).toBeNull();
  });
});

describe('sugerirReemplazos', () => {
  it('sugiere otra bebida con stock y nunca un insumo de otra categoría o unidad', () => {
    const r = sugerirReemplazos(11, [gin, ginger, tonica, hielo], stockGin, ginConGin);
    expect(r).toEqual([{ insumoId: 12, name: 'Tónica', drinks: 25 }]);
  });
  it('no sugiere lo que no tiene stock', () => {
    expect(sugerirReemplazos(11, [gin, ginger, tonica], new Map([[10, 1050]]), ginConGin)).toEqual([]);
  });
});

describe('reemplazo «por hoy» en la venta', () => {
  const recetasGin: RecetaLinea[] = [{ ticketTypeId: 5, insumoId: 10, amount: 90 }, { ticketTypeId: 5, insumoId: 11, amount: 120 }];
  it('descuenta el insumo de reemplazo y no el faltante', () => {
    const out = consumoDeVenta([{ ticketTypeId: 5, quantity: 2, opciones: [idSustitucion(11, 12)] }], recetasGin);
    expect(out).toEqual(expect.arrayContaining([{ insumoId: 10, delta: -180 }, { insumoId: 12, delta: -240 }]));
    expect(out.find((o) => o.insumoId === 11)).toBeUndefined();
  });
  it('sin reemplazo todo sigue igual', () => {
    expect(consumoDeVenta([{ ticketTypeId: 5, quantity: 1 }], recetasGin).map((o) => o.insumoId).sort()).toEqual([10, 11]);
  });
  it('lee los reemplazos de la lista de opciones y no se confunde con otras', () => {
    expect(sustitucionesDe(['sub:11:12', 'hielo', 'sub:x:y']).get(11)).toBe(12);
  });
  it('la alerta de insumo agotado dice qué tragos afecta y con qué reemplazarlo', () => {
    const d = insumoStockAlerts([{ insumo: ginger, before: 100, after: 0, reference: null }], recetasGin, 7, {
      afectados: new Map([[11, ['Gin con Gin']]]), reemplazos: new Map([[11, ['Tónica (alcanza para 25)']]]),
    });
    expect(d[0].body).toContain('Afecta: Gin con Gin');
    expect(d[0].body).toContain('Tónica (alcanza para 25)');
  });
});
