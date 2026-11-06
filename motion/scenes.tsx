import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { MotionScene } from '../shared/motionSpec';
import { useMotion } from './context';
import { bubbleShadow, KITS, rand } from './kits';
import { MediaLayer, useBreathe, useExit } from './layers';
import { beats, ease, fonts, safeInsets, springs } from './theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/* --- Piezas de texto -------------------------------------------------------- */

/** Tamaño que cabe: según la palabra más larga y el ancho útil. */
function fitSize(text: string, base: number, usable: number, charW: number): number {
  const longest = Math.max(4, ...text.split(/\s+/).map((w) => w.length));
  const words = text.split(/\s+/).filter(Boolean).length;
  const byWidth = usable / (longest * charW);
  // Muchas palabras: un poco más chico para no pasar de 4 líneas.
  const byCount = words > 6 ? base * 0.8 : base;
  return Math.round(Math.min(byCount, byWidth));
}

function heroWords(text: string, highlight: string): Set<number> {
  const out = new Set<number>();
  if (!highlight) return out;
  const words = text.split(/\s+/);
  const target = highlight.toLowerCase().split(/\s+/);
  const norm = (w: string) => w.toLowerCase().replace(/[¿?¡!.,:;"«»]/g, '');
  for (let i = 0; i + target.length <= words.length; i++) {
    if (target.every((t, k) => norm(words[i + k]) === norm(t))) {
      target.forEach((_, k) => out.add(i + k));
      break;
    }
  }
  return out;
}

export const Headline: React.FC<{ text: string; highlight: string; base: number; delay: number; maxWidth?: number }> = ({ text, highlight, base, delay, maxWidth }) => {
  const { spec, width } = useMotion();
  const kit = KITS[spec.style];
  const breathe = useBreathe();
  const usable = maxWidth ?? width - safeInsets(width, 1).side * 2;
  const shown = kit.uppercase ? text.toUpperCase() : text;
  const size = fitSize(shown, base, usable, kit.uppercase ? 0.86 : 0.8);
  const heroes = heroWords(text, highlight);
  const words = shown.split(/\s+/).filter(Boolean);
  return (
    <div
      style={{
        fontFamily: kit.headlineFont,
        fontWeight: kit.uppercase ? 800 : 600,
        fontSize: size,
        lineHeight: kit.lineHeight,
        letterSpacing: kit.uppercase ? '-0.02em' : '-0.03em',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: kit.align === 'center' ? 'center' : 'flex-start',
        textAlign: kit.align,
        columnGap: Math.round(size * 0.28),
        rowGap: Math.round(size * 0.06),
        maxWidth: usable,
        transform: `scale(${breathe})`,
        transformOrigin: kit.align === 'center' ? '50% 50%' : '0% 50%',
      }}
    >
      {words.map((w, i) => (
        <kit.Word key={`${i}-${w}`} word={w} i={i} delay={delay} hero={heroes.has(i)} size={size} />
      ))}
    </div>
  );
};

export const Kicker: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, spec } = useMotion();
  const p = spring({ frame: frame - delay, fps, config: springs.snappy });
  if (!text) return null;
  const glitch = spec.style === 'glitch';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 30px',
        borderRadius: 999,
        border: `3px solid ${palette.body}`,
        fontFamily: glitch ? fonts.body : fonts.ui,
        fontWeight: 800,
        fontSize: 38,
        letterSpacing: '0.18em',
        color: palette.body,
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [24, 0])}px) scale(${interpolate(p, [0, 1], [0.86, 1])})`,
      }}
    >
      <span style={{ width: 14, height: 14, borderRadius: 7, background: palette.body, opacity: 0.5 + 0.5 * Math.abs(Math.sin(frame / 8)) }} />
      {text.toUpperCase()}
    </div>
  );
};

export const Sub: React.FC<{ text: string; delay: number; size?: number }> = ({ text, delay, size = 46 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, spec } = useMotion();
  const p = spring({ frame: frame - delay, fps, config: springs.smooth });
  if (!text) return null;
  return (
    <div
      style={{
        fontFamily: fonts.body,
        fontWeight: 500,
        fontSize: size,
        lineHeight: 1.35,
        color: palette.body,
        maxWidth: 860,
        textAlign: KITS[spec.style].align,
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)`,
      }}
    >
      {text}
    </div>
  );
};

/* --- Escena genérica (anuncio y montaje) -------------------------------------- */

type Role = 'hook' | 'body' | 'cta';

export const TextScene: React.FC<{ scene: MotionScene; index: number; frames: number; role: Role; lowerThird?: boolean }> = ({ scene, index, frames, role, lowerThird }) => {
  const { spec, width, height, captionsOn, palette } = useMotion();
  const frame = useCurrentFrame();
  const kit = KITS[spec.style];
  const exit = useExit(frames, beats.exit);
  const inset = safeInsets(width, height);
  const base = lowerThird ? 96 : role === 'hook' ? 156 : 124;
  const headDelay = scene.kicker ? 6 : 2;
  const words = scene.text.split(/\s+/).filter(Boolean).length;
  const subDelay = headDelay + words * beats.stagger + 8;
  // CTA: subrayado que crece bajo el texto, en el color protagonista.
  const underline = interpolate(frame, [subDelay, subDelay + 16], [0, 1], { easing: ease.out, ...clamp });
  const align = kit.align === 'center' ? 'center' : 'flex-start';
  return (
    <AbsoluteFill>
      {scene.media && <MediaLayer media={scene.media} index={index} frames={frames} dim={lowerThird ? 0.55 : 0.4} />}
      <AbsoluteFill
        style={{
          paddingTop: inset.top,
          paddingBottom: inset.bottom + (captionsOn ? height * 0.16 : 0),
          paddingLeft: inset.side,
          paddingRight: inset.side,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: lowerThird ? 'flex-end' : 'center',
          alignItems: align,
          gap: 36,
          ...kit.exitStyle(exit),
        }}
      >
        {scene.kicker && <Kicker text={scene.kicker} />}
        <Headline text={scene.text} highlight={scene.highlight} base={base} delay={headDelay} />
        {role === 'cta' && !scene.sub && (
          <div style={{ height: 10, width: 320 * underline, borderRadius: 5, background: palette.hero, boxShadow: `0 0 40px ${palette.hero}88` }} />
        )}
        <Sub text={scene.sub} delay={subDelay} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* --- Countdown ---------------------------------------------------------------- */

export const CountdownScene: React.FC<{ scene: MotionScene; frames: number }> = ({ scene, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { spec, palette, width, height, captionsOn } = useMotion();
  const kit = KITS[spec.style];
  const exit = useExit(frames, beats.exit);
  const inset = safeInsets(width, height);
  const target = spec.countdown.value;
  // Los números corren desde arriba y frenan en el valor (con tic en cada cambio, ver MotionVideo).
  const run = interpolate(frame, [4, 28], [0, 1], { easing: ease.out, ...clamp });
  const shown = Math.round(target + (1 - run) * Math.min(9, Math.max(3, target)));
  const slam = spring({ frame: frame - 26, fps, config: springs.bouncy });
  const scale = interpolate(slam, [0, 1], [1.25, 1]);
  const breathe = useBreathe(18, 0.02);
  const numSize = Math.min(height * 0.32, width * (String(shown).length > 2 ? 0.42 : 0.62));
  return (
    <AbsoluteFill>
      {/* Partículas que estallan cuando el número frena. */}
      {Array.from({ length: 16 }, (_, k) => {
        const a = (k / 16) * Math.PI * 2 + rand(k) * 0.4;
        const d = interpolate(frame - 26, [0, 30], [0, 260 + rand(k + 9) * 260], { easing: ease.out, ...clamp });
        const o = interpolate(frame - 26, [0, 8, 34], [0, 1, 0], clamp);
        const s = 10 + rand(k + 3) * 18;
        return (
          <div
            key={k}
            style={{
              position: 'absolute', left: width / 2 + Math.cos(a) * d - s / 2, top: height * 0.46 + Math.sin(a) * d - s / 2,
              width: s, height: s, borderRadius: spec.style === 'glitch' ? 0 : s, background: k % 3 ? palette.display : palette.hero, opacity: o,
            }}
          />
        );
      })}
      <AbsoluteFill
        style={{
          paddingTop: inset.top, paddingBottom: inset.bottom + (captionsOn ? height * 0.14 : 0),
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
          ...kit.exitStyle(exit),
        }}
      >
        {scene.kicker && <Kicker text={scene.kicker} />}
        <div
          style={{
            fontFamily: fonts.numbers,
            fontSize: numSize,
            lineHeight: 0.9,
            color: palette.display,
            fontVariantNumeric: 'tabular-nums',
            transform: `scale(${scale * breathe})`,
            textShadow:
              spec.style === 'glitch'
                ? `-10px 0 0 ${palette.shadow}, 10px 0 0 ${palette.accent}`
                : bubbleShadow(palette.shadow, 10),
          }}
        >
          {shown}
        </div>
        <div style={{ fontFamily: fonts.body, fontWeight: 800, fontSize: 64, letterSpacing: '0.24em', color: palette.hero, opacity: slam }}>
          {spec.countdown.unit.toUpperCase()}
        </div>
        <div style={{ marginTop: 24 }}>
          <Headline text={scene.text} highlight={scene.highlight} base={84} delay={34} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* --- Firma de marca (intro/outro) ----------------------------------------------- */

export const BrandSting: React.FC<{ frames: number; tagline: string }> = ({ frames, tagline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, width, height, spec } = useMotion();
  const exit = useExit(frames, 10);
  const mark = spring({ frame, fps, config: springs.bouncy });
  const word = spring({ frame: frame - 16, fps, config: springs.smooth });
  const line = spring({ frame: frame - 34, fps, config: springs.snappy });
  const rays = 14;
  const size = Math.min(width, height) * 0.36;
  const breathe = useBreathe(20, 0.015);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 1 - exit, transform: `scale(${1 - 0.05 * exit})` }}>
      {/* Rayos escalonados detrás del isotipo. */}
      <div style={{ position: 'absolute', left: width / 2, top: height * 0.42, transform: `rotate(${frame * 0.6}deg)` }}>
        {Array.from({ length: rays }, (_, i) => {
          const p = spring({ frame: frame - 4 - i * 1.2, fps, config: springs.snappy });
          const fade = interpolate(frame, [30, 50], [0.55, 0.22], clamp);
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: -9, top: 0, width: 18, height: size * 0.4 * p, borderRadius: 9,
                background: i % 2 ? palette.hero : palette.display, opacity: fade,
                transformOrigin: '50% 0%', transform: `rotate(${(360 / rays) * i}deg) translateY(${size * 0.62}px)`,
              }}
            />
          );
        })}
      </div>
      <div style={{ position: 'absolute', top: height * 0.42 - size * 0.69, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Img
          src={staticFile('candyland/logo-isotipo-transparent.png')}
          style={{
            height: size * 1.38,
            transform: `scale(${mark * breathe}) rotate(${interpolate(mark, [0, 1], [-25, 0])}deg)`,
            filter: `drop-shadow(0 18px 30px rgba(0,0,0,0.25))`,
          }}
        />
      </div>
      <div style={{ position: 'absolute', top: height * 0.42 + size * 0.85, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
        <Img
          src={staticFile('studio/logo-wordmark-white.png')}
          style={{ width: width * 0.62, opacity: word, transform: `translateY(${interpolate(word, [0, 1], [40, 0])}px)` }}
        />
        {tagline && (
          <div
            style={{
              padding: '16px 36px', borderRadius: 999, border: `3px solid ${palette.body}`,
              fontFamily: spec.style === 'glitch' ? fonts.body : fonts.ui, fontWeight: 800, fontSize: 34, letterSpacing: '0.12em', color: palette.body,
              opacity: line, transform: `translateY(${interpolate(line, [0, 1], [24, 0])}px)`,
            }}
          >
            {tagline.toUpperCase()}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
