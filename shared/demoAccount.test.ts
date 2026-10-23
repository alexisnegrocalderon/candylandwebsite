import { describe, expect, it } from 'vitest';
import { DEMO_COMPANIONS, DEMO_TICKET_TYPES, demoAttendeeData, demoEventWindow, demoTicketCode, isDemoAmbassadorCode, isDemoSlug } from './demoAccount';
import { companionsFromCampos } from './repurchase';
import { ticketKind } from './ticketKind';
import { isPartyWindowOpen } from './party';

describe('cuenta de prueba', () => {
  it('los acompañantes se leen igual que los de una compra real', () => {
    const campos = JSON.parse(demoAttendeeData()).campos;
    expect(companionsFromCampos(campos).map((c) => ({ nombre: c.nombre, rut: c.rut }))).toEqual(DEMO_COMPANIONS);
  });

  it('trae un acceso y uno de cada extra que muestra la App', () => {
    expect(DEMO_TICKET_TYPES.map((t) => ticketKind(t.category, t.name)))
      .toEqual(['acceso', 'estacionamiento', 'guardarropia', 'consumo', 'merch', 'extra']);
  });

  it('el código de embajador de prueba no da descuento, pero uno real que empiece parecido sí', () => {
    expect(isDemoAmbassadorCode('DEMO-AB12C')).toBe(true);
    expect(isDemoAmbassadorCode(' demo-ab12c ')).toBe(true);
    expect(isDemoAmbassadorCode('DEMONIO')).toBe(false);
    expect(isDemoAmbassadorCode('CAMI10')).toBe(false);
  });

  it('reconoce sus eventos y nada más', () => {
    expect(isDemoSlug('cuenta-demo')).toBe(true);
    expect(isDemoSlug('cuenta-demo-pasada-2')).toBe(true);
    expect(isDemoSlug('aniversario-2026')).toBe(false);
  });

  it('antes de la fiesta Playmatch está cerrado; durante, abierto', () => {
    const now = new Date('2026-10-23T18:00:00Z');
    expect(isPartyWindowOpen(demoEventWindow('antes', now), now)).toBe(false);
    expect(isPartyWindowOpen(demoEventWindow('durante', now), now)).toBe(true);
  });

  it('códigos con el formato de siempre', () => {
    expect(demoTicketCode(1)).toBe('MP-DEMO-0001');
    expect(demoTicketCode(101)).toBe('MP-DEMO-0101');
  });
});
