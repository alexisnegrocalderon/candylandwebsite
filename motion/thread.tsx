import { AbsoluteFill } from 'remotion';
import { seededRandom } from '../shared/motionVariety';
import { useMotion } from './context';

/* El «hilo» del carrusel: en cada borde entre dos láminas hay una forma de color
 * centrada justo en la línea, así media forma queda en la lámina de la izquierda
 * y la otra media en la de la derecha, y se completa al deslizar. Posición y
 * tamaño salen de la semilla del video (la misma en ambas mitades). Solo en las
 * láminas del carrusel; en el video no se dibuja. */

export const Thread: React.FC = () => {
  const { slide, width, height, palette, spec } = useMotion();
  if (!slide?.thread || slide.total < 2) return null;

  // Estilos de revista: solo contornos (ya tienen su círculo grande); los demás, formas llenas.
  const outline = spec.style === 'kinetic' || spec.style === 'editorial';
  const half = (boundary: number, localX: number) => {
    const rand = seededRandom(spec.seed * 977 + boundary * 31 + 3);
    const y = height * (0.2 + 0.52 * rand());
    const r = width * (0.11 + 0.07 * rand());
    const filled = !outline && boundary % 2 === 1;
    return (
      <div
        key={boundary}
        style={{
          position: 'absolute', left: localX - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%',
          background: filled ? palette.hero : 'transparent',
          border: filled ? undefined : `3px solid ${boundary % 2 === 1 ? palette.hero : palette.micro}`,
          opacity: filled ? 0.9 : 0.8,
        }}
      />
    );
  };
  return (
    <AbsoluteFill style={{ overflow: 'hidden', pointerEvents: 'none' }}>
      {slide.index < slide.total - 1 && half(slide.index + 1, width)}
      {slide.index > 0 && half(slide.index, 0)}
    </AbsoluteFill>
  );
};
