import { describe, expect, it } from 'vitest';
import { CATEGORIAS, CHECKLIST_CREADOR, CONSENTIMIENTO, DINAMICAS, GUION_NOCHE, SENALES, dinamicaPorId, pautaAnimador } from './animadorPauta';

describe('pauta del animador', () => {
  it('tiene unas 30 dinámicas con ids únicos y todas las categorías', () => {
    expect(DINAMICAS.length).toBeGreaterThanOrEqual(28);
    expect(new Set(DINAMICAS.map((d) => d.id)).size).toBe(DINAMICAS.length);
    for (const c of CATEGORIAS) expect(DINAMICAS.some((d) => d.categoria === c)).toBe(true);
  });

  it('cada dinámica trae salida suave, bloque de cámara, gancho y cierre', () => {
    for (const d of DINAMICAS) {
      expect(d.salidaSuave.trim(), d.id).not.toBe('');
      expect(d.gancho.trim(), d.id).not.toBe('');
      expect(d.cierre.trim(), d.id).not.toBe('');
      expect(d.decirlo.trim(), d.id).not.toBe('');
      expect(d.reglas.length, d.id).toBeGreaterThan(0);
      for (const v of Object.values(d.camara)) expect(v.trim(), d.id).not.toBe('');
      expect(d.duracionSeg, d.id).toBeGreaterThan(0);
    }
  });

  it('las atrevidas siempre piden opt-in', () => {
    for (const d of DINAMICAS.filter((x) => x.intensidad === 'atrevido')) expect(d.optIn, d.id).toBe(true);
    expect(DINAMICAS.some((d) => d.intensidad === 'atrevido')).toBe(true);
  });

  it('el guion solo referencia dinámicas que existen', () => {
    for (const b of GUION_NOCHE) for (const id of b.dinamicas) expect(dinamicaPorId(id), `${b.id}:${id}`).toBeDefined();
    for (let i = 1; i < GUION_NOCHE.length; i++) expect(GUION_NOCHE[i].desdeMin).toBe(GUION_NOCHE[i - 1].hastaMin);
  });

  it('el consentimiento es la frase a cámara y los límites no se pierden', () => {
    expect(CONSENTIMIENTO.frase).toContain('+18');
    expect(CONSENTIMIENTO.frase).toContain('reels de Candyland');
    expect(CONSENTIMIENTO.limites.join(' ')).toMatch(/desnudez/);
  });

  it('señales y checklist tienen ids únicos', () => {
    expect(new Set(SENALES.map((s) => s.id)).size).toBe(SENALES.length);
    expect(new Set(CHECKLIST_CREADOR.map((s) => s.id)).size).toBe(CHECKLIST_CREADOR.length);
    expect(pautaAnimador().dinamicas).toBe(DINAMICAS);
  });
});
