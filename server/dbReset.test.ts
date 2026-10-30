import { describe, expect, it } from 'vitest';
import { looksLikeDbConnectionError } from './_core/app';

describe('qué errores descartan la conexión a la base', () => {
  it('un error SQL común (clave duplicada) NO la descarta', () => {
    const err = Object.assign(new Error('Failed query: insert into `partyProfiles` ...'), {
      cause: Object.assign(new Error("Duplicate entry '5' for key 'partyProfiles.ticketId'"), { code: 'ER_DUP_ENTRY' }),
    });
    expect(looksLikeDbConnectionError(err)).toBe(false);
  });
  it('un corte real de conexión sí la descarta', () => {
    const err = Object.assign(new Error('Failed query: insert into `emailEvents` ...'), {
      cause: new Error('This socket has been ended by the other party'),
    });
    expect(looksLikeDbConnectionError(err)).toBe(true);
    expect(looksLikeDbConnectionError(Object.assign(new Error('x'), { cause: new Error('read ECONNRESET') }))).toBe(true);
  });
});
