import { describe, expect, it } from 'vitest';
import { buildAccessCreditEmail } from './email';

describe('buildAccessCreditEmail', () => {
  it('incluye el código, el tipo de acceso y el recordatorio de la preventa', () => {
    const html = buildAccessCreditEmail({ buyerName: 'Mauricio', originEventTitle: '2do Aniversario de PlayRoom', credits: [{ code: 'CREDITO-K7M2QX', accesoName: 'ACCESO DÚO' }] });
    expect(html).toContain('CREDITO-K7M2QX');
    expect(html).toContain('ACCESO DÚO');
    expect(html).toContain('preventa');
    expect(html).toContain('2do Aniversario de PlayRoom');
  });
  it('escapa el HTML de los datos y pluraliza con varios créditos', () => {
    const html = buildAccessCreditEmail({ buyerName: '<b>x</b>', originEventTitle: 'Fiesta', credits: [{ code: 'CREDITO-AAAAAA', accesoName: 'DÚO' }, { code: 'CREDITO-BBBBBB', accesoName: 'DÚO' }], reminder: true });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('CREDITO-AAAAAA');
    expect(html).toContain('CREDITO-BBBBBB');
    expect(html).toContain('Tus códigos');
  });
});
