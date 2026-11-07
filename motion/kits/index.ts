import type { MotionStyle } from '../../shared/motionSpec';
import { editorial } from './editorial';
import { glitch } from './glitch';
import { kinetic } from './kinetic';
import { liquid } from './liquid';
import type { Kit } from './shared';

/* Los estilos del Estudio Motion. Cada kit trae su fondo, cómo entra cada
 * palabra, la transición entre escenas y cuánto grade/grano lleva. Las
 * plantillas (scenes.tsx) no saben de estilos: le piden todo al kit. */
export const KITS: Record<MotionStyle, Kit> = { liquid, glitch, editorial, kinetic };

export { bubbleShadow, heroText, type Kit, type WordProps } from './shared';
export { rand } from '../theme';
