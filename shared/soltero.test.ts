import { describe, expect, it } from 'vitest';
import { firstPurchaseProblem, needsSolteroApproval, parseDuoComposicion, solteroGateProblem, solteroRequestProblem } from './soltero';

const soltero = { accesoSlug: 'soltero', category: 'acceso' };
const duo = { accesoSlug: 'duo', category: 'acceso' };
const soltera = { accesoSlug: 'soltera', category: 'acceso' };

describe('accesos de hombres solos', () => {
  it('Soltero siempre; Dúo solo si son dos hombres; lo demás nunca', () => {
    expect(needsSolteroApproval([soltero])).toBe(true);
    expect(needsSolteroApproval([duo], 'dos_hombres')).toBe(true);
    expect(needsSolteroApproval([duo], 'mixta')).toBe(false);
    expect(needsSolteroApproval([soltera, { accesoSlug: null, category: 'extra' }])).toBe(false);
  });

  it('lee la composición del Dúo que manda el checkout', () => {
    expect(parseDuoComposicion(JSON.stringify({ duoComposicion: 'dos_hombres' }))).toBe('dos_hombres');
    expect(parseDuoComposicion('no es json')).toBeNull();
    expect(parseDuoComposicion(null)).toBeNull();
  });

  it('el Dúo de dos hombres siempre pide código: la aprobación de soltero no lo desbloquea', () => {
    const duo = { accesoSlug: 'duo', category: 'acceso' };
    const base = { lines: [duo], duoComposicion: 'dos_hombres', buyerEmail: 'ana@x.cl', approvedEmail: 'ana@x.cl' };
    expect(solteroGateProblem(base)).toMatch(/Dúo de dos hombres necesita un código/);
    expect(solteroGateProblem({ ...base, communityCode: 'PAREJAS' })).toBeNull();
    // El Dúo mixto o de dos mujeres no lleva esta regla.
    expect(solteroGateProblem({ ...base, duoComposicion: 'mixta' })).toBeNull();
  });

  it('la campaña aliada no vende accesos de hombres, ni con código ni aprobado', () => {
    const duo = { accesoSlug: 'duo', category: 'acceso' };
    expect(solteroGateProblem({ lines: [soltero], buyerEmail: 'a@x.cl', partner: true, communityCode: 'X', approvedEmail: 'a@x.cl' })).toMatch(/web normal/);
    expect(solteroGateProblem({ lines: [duo], duoComposicion: 'dos_hombres', buyerEmail: 'a@x.cl', partner: true, communityCode: 'X' })).toMatch(/web normal/);
    // Un Dúo mixto por el link de la comunidad sigue entrando.
    expect(solteroGateProblem({ lines: [duo], duoComposicion: 'mixta', buyerEmail: 'a@x.cl', partner: true })).toBeNull();
  });

  it('pasa con código, o aprobado con el mismo correo de la compra', () => {
    const base = { lines: [soltero], buyerEmail: 'Ana@X.cl' };
    expect(solteroGateProblem(base)).toMatch(/código de comunidad o estar aprobado/);
    expect(solteroGateProblem({ ...base, communityCode: 'SOLTEROS' })).toBeNull();
    expect(solteroGateProblem({ ...base, approvedEmail: 'ana@x.cl' })).toBeNull();
    // Aprobado, pero comprando con otro correo (para un amigo sin aprobar): no.
    expect(solteroGateProblem({ ...base, buyerEmail: 'amigo@x.cl', approvedEmail: 'ana@x.cl' })).not.toBeNull();
    expect(solteroGateProblem({ ...base, communityCode: '   ' })).not.toBeNull();
    // Los accesos que no son de hombres solos no piden nada.
    expect(solteroGateProblem({ lines: [soltera], buyerEmail: 'x@x.cl' })).toBeNull();
  });
});

describe('datos obligatorios', () => {
  it('primera compra: documento, Instagram y teléfono', () => {
    expect(firstPurchaseProblem({ doc: '11.111.111-1', instagram: '@ana.perez', phone: '+56 9 1234 5678' })).toBeNull();
    expect(firstPurchaseProblem({ doc: 'AB123456', docTipo: 'passport', instagram: 'ana', phone: '+1 555 123 4567' })).toBeNull();
    expect(firstPurchaseProblem({ doc: '11.111.111-2', instagram: 'ana', phone: '+56912345678' })).toMatch(/RUT/);
    expect(firstPurchaseProblem({ doc: '11.111.111-1', instagram: '', phone: '+56912345678' })).toMatch(/Instagram/);
    expect(firstPurchaseProblem({ doc: '11.111.111-1', instagram: 'https://instagram.com/ana_p', phone: '123' })).toMatch(/WhatsApp/);
  });

  it('solicitud de soltero: nombre y apellido, RUT, Instagram y teléfono', () => {
    const ok = { fullName: 'Juan Pérez', rut: '11.111.111-1', instagram: '@juanp', phone: '+56 9 1234 5678' };
    expect(solteroRequestProblem(ok)).toBeNull();
    expect(solteroRequestProblem({ ...ok, fullName: 'Juan' })).toMatch(/apellido/);
    expect(solteroRequestProblem({ ...ok, rut: 'AB12345' })).toMatch(/RUT/);
  });
});
