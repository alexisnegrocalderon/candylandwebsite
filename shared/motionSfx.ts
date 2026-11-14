import { chatMessages, chatSchedule } from './motionChat';
import { hookApplies, type MotionSpec, type MotionTimeline } from './motionSpec';
import type { ResolvedLook } from './motionVariety';

/* El calendario de efectos de sonido de un video: qué suena, en qué cuadro y a qué volumen. Es PURO (sin React) para poder
 * revisarlo en pruebas: el reproductor del panel solo deja montar unas pocas etiquetas de audio a la vez, y si se pasan el
 * video se cae (le pasó a las plantillas con stickers y chat). */

export type SfxName = 'whoosh' | 'glitch' | 'rip' | 'bass' | 'riser' | 'pop' | 'tick' | 'sparkle' | 'coin' | 'thud' | 'ding' | 'send' | 'buzz';

/** Cuadros que dura cada efecto (lo que mide su WAV, con un margen): cada uno monta su etiqueta de audio solo ese rato. */
export const SFX_FRAMES: Record<SfxName, number> = {
  whoosh: 14, glitch: 9, bass: 17, riser: 29, pop: 6, tick: 3, sparkle: 17, coin: 11, thud: 12, rip: 11, ding: 15, send: 6, buzz: 12,
};

export interface SfxHit {
  key: string;
  at: number;
  name: SfxName;
  volume: number;
}

export function sfxSchedule(input: {
  spec: MotionSpec;
  timeline: MotionTimeline;
  look: ResolvedLook;
  /** Efecto del corte de escena del estilo. */
  cutSfx: 'whoosh' | 'glitch' | 'rip';
  /** Cuadros que dura el corte del estilo. */
  cutFrames: number;
  /** Cuadro en que revienta el perrito (null = no revienta). */
  popAt: number | null;
}): SfxHit[] {
  const { spec, timeline, look, cutSfx, cutFrames, popAt } = input;
  if (!spec.sfx) return [];
  const hits: SfxHit[] = [];
  const add = (key: string, at: number, name: SfxName, volume: number) => hits.push({ key, at: Math.max(0, at), name, volume });
  // Con la canción de fondo los efectos van más bajos (ya trae su propio bombo) y no se agrega el golpe de apertura.
  const g = spec.song ? 0.55 : 1;
  if (!spec.song) add('open', 0, 'bass', 0.7);
  timeline.scenes.slice(1).forEach((t) => add(`cut${t.index}`, t.from - cutFrames / 2 - 2, cutSfx, (cutSfx === 'glitch' ? 0.45 : 0.55) * g));
  if (spec.template === 'countdown') {
    for (let f = 4; f < 28; f += 4) add(`t${f}`, f, 'tick', 0.4);
    add('slam', 25, 'pop', 0.7);
  }
  if (timeline.outroFrom != null) {
    add('rise', timeline.outroFrom - 26, 'riser', 0.4 * g);
    add('mark', timeline.outroFrom, 'bass', 0.7 * g);
  }
  if (spec.template === 'sting') add('pop', 14, 'pop', 0.6);
  // Gancho de chat: ding cuando llega un mensaje, barrido cuando se envía el tuyo, y la notificación hace vibrar el celular.
  if (spec.hook !== 'ninguno' && hookApplies(spec.template) && timeline.scenes[0]) {
    const t0 = timeline.scenes[0];
    const msgs = chatMessages(spec.scenes[0]);
    chatSchedule(msgs, t0.frames).forEach((b) => {
      const at = t0.from + b.showAt;
      if (spec.hook === 'notificacion') {
        add(`chat-buzz${b.index}`, at, 'buzz', 0.55 * g);
        add(`chat-ding${b.index}`, at + 2, 'ding', 0.4 * g);
      } else add(`chat${b.index}`, at, msgs[b.index].mine ? 'send' : 'ding', (msgs[b.index].mine ? 0.5 : 0.6) * g);
    });
  }
  // Cada adorno del look suena cuando aparece (en cada escena), igual que se ve.
  if (spec.template !== 'sting') {
    timeline.scenes.forEach((t) => {
      const at = (n: number) => t.from + n;
      if (look.deco === 'sello') add(`deco-sello${t.index}`, at(10), 'thud', 0.7 * g);
      else if (look.deco === 'destellos') add(`deco-sparkle${t.index}`, at(4), 'sparkle', 0.5 * g);
      else if (look.deco === 'cintas') add(`deco-rip${t.index}`, at(3), 'rip', 0.45 * g);
      else if (look.deco === 'stickers') [5, 9, 13, 17].forEach((n) => add(`deco-st${t.index}-${n}`, at(n), 'pop', 0.32 * g));
      if (spec.style === 'arcade') add(`coin${t.index}`, at(2), 'coin', 0.4 * g);
    });
  }
  // El perrito globo revienta con un «pop».
  if (popAt != null) add('mascot-pop', popAt, 'pop', 0.8);
  return hits;
}

/** Cuántos efectos suenan a la vez como máximo (cada uno ocupa una etiqueta de audio mientras dura). */
export function maxSimultaneousSfx(hits: SfxHit[]): number {
  const edges: Array<[number, number]> = [];
  for (const h of hits) {
    edges.push([h.at, 1], [h.at + SFX_FRAMES[h.name], -1]);
  }
  // En un mismo cuadro, primero terminan los que acaban y después empiezan los nuevos.
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0;
  let max = 0;
  for (const [, d] of edges) {
    now += d;
    max = Math.max(max, now);
  }
  return max;
}
