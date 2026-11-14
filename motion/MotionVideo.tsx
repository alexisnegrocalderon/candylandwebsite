import { useMemo } from 'react';
import { AbsoluteFill, getRemotionEnvironment, Html5Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, captionPages, captionWords, hookApplies, motionPalette, motionTimeline, normalizeMotionSpec, type MotionSpec } from '../shared/motionSpec';
import { resolveLayouts, resolveLook } from '../shared/motionVariety';
import { MotionContext, useMotion, type MotionCtx, type MotionSlideInfo } from './context';
import { useBrandFonts } from './fonts';
import { KITS } from './kits';
import { Camera, HandleCard, Hud } from './hud';
import { Glow, LoopFade } from './glow';
import { Mascot } from './mascot';
import { mascotTimes } from '../shared/motionMascot';
import { Thread } from './thread';
import { Grade, Grain, Vignette } from './layers';
import { LOOK_CUT_FRAMES, LookCut, onColor, Texture } from './look';
import { KineticScene } from './kinetic';
import { PosterScene } from './poster';
import { SoftUiScene } from './softui';
import { BrandSting, CountdownScene, TextScene } from './scenes';
import { ChatHookScene } from './chat';
import { AdaptedPalette, AdaptedScene, BackdropLayer } from './backdrop';
import { backdropPlan } from '../shared/motionBackdropPlan';
import { layoutZone } from '../shared/motionVariety';
import { SFX_FRAMES, sfxSchedule, type SfxName } from '../shared/motionSfx';
import { beats, fonts } from './theme';

/* La composición única del Estudio Motion. Recibe la receta (MotionSpec) y la
 * dibuja con el kit de su estilo. Es la MISMA en el reproductor del panel
 * (@remotion/player) y en la grabación (scripts/render-studio-video.mjs). */

export type MotionVideoProps = { spec: MotionSpec; slide?: MotionSlideInfo | null };

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const Sfx: React.FC<{ at: number; name: string; volume?: number }> = ({ at, name, volume = 0.6 }) => (
  <Sequence from={Math.max(0, at)} durationInFrames={SFX_FRAMES[name as SfxName] ?? 30} layout="none">
    <Html5Audio src={staticFile(`motion/sfx/${name}.wav`)} volume={volume} />
  </Sequence>
);

const Soundtrack: React.FC = () => {
  const { spec, timeline, look } = useMotion();
  const { durationInFrames, fps } = useVideoConfig();
  const kit = KITS[spec.style];
  const voiced = !!spec.voice;
  const song = spec.song;
  const bed = voiced ? 0.11 : 0.3;
  // Los efectos salen de un calendario puro (shared/motionSfx.ts): ahí una prueba revisa que no suenen demasiados a la vez.
  const hits = sfxSchedule({ spec, timeline, look, cutSfx: kit.cutSfx, cutFrames: beats.cut, popAt: spec.sfx ? mascotTimes(spec, timeline, fps).popAt : null })
    .map((h) => <Sfx key={h.key} at={h.at} name={h.name} volume={h.volume} />);
  return (
    <>
      {song && !(song.muteOnExport && getRemotionEnvironment().isRendering) && (
        // La canción propia parte en el tiempo 1 del compás elegido (song.start) y manda sobre las pistas de la casa.
        <Html5Audio
          src={song.url}
          trimBefore={Math.round(song.start * fps)}
          volume={(f) => song.volume * (voiced ? 0.4 : 1) * (spec.loop ? 1 : interpolate(f, [0, 10, durationInFrames - 24, durationInFrames - 1], [0, 1, 1, 0], clamp))}
        />
      )}
      {!song && spec.music !== 'none' && (
        <Html5Audio
          src={staticFile(`motion/audio/${spec.music}.wav`)}
          loop
          volume={(f) => bed * interpolate(f, [0, 10, durationInFrames - 24, durationInFrames - 1], [0, 1, 1, 0], clamp)}
        />
      )}
      {spec.voice && <Html5Audio src={spec.voice.url} volume={1} />}
      {hits}
    </>
  );
};

/** Subtítulos palabra por palabra. Tres estilos (spec.captionStyle):
 *  - clásico: de a 3, la palabra que suena en el color protagonista (como siempre);
 *  - karaoke: las palabras entran con un salto cuando se dicen y la que suena va en una caja del color protagonista;
 *  - palabra: una sola palabra, grande, con golpe de zoom.
 * Zona segura de Reels/TikTok: el bloque queda sobre los ~340 px de abajo que cubre la interfaz, y dentro del 80 % del ancho. */
const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { spec, palette, width, height } = useMotion();
  const words = useMemo(() => captionWords(spec), [spec]);
  const style = spec.captionStyle;
  const pageOf = useMemo(() => (style === 'clasico' ? words.map((_, i) => Math.floor(i / 3)) : captionPages(words, style)), [words, style]);
  if (!words.length) return null;
  const idx = words.findIndex((w) => frame >= w.from && frame < w.to);
  const current = idx >= 0 ? idx : words.findIndex((w) => w.from > frame) - 1;
  if (current < 0 || frame > words[words.length - 1].to + 6) return null;
  const page = pageOf[current];
  const group = words.map((w, i) => ({ w, i })).filter(({ i }) => pageOf[i] === page);
  const bottom = height > 1500 ? 340 : 130;
  const wrapStyle: React.CSSProperties = { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: bottom, pointerEvents: 'none' };

  if (style === 'clasico') {
    return (
      <AbsoluteFill style={{ ...wrapStyle, paddingBottom: height > 1500 ? 330 : 110 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', maxWidth: width - 160 }}>
          {group.map(({ w, i }) => {
            const on = i === idx;
            const pop = interpolate(frame - w.from, [0, 4], [0.85, 1], clamp);
            return (
              <span
                key={`${page}-${i}`}
                style={{
                  fontFamily: fonts.body, fontWeight: 800, fontSize: 58, textTransform: 'uppercase',
                  color: on ? palette.hero : palette.display,
                  transform: `scale(${on ? 1.08 * pop : 1})`,
                  textShadow: `0 4px 0 ${palette.deep}, 0 0 18px rgba(0,0,0,0.35)`,
                  padding: '4px 10px', borderRadius: 14,
                  background: on ? `${palette.deep}55` : 'transparent',
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }

  // Contorno grueso por detrás del relleno: se lee sobre cualquier foto o fondo, con el celular al sol y sin sonido.
  // Si el texto es oscuro (fondos perla y niebla), el contorno va del color del fondo; si es claro, del color profundo.
  const ink = onColor(palette.display) === BRAND.white ? palette.bg : palette.deep;
  const stroke = (size: number): React.CSSProperties => ({
    WebkitTextStroke: `${Math.round(size * 0.16)}px ${ink}`, paintOrder: 'stroke fill',
    textShadow: `0 ${Math.round(size * 0.07)}px 0 ${ink}, 0 0 24px rgba(0,0,0,${ink === palette.bg ? 0.12 : 0.3})`,
  });

  if (style === 'palabra') {
    const { w } = group[0];
    const p = spring({ frame: frame - w.from, fps, config: { damping: 9, stiffness: 240, mass: 0.6 } });
    const size = Math.min(150, Math.round(((width - 200) / Math.max(3, w.text.length)) * 1.55));
    return (
      <AbsoluteFill style={wrapStyle}>
        <span
          style={{
            fontFamily: fonts.body, fontWeight: 900, fontSize: size, lineHeight: 1, textTransform: 'uppercase',
            color: current % 2 === 0 ? palette.hero : palette.display,
            transform: `scale(${interpolate(p, [0, 1], [1.7, 1])}) rotate(${interpolate(p, [0, 1], [current % 2 ? 5 : -5, 0])}deg)`,
            opacity: interpolate(frame - w.from, [0, 2], [0, 1], clamp),
            ...stroke(size),
          }}
        >
          {w.text}
        </span>
      </AbsoluteFill>
    );
  }

  // karaoke
  const size = 64;
  return (
    <AbsoluteFill style={wrapStyle}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: Math.round(width * 0.8), rowGap: 6 }}>
        {group.map(({ w, i }) => {
          const entered = frame >= w.from;
          const on = i === idx;
          // Entra con un salto cuando se dice; la caja de la palabra activa «cae» con un pequeño rebote.
          const p = spring({ frame: frame - w.from, fps, config: { damping: 11, stiffness: 220, mass: 0.55 } });
          return (
            <span
              key={`${page}-${i}`}
              style={{
                position: 'relative', display: 'inline-block', padding: '2px 16px', borderRadius: 18,
                fontFamily: fonts.body, fontWeight: 800, fontSize: size, lineHeight: 1.15, textTransform: 'uppercase',
                opacity: entered ? interpolate(p, [0, 0.4], [0, 1], clamp) : 0,
                transform: `translateY(${entered ? interpolate(p, [0, 1], [22, 0]) : 22}px) scale(${on ? 1 + 0.08 * Math.min(1, p) : interpolate(p, [0, 1], [0.7, 1])})`,
                color: on ? onColor(palette.hero) : palette.display,
                background: on ? palette.hero : 'transparent',
                ...(on ? { boxShadow: `0 8px 0 ${ink}, 0 0 30px ${palette.hero}66` } : stroke(size)),
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Body: React.FC = () => {
  const { spec, timeline, look, layouts, backdropPlan: plan } = useMotion();
  const kit = KITS[spec.style];
  const last = spec.scenes.length - 1;
  return (
    <>
      {/* 0. El video de fondo (si lo hay): continuo, debajo de todo. */}
      {spec.backdrop && <BackdropLayer />}
      {/* 1. Fondo (continuo entre escenas). Sobre un video, se ve solo lo que pide la mezcla. */}
      {spec.backdrop ? (
        <AbsoluteFill style={{ opacity: spec.backdrop.mix / 100 }}><kit.Background /></AbsoluteFill>
      ) : <kit.Background />}
      {/* La luz de fondo (halo o haces) que respira con la música. */}
      <Glow />
      {/* La trama del look (puntos, rayas, ondas…) sobre el fondo del estilo. */}
      <Texture />
      {/* El hilo del carrusel: una forma que cruza de una lámina a la siguiente. */}
      <Thread />
      {/* 2-3. Fotos, gráfica y texto por escena, con un empuje lento de cámara. */}
      <Camera>
      {/* El perrito globo: detrás del texto, dentro de la cámara. */}
      <Mascot />
      {timeline.scenes.map((t) => {
        const scene = spec.scenes[t.index];
        let content: React.ReactNode;
        if (spec.template === 'sting') {
          content = <BrandSting frames={t.frames} tagline={scene.sub || spec.outroLine} />;
        } else if (spec.hook !== 'ninguno' && hookApplies(spec.template) && t.index === 0) {
          // Gancho de chat: la escena 1 es una conversación de celular en vez del titular.
          content = <ChatHookScene scene={scene} frames={t.frames} />;
        } else if (spec.template === 'countdown' && t.index === 0) {
          content = <CountdownScene scene={scene} frames={t.frames} />;
        } else {
          const role = t.index === 0 ? 'hook' : t.index === last && last > 0 ? 'cta' : 'body';
          content = spec.style === 'kinetic'
            ? <KineticScene scene={scene} index={t.index} frames={t.frames} role={role} />
            : spec.style === 'poster'
            ? <PosterScene scene={scene} index={t.index} frames={t.frames} role={role} />
            : spec.style === 'softui'
            ? <SoftUiScene scene={scene} index={t.index} frames={t.frames} />
            : <TextScene scene={scene} index={t.index} frames={t.frames} role={role} lowerThird={spec.template === 'montaje' && !!scene.media} />;
        }
        // Sobre un video de fondo, el texto de cada escena se adapta a lo que hay detrás (menos el celular del gancho de chat, que trae su pantalla).
        const legibility = plan?.scenes[t.index];
        const isChat = spec.hook !== 'ninguno' && hookApplies(spec.template) && t.index === 0;
        return (
          <Sequence key={t.index} from={t.from} durationInFrames={t.frames} name={`Escena ${t.index + 1}`}>
            {legibility && !isChat
              ? <AdaptedScene legibility={legibility} zone={layoutZone(spec.style, layouts[t.index])} frames={t.frames}>{content}</AdaptedScene>
              : content}
          </Sequence>
        );
      })}
      {timeline.outroFrom != null && (
        <Sequence from={timeline.outroFrom} durationInFrames={timeline.outroFrames} name="Cierre">
          <AdaptedPalette legibility={plan?.outro ?? null}>
            {spec.closing === 'handle'
              ? <HandleCard frames={timeline.outroFrames} line={spec.outroLine} />
              : <BrandSting frames={timeline.outroFrames} tagline={spec.outroLine} />}
          </AdaptedPalette>
        </Sequence>
      )}
      </Camera>
      <AdaptedPalette legibility={plan?.edges ?? null}>
        {spec.hud && <Hud />}
        <Captions />
      </AdaptedPalette>
      {/* Transiciones encima de todo el contenido, centradas en cada corte. */}
      {[...timeline.scenes.slice(1).map((t) => t.from), ...(timeline.outroFrom != null ? [timeline.outroFrom] : [])].map((cut, n) => (
        look.cut === 'estilo' ? (
          <Sequence key={`cut-${cut}`} from={cut - beats.cut / 2} durationInFrames={beats.cut} name="Corte">
            <kit.Cut />
          </Sequence>
        ) : (
          <Sequence key={`cut-${cut}`} from={cut - LOOK_CUT_FRAMES / 2} durationInFrames={LOOK_CUT_FRAMES} name="Corte">
            <LookCut kind={look.cut} n={n} />
          </Sequence>
        )
      ))}
      {/* 4-5. Grade, grano y viñeta. */}
      <Grade opacity={kit.grade} />
      <Grain opacity={kit.grain} />
      <Vignette strength={kit.vignette} />
      {/* Loop: se funde al fondo al final y sale de él al inicio. */}
      <LoopFade />
      <Soundtrack />
    </>
  );
};

export const MotionVideo: React.FC<MotionVideoProps> = ({ spec: raw, slide = null }) => {
  useBrandFonts();
  const { width, height, fps } = useVideoConfig();
  const ctx = useMemo<MotionCtx>(() => {
    const spec = normalizeMotionSpec(raw);
    const timeline = motionTimeline(spec);
    const layouts = resolveLayouts(spec);
    return { spec, palette: motionPalette(spec.base, spec.accent), timeline, width, height, captionsOn: spec.captions && !!spec.voice, layouts, look: resolveLook(spec), backdropPlan: backdropPlan(spec, timeline, layouts, fps), slide };
  }, [raw, width, height, fps, slide]);
  return (
    <MotionContext.Provider value={ctx}>
      {/* La composición no depende del CSS de la página donde se dibuja: sin `border-box` el relleno
          se suma al alto (height:100%) y el texto se desborda fuera del cuadro. */}
      <style>{'.mv-root, .mv-root *, .mv-root *::before, .mv-root *::after { box-sizing: border-box; }'}</style>
      <AbsoluteFill className="mv-root" style={{ backgroundColor: ctx.palette.bg, overflow: 'hidden' }}>
        <Body />
      </AbsoluteFill>
    </MotionContext.Provider>
  );
};
