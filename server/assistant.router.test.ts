import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import * as assistant from './assistant/run';
import * as customerPush from './customerPush';
import type { TrpcContext } from './_core/context';

vi.mock('./assistant/run', () => ({
  ask: vi.fn(async () => ({ threadId: 1, message: { id: 2, role: 'assistant', ui: { text: 'ok' }, createdAt: '' } })),
  listThreads: vi.fn(async () => []), getThread: vi.fn(async () => null), deleteThread: vi.fn(),
  getProposal: vi.fn(), setProposalState: vi.fn(), claimProposal: vi.fn(),
}));
vi.mock('./customerPush', async (orig) => ({ ...(await orig<typeof import('./customerPush')>()), pushToEmail: vi.fn(async () => 1) }));
vi.mock('./db', async (orig) => ({ ...(await orig<typeof import('./db')>()), recordAdminAudit: vi.fn(), getEventById: vi.fn(async () => ({ id: 4, title: 'Navidad' })) }));

const req = { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as TrpcContext['req'];
const caller = (user: any) => appRouter.createCaller({ user, req, res: {} as TrpcContext['res'] });
const owner = { id: 1, openId: 'x', name: 'Dueño', role: 'admin' } as any; // sesión del panel: sin correo, puede regalar
const otherAdmin = { id: 2, openId: 'y', name: 'Otro', role: 'admin', email: 'otro@correo.cl' } as any;
const proposal = (accion: any, estado = 'pendiente') => ({ proposal: { id: 'p1', resumen: 'x', estado, accion }, ui: { text: '' } });
const push = { tipo: 'push', correo: 'ana@x.cl', titulo: 'Hola', texto: 'Te esperamos' };
const regalo = { tipo: 'regalar', evento_id: 4, correos: ['ana@x.cl'], items: [{ ticket_type_id: 11, cantidad: 1 }], modo: 'directo', cualquier_evento: false, mensaje: null };

beforeEach(() => { vi.clearAllMocks(); });

describe('asistente: quién puede usarlo', () => {
  it('la supervisora, los socios y los visitantes no pueden preguntar ni confirmar', async () => {
    for (const u of [{ id: -1, openId: 's', name: 'Sup', role: 'supervisor' }, { id: -2, openId: 'p', name: 'Socio', role: 'partner' }, null]) {
      await expect(caller(u).assistant.ask({ question: '¿cuánto vendimos?' })).rejects.toBeTruthy();
      await expect(caller(u).assistant.threads()).rejects.toBeTruthy();
      await expect(caller(u).assistant.runAction({ messageId: 1, proposalId: 'p1' })).rejects.toBeTruthy();
    }
    expect(assistant.ask).not.toHaveBeenCalled();
  });

  it('el dueño pregunta con el evento del panel como contexto', async () => {
    await caller(owner).assistant.ask({ question: '¿cómo va?', context: { eventId: 4, section: 'Inicio' } });
    expect(vi.mocked(assistant.ask).mock.calls[0][0]).toMatchObject({ question: '¿cómo va?', context: { eventId: 4, eventTitle: 'Navidad', section: 'Inicio' } });
  });
});

describe('asistente: confirmar acciones', () => {
  it('una acción que no existe o ya se resolvió no se ejecuta', async () => {
    vi.mocked(assistant.getProposal).mockResolvedValueOnce(null);
    await expect(caller(owner).assistant.runAction({ messageId: 1, proposalId: 'p1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    vi.mocked(assistant.getProposal).mockResolvedValueOnce(proposal(push, 'hecha') as any);
    await expect(caller(owner).assistant.runAction({ messageId: 1, proposalId: 'p1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(customerPush.pushToEmail).not.toHaveBeenCalled();
  });

  it('un doble toque no la ejecuta dos veces', async () => {
    vi.mocked(assistant.getProposal).mockResolvedValue(proposal(push) as any);
    vi.mocked(assistant.claimProposal).mockResolvedValueOnce(null);
    await expect(caller(owner).assistant.runAction({ messageId: 1, proposalId: 'p1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(customerPush.pushToEmail).not.toHaveBeenCalled();
  });

  it('regalar exige poder regalar (solo el dueño)', async () => {
    vi.mocked(assistant.getProposal).mockResolvedValue(proposal(regalo) as any);
    await expect(caller(otherAdmin).assistant.runAction({ messageId: 1, proposalId: 'p1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(assistant.claimProposal).not.toHaveBeenCalled();
  });

  it('cancelar deja la acción cancelada sin ejecutar nada', async () => {
    vi.mocked(assistant.getProposal).mockResolvedValue(proposal(push) as any);
    await expect(caller(owner).assistant.runAction({ messageId: 1, proposalId: 'p1', cancel: true })).resolves.toMatchObject({ estado: 'cancelada' });
    expect(assistant.setProposalState).toHaveBeenCalledWith(1, 'p1', 'cancelada');
    expect(customerPush.pushToEmail).not.toHaveBeenCalled();
  });

  it('confirmar una notificación la manda una vez y deja el resultado', async () => {
    vi.mocked(assistant.getProposal).mockResolvedValue(proposal(push) as any);
    vi.mocked(assistant.claimProposal).mockResolvedValueOnce(proposal(push).proposal as any);
    const r = await caller(owner).assistant.runAction({ messageId: 1, proposalId: 'p1' });
    expect(r).toMatchObject({ estado: 'hecha' });
    expect(customerPush.pushToEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(customerPush.pushToEmail).mock.calls[0]).toEqual(['ana@x.cl', { title: 'Hola', body: 'Te esperamos', url: '/cuenta' }]);
    expect(assistant.setProposalState).toHaveBeenLastCalledWith(1, 'p1', 'hecha', expect.stringMatching(/enviada/));
  });
});
