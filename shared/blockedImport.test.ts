import { describe, expect, it } from 'vitest';
import { blockedKeysFor, type BlockedRow } from './blockedMatch';
import { classifyCell, detectMapping, mergeFields, parseSheet, parseSheetDate, planBlockedImport } from './blockedImport';

const existing = (id: number, f: Parameters<typeof blockedKeysFor>[0]): BlockedRow => ({ id, fullName: f.fullName ?? null, ...blockedKeysFor(f) });

describe('classifyCell', () => {
  it('reconoce cada tipo de dato', () => {
    expect(classifyCell('juan@gmail.com')).toBe('email');
    expect(classifyCell('@juan.perez')).toBe('instagram');
    expect(classifyCell('+56 9 1234 5678')).toBe('phone');
    expect(classifyCell('9 8765 4321')).toBe('phone');
    expect(classifyCell('12.345.678-5')).toBe('rut');
    expect(classifyCell('5/9/2026')).toBe('date');
    expect(classifyCell('Sinners')).toBe('text');
    expect(classifyCell(' - ')).toBe('empty');
    expect(classifyCell('s/d')).toBe('empty');
  });
});

describe('detectMapping', () => {
  it('detecta columnas por encabezado', () => {
    expect(detectMapping(['Nombre', 'RUT', 'Teléfono', 'Instagram', 'Local', 'Fecha', 'Motivo', 'Observaciones', 'Otra'])).toEqual([
      'fullName', 'rut', 'phone', 'instagram', 'sourceVenue', 'blockedOn', 'reason', 'notes', 'ignore',
    ]);
  });
});

describe('planBlockedImport', () => {
  const csv = [
    'Nombre;Contacto;Local',
    'Juan Pérez;+56 9 1111 2222;',
    'María González;Sinners;',
    'Pedro Soto;@pedro.s;Sinners',
    ' ; ; ',
    'Juan Perez;9 1111 2222;Otro local',
    'Ana Lagos;-;',
  ].join('\n');
  const { headers, rows } = parseSheet(csv);
  const mapping = detectMapping(headers);

  it('lee cada celda según su contenido y manda el texto suelto al local', () => {
    const plan = planBlockedImport(rows, { mapping }, []);
    const byLine = (n: number) => plan.rows.find((r) => r.line === n)!;
    expect(byLine(2).fields).toMatchObject({ fullName: 'Juan Pérez', phone: '+56 9 1111 2222' });
    expect(byLine(3).fields).toMatchObject({ fullName: 'María González', sourceVenue: 'Sinners', phone: null });
    expect(byLine(4).fields).toMatchObject({ instagram: '@pedro.s', sourceVenue: 'Sinners' });
    expect(plan.misplaced.map((m) => [m.value, m.count, m.placement])).toEqual([['Sinners', 1, 'venue']]);
  });

  it('filas vacías se saltan; las de solo nombre se cargan y quedan como "solo avisa"', () => {
    const plan = planBlockedImport(rows, { mapping }, []);
    expect(planBlockedImport([['', '', '']], { mapping }, []).rows[0].action).toBe('skip');
    const ana = plan.rows.find((r) => r.line === 6)!;
    expect(ana.action).toBe('create');
    expect(ana.onlyName).toBe(true);
    expect(plan.counts.onlyName).toBe(2);
  });

  it('fusiona por teléfono con una fila anterior del archivo y con fichas existentes', () => {
    const plan = planBlockedImport(rows, { mapping }, []);
    expect(plan.rows.find((r) => r.line === 5)).toMatchObject({ action: 'merge', mergeWithLine: 2 });
    const plan2 = planBlockedImport(rows, { mapping }, [existing(77, { fullName: 'Pedro S', igNorm: undefined, instagram: '@pedro.s' })]);
    expect(plan2.rows.find((r) => r.line === 4)).toMatchObject({ action: 'merge', mergeWithId: 77 });
  });

  it('respeta la decisión del dueño sobre un texto dudoso', () => {
    const plan = planBlockedImport(rows, { mapping, placements: { Sinners: 'note' } }, []);
    const maria = plan.rows.find((r) => r.line === 3)!;
    expect(maria.fields.sourceVenue).toBeNull();
    expect(maria.fields.notes).toBe('Sinners');
  });

  it('un valor por defecto de local se aplica a las filas sin local', () => {
    const plan = planBlockedImport(rows, { mapping, defaultVenue: 'Lista amiga' }, []);
    expect(plan.rows.find((r) => r.line === 2)!.fields.sourceVenue).toBe('Lista amiga');
    expect(plan.rows.find((r) => r.line === 3)!.fields.sourceVenue).toBe('Sinners');
  });
});

describe('fechas y fusión de datos', () => {
  it('parsea fechas de la planilla', () => {
    expect(parseSheetDate('5/9/26')).toBe('2026-09-05');
    expect(parseSheetDate('2026-09-05')).toBe('2026-09-05');
    expect(parseSheetDate('mañana')).toBeNull();
  });
  it('fusionar completa lo que falta y no pisa lo que ya había', () => {
    const merged = mergeFields({ fullName: 'Juan Pérez', phone: '911112222', notes: 'a' }, { fullName: 'Otro', rut: '12.345.678-5', phone: '999999999', email: null, instagram: null, sourceVenue: 'Sinners', sourceProducer: null, blockedOn: null, reason: null, notes: 'b' });
    expect(merged).toEqual({ rut: '12.345.678-5', sourceVenue: 'Sinners', notes: 'a · b' });
  });
});

describe('columna de documento', () => {
  it('acepta RUT sin DV y cédulas extranjeras sin tratarlos como teléfono ni como texto', () => {
    const plan = planBlockedImport([['Ana Soto', '11276166'], ['', '1096257494'], ['', '19.681.692-5']], { mapping: ['fullName', 'rut'] }, []);
    expect(plan.rows.map((r) => r.fields.rut)).toEqual(['11276166', '1096257494', '19.681.692-5']);
    expect(plan.misplaced).toEqual([]);
  });
});
