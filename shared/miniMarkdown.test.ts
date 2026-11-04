import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './miniMarkdown';

describe('markdown mínimo del asistente', () => {
  it('negritas, cursivas y código', () => {
    expect(parseInline('Vendiste **$1.234.567** en _Aniversario_ con `web`')).toEqual([
      { t: 'text', v: 'Vendiste ' }, { t: 'bold', v: '$1.234.567' }, { t: 'text', v: ' en ' }, { t: 'italic', v: 'Aniversario' }, { t: 'text', v: ' con ' }, { t: 'code', v: 'web' },
    ]);
  });

  it('no confunde guiones bajos dentro de palabras ni signos sueltos', () => {
    expect(parseInline('ticket_type_id 2 * 3')).toEqual([{ t: 'text', v: 'ticket_type_id 2 * 3' }]);
  });

  it('títulos, párrafos, listas y tablas', () => {
    const md = ['## Resumen', 'Vendiste mucho.', 'Muy bien.', '', '- Web: **$10**', '- Caja: $5', '', '1. Uno', '2. Dos', '', '| Fiesta | Ganancia |', '|---|---:|', '| Aniv | $10 |', '| Nav | $5 |', '', '_Fuente: Finanzas._'].join('\n');
    const b = parseMarkdown(md);
    expect(b.map((x) => x.kind)).toEqual(['heading', 'paragraph', 'list', 'list', 'table', 'paragraph']);
    expect(b[1]).toEqual({ kind: 'paragraph', inline: [{ t: 'text', v: 'Vendiste mucho. Muy bien.' }] });
    expect((b[2] as any).items).toHaveLength(2);
    expect((b[3] as any).ordered).toBe(true);
    const t = b[4] as any;
    expect(t.header.map((h: any) => h[0].v)).toEqual(['Fiesta', 'Ganancia']);
    expect(t.align).toEqual(['left', 'right']);
    expect(t.rows).toHaveLength(2);
    expect(b[5]).toEqual({ kind: 'paragraph', inline: [{ t: 'italic', v: 'Fuente: Finanzas.' }] });
  });

  it('el HTML queda como texto', () => {
    expect(parseMarkdown('<script>alert(1)</script>')).toEqual([{ kind: 'paragraph', inline: [{ t: 'text', v: '<script>alert(1)</script>' }] }]);
  });
});
