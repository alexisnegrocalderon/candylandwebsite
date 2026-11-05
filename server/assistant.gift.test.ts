import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import * as assistant from './assistant/run';
import * as accessCredit from './accessCredit';
import type { TrpcContext } from './_core/context';

vi.mock('./assistant/run', () => ({
  ask: vi.fn(), listThreads: vi.fn(), getThread: vi.fn(), deleteThread: vi.fn(),
  getProposal: vi.fn(), setProposalState: vi.fn(async () => {}), claimProposal: vi.fn(),
}));
vi.mock('./accessCredit', async (orig) => ({ ...(await orig<typeof import('./accessCredit')>()), issueGiftPass: vi.fn(async () => ({ code: 'CREDITO-K7M2QX', creditId: 1, emailSent: true })) }));
vi.mock('./appDevices', async (orig) => ({ ...(await orig<typeof import('./appDevices')>()), appUserEmails: vi.fn(async () => new Set(['con-app@x.cl'])) }));
vi.mock('./staffPortal', async (orig) => ({ ...(await orig<typeof import('./staffPortal')>()), findStaffByEmail: vi.fn(async () => null) }));
vi.mock('./customerPush', async (orig) => ({ ...(await orig<typeof import('./customerPush')>()), pushToEmail: vi.fn(async () => 1) }));
vi.mock('./db', async (orig) => ({
  ...(await orig<typeof import('./db')>()),
  recordAdminAudit: vi.fn(), getCustomerByEmail: vi.fn(async () => null),
  getEventById: vi.fn(async () => ({ id: 4, title: 'Navidad', slug: 'nav', eventDate: new Date('2026-12-20T23:00:00Z') })),
  getTicketTypesByEventId: vi.fn(async () => [{ id: 11, name: 'ACCESO DÚO', category: 'acceso', accesoSlug: 'duo' }]),
}));

const req = { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as TrpcContext['req'];
const owner = { id: 1, openId: 'x', name: 'Dueño', role: 'admin' } as any;
const caller = () => appRouter.createCaller({ user: owner, req, res: {} as TrpcContext['res'] });
const pase = (correo: string) => ({ proposal: { id: 'p1', resumen: 'x', estado: 'pendiente', accion: { tipo: 'regalar', evento_id: 4, correos: [correo], items: [{ ticket_type_id: 11, cantidad: 1 }], modo: 'pase', cualquier_evento: true, mensaje: null } }, ui: { text: '' } });

beforeEach(() => { vi.clearAllMocks(); });

describe('asistente: regalar un pase para cualquier evento', () => {
  it('crea un pase a elección sin evento y dice a qué correo quedó, con su código', async () => {
    vi.mocked(assistant.getProposal).mockResolvedValue(pase('con-app@x.cl') as any);
    vi.mocked(assistant.claimProposal).mockResolvedValueOnce(pase('con-app@x.cl').proposal as any);
    const r = await caller().assistant.runAction({ messageId: 1, proposalId: 'p1' });
    expect(vi.mocked(accessCredit.issueGiftPass).mock.calls[0][0]).toMatchObject({ email: 'con-app@x.cl', eventId: null, accesoSlug: '*', validUntil: null });
    expect(r.estado).toBe('hecha');
    expect(r.resultado).toMatch(/con-app@x\.cl \(código CREDITO-K7M2QX\)/);
    expect(r.resultado).not.toMatch(/todavía no se abrió la app/);
  });

  it('avisa cuando ese correo no tiene la app abierta (el pase queda en su cuenta, pero no lo verá hasta entrar con él)', async () => {
    vi.mocked(assistant.getProposal).mockResolvedValue(pase('admin@mansionplayroom.cl') as any);
    vi.mocked(assistant.claimProposal).mockResolvedValueOnce(pase('admin@mansionplayroom.cl').proposal as any);
    const r = await caller().assistant.runAction({ messageId: 1, proposalId: 'p1' });
    expect(r.resultado).toMatch(/admin@mansionplayroom\.cl \(código CREDITO-K7M2QX\)/);
    expect(r.resultado).toMatch(/ojo: con ese correo todavía no se abrió la app/);
  });
});
