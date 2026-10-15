import { describe, expect, it } from 'vitest';
import { buildAdminUrl, parseAdminDeepLink } from './adminDeepLink';

describe('adminDeepLink', () => {
  it('ida y vuelta', () => {
    const url = buildAdminUrl({ section: 'instagram', tab: 'comentarios', comment: 42 });
    expect(url).toBe('/admin?section=instagram&tab=comentarios&comment=42');
    expect(parseAdminDeepLink(url)).toEqual({ section: 'instagram', tab: 'comentarios', comment: 42 });
  });
  it('lee un location.search', () => {
    expect(parseAdminDeepLink('?section=whatsapp&thread=7')).toEqual({ section: 'whatsapp', thread: 7 });
  });
  it('descarta valores raros', () => {
    expect(parseAdminDeepLink('?section=<script>')).toBeNull();
    expect(parseAdminDeepLink('?section=instagram&tab=x y&thread=-3&comment=abc')).toEqual({ section: 'instagram' });
    expect(parseAdminDeepLink('')).toBeNull();
  });
});
