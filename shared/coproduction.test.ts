import { describe, expect, it } from 'vitest';
import { DEFAULT_LANDING, generatePartnerPassword, normalizeLanding, parsePartnerOpenId, partnerOpenId, splitProfit } from './coproduction';

describe('splitProfit', () => {
  it('50/50 de la utilidad, y las partes siempre suman el total', () => {
    expect(splitProfit(10_000_001, 50)).toEqual({ netProfit: 10_000_001, partnerPercent: 50, partnerShare: 5_000_001, playroomShare: 5_000_000 });
  });

  it('una pérdida también se reparte', () => {
    const r = splitProfit(-2_000_000, 50);
    expect(r.partnerShare).toBe(-1_000_000);
    expect(r.playroomShare).toBe(-1_000_000);
  });

  it('acota el porcentaje a 0-100', () => {
    expect(splitProfit(1000, 150).partnerShare).toBe(1000);
    expect(splitProfit(1000, -5).partnerShare).toBe(0);
  });
});

describe('normalizeLanding', () => {
  it('una landing vacía queda con los textos por defecto', () => {
    expect(normalizeLanding(null)).toEqual(DEFAULT_LANDING);
  });

  it('descarta imágenes que no son https ni del propio sitio', () => {
    const l = normalizeLanding({ heroImageUrl: 'javascript:alert(1)', galleryUrls: ['http://x.cl/a.jpg', 'https://x.cl/b.jpg', '/candyland/c.jpg'] });
    expect(l.heroImageUrl).toBe('');
    expect(l.galleryUrls).toEqual(['https://x.cl/b.jpg', '/candyland/c.jpg']);
  });

  it('limpia preguntas incompletas', () => {
    expect(normalizeLanding({ faq: [{ q: 'Hola', a: '' }, { q: '¿Dónde?', a: 'Hipódromo' }, 'x'] }).faq).toEqual([{ q: '¿Dónde?', a: 'Hipódromo' }]);
  });
});

describe('sesión del socio', () => {
  it('el openId lleva la versión y se puede leer de vuelta', () => {
    expect(parsePartnerOpenId(partnerOpenId('dalmore', 3))).toEqual({ slug: 'dalmore', sessionVersion: 3 });
  });

  it('no confunde otros openId con un socio', () => {
    expect(parsePartnerOpenId('admin-local')).toBeNull();
    expect(parsePartnerOpenId('partner:../x:1')).toBeNull();
  });

  it('la clave generada tiene 4 palabras y un número', () => {
    let i = 0;
    expect(generatePartnerPassword(() => i++)).toMatch(/^[a-z]+-[a-z]+-[a-z]+-[a-z]+-\d{2}$/);
  });
});

describe('timeline de la landing', () => {
  it('ida y vuelta texto ↔ momentos', async () => {
    const { timelineFromText, timelineToText, normalizeLanding } = await import('./coproduction');
    const t = timelineFromText('23:00 | Puertas | Llegas y entras\n\n01:30 | Zonas\nmal formada');
    expect(t).toEqual([{ time: '23:00', title: 'Puertas', text: 'Llegas y entras' }, { time: '01:30', title: 'Zonas', text: '' }]);
    expect(timelineToText(t)).toBe('23:00 | Puertas | Llegas y entras\n01:30 | Zonas');
    expect(normalizeLanding({}).timeline.length).toBeGreaterThan(0);
    expect(normalizeLanding({ timeline: [] }).timeline).toEqual([]);
  });
});

describe('logo del socio', () => {
  it('ignora los JPG (traen fondo) y deja pasar PNG/WebP', () => {
    const base = 'https://x.public.blob.vercel-storage.com/coproduction/landing/logo';
    expect(normalizeLanding({ partnerLogoUrl: `${base}.jpeg` }).partnerLogoUrl).toBe('');
    expect(normalizeLanding({ partnerLogoUrl: `${base}.JPG?v=2` }).partnerLogoUrl).toBe('');
    expect(normalizeLanding({ partnerLogoUrl: `${base}.png` }).partnerLogoUrl).toBe(`${base}.png`);
    expect(normalizeLanding({ partnerLogoUrl: `${base}.webp` }).partnerLogoUrl).toBe(`${base}.webp`);
  });
});
