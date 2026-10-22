import { describe, expect, it } from 'vitest';
import { dbErrorMessage } from './customerPush';

describe('dbErrorMessage', () => {
  const wrap = (cause: unknown) => Object.assign(new Error('Failed query: insert into `pushCampaigns` (...) params: 🎉 Es Hoy!,secreto'), { cause });
  it('deja solo la causa real y avisa si falta una migración', () => {
    expect(dbErrorMessage(wrap({ sqlMessage: "Unknown column 'titleB' in 'field list'" }))).toBe("Falta aplicar una migración en la base de datos: Unknown column 'titleB' in 'field list'");
    expect(dbErrorMessage(wrap({ message: "Table 'x.pushDeliveries' doesn't exist" }))).toContain('Falta aplicar una migración');
    expect(dbErrorMessage(wrap({ sqlMessage: 'Data too long for column title' }))).toBe('Error de la base de datos: Data too long for column title');
  });
  it('sin causa, nunca muestra el SQL ni los datos', () => {
    const msg = dbErrorMessage(new Error('Failed query: insert into `pushCampaigns` (...) params: 🎉 Es Hoy!,secreto'));
    expect(msg).toBe('Failed query: insert into `pushCampaigns` (...)');
    expect(msg).not.toContain('secreto');
  });
});
