import { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { songBeatState, songHitFrames, type BeatState } from '../shared/motionSong';
import { useMotion } from './context';

/* El pulso de la música en cada cuadro. Con canción propia sale de su análisis (pulso real, golpes fuertes y
 * energía de cada instante); con una pista de la casa, de su BPM (un golpe fuerte cada compás); sin música, quieto.
 *
 * OJO: lee el cuadro del video entero. Úsalo en capas que van FUERA de las <Sequence> de cada escena (cámara, luz,
 * fondo): dentro de una escena el cuadro es el de la escena y el pulso quedaría corrido. */

export interface Beat extends BeatState {
  /** Hay un pulso que seguir (canción o pista de la casa). */
  has: boolean;
}

const IDLE: Beat = { has: false, index: 0, inBar: 0, phase: 0, pulse: 0, hit: 0, energy: 0.5 };

export function useBeat(): Beat {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { spec, timeline } = useMotion();
  const song = spec.song;
  const hitFrames = useMemo(() => (song ? songHitFrames(song, fps) : []), [song, fps]);
  if (song) return { has: true, ...songBeatState(song, hitFrames, frame, fps) };
  const beatFrames = timeline.beatFrames;
  if (!beatFrames || spec.music === 'none') return IDLE;
  // Pista de la casa: el primer pulso cae en el cuadro 0 y el golpe fuerte en el tiempo 1 de cada compás.
  const pos = frame / beatFrames;
  const index = Math.floor(pos);
  const phase = pos - index;
  const pulse = Math.exp((-phase * beatFrames) / 3.5);
  return { has: true, index, inBar: index % 4, phase, pulse, hit: index % 4 === 0 ? pulse : 0, energy: 0.6 };
}
