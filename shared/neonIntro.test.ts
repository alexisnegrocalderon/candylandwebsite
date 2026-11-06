import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs de scripts/ (sin tipos)
import { neonIntroStart, neonIntroStageHtml, neonIntroInlineScript } from '../scripts/neon-intro.mjs';

function fakeEnv(opts: { path?: string; kind?: 'dark' | 'site'; seen?: boolean; webdriver?: boolean; reducedMotion?: boolean; noLoader?: boolean; badStorage?: boolean } = {}) {
  const store = new Map<string, string>();
  if (opts.seen) store.set(`neon-intro.seen.${opts.kind === 'site' ? 'site' : ((opts.path ?? '/admin').split('/')[1] || 'app')}`, '1');
  const attrs = new Map<string, string>();
  const el = { className: '', setAttribute: (k: string, v: string) => attrs.set(k, v) };
  return {
    el, attrs, store,
    env: {
      doc: { getElementById: () => (opts.noLoader ? null : el) },
      storage: opts.badStorage
        ? { getItem: () => { throw new Error('sin storage'); }, setItem: () => { throw new Error('sin storage'); } }
        : { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } },
      path: opts.path ?? '/admin', kind: opts.kind ?? 'dark', webdriver: !!opts.webdriver, reducedMotion: !!opts.reducedMotion, now: 1000,
    },
  };
}

describe('¿toca la intro de neón? (se decide en el HTML, antes del primer cuadro)', () => {
  it('el panel, la primera vez que se abre: intro completa, marcada como vista y con la hora de inicio', () => {
    const t = fakeEnv({ path: '/admin' });
    expect(neonIntroStart(t.env)).toBe(true);
    expect(t.el.className).toBe('neon-intro');
    expect(t.store.get('neon-intro.seen.admin')).toBe('1');
    expect(t.attrs.get('data-ni-t0')).toBe('1000');
  });
  it('con la app ya abierta (o recargada) no se repite', () => {
    expect(neonIntroStart(fakeEnv({ path: '/admin', seen: true }).env)).toBe(false);
  });
  it('las terminales (caja, puerta…) la ven corta', () => {
    const t = fakeEnv({ path: '/caja' });
    expect(neonIntroStart(t.env)).toBe(true);
    expect(t.el.className).toBe('neon-intro neon-intro--short');
  });
  it('con «reducir movimiento» queda quieta', () => {
    const t = fakeEnv({ path: '/admin', reducedMotion: true });
    neonIntroStart(t.env);
    expect(t.el.className).toBe('neon-intro neon-intro--still');
  });
  it('el sitio: solo en la home, una vez, y nunca en pruebas automáticas', () => {
    expect(neonIntroStart(fakeEnv({ kind: 'site', path: '/' }).env)).toBe(true);
    expect(neonIntroStart(fakeEnv({ kind: 'site', path: '/eventos' }).env)).toBe(false);
    expect(neonIntroStart(fakeEnv({ kind: 'site', path: '/', seen: true }).env)).toBe(false);
    expect(neonIntroStart(fakeEnv({ kind: 'site', path: '/', webdriver: true }).env)).toBe(false);
  });
  it('el sitio la ve completa (no la versión corta de las terminales)', () => {
    const t = fakeEnv({ kind: 'site', path: '/' });
    neonIntroStart(t.env);
    expect(t.el.className).toBe('neon-intro');
  });
  it('sin loader o sin storage no hace nada (nunca rompe la apertura)', () => {
    expect(neonIntroStart(fakeEnv({ noLoader: true }).env)).toBe(false);
    expect(neonIntroStart(fakeEnv({ badStorage: true }).env)).toBe(false);
  });
});

describe('los HTML llevan exactamente lo mismo que el módulo', () => {
  const index = readFileSync(join(__dirname, '..', 'client', 'index.html'), 'utf8');
  it('client/index.html trae la misma función que decide la intro', () => {
    expect(index).toContain(neonIntroStart.toString());
  });
  it('client/index.html trae el mismo escenario (isotipo + PLAYROOM) entre las marcas del loader', () => {
    const inner = index.match(/<!--initial-loader-->([\s\S]*?)<!--\/initial-loader-->/)?.[1] ?? '';
    expect(inner).toContain(neonIntroStageHtml());
  });
  it('el escenario tiene las 8 letras de PLAYROOM, cada una con su tramo del degradado', () => {
    const html: string = neonIntroStageHtml();
    expect((html.match(/neon-intro-letter/g) ?? []).length).toBe(8);
    expect(html).toContain('--j:7;--n:8');
  });
  it('el script de las pantallas oscuras incluye la función y la llamada con el tipo «dark»', () => {
    const script: string = neonIntroInlineScript('dark');
    expect(script).toContain(neonIntroStart.toString());
    expect(script).toContain("kind:'dark'");
  });
});
