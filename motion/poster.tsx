import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { MOTION_MUSIC_BPM, type MotionScene } from '../shared/motionSpec';
import { useMotion } from './context';
import { IgGlyph } from './hud';
import { syneWidth } from './kinetic';
import { KITS } from './kits';
import { clamp } from './kits/shared';
import { heroWords } from './scenes';
import { BrandObject } from './three/BrandObject';
import { ease, fonts, safeInsets, springs, type } from './theme';

/* Escena del estilo POSTER (referencia C): palabras arriba, la palabra clave
 * gigante abajo y un objeto 3D de marca girando entre ambas, montado encima
 * de las letras. Íconos finos en las esquinas y una línea de datos chica. */

const Heart: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.3 5.3 3.2 1.7-1.9 3.1-3.2 5.3-3.2 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill={color} /></svg>
);

const Loop: React.FC<{ size: number; color: string; flip?: boolean }> = ({ size, color, flip }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
    <path d="M4 9h12a4 4 0 0 1 0 8H9" /><path d="M8 5 4 9l4 4" />
  </svg>
);

export const PosterScene: React.FC<{ scene: MotionScene; index: number; frames: number; role: 'hook' | 'body' | 'cta' }> = ({ scene, index, frames, role }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, width, height, spec, captionsOn } = useMotion();
  const kit = KITS.poster;
  const inset = safeInsets(width, height);
  const usable = width - inset.side * 2;

  const words = scene.text.toUpperCase().split(/\s+/).filter(Boolean);
  let heroes = heroWords(scene.text, scene.highlight);
  if (heroes.size === 0) heroes = new Set([words.length - 1]);
  const top = words.filter((_, i) => !heroes.has(i));
  const bottom = words.filter((_, i) => heroes.has(i));
  const fitLine = (t: string, max: number) => Math.round(Math.min(max, (usable * 0.98) / Math.max(2, syneWidth(t))));
  const topText = top.join(' ');
  const bottomSize = fitLine(bottom.join(' '), 320);
  // La palabra clave manda: lo de arriba nunca es más grande que ~70 % de ella.
  const topSize = top.length ? Math.min(fitLine(top.reduce((a, b) => (syneWidth(b) > syneWidth(a) ? b : a), ''), 190), Math.round(bottomSize * 0.72)) : 0;

  const objSize = Math.round(Math.min(width * 1.0, height * 0.5));
  const beat = spec.music === 'none' ? 45 : Math.round(((fps * 60) / MOTION_MUSIC_BPM[spec.music]) * 4);
  const exit = interpolate(frame, [frames - 8, frames - 1], [0, 1], { easing: ease.in, ...clamp });
  const icons = spring({ frame: frame - 8, fps, config: springs.snappy });
  const info = spring({ frame: frame - 18, fps, config: springs.smooth });
  const kind = role === 'cta' || index % 3 === 2 ? 'corazon' : 'cubo';
  const bottomPad = inset.bottom + (captionsOn ? height * 0.14 : 0);
  // En 9:16 sobra espacio; en 4:5 o cuadrado los íconos de abajo chocan con el HUD y el «Desliza», y los de arriba con su barra.
  const tall = height / width > 1.5;
  const iconTop = tall ? inset.top - 20 : 112;
  const textTop = tall ? inset.top + 70 : 196;

  return (
    <AbsoluteFill style={{ opacity: 1 - exit }}>
      {/* Íconos de esquina. */}
      <div style={{ position: 'absolute', left: inset.side, top: iconTop, transform: `scale(${icons})` }}><Heart size={56} color={palette.hero} /></div>
      <div style={{ position: 'absolute', right: inset.side, top: iconTop, transform: `rotate(${frame * 2}deg) scale(${icons})` }}><Loop size={56} color={palette.display} /></div>
      {tall && (
        <>
          <div style={{ position: 'absolute', left: inset.side, bottom: bottomPad - 10, transform: `scale(${icons})`, opacity: 0.8 }}><Loop size={52} color={palette.hero} flip /></div>
          <div style={{ position: 'absolute', right: inset.side, bottom: bottomPad - 10, transform: `scale(${icons})` }}><IgGlyph size={52} color={palette.display} /></div>
        </>
      )}

      {/* Texto de arriba. */}
      <div style={{ position: 'absolute', left: inset.side, right: inset.side, top: textTop }}>
        {scene.kicker && (
          <div style={{ fontFamily: fonts.grotesk, fontWeight: 700, fontSize: type.micro + 8, letterSpacing: '0.14em', color: palette.hero, marginBottom: 10, opacity: icons }}>
            {scene.kicker.toUpperCase()}
          </div>
        )}
        {top.length > 0 && (
          <div style={{ fontFamily: fonts.syne, fontWeight: 800, fontSize: topSize, lineHeight: 0.86, letterSpacing: kit.letterSpacing, display: 'flex', flexWrap: 'wrap', columnGap: topSize * 0.25, maxWidth: usable }}>
            {topText.split(' ').map((w, i) => <kit.Word key={i} word={w} i={i} delay={2} hero={false} size={topSize} />)}
          </div>
        )}
      </div>

      {/* El objeto 3D, montado sobre las letras. */}
      <div style={{ position: 'absolute', left: (width - objSize) / 2, top: height * 0.5 - objSize * 0.55, width: objSize, height: objSize, zIndex: 2 }}>
        <BrandObject kind={kind} size={objSize} hero={palette.hero} beat={beat} />
      </div>

      {/* La palabra clave gigante, abajo. */}
      <div style={{ position: 'absolute', left: inset.side, right: inset.side, bottom: bottomPad + (tall ? 90 : 110) }}>
        <div style={{ fontFamily: fonts.syne, fontWeight: 800, fontSize: bottomSize, lineHeight: 0.86, letterSpacing: kit.letterSpacing, display: 'flex', flexWrap: 'wrap', columnGap: bottomSize * 0.2 }}>
          {bottom.map((w, i) => <kit.Word key={i} word={w} i={top.length + i} delay={6} hero size={bottomSize} />)}
        </div>
        {scene.sub && (
          <div style={{ marginTop: 18, fontFamily: fonts.grotesk, fontWeight: 600, fontSize: 30, letterSpacing: '0.02em', color: palette.body, opacity: info, maxWidth: usable * 0.75 }}>
            {scene.sub}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
