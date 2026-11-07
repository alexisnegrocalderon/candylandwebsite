import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { MotionCard, MotionScene } from '../shared/motionSpec';
import { useMotion } from './context';
import { IgGlyph } from './hud';
import { clamp } from './kits/shared';
import { Headline } from './scenes';
import { useExit } from './layers';
import { beats, ease, fonts, rand, safeInsets, springs } from './theme';

/* Escena del estilo SOFT UI (referencia B): una tarjeta de vidrio que entra
 * inclinada en 3D y se endereza, con su contenido animado (días del
 * calendario, checks, mensajes). Encima, el titular; arriba, una píldora
 * inclinada tipo sticker. Los datos salen de la escena (texto, ítems) y de
 * spec.eventDate: nada inventado. */

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function useGlass(): React.CSSProperties {
  const { palette } = useMotion();
  return palette.dark
    ? { background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.22)', boxShadow: '0 50px 90px -30px rgba(0,0,0,0.6)', backdropFilter: 'blur(22px)' }
    : { background: 'rgba(255,255,255,0.62)', border: '1.5px solid rgba(255,255,255,0.9)', boxShadow: '0 50px 90px -34px rgba(20,28,60,0.35), inset 0 1px 0 rgba(255,255,255,0.9)', backdropFilter: 'blur(22px)' };
}

/** Píldora inclinada tipo sticker (el «Skipping the gym» de la referencia). */
export const Sticker: React.FC<{ text: string; delay?: number; tilt?: number }> = ({ text, delay = 0, tilt = -7 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette } = useMotion();
  const p = spring({ frame: frame - delay, fps, config: springs.bouncy });
  return (
    <div
      style={{
        display: 'inline-block', padding: '18px 38px', borderRadius: 999, background: palette.hero,
        fontFamily: fonts.grotesk, fontWeight: 700, fontSize: 40, letterSpacing: '-0.01em', color: palette.dark ? palette.deep : '#FFFFFF',
        transform: `rotate(${tilt * p}deg) scale(${p})`, boxShadow: `0 18px 40px -16px ${palette.hero}`,
      }}
    >
      {text}
    </div>
  );
};

const Calendar: React.FC<{ date: string; delay: number }> = ({ date, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette } = useMotion();
  const d = date ? new Date(`${date}T12:00:00Z`) : null;
  const year = d ? d.getUTCFullYear() : 2026;
  const month = d ? d.getUTCMonth() : 10;
  const target = d ? d.getUTCDate() : -1;
  const first = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // lunes primero
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [...Array.from({ length: first }, () => 0), ...Array.from({ length: days }, (_, i) => i + 1)];
  const pop = spring({ frame: frame - delay - 26, fps, config: springs.bouncy });
  const ring = interpolate((frame - delay - 30) % 40, [0, 40], [1, 1.9], clamp);
  return (
    <div style={{ width: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: fonts.grotesk, fontWeight: 700, fontSize: 40, color: palette.display, marginBottom: 22 }}>
        <span>‹</span>
        <span style={{ textTransform: 'capitalize' }}>{MONTHS[month]} {year}</span>
        <span>›</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, fontFamily: fonts.grotesk, fontSize: 24, color: palette.muted, textAlign: 'center', marginBottom: 12, fontWeight: 600 }}>
        {['LU', 'MA', 'MI', 'JU', 'VI', 'SÁ', 'DO'].map((x) => <span key={x}>{x}</span>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12 }}>
        {cells.map((n, i) => {
          const isTarget = n === target;
          const appear = interpolate(frame - delay - 4 - i * 0.6, [0, 8], [0, 1], { easing: ease.out, ...clamp });
          return (
            <div key={i} style={{ position: 'relative', height: 82, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: n ? appear : 0 }}>
              {isTarget && (
                <>
                  <div style={{ position: 'absolute', width: 78, height: 78, borderRadius: '50%', border: `3px solid ${palette.hero}`, transform: `scale(${ring})`, opacity: (2 - ring) * 0.6 * pop }} />
                  <div style={{ position: 'absolute', width: 78, height: 78, borderRadius: '50%', background: palette.hero, transform: `scale(${pop})` }} />
                </>
              )}
              <span style={{ position: 'relative', fontFamily: fonts.grotesk, fontWeight: isTarget ? 700 : 500, fontSize: 32, color: isTarget ? '#FFFFFF' : palette.display, opacity: n && n < target ? 0.4 : 1 }}>{n || ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Check: React.FC<{ p: number; color: string }> = ({ p, color }) => (
  <svg width={56} height={56} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="11" fill={color} opacity={0.15 + 0.85 * p} />
    <path d="M6.5 12.5l3.6 3.6L17.8 8" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={20} strokeDashoffset={20 * (1 - p)} />
  </svg>
);

const Checklist: React.FC<{ items: string[]; delay: number }> = ({ items, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette } = useMotion();
  const list = items.length ? items : ['…'];
  return (
    <div style={{ width: 760, display: 'flex', flexDirection: 'column', gap: 26 }}>
      {list.map((it, i) => {
        const row = spring({ frame: frame - delay - 6 - i * 7, fps, config: springs.smooth });
        const tick = interpolate(frame - delay - 18 - i * 9, [0, 10], [0, 1], { easing: ease.out, ...clamp });
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, opacity: row, transform: `translateX(${(1 - row) * 40}px)` }}>
            <Check p={tick} color={palette.hero} />
            <span style={{ fontFamily: fonts.grotesk, fontWeight: 600, fontSize: 40, letterSpacing: '-0.02em', color: palette.display }}>{it}</span>
          </div>
        );
      })}
      <div style={{ height: 14, borderRadius: 7, background: `${palette.micro}22`, overflow: 'hidden', marginTop: 8 }}>
        <div style={{ height: '100%', width: `${interpolate(frame - delay - 14, [0, list.length * 9 + 12], [0, 100], clamp)}%`, background: `repeating-linear-gradient(-45deg, ${palette.hero} 0 14px, ${palette.hero}AA 14px 28px)` }} />
      </div>
    </div>
  );
};

const Chat: React.FC<{ items: string[]; delay: number }> = ({ items, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette } = useMotion();
  const list = items.length ? items : ['Hola'];
  return (
    <div style={{ width: 780, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {list.map((m, i) => {
        const start = delay + 6 + i * 16;
        const typing = frame >= start && frame < start + 8;
        const p = spring({ frame: frame - start - 8, fps, config: springs.snappy });
        const mine = i % 2 === 1;
        return (
          <div key={i} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
            {typing ? (
              <div style={{ padding: '22px 30px', borderRadius: 40, background: `${palette.micro}18`, display: 'flex', gap: 10 }}>
                {[0, 1, 2].map((k) => <div key={k} style={{ width: 14, height: 14, borderRadius: 7, background: palette.muted, opacity: 0.4 + 0.6 * Math.abs(Math.sin((frame + k * 4) / 4)) }} />)}
              </div>
            ) : frame >= start + 8 ? (
              <div
                style={{
                  maxWidth: 600, padding: '22px 32px', borderRadius: 40, borderBottomLeftRadius: mine ? 40 : 10, borderBottomRightRadius: mine ? 10 : 40,
                  background: mine ? palette.hero : 'rgba(255,255,255,0.92)', color: mine ? '#FFFFFF' : '#16161A',
                  fontFamily: fonts.grotesk, fontWeight: 500, fontSize: 36, lineHeight: 1.25,
                  transform: `scale(${p})`, transformOrigin: mine ? '100% 100%' : '0% 100%', opacity: p,
                }}
              >
                {m}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

const Ticket: React.FC<{ scene: MotionScene; delay: number }> = ({ scene, delay }) => {
  const frame = useCurrentFrame();
  const { palette } = useMotion();
  const shine = interpolate((frame - delay) % 70, [0, 70], [-120, 220], clamp);
  return (
    <div style={{ width: 760, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontFamily: fonts.grotesk, fontWeight: 700, fontSize: 26, letterSpacing: '0.2em', color: palette.hero, textTransform: 'uppercase' }}>{scene.kicker || 'Entrada'}</span>
        <IgGlyph size={40} color={palette.display} />
      </div>
      <div style={{ fontFamily: fonts.syne, fontWeight: 800, fontSize: 78, lineHeight: 0.98, letterSpacing: '-0.04em', color: palette.display }}>{scene.text}</div>
      {scene.sub && <div style={{ fontFamily: fonts.grotesk, fontWeight: 500, fontSize: 32, color: palette.muted, marginTop: 16 }}>{scene.sub}</div>}
      <div style={{ margin: '34px -60px 26px', borderTop: `3px dashed ${palette.micro}40` }} />
      <div style={{ display: 'flex', gap: 3, height: 70 }}>
        {Array.from({ length: 54 }, (_, i) => <div key={i} style={{ width: 2 + Math.floor(rand(i + 7) * 7), background: palette.display, opacity: 0.85 }} />)}
      </div>
      {/* Brillo que cruza la entrada. */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, transparent 40%, rgba(255,255,255,0.55) 50%, transparent 60%)', transform: `translateX(${shine}%)` }} />
    </div>
  );
};

const EventCardBody: React.FC<{ scene: MotionScene; delay: number }> = ({ scene, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette } = useMotion();
  return (
    <div style={{ width: 760 }}>
      {scene.kicker && <div style={{ fontFamily: fonts.grotesk, fontWeight: 700, fontSize: 26, letterSpacing: '0.2em', color: palette.hero, textTransform: 'uppercase', marginBottom: 14 }}>{scene.kicker}</div>}
      <div style={{ fontFamily: fonts.syne, fontWeight: 800, fontSize: 72, lineHeight: 1, letterSpacing: '-0.04em', color: palette.display }}>{scene.text}</div>
      {scene.sub && <div style={{ fontFamily: fonts.grotesk, fontWeight: 500, fontSize: 34, color: palette.muted, marginTop: 14 }}>{scene.sub}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 28 }}>
        {scene.items.map((it, i) => {
          const p = spring({ frame: frame - delay - 14 - i * 5, fps, config: springs.snappy });
          return (
            <span key={i} style={{ padding: '12px 24px', borderRadius: 999, border: `2px solid ${palette.micro}40`, fontFamily: fonts.grotesk, fontWeight: 600, fontSize: 28, color: palette.display, opacity: p, transform: `scale(${p})` }}>{it}</span>
          );
        })}
      </div>
    </div>
  );
};

const CardContent: React.FC<{ card: MotionCard; scene: MotionScene; delay: number }> = ({ card, scene, delay }) => {
  const { spec } = useMotion();
  switch (card) {
    case 'calendario': return <Calendar date={spec.eventDate} delay={delay} />;
    case 'checklist': return <Checklist items={scene.items} delay={delay} />;
    case 'chat': return <Chat items={scene.items} delay={delay} />;
    case 'entrada': return <Ticket scene={scene} delay={delay} />;
    default: return <EventCardBody scene={scene} delay={delay} />;
  }
};

export const SoftUiScene: React.FC<{ scene: MotionScene; index: number; frames: number }> = ({ scene, index, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width, height, palette, captionsOn } = useMotion();
  const glass = useGlass();
  const exit = useExit(frames, beats.exit);
  const inset = safeInsets(width, height);
  const hasCard = scene.card !== 'ninguna';
  // Las tarjetas que muestran el texto adentro no lo repiten como titular.
  const textInCard = scene.card === 'evento' || scene.card === 'entrada';
  const enter = spring({ frame: frame - 6, fps, config: springs.heavy });
  const side = index % 2 === 0 ? 1 : -1;
  const rx = interpolate(enter, [0, 1], [28, 7]) + Math.sin(frame / 34) * 2;
  const ry = interpolate(enter, [0, 1], [-24 * side, -7 * side]) + Math.cos(frame / 40) * 2.5;
  const float = Math.sin(frame / 26) * 8;

  return (
    <AbsoluteFill
      style={{
        paddingTop: inset.top + 40, paddingBottom: inset.bottom + (captionsOn ? height * 0.14 : 0),
        paddingLeft: inset.side, paddingRight: inset.side,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 44,
        opacity: 1 - exit, transform: `scale(${1 - exit * 0.05})`, filter: `blur(${exit * 8}px)`,
      }}
    >
      {scene.kicker && !textInCard && <Sticker text={scene.kicker} delay={2} tilt={index % 2 ? 6 : -7} />}
      {!textInCard && <Headline text={scene.text} highlight={scene.highlight} base={hasCard ? 96 : 132} delay={hasCard ? 2 : 6} />}
      {hasCard && (
        <div style={{ perspective: 1800 }}>
          <div
            style={{
              ...glass, borderRadius: 48, padding: '56px 60px',
              transform: `translateY(${(1 - enter) * 220 + float}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${0.8 + 0.2 * enter})`,
              opacity: interpolate(enter, [0, 0.25], [0, 1], clamp),
            }}
          >
            <CardContent card={scene.card} scene={scene} delay={10} />
          </div>
        </div>
      )}
      {scene.sub && !textInCard && (
        <div style={{ fontFamily: fonts.grotesk, fontWeight: 500, fontSize: 38, color: palette.muted, opacity: interpolate(frame, [24, 40], [0, 1], { easing: ease.out, ...clamp }) }}>{scene.sub}</div>
      )}
    </AbsoluteFill>
  );
};
