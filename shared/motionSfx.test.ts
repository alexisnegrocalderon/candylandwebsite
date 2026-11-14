import { describe, expect, it } from 'vitest';
import { SFX_FRAMES, maxSimultaneousSfx, sfxSchedule } from './motionSfx';
import { MOTION_STYLES, motionTimeline, normalizeMotionSpec, starterChat, starterSpec } from './motionSpec';
import { LOOK_ALL_AUTO, LOOK_DECOS, resolveLook } from './motionVariety';

/* El reproductor del panel solo deja montar unas pocas etiquetas de audio a la vez (14 en el Estudio; la voz y la música ya
 * usan 2). Si los efectos que suenan juntos se pasan, el video se cae y la pantalla queda en negro. */
const MAX_SFX = 8;

const cutSfx = (style: string) => (style === 'glitch' || style === 'arcade' ? 'glitch' : style === 'collage' ? 'rip' : 'whoosh') as 'glitch' | 'rip' | 'whoosh';

describe('efectos de sonido', () => {
  it('cada efecto dura lo que mide su WAV (con margen): ninguno reserva de más', () => {
    for (const [name, frames] of Object.entries(SFX_FRAMES)) {
      expect(frames).toBeGreaterThanOrEqual(2);
      expect(frames).toBeLessThanOrEqual(30);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('nunca suenan demasiados a la vez, en ninguna combinación de estilo, adorno, gancho, duración y semilla', () => {
    let worst = 0;
    let worstCase = '';
    for (const style of MOTION_STYLES) {
      for (const template of ['anuncio', 'montaje', 'countdown', 'sting'] as const) {
        for (const hook of ['ninguno', 'whatsapp', 'dm', 'notificacion'] as const) {
          for (const deco of LOOK_DECOS) {
            for (const seed of [3, 21, 77]) {
              const base = template === 'anuncio' && hook !== 'ninguno' ? starterChat(style, hook) : starterSpec(template, style);
              const spec = normalizeMotionSpec({ ...base, template, hook, seed, look: { ...LOOK_ALL_AUTO, deco }, durationSecs: seed === 3 ? 20 : null, mascot: { kind: 'pareja', color: 'magenta', size: 'grande', pop: true, style: 'ilustrado', pattern: 'auto' } });
              const timeline = motionTimeline(spec);
              const hits = sfxSchedule({ spec, timeline, look: resolveLook(spec), cutSfx: cutSfx(style), cutFrames: 12, popAt: timeline.total - 20 });
              const n = maxSimultaneousSfx(hits);
              if (n > worst) { worst = n; worstCase = `${style}/${template}/${hook}/${deco}/${seed}`; }
            }
          }
        }
      }
    }
    expect(worst, `el peor caso (${worstCase}) hace sonar ${worst} efectos a la vez`).toBeLessThanOrEqual(MAX_SFX);
  });

  it('sin efectos activados no suena ninguno', () => {
    const spec = normalizeMotionSpec({ ...starterSpec('anuncio', 'liquid'), sfx: false });
    expect(sfxSchedule({ spec, timeline: motionTimeline(spec), look: resolveLook(spec), cutSfx: 'whoosh', cutFrames: 12, popAt: 100 })).toEqual([]);
  });

  it('cuenta bien los que se superponen', () => {
    const hit = (at: number) => ({ key: String(at), at, name: 'pop' as const, volume: 1 });
    expect(maxSimultaneousSfx([hit(0), hit(2), hit(4)])).toBe(3); // pop dura 6 cuadros: a los 4 suenan los tres
    expect(maxSimultaneousSfx([hit(0), hit(6)])).toBe(1); // uno termina justo cuando empieza el otro
    expect(maxSimultaneousSfx([hit(0), hit(40)])).toBe(1);
  });
});
