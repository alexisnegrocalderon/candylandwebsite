import { describe, it, expect } from 'vitest';
import { MARCA, EVENTO, CANDYLAND } from '../client/src/config/candyland';

/* La marca es Mansion Playroom; "Candyland" es el nombre de UN evento y
 * después vendrá otro. Estos tests son la red que sostiene esa separación:
 * atrapan tanto que alguien vuelva a mezclar los dos conceptos como que el
 * objeto compuesto deje de exponer algo que los importadores ya usaban. */

describe('separación marca / evento', () => {
  it('la marca es Mansion Playroom, no el nombre del evento', () => {
    expect(MARCA.nombre).toBe('Mansion Playroom');
    expect(MARCA.nombre).not.toBe(EVENTO.nombre);
  });

  it('MARCA no contiene datos que cambian con cada evento', () => {
    // Si alguno de estos aparece en MARCA, se va a quedar pegado del evento
    // viejo cuando cambie la fiesta.
    for (const clave of ['slug', 'eventDate', 'fechaTexto', 'dressCode', 'tagline']) {
      expect(MARCA, `"${clave}" es del evento, no de la marca`).not.toHaveProperty(clave);
    }
  });

  it('EVENTO no contiene datos permanentes de la marca', () => {
    // Al revés: si están acá, habría que reescribirlos en cada evento aunque
    // no cambien.
    for (const clave of ['valores', 'edadMinima', 'redes', 'lugar', 'ciudad']) {
      expect(EVENTO, `"${clave}" es de la marca, no del evento`).not.toHaveProperty(clave);
    }
  });

  it('MARCA y EVENTO no comparten claves salvo `nombre`', () => {
    // `nombre` se solapa a propósito y CANDYLAND resuelve el empate de forma
    // explícita. Cualquier OTRA clave repetida se resolvería en silencio por
    // orden del spread, que es justo el tipo de bug difícil de ver.
    const repetidas = Object.keys(MARCA).filter((k) => k in EVENTO && k !== 'nombre');
    expect(repetidas, `claves repetidas: ${repetidas.join(', ')}`).toEqual([]);
  });
});

describe('CANDYLAND (objeto compuesto, compatibilidad)', () => {
  it('sigue exponiendo todo lo que los importadores usan', () => {
    // Si el refactor hubiera perdido alguna clave, las páginas romperían en
    // runtime y no en el type-check (varios usos son dinámicos).
    for (const clave of [
      'slug', 'nombre', 'tagline', 'heroTitulo', 'eventDate', 'fechaTexto',
      'horarioTexto', 'afterTexto', 'ciudad', 'lugar', 'valores', 'edadMinima',
      'dressCode', 'mision', 'pistas', 'lineup', 'amenities', 'accesos',
      'faqs', 'redes',
    ]) {
      expect(CANDYLAND, `falta "${clave}"`).toHaveProperty(clave);
    }
  });

  it('`nombre` resuelve al del evento, como esperaban los usos previos', () => {
    expect(CANDYLAND.nombre).toBe(EVENTO.nombre);
  });

  it('hereda de la marca lo que no está en el evento', () => {
    expect(CANDYLAND.edadMinima).toBe(MARCA.edadMinima);
    expect(CANDYLAND.lugar).toBe(MARCA.lugar);
  });
});
