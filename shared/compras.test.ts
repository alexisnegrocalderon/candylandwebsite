import { describe, expect, it } from 'vitest';
import { cargaDeLinea, cuadreBoleta, emparejarInsumo, nombreSugerido, packDeTexto, palabrasClave, tamanoDeTexto, type InsumoParaEmparejar } from './compras';

const ins = (id: number, name: string, unit: 'ml' | 'un' = 'ml', containerSize = 750, aliases: string[] = []): InsumoParaEmparejar => ({ id, name, unit, containerSize, aliases });
const lista = [
  ins(1, 'Ron blanco'), ins(2, 'Ron negro'), ins(3, 'Pisco Mistral 35 / Nobel', 'ml', 1000), ins(4, 'Gin Beefeater'),
  ins(5, 'Agua mineral', 'ml', 1500), ins(6, 'Agua con gas', 'ml', 1500), ins(7, 'Peroni', 'un', 1), ins(8, 'Jugo de limón', 'ml', 1000),
];

describe('lectura de tamaños', () => {
  it('entiende cc, ml y litros', () => {
    expect(tamanoDeTexto('RON BACARDI 750CC')).toBe(750);
    expect(tamanoDeTexto('Coca-Cola 1,5 L')).toBe(1500);
    expect(tamanoDeTexto('Sprite 350ml x6')).toBe(350);
    expect(tamanoDeTexto('Hielo bolsa')).toBe(0);
  });
  it('entiende packs', () => {
    expect(packDeTexto('Coca Cola 350cc pack 6')).toBe(6);
    expect(packDeTexto('Peroni x24')).toBe(24);
    expect(packDeTexto('Ron 750cc')).toBe(1);
  });
  it('palabras clave sin tamaños ni relleno', () => {
    expect(palabrasClave('RON BACARDI BCO 750CC')).toEqual(['ron', 'bacardi', 'blanco']);
  });
});

describe('emparejar con los insumos', () => {
  it('reconoce el insumo con marca de más', () => {
    const r = emparejarInsumo('RON BACARDI BCO 750CC', lista);
    expect(r.insumoId).toBe(1);
    expect(r.confianza).toBe('alta');
  });
  it('reconoce la alternativa del nombre con barra', () => {
    expect(emparejarInsumo('PISCO NOBEL 35 1L', lista).insumoId).toBe(3);
  });
  it('agua con gas no se confunde con agua mineral', () => {
    expect(emparejarInsumo('AGUA CON GAS 1.5L', lista).insumoId).toBe(6);
  });
  it('lo que no existe queda como nueva', () => {
    expect(emparejarInsumo('HIELO EN CUBOS BOLSA 5KG', lista).confianza).toBe('nueva');
  });
  it('un alias enseñado manda', () => {
    const l = [...lista, ins(9, 'Espumante', 'ml', 750, ['SALENTEIN BRUT'])];
    expect(emparejarInsumo('SALENTEIN BRUT 750', l).insumoId).toBe(9);
  });
  it('si dos se parecen igual, pide revisar (media)', () => {
    const r = emparejarInsumo('RON 750CC', lista);
    expect(r.confianza).not.toBe('alta');
    expect(r.candidatos.length).toBeGreaterThan(1);
  });
});

describe('cuánto stock se suma', () => {
  it('6 botellas de 750 ml = 4500 ml', () => {
    const c = cargaDeLinea({ cantidad: 6, precioUnitario: 8990, totalLinea: 53940, tamano: 750, packUnidades: 1 }, lista[0]);
    expect(c.agregar).toBe(4500);
    expect(c.costoEnvase).toBe(8990);
    expect(c.avisos).toEqual([]);
  });
  it('un pack de 6 latas cuenta 6 unidades por pack', () => {
    const c = cargaDeLinea({ cantidad: 2, precioUnitario: 9000, totalLinea: 18000, tamano: 350, packUnidades: 6 }, ins(7, 'Peroni', 'un', 1));
    expect(c.agregar).toBe(12);
    expect(c.costoEnvase).toBe(1500);
  });
  it('si la boleta trae otro tamaño, suma con ese y avisa; el costo se lleva al tamaño del insumo', () => {
    const c = cargaDeLinea({ cantidad: 2, precioUnitario: 6000, totalLinea: 12000, tamano: 1000, packUnidades: 1 }, lista[0]);
    expect(c.agregar).toBe(2000);
    expect(c.avisos.some((a) => /no está entre/.test(a))).toBe(true);
    expect(c.costoParaInsumo).toBe(4500);
  });
  it('avisa si cantidad × precio no da el total', () => {
    const c = cargaDeLinea({ cantidad: 3, precioUnitario: 1000, totalLinea: 2000, tamano: 750, packUnidades: 1 }, lista[0]);
    expect(c.avisos.some((a) => /no coincide/.test(a))).toBe(true);
  });
});

describe('cuadre de la boleta', () => {
  it('las líneas suman el total', () => {
    expect(cuadreBoleta([{ totalLinea: 53940 }, { totalLinea: 10000 }], 63940)).toMatchObject({ suma: 63940, diferencia: 0, cuadra: true });
  });
  it('un descuento negativo se resta', () => {
    expect(cuadreBoleta([{ totalLinea: 10000 }, { totalLinea: -1000 }], 9000).cuadra).toBe(true);
  });
  it('si falta una línea, no cuadra y dice cuánto', () => {
    expect(cuadreBoleta([{ totalLinea: 10000 }], 15000)).toMatchObject({ diferencia: 5000, cuadra: false });
  });
});

describe('nombre sugerido', () => {
  it('limpia tamaños y capitaliza', () => {
    expect(nombreSugerido('GIN BEEFEATER 750CC')).toBe('Gin Beefeater');
  });
});
