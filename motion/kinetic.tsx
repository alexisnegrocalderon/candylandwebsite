import { AbsoluteFill, Img, interpolate, OffthreadVideo, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { MotionScene } from '../shared/motionSpec';
import { useMotion } from './context';
import { kineticPace } from './kits/kinetic';
import { AccentCircle, clamp } from './kits/shared';
import { syneWidth } from './measure';
import { heroWords, Kicker } from './scenes';
import { useMagazine } from './layouts';
import { ease, fonts, safeInsets, springs } from './theme';

/* Escena del estilo KINETIC (referencia A): una frase que se arma palabra a
 * palabra. Las palabras que acompañan entran chicas y en gris; la que carga el
 * sentido entra enorme, con máscara. Detrás: el círculo de acento (con la foto
 * adentro, si hay), y la misma palabra gigante en contorno saliendo por abajo. */

const SMALL = 62;

function fit(text: string, usable: number, max: number): number {
  return Math.round(Math.min(max, (usable * 0.96) / Math.max(2.5, syneWidth(text))));
}

export const KineticScene: React.FC<{ scene: MotionScene; index: number; frames: number; role: 'hook' | 'body' | 'cta' }> = ({ scene, index, frames, role }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, width, height, captionsOn, spec } = useMotion();
  const inset = safeInsets(width, height);
  const usable = width - inset.side * 2;

  const words = scene.text.split(/\s+/).filter(Boolean);
  let heroes = heroWords(scene.text, scene.highlight);
  if (heroes.size === 0 && words.length) {
    const longest = words.reduce((best, w, i) => (w.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '').length > words[best].replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '').length ? i : best), 0);
    heroes = new Set([longest]);
  }
  const first = Math.min(...Array.from(heroes));
  const last = Math.max(...Array.from(heroes));
  const pre = words.slice(0, first);
  const hero = words.slice(first, last + 1);
  const post = words.slice(last + 1);
  const heroLine = hero.join(' ');
  // Composición de la escena: dónde va el bloque de texto, de qué lado, y dónde caen las formas.
  const { geo } = useMagazine(index);
  const heroSize = fit(heroLine, usable, (role === 'hook' ? 280 : 240) * geo.heroScale);

  const pace = kineticPace(words.length, frames);
  const at = (i: number) => 6 + i * pace + (i >= first ? 4 : 0) + (i > last ? 4 : 0);

  // Salida: la palabra grande crece y se desenfoca (casi un match cut).
  const exit = interpolate(frame, [frames - 9, frames - 1], [0, 1], { easing: ease.in, ...clamp });

  const smallWord = (w: string, i: number, color: string) => {
    const p = spring({ frame: frame - at(i), fps, config: springs.snappy });
    return (
      <span key={i} style={{ display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 22}px)`, filter: `blur(${(1 - p) * 6}px)`, color }}>
        {w}
      </span>
    );
  };

  // Círculo: la forma de la composición (se desliza desde donde estaba en la escena anterior).
  const cx = width * geo.circle.x;
  const cy = height * geo.circle.y;
  const r = width * geo.circle.r * (scene.media ? 1.18 : 1);
  const circleP = spring({ frame: frame - 2, fps, config: springs.heavy });
  const outline = (hero[0] ?? '').toUpperCase();
  const slide = interpolate(frame, [0, frames], [0, -width * 0.25], { easing: ease.inOut, ...clamp });
  const montage = spec.template === 'montaje' && !!scene.media;

  // Composición: dónde va el bloque de texto y de qué lado.
  const tall = height / width > 1.5;
  const anchor = geo.anchor;
  const split = anchor === 'split';
  const alignItems = geo.align === 'right' ? 'flex-end' : 'flex-start';
  const rowJustify = geo.align === 'right' ? 'flex-end' : 'flex-start';
  const justifyContent = anchor === 'top' ? 'flex-start' : anchor === 'center' ? 'center' : split ? 'space-between' : 'flex-end';
  const topPad = inset.top + (tall ? 30 : 120);
  const bottomPad = inset.bottom + (captionsOn ? height * 0.16 : 0) + (anchor === 'bottom' || split ? height * 0.06 : 0);
  const groupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems, gap: 10 };
  const rowStyle: React.CSSProperties = { fontFamily: fonts.grotesk, fontWeight: 500, fontSize: SMALL, lineHeight: 1.08, letterSpacing: '-0.02em', display: 'flex', flexWrap: 'wrap', columnGap: 16, justifyContent: rowJustify };
  const kickerEl = scene.kicker ? <div style={{ marginBottom: 18 }}><Kicker text={scene.kicker} /></div> : null;
  const preEl = pre.length > 0 ? <div style={{ ...rowStyle, maxWidth: usable * 0.82 }}>{pre.map((w, k) => smallWord(w, k, palette.muted))}</div> : null;
  const heroEl = (
    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: heroSize * 0.2, justifyContent: rowJustify }}>
      {hero.map((w, k) => {
        const i = first + k;
        const p = interpolate(frame - at(i), [0, 16], [0, 1], { easing: ease.out, ...clamp });
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: heroSize * 0.08, marginBottom: -heroSize * 0.08 }}>
            <span
              style={{
                display: 'inline-block', fontFamily: fonts.syne, fontWeight: 800, fontSize: heroSize, lineHeight: 0.95,
                letterSpacing: `${interpolate(p, [0, 1], [0.02, -0.05])}em`, color: palette.display,
                transform: `translateY(${(1 - p) * 105}%) scale(${1 + exit * 0.18})`, filter: `blur(${exit * 14}px)`,
                transformOrigin: geo.align === 'right' ? '100% 100%' : '0% 100%',
              }}
            >
              {w}
            </span>
          </span>
        );
      })}
    </div>
  );
  const postEl = post.length > 0 ? <div style={{ ...rowStyle, maxWidth: usable }}>{post.map((w, k) => smallWord(w, last + 1 + k, palette.body))}</div> : null;
  const subEl = scene.sub ? (
    <div style={{ marginTop: 18, fontFamily: fonts.grotesk, fontWeight: 400, fontSize: 36, lineHeight: 1.35, color: palette.muted, maxWidth: usable * 0.8, textAlign: geo.align, opacity: spring({ frame: frame - at(words.length) - 4, fps, config: springs.smooth }) }}>
      {scene.sub}
    </div>
  ) : null;
  const ctaEl = role === 'cta' ? (
    <div style={{ marginTop: 22, height: 10, width: 300 * interpolate(frame - at(words.length), [0, 16], [0, 1], { easing: ease.out, ...clamp }), background: palette.hero, borderRadius: 5 }} />
  ) : null;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {/* Montaje: la foto a todo el cuadro, en blanco y negro con tinte. */}
      {montage && scene.media && (
        <AbsoluteFill style={{ opacity: circleP }}>
          {scene.media.kind === 'video'
            ? <OffthreadVideo src={scene.media.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(1) contrast(1.15)' }} />
            : <Img src={scene.media.url} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(1) contrast(1.15)', transform: `scale(${1.04 + 0.06 * (frame / frames)})` }} />}
          <AbsoluteFill style={{ background: palette.bg, mixBlendMode: 'multiply', opacity: 0.35 }} />
          <AbsoluteFill style={{ background: `linear-gradient(180deg, transparent 35%, ${palette.bg2}EE 88%)` }} />
        </AbsoluteFill>
      )}

      {/* Palabra gigante en contorno saliendo por abajo (del lado contrario al texto, que corre en sentido opuesto). */}
      <div
        style={{
          position: 'absolute', ...(geo.align === 'right' ? { right: 0 } : { left: 0 }), bottom: -height * 0.06, whiteSpace: 'nowrap',
          fontFamily: fonts.syne, fontWeight: 800, fontSize: Math.min(560, height * 0.3), lineHeight: 1, letterSpacing: '-0.05em',
          color: 'transparent', WebkitTextStroke: `3px ${palette.micro}`, opacity: 0.16 * circleP,
          transform: `translateX(${geo.align === 'right' ? -slide : slide}px)`,
        }}
      >
        {outline} {outline}
      </div>

      {/* Círculo de acento; con foto, la foto va adentro en blanco y negro. */}
      {!montage && (
        scene.media ? (
          <div
            style={{
              position: 'absolute', left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: '50%', overflow: 'hidden',
              transform: `scale(${circleP})`, background: palette.hero,
            }}
          >
            {scene.media.kind === 'video'
              ? <OffthreadVideo src={scene.media.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(1) contrast(1.2)', mixBlendMode: 'multiply' }} />
              : <Img src={scene.media.url} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(1) contrast(1.2)', mixBlendMode: 'multiply', transform: `scale(${1.1 - 0.08 * (frame / frames)})` }} />}
          </div>
        ) : (
          <AccentCircle x={cx} y={cy} r={r} delay={2} />
        )
      )}

      {/* El texto. */}
      <AbsoluteFill
        style={{
          paddingLeft: inset.side, paddingRight: inset.side,
          paddingTop: anchor === 'top' || anchor === 'split' ? topPad : inset.top,
          paddingBottom: bottomPad,
          display: 'flex', flexDirection: 'column', justifyContent, alignItems, gap: 10,
          opacity: 1 - exit,
        }}
      >
        {split ? (
          <>
            <div style={groupStyle}>{kickerEl}{preEl}</div>
            <div style={groupStyle}>{heroEl}{postEl}{subEl}{ctaEl}</div>
          </>
        ) : (
          <>{kickerEl}{preEl}{heroEl}{postEl}{subEl}{ctaEl}</>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
