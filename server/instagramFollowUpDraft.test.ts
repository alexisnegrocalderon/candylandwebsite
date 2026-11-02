import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeLLM } from './_core/llm';
import { draftFollowUp } from './instagramFollowUpDraft';

vi.mock('./_core/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_core/llm')>();
  return { ...actual, invokeLLM: vi.fn() };
});
vi.mock('./instagramAgent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instagramAgent')>();
  return { ...actual, buildInstagramContext: vi.fn().mockResolvedValue('FECHAS Y ENTRADAS: Dúo [pareja]: $45.000') };
});
const invokeLLMMock = vi.mocked(invokeLLM);
const llm = (payload: unknown) => invokeLLMMock.mockResolvedValueOnce({ choices: [{ message: { content: typeof payload === 'string' ? payload : JSON.stringify(payload) } }] } as any);
const base = { stage: 1 as const, variant: 'silence' as const, history: [{ direction: 'in', text: 'somos pareja' }] as any, customerNotes: 'Viene en pareja', now: new Date('2026-11-02T20:00:00Z') };

describe('draftFollowUp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devuelve el mensaje limpio y el acceso que dijo la IA', async () => {
    llm({ action: 'send', message: '¡Hola! ¿Pudiste ver lo del Dúo? 💜', accessOption: 'pareja', quantity: 2 });
    expect(await draftFollowUp(base)).toEqual({ action: 'send', message: '¡Hola! ¿Pudiste ver lo del Dúo? 💜', accessOption: 'pareja', quantity: 2 });
  });

  it('saca cualquier link del mensaje (los links van solo como botón)', async () => {
    llm({ action: 'send', message: 'Mira acá https://mansionplayroom.cl/entradas si quieres 💜', accessOption: '', quantity: 1 });
    const draft = await draftFollowUp(base);
    expect(draft && draft.action === 'send' && draft.message).not.toContain('mansionplayroom');
  });

  it('si la IA olvida el acceso, lo deduce de la ficha de la persona', async () => {
    llm({ action: 'send', message: 'Hola 💜 ¿Cómo vas con la decisión?', accessOption: '', quantity: 1 });
    const draft = await draftFollowUp(base);
    expect(draft).toMatchObject({ action: 'send', accessOption: 'pareja' });
  });

  it('respeta stop y skip, y no escribe si el mensaje queda vacío', async () => {
    llm({ action: 'stop', message: '', accessOption: '', quantity: 1 });
    expect(await draftFollowUp(base)).toEqual({ action: 'stop' });
    llm({ action: 'skip', message: '', accessOption: '', quantity: 1 });
    expect(await draftFollowUp(base)).toEqual({ action: 'skip' });
    llm({ action: 'send', message: '   ', accessOption: '', quantity: 1 });
    expect(await draftFollowUp(base)).toEqual({ action: 'skip' });
  });

  it('devuelve null si la IA falla o responde algo que no es JSON', async () => {
    llm('esto no es json');
    expect(await draftFollowUp(base)).toBeNull();
    invokeLLMMock.mockRejectedValueOnce(new Error('sin crédito'));
    expect(await draftFollowUp(base)).toBeNull();
  });

  it('el prompt cambia según la variante y el seguimiento', async () => {
    llm({ action: 'skip', message: '', accessOption: '', quantity: 1 });
    await draftFollowUp({ ...base, variant: 'click' });
    llm({ action: 'skip', message: '', accessOption: '', quantity: 1 });
    await draftFollowUp({ ...base, stage: 2 });
    const userOf = (i: number) => String((invokeLLMMock.mock.calls[i][0].messages as any[]).at(-1).content);
    expect(userOf(0)).toContain('tocó el botón de compra');
    expect(userOf(1)).toContain('SEGUIMIENTO FINAL');
    expect(userOf(0)).toContain('Dúo [pareja]');
  });
});
