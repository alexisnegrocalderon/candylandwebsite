import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.fn();
const requestCrossCheck = vi.fn();
vi.mock('./email', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock('./crossCheck', async () => {
  class CrossCheckRetry extends Error {}
  return { CrossCheckRetry, requestCrossCheck: (...a: unknown[]) => requestCrossCheck(...a) };
});

import { OUTREACH_DRAFTS, ensureOutreachDrafts, getOutreachPreview, sendOutreach } from './outreach';

const KEY = 'booking-faedior-playmore-2026';
beforeEach(() => { vi.clearAllMocks(); });

describe('correo de booking por Cross check', () => {
  it('el borrador es el aprobado: destinatario, respuestas a contacto@, titular, set y fecha límite', () => {
    const p = getOutreachPreview(KEY)!;
    expect(p.to).toBe('faediorbooking@gmail.com');
    expect(p.replyTo).toBe('contacto@mansionplayroom.cl');
    expect(p.subject).toBe('Booking · PLAYMORE (Playroom × Dalmore) · Viernes 4 de diciembre, Providencia');
    expect(p.html).toContain('Nos gustaría que FaeDior sea parte de nuestro Line Up');
    expect(p.html).toContain('2:00 – 4:00 AM');
    expect(p.html).toContain('antes del viernes 13 de noviembre');
    expect(p.html).toContain('href="https://playmore.mansionplayroom.cl"');
  });

  it('vence antes de que pase la fecha límite que dice el correo', () => {
    const d = OUTREACH_DRAFTS.find((x) => x.key === KEY)!;
    // viernes 13 de nov 00:00 en Chile (verano, UTC-3) = 03:00 UTC
    expect(d.expiresAt.getTime()).toBeLessThan(new Date('2026-11-13T03:00:00Z').getTime());
  });

  it('lo deja como pedido de Cross check con el tipo «outreach» y no se vuelve a pedir si ya se pidió', async () => {
    requestCrossCheck.mockResolvedValueOnce(true).mockResolvedValue(false);
    expect(await ensureOutreachDrafts(new Date('2026-11-06T20:00:00Z'))).toBe(1);
    expect(requestCrossCheck).toHaveBeenCalledWith(expect.objectContaining({ kind: 'outreach', dedupeKey: `outreach:${KEY}`, payload: { key: KEY } }));
    expect(await ensureOutreachDrafts(new Date('2026-11-06T20:05:00Z'))).toBe(0);
  });

  it('pasada su fecha de vencimiento ya no se pide', async () => {
    expect(await ensureOutreachDrafts(new Date('2026-11-14T12:00:00Z'))).toBe(0);
  });

  it('al reportar manda el correo con «responder a» contacto@ y cuenta a quién salió', async () => {
    sendEmail.mockResolvedValue({ success: true });
    const msg = await sendOutreach(KEY);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'faediorbooking@gmail.com', replyTo: 'contacto@mansionplayroom.cl' }));
    expect(sendEmail.mock.calls[0][0].marketing).toBeUndefined();
    expect(msg).toContain('faediorbooking@gmail.com');
  });

  it('si el envío falla, se puede volver a intentar (no queda como «falló»)', async () => {
    sendEmail.mockResolvedValue({ success: false, reason: 'No API configured' });
    await expect(sendOutreach(KEY)).rejects.toThrow(/Toca Reportar para reintentar/);
  });

  it('un borrador que no existe no manda nada', async () => {
    await expect(sendOutreach('no-existe')).rejects.toThrow();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
