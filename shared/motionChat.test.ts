import { describe, expect, it } from 'vitest';
import { CHAT_LEAD, CHAT_MAX_MESSAGES, chatMessages, chatMinSecs, chatSchedule } from './motionChat';
import { hookApplies, normalizeMotionSpec, starterChat } from './motionSpec';

describe('gancho de chat', () => {
  it('el primer mensaje es el texto grande, los siguientes las líneas, y se alternan quién habla', () => {
    const m = chatMessages({ text: ' Hola ', items: ['¿Qué?', '', 'Una noche distinta'] });
    expect(m.map((x) => x.text)).toEqual(['Hola', '¿Qué?', 'Una noche distinta']);
    expect(m.map((x) => x.mine)).toEqual([false, true, false]);
    expect(chatMessages({ text: 'a', items: Array.from({ length: 9 }, (_, i) => `m${i}`) })).toHaveLength(CHAT_MAX_MESSAGES);
  });

  it('cada mensaje entra después del anterior, dentro de la escena, y los que llegan «escriben» antes', () => {
    for (const frames of [40, 90, 150]) {
      const beats = chatSchedule(chatMessages({ text: 'a', items: ['b', 'c', 'd'] }), frames);
      beats.forEach((b, i) => {
        expect(b.showAt).toBeGreaterThanOrEqual(CHAT_LEAD);
        if (i > 0) expect(b.showAt).toBeGreaterThan(beats[i - 1].showAt);
        if (b.typingAt != null) expect(b.typingAt).toBeLessThan(b.showAt);
        else expect(i % 2).toBe(1);
      });
    }
    // Con tiempo suficiente, todos caben antes del final de la escena.
    const ok = chatSchedule(chatMessages({ text: 'a', items: ['b', 'c'] }), Math.round(chatMinSecs(3) * 30));
    expect(ok[2].showAt).toBeLessThan(Math.round(chatMinSecs(3) * 30));
  });

  it('un video guardado antes queda sin gancho y un valor raro también; el gancho solo aplica a anuncio y montaje', () => {
    expect(normalizeMotionSpec({ scenes: [{ text: 'a' }] }).hook).toBe('ninguno');
    expect(normalizeMotionSpec({ hook: 'tiktok' }).hook).toBe('ninguno');
    expect(normalizeMotionSpec({ hook: 'dm', hookName: '  Sofi   Playroom ' }).hookName).toBe('Sofi Playroom');
    expect(hookApplies('anuncio') && hookApplies('montaje')).toBe(true);
    expect(hookApplies('countdown') || hookApplies('sting')).toBe(false);
  });

  it('el punto de partida trae la conversación y le da a la escena 1 el tiempo para leerla', () => {
    const s = starterChat('liquid');
    expect(s.hook).toBe('whatsapp');
    expect(chatMessages(s.scenes[0]).length).toBe(3);
    expect(s.scenes[0].secs).toBeGreaterThanOrEqual(chatMinSecs(3));
  });
});
