import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeLLM } from './_core/llm';
import * as db from './db';
import { buildPlanRequest, generateContentPlan } from './contentPlanner';

vi.mock('./_core/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_core/llm')>();
  return { ...actual, invokeLLM: vi.fn() };
});
const invokeLLMMock = vi.mocked(invokeLLM);

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    getEventById: vi.fn(),
    getFeaturedEvent: vi.fn(),
    getSiteSettings: vi.fn(),
    listActiveIgKeywordAutomations: vi.fn(),
    getAccessTicketMix: vi.fn(),
  };
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-02T12:00:00Z'); // viernes 2 de octubre
const event = {
  id: 7, title: 'Aniversario', slug: 'aniversario', venue: 'La Mansión', shortDescription: 'Dos años de fiestas.',
  eventDate: new Date(NOW.getTime() + 28 * DAY), status: 'published', tandaPhaseIndex: 0,
  tandaDiscountSchedule: [{ percent: 40, untilDate: '2026-10-12T03:00:00Z' }, { percent: 20 }],
};

const piece = (over: Record<string, unknown> = {}) => ({
  date: '2026-10-06', time: '19:00', format: 'historia', goal: 'confianza', hook: 'Primera vez', caption: 'Te cuento cómo es.', visual: 'Grabar la fachada', hashtags: ['MansionPlayroom'], keyword: '', ...over,
});

const reply = (pieces: unknown[]) => ({
  id: 'x', created: 0, model: 'm',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ summary: 'Primero confianza, después urgencia.', pieces }) } }],
}) as any;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.getEventById).mockResolvedValue(event as any);
  vi.mocked(db.getFeaturedEvent).mockResolvedValue(event as any);
  vi.mocked(db.getSiteSettings).mockResolvedValue({ instagramAgentConfig: { brandNotes: 'Tono cercano y respetuoso.', styleExamples: 'jaja dale, nos vemos!' } } as any);
  vi.mocked(db.listActiveIgKeywordAutomations).mockResolvedValue([
    { keyword: 'ENTRADA', triggerSource: 'story_reply' },
    { keyword: 'GUIA', triggerSource: 'both' },
    { keyword: 'COMENTA', triggerSource: 'comment' },
  ] as any);
  vi.mocked(db.getAccessTicketMix).mockResolvedValue([{ name: 'Dúo', price: '24000', originalPrice: '40000', totalStock: 999999, soldCount: 3, status: 'active' }] as any);
});

describe('buildPlanRequest', () => {
  it('le da a la IA la ventana, los datos reales, el tono y solo las palabras clave que funcionan', async () => {
    const { userContent, window, keywords } = await buildPlanRequest(undefined, NOW);
    expect(window).toEqual({ from: '2026-10-03', to: '2026-10-23', days: 21 });
    expect(userContent).toContain('Ventana para planificar: del 2026-10-03');
    expect(userContent).toContain('Evento: Aniversario');
    expect(userContent).toContain('Entradas desde $24.000');
    expect(userContent).toContain('rige hasta'); // cambio de tanda real
    expect(userContent).toContain('Tono cercano y respetuoso.');
    expect(userContent).toContain('jaja dale');
    expect(userContent).toContain('Disfraz obligatorio'); // dress code de la marca
    // "comentar" no dispara nada todavía (Meta no aprobó el permiso)
    expect(keywords).toEqual(['ENTRADA', 'GUIA']);
    expect(userContent).toContain('ENTRADA, GUIA');
    expect(userContent).not.toContain('COMENTA');
  });

  it('un evento que es hoy o ya pasó no se planifica', async () => {
    vi.mocked(db.getFeaturedEvent).mockResolvedValue({ ...event, eventDate: new Date(NOW.getTime() + 3 * 60 * 60 * 1000) } as any);
    await expect(buildPlanRequest(undefined, NOW)).rejects.toThrow(/es hoy o ya pasó/);
  });

  it('sin evento publicado da un error claro', async () => {
    vi.mocked(db.getFeaturedEvent).mockResolvedValue(undefined as any);
    await expect(buildPlanRequest(undefined, NOW)).rejects.toThrow(/ningún evento publicado/);
  });
});

describe('generateContentPlan', () => {
  it('devuelve el plan con las piezas limpias y ordenadas', async () => {
    invokeLLMMock.mockResolvedValue(reply([piece({ date: '2026-10-09', hook: 'B' }), piece({ date: '2026-10-06', hook: 'A' })]));
    const plan = await generateContentPlan(undefined, NOW);
    expect(plan).toMatchObject({ eventId: 7, eventTitle: 'Aniversario', from: '2026-10-03', to: '2026-10-23' });
    expect(plan.pieces.map((p) => p.hook)).toEqual(['A', 'B']);
    expect(plan.summary).toContain('confianza');
  });

  it('descarta las piezas con fecha fuera de la ventana', async () => {
    invokeLLMMock.mockResolvedValue(reply([piece({ date: '2026-10-02' }), piece({ date: '2026-11-15' }), piece({ date: '2026-10-08' })]));
    const plan = await generateContentPlan(undefined, NOW);
    expect(plan.pieces.map((p) => p.date)).toEqual(['2026-10-08']);
  });

  it('borra la palabra clave si la IA se la inventó o no es una historia', async () => {
    invokeLLMMock.mockResolvedValue(reply([
      piece({ date: '2026-10-06', keyword: 'entrada' }),                     // historia + palabra real (da igual la mayúscula) -> se queda
      piece({ date: '2026-10-07', keyword: 'INVENTADA' }),                    // no existe -> se borra
      piece({ date: '2026-10-08', format: 'reel', keyword: 'ENTRADA' }),      // un reel no se responde -> se borra
      piece({ date: '2026-10-09', keyword: 'COMENTA' }),                      // la de comentarios no funciona -> se borra
    ]));
    const plan = await generateContentPlan(undefined, NOW);
    expect(plan.pieces.map((p) => p.keyword)).toEqual(['entrada', '', '', '']);
  });

  it('si no queda ninguna pieza válida, falla en vez de entregar un calendario vacío', async () => {
    invokeLLMMock.mockResolvedValue(reply([piece({ date: '2030-01-01' })]));
    await expect(generateContentPlan(undefined, NOW)).rejects.toThrow(/ninguna publicación válida/);
  });

  it('el pedido a la IA lleva las reglas duras: sin URLs, sin "comenta X", urgencia solo real', async () => {
    invokeLLMMock.mockResolvedValue(reply([piece()]));
    await generateContentPlan(undefined, NOW);
    const system = (invokeLLMMock.mock.calls[0][0].messages[0] as any).content as string;
    expect(system).toContain('ninguna URL');
    expect(system).toContain('NO pidas "comenta X"');
    expect(system).toContain('solo si es real');
    expect(system).toContain('nada sexual explícito');
  });
});
