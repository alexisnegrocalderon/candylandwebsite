import type { MotionStyle } from '../../shared/motionSpec';
import { arcade } from './arcade';
import { collage } from './collage';
import { custom } from './custom';
import { editorial } from './editorial';
import { glitch } from './glitch';
import { kinetic } from './kinetic';
import { liquid } from './liquid';
import { pizarra } from './pizarra';
import { poster } from './poster';
import { softui } from './softui';
import type { Kit } from './shared';

/* Los estilos del Estudio Motion. Cada kit trae su fondo, cómo entra cada
 * palabra, la transición entre escenas y cuánto grade/grano lleva. Las
 * plantillas (scenes.tsx) no saben de estilos: le piden todo al kit. */
export const KITS: Record<MotionStyle, Kit> = { liquid, glitch, editorial, kinetic, poster, softui, arcade, collage, pizarra, custom };

export { bubbleShadow, heroText, type Kit, type WordProps } from './shared';
export { rand } from '../theme';
