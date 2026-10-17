import { describe, expect, it } from 'vitest';
import {
  PARTNER_DEFAULT_RULES, hasPartnerAcceptance, normalizePartnerRef, partnerAccessPrice, partnerAllowedAccesos, partnerRulesList,
  priceForPartnerOrder, type PartnerCampaignConfig,
} from './partnerCampaign';

const campaign: PartnerCampaignConfig = { isActive: 1, pricePerPerson: 5000, allowedAccesoSlugs: null, maxPersons: null };
const line = (ticketTypeId: number, accesoSlug: string | null, quantity = 1, category = 'acceso') => ({ ticketTypeId, accesoSlug, quantity, category });

describe('partnerAccessPrice', () => {
  it('cobra el precio por persona por cada persona del acceso', () => {
    expect(partnerAccessPrice(5000, 'soltera')).toBe(5000);
    expect(partnerAccessPrice(5000, 'duo_mujeres')).toBe(10000);
    expect(partnerAccessPrice(5000, 'duo')).toBe(10000);
    expect(partnerAccessPrice(5000, 'trio')).toBe(15000);
    expect(partnerAccessPrice(5000, 'grupo')).toBe(20000);
  });

  it('respeta el precio fijo de la Soltera doble en la comunidad electrónica', () => {
    expect(partnerAccessPrice(6000, 'duo_mujeres', 'electronica')).toBe(10000);
    expect(partnerAccessPrice(6000, 'duo', 'electronica')).toBe(12000);
    expect(priceForPartnerOrder({ ...campaign, slug: 'electronica', pricePerPerson: 6000 }, [line(1, 'duo_mujeres')], 0).unitPrices.get(1)).toBe(10000);
  });

  it('no tiene precio para Soltero ni accesos desconocidos', () => {
    expect(partnerAccessPrice(5000, 'soltero')).toBeNull();
    expect(partnerAccessPrice(5000, 'cumpleaneros')).toBeNull();
    expect(partnerAccessPrice(5000, null)).toBeNull();
  });
});

describe('partnerAllowedAccesos', () => {
  it('por defecto deja todos menos Soltero', () => {
    expect(partnerAllowedAccesos(null)).toEqual(['soltera', 'duo_mujeres', 'duo', 'trio', 'grupo']);
  });

  it('nunca deja pasar Soltero aunque esté configurado', () => {
    expect(partnerAllowedAccesos(['soltero', 'duo'])).toEqual(['duo']);
  });
});

describe('priceForPartnerOrder', () => {
  it('reprecia los accesos y deja los extras a su precio normal', () => {
    const { unitPrices, personas } = priceForPartnerOrder(campaign, [line(1, 'trio'), line(9, null, 2, 'extra')], 0);
    expect(unitPrices.get(1)).toBe(15000);
    expect(unitPrices.get(9)).toBeNull();
    expect(personas).toBe(3);
  });

  it('cuenta personas por cantidad', () => {
    expect(priceForPartnerOrder(campaign, [line(1, 'duo', 2)], 0).personas).toBe(4);
  });

  it('rechaza Soltero', () => {
    expect(() => priceForPartnerOrder(campaign, [line(1, 'soltero')], 0)).toThrow(/no está disponible/);
  });

  it('rechaza una orden sin accesos', () => {
    expect(() => priceForPartnerOrder(campaign, [line(9, null, 1, 'extra')], 0)).toThrow(/Elige un acceso/);
  });

  it('rechaza si el link está cerrado', () => {
    expect(() => priceForPartnerOrder({ ...campaign, isActive: 0 }, [line(1, 'soltera')], 0)).toThrow(/ya no está disponible/);
  });

  it('respeta el tope de personas', () => {
    const capped = { ...campaign, maxPersons: 100 };
    expect(priceForPartnerOrder(capped, [line(1, 'grupo')], 96).personas).toBe(4);
    expect(() => priceForPartnerOrder(capped, [line(1, 'grupo')], 97)).toThrow(/Se agotaron/);
  });
});

describe('hasPartnerAcceptance', () => {
  const data = (partner: unknown) => JSON.stringify({ campos: {}, partner });

  it('exige las tres aceptaciones', () => {
    expect(hasPartnerAcceptance(data({ sigoPlayroom: true, aceptaValores: true, aceptaPermanencia: true }))).toBe(true);
    expect(hasPartnerAcceptance(data({ sigoPlayroom: true, aceptaValores: true, aceptaPermanencia: false }))).toBe(false);
    expect(hasPartnerAcceptance(data(undefined))).toBe(false);
    expect(hasPartnerAcceptance('no es json')).toBe(false);
    expect(hasPartnerAcceptance(undefined)).toBe(false);
  });
});

describe('partnerRulesList', () => {
  it('usa el borrador por defecto si no hay texto', () => {
    expect(partnerRulesList(null)).toEqual(PARTNER_DEFAULT_RULES.split('\n'));
  });

  it('separa por línea y descarta las vacías', () => {
    expect(partnerRulesList('Uno\n\n  Dos  \n')).toEqual(['Uno', 'Dos']);
  });
});

describe('normalizePartnerRef', () => {
  it('acepta las firmas conocidas sin importar mayúsculas', () => {
    expect(normalizePartnerRef('electronica', 'Aldo')).toBe('aldo');
    expect(normalizePartnerRef('electronica', ' german ')).toBe('german');
  });

  it('descarta firmas desconocidas o vacías', () => {
    expect(normalizePartnerRef('electronica', 'otro')).toBeNull();
    expect(normalizePartnerRef('electronica', '')).toBeNull();
    expect(normalizePartnerRef('electronica', undefined)).toBeNull();
    expect(normalizePartnerRef('otra-campana', 'aldo')).toBeNull();
  });
});
