import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./members', () => ({ getMemberConfig: vi.fn() }));
vi.mock('./memberCards', () => ({ storedMpCustomerId: vi.fn(async () => 'cus_123'), saveCardFromToken: vi.fn() }));

import { getMemberConfig } from './members';
import { memberCardContext } from './webhooks';
import { parsePayToken, supervisorIdFromPayToken } from './memberPay';
import { isPayQr, parseTicketCodeFromQr, PAY_QR_PREFIX } from '../shared/qr';
import { normalizeMemberConfig, DEFAULT_MEMBER_CONFIG } from '../shared/memberConfig';

const cfg = (savedCards: boolean) => ({ ...DEFAULT_MEMBER_CONFIG, payments: { savedCards, accountTopup: false, cajaPay: false } });

describe('pagos de socios: interruptores', () => {
  it('arrancan apagados y solo se prenden con true explícito', () => {
    expect(normalizeMemberConfig({}).payments).toEqual({ savedCards: false, accountTopup: false, cajaPay: false });
    expect(normalizeMemberConfig({ payments: { savedCards: 'yes', cajaPay: true } }).payments).toEqual({ savedCards: false, accountTopup: false, cajaPay: true });
  });
});

describe('tarjetas guardadas: nunca con el cliente de otra persona', () => {
  beforeEach(() => vi.mocked(getMemberConfig).mockResolvedValue(cfg(true) as any));

  it('usa el cliente de Mercado Pago solo si la sesión es del mismo correo de la orden', async () => {
    expect(await memberCardContext('ana@x.cl', 'Ana@X.cl ')).toEqual({ email: 'ana@x.cl', mpCustomerId: 'cus_123' });
    expect(await memberCardContext('otra@x.cl', 'ana@x.cl')).toBeNull();
    expect(await memberCardContext(null, 'ana@x.cl')).toBeNull();
  });

  it('con el interruptor apagado no se usa nunca', async () => {
    vi.mocked(getMemberConfig).mockResolvedValue(cfg(false) as any);
    expect(await memberCardContext('ana@x.cl', 'ana@x.cl')).toBeNull();
  });
});

describe('QR de «Pagar en caja»', () => {
  const token = `${PAY_QR_PREFIX}AbCdEfGhIjKlMnOp.ZyXwVuTsRqPoNmLkJiHgFe`;
  it('no se confunde con el QR de una entrada', () => {
    expect(isPayQr(token)).toBe(true);
    expect(parseTicketCodeFromQr(token)).toBeNull();
    expect(isPayQr('https://mansionplayroom.cl/verificar/MP-ABC123')).toBe(false);
  });
  it('se separa en nonce y firma, y rechaza formas raras', () => {
    expect(parsePayToken(token)).toEqual({ nonce: 'AbCdEfGhIjKlMnOp', sig: 'ZyXwVuTsRqPoNmLkJiHgFe' });
    expect(parsePayToken('PLAYPAY:v1:sinfirma')).toBeNull();
    expect(parsePayToken('PLAYPAY:v1:a.b')).toBeNull();
    expect(parsePayToken('MP-ABC123')).toBeNull();
  });
});

describe('token de supervisor (cobro sin PIN)', () => {
  it('lleva el id del supervisor en el nonce y un QR normal no', () => {
    expect(supervisorIdFromPayToken(`${PAY_QR_PREFIX}SUPAUTH_12_AbCdEfGhIjKlMnOp.ZyXwVuTsRqPoNmLkJiHgFe`)).toBe(12);
    expect(supervisorIdFromPayToken(`${PAY_QR_PREFIX}AbCdEfGhIjKlMnOp.ZyXwVuTsRqPoNmLkJiHgFe`)).toBeNull();
    expect(supervisorIdFromPayToken('MP-ABC123')).toBeNull();
  });
});
