import { describe, expect, it } from 'vitest';
import { isAllowedAssetUrl, sanitizeCss, sanitizeSlideHtml } from './sanitize';

describe('sanitizeSlideHtml', () => {
  it('saca scripts, eventos, iframes y formularios', () => {
    const out = sanitizeSlideHtml('<div class="board" onclick="x()"><script>alert(1)</script><iframe src="https://x.com"></iframe><form><input></form><h1>Hola</h1></div>');
    expect(out).toBe('<div class="board"><h1>Hola</h1></div>');
  });

  it('deja imágenes propias y del Blob, y saca las de afuera', () => {
    const out = sanitizeSlideHtml([
      '<img src="/candyland/logo.png">',
      '<img src="https://abc123.public.blob.vercel-storage.com/studio/foto.jpg">',
      '<img src="https://evil.com/x.png">',
      '<img src="javascript:alert(1)">',
    ].join(''));
    expect(out).toContain('/candyland/logo.png');
    expect(out).toContain('public.blob.vercel-storage.com');
    expect(out).not.toContain('evil.com');
    expect(out).not.toContain('javascript');
  });

  it('mantiene SVG en línea con sus atributos', () => {
    const out = sanitizeSlideHtml('<svg width="66" height="14" viewBox="0 0 66 14" fill="none"><path d="M0 7H64" stroke="#0010DF" stroke-width="2"></path></svg>');
    expect(out).toContain('viewBox="0 0 66 14"');
    expect(out).toContain('stroke-width="2"');
  });

  it('limpia url() de afuera en estilos en línea', () => {
    const out = sanitizeSlideHtml('<div style="background:url(https://evil.com/a.png);color:red">x</div>');
    expect(out).not.toContain('evil.com');
    expect(out).toContain('color:red');
  });
});

describe('sanitizeCss', () => {
  it('saca @import, @font-face, cierres de <style> y url() de afuera', () => {
    const css = sanitizeCss("@import url('https://x.com/a.css');\n@font-face{font-family:X;src:url(https://x.com/f.ttf)}\n.a{background:url('/studio/x.png')}\n.b{background:url(https://evil.com/b.png)}</style><script>");
    expect(css).not.toContain('@import');
    expect(css).not.toContain('@font-face');
    expect(css).not.toContain('evil.com');
    expect(css).not.toContain('</style');
    expect(css).toContain("url('/studio/x.png')");
  });
});

describe('isAllowedAssetUrl', () => {
  it('acepta rutas propias y Blob; rechaza el resto', () => {
    expect(isAllowedAssetUrl('/studio/a.png')).toBe(true);
    expect(isAllowedAssetUrl('https://xyz.public.blob.vercel-storage.com/a.png')).toBe(true);
    expect(isAllowedAssetUrl('//evil.com/a.png')).toBe(false);
    expect(isAllowedAssetUrl('https://evil.com/a.png')).toBe(false);
    expect(isAllowedAssetUrl('data:image/png;base64,xx')).toBe(false);
  });
});
