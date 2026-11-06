import { useMemo } from 'react';
import { AbsoluteFill, Html5Audio, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { captionWords, motionPalette, motionTimeline, normalizeMotionSpec, type MotionSpec } from '../shared/motionSpec';
import { MotionContext, useMotion, type MotionCtx } from './context';
import { useBrandFonts } from './fonts';
import { KITS } from './kits';
import { Grade, Grain, Vignette } from './layers';
import { BrandSting, CountdownScene, TextScene } from './scenes';
import { beats, fonts } from './theme';

/* La composición única del Estudio Motion. Recibe la receta (MotionSpec) y la
 * dibuja con el kit de su estilo. Es la MISMA en el reproductor del panel
 * (@remotion/player) y en la grabación (scripts/render-studio-video.mjs). */

export type MotionVideoProps = { spec: MotionSpec };

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const Sfx: React.FC<{ at: number; name: string; volume?: number }> = ({ at, name, volume = 0.6 }) => (
  <Sequence from={Math.max(0, at)} durationInFrames={30} layout="none">
    <Html5Audio src={staticFile(`motion/sfx/${name}.wav`)} volume={volume} />
  </Sequence>
);

const Soundtrack: React.FC = () => {
  const { spec, timeline } = useMotion();
  const { durationInFrames } = useVideoConfig();
  const kit = KITS[spec.style];
  const voiced = !!spec.voice;
  const bed = voiced ? 0.11 : 0.3;
  const hits: React.ReactNode[] = [];
  if (spec.sfx) {
    hits.push(<Sfx key="open" at={0} name="bass" volume={0.7} />);
    timeline.scenes.slice(1).forEach((t) => hits.push(<Sfx key={`cut${t.index}`} at={t.from - beats.cut / 2 - 2} name={kit.cutSfx} volume={kit.cutSfx === 'glitch' ? 0.45 : 0.55} />));
    if (spec.template === 'countdown') {
      for (let f = 4; f < 28; f += 4) hits.push(<Sfx key={`t${f}`} at={f} name="tick" volume={0.4} />);
      hits.push(<Sfx key="slam" at={25} name="pop" volume={0.7} />);
    }
    if (timeline.outroFrom != null) {
      hits.push(<Sfx key="rise" at={timeline.outroFrom - 26} name="riser" volume={0.4} />);
      hits.push(<Sfx key="mark" at={timeline.outroFrom} name="bass" volume={0.7} />);
    }
    if (spec.template === 'sting') hits.push(<Sfx key="pop" at={14} name="pop" volume={0.6} />);
  }
  return (
    <>
      {spec.music !== 'none' && (
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

/** Subtítulos palabra por palabra: de a 3, la palabra que suena en el color protagonista. */
const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const { spec, palette, width, height } = useMotion();
  const words = useMemo(() => captionWords(spec), [spec]);
  if (!words.length) return null;
  const idx = words.findIndex((w) => frame >= w.from && frame < w.to);
  const current = idx >= 0 ? idx : words.findIndex((w) => w.from > frame) - 1;
  if (current < 0 || frame > words[words.length - 1].to + 6) return null;
  const page = Math.floor(current / 3);
  const group = words.slice(page * 3, page * 3 + 3);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: height > 1500 ? 330 : 110, pointerEvents: 'none' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', maxWidth: width - 160 }}>
        {group.map((w, k) => {
          const on = page * 3 + k === idx;
          const pop = interpolate(frame - w.from, [0, 4], [0.85, 1], clamp);
          return (
            <span
              key={`${page}-${k}`}
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
};

const Body: React.FC = () => {
  const { spec, timeline } = useMotion();
  const kit = KITS[spec.style];
  const last = spec.scenes.length - 1;
  return (
    <>
      {/* 1. Fondo (continuo entre escenas). */}
      <kit.Background />
      {/* 2-3. Fotos, gráfica y texto por escena. */}
      {timeline.scenes.map((t) => {
        const scene = spec.scenes[t.index];
        let content: React.ReactNode;
        if (spec.template === 'sting') {
          content = <BrandSting frames={t.frames} tagline={scene.sub || spec.outroLine} />;
        } else if (spec.template === 'countdown' && t.index === 0) {
          content = <CountdownScene scene={scene} frames={t.frames} />;
        } else {
          const role = t.index === 0 ? 'hook' : t.index === last && last > 0 ? 'cta' : 'body';
          content = <TextScene scene={scene} index={t.index} frames={t.frames} role={role} lowerThird={spec.template === 'montaje' && !!scene.media} />;
        }
        return (
          <Sequence key={t.index} from={t.from} durationInFrames={t.frames} name={`Escena ${t.index + 1}`}>
            {content}
          </Sequence>
        );
      })}
      {timeline.outroFrom != null && (
        <Sequence from={timeline.outroFrom} durationInFrames={timeline.outroFrames} name="Firma">
          <BrandSting frames={timeline.outroFrames} tagline={spec.outroLine} />
        </Sequence>
      )}
      <Captions />
      {/* Transiciones encima de todo el contenido, centradas en cada corte. */}
      {[...timeline.scenes.slice(1).map((t) => t.from), ...(timeline.outroFrom != null ? [timeline.outroFrom] : [])].map((cut) => (
        <Sequence key={`cut-${cut}`} from={cut - beats.cut / 2} durationInFrames={beats.cut} name="Corte">
          <kit.Cut />
        </Sequence>
      ))}
      {/* 4-5. Grade, grano y viñeta. */}
      <Grade opacity={kit.grade} />
      <Grain opacity={kit.grain} />
      <Vignette strength={kit.vignette} />
      <Soundtrack />
    </>
  );
};

export const MotionVideo: React.FC<MotionVideoProps> = ({ spec: raw }) => {
  useBrandFonts();
  const { width, height } = useVideoConfig();
  const ctx = useMemo<MotionCtx>(() => {
    const spec = normalizeMotionSpec(raw);
    return { spec, palette: motionPalette(spec.base), timeline: motionTimeline(spec), width, height, captionsOn: spec.captions && !!spec.voice };
  }, [raw, width, height]);
  return (
    <MotionContext.Provider value={ctx}>
      <AbsoluteFill style={{ backgroundColor: ctx.palette.bg, overflow: 'hidden' }}>
        <Body />
      </AbsoluteFill>
    </MotionContext.Provider>
  );
};
