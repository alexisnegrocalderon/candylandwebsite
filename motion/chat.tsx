import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, type MotionScene } from '../shared/motionSpec';
import { chatMessages, chatSchedule, type ChatMsg } from '../shared/motionChat';
import { useMotion } from './context';
import { clamp } from './kits/shared';
import { useExit } from './layers';
import { onColor } from './look';
import { beats, fonts, safeInsets, springs } from './theme';

/* Gancho de chat: la escena 1 como un celular donde llegan mensajes (WhatsApp, DM de Instagram o notificaciones de pantalla
 * de bloqueo). Los colores salen de la paleta del video (nada de verde WhatsApp ni azul iOS: son los de la marca), y los
 * mensajes salen de la escena (texto grande + líneas), así que no se inventa nada. El cuadro de cada mensaje lo da
 * shared/motionChat.ts, el mismo que usa el sonido. */

const CLOCK = '22:14';

const Logo: React.FC<{ size: number; bg: string }> = ({ size, bg }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'grid', placeItems: 'center', flexShrink: 0, overflow: 'hidden' }}>
    <Img src={staticFile('candyland/logo-isotipo-transparent.png')} style={{ width: size * 0.78, height: size * 0.78, objectFit: 'contain' }} />
  </div>
);

const Typing: React.FC<{ unit: number; color: string }> = ({ unit, color }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: 'flex', gap: unit * 0.35, padding: `${unit * 0.5}px ${unit * 0.7}px` }}>
      {[0, 1, 2].map((k) => (
        <span key={k} style={{ width: unit * 0.5, height: unit * 0.5, borderRadius: '50%', background: color, opacity: 0.55, transform: `translateY(${Math.sin((frame - k * 3) / 2.6) * unit * 0.22}px)` }} />
      ))}
    </div>
  );
};

const Ticks: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size * 1.5} height={size} viewBox="0 0 24 16" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 9 5.5 13 12.5 3" />
    <path d="M9 12.5 11 13 18.5 3" />
  </svg>
);

interface Skin {
  kind: 'whatsapp' | 'dm';
  screen: string;
  header: string;
  headerInk: string;
  incoming: string;
  incomingInk: string;
  outgoing: string;
  outgoingInk: string;
  status: string;
}

export const ChatHookScene: React.FC<{ scene: MotionScene; frames: number }> = ({ scene, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { spec, palette, width, height, captionsOn } = useMotion();
  const exit = useExit(frames, beats.exit);
  const msgs = chatMessages(scene);
  const beatsAt = chatSchedule(msgs, frames);
  const name = spec.hookName || 'Mansion Playroom';
  const inset = safeInsets(width, height);

  // El celular: alto disponible (sin las zonas que tapa la interfaz de Reels ni los subtítulos) y proporción de pantalla alargada.
  const availH = height - inset.top - inset.bottom - (captionsOn ? height * 0.14 : 0);
  const pw = Math.min(width * 0.8, availH / 1.9);
  const ph = Math.min(availH, pw * 1.9);
  const pad = pw * 0.028;
  const u = pw * 0.058; // unidad tipográfica: el texto de los mensajes
  const enter = spring({ frame, fps, config: springs.heavy });
  const top = inset.top + (availH - ph) / 2;

  const hook = spec.hook;
  const skin: Skin = hook === 'dm'
    ? { kind: 'dm', screen: BRAND.white, header: BRAND.white, headerInk: BRAND.graphite, incoming: BRAND.mist, incomingInk: BRAND.graphite, outgoing: palette.hero, outgoingInk: onColor(palette.hero), status: 'Activo ahora' }
    : { kind: 'whatsapp', screen: BRAND.mist, header: palette.hero, headerInk: onColor(palette.hero), incoming: BRAND.white, incomingInk: BRAND.graphite, outgoing: palette.accent, outgoingInk: onColor(palette.accent), status: 'en línea' };

  // Quiénes ya llegaron, y quién está «escribiendo…» ahora.
  const shown = beatsAt.filter((b) => frame >= b.showAt);
  const typing = beatsAt.find((b) => b.typingAt != null && frame >= (b.typingAt as number) && frame < b.showAt);
  const seen = spec.hook !== 'notificacion' && shown.length === msgs.length && frame >= (shown[shown.length - 1]?.showAt ?? 0) + 8;

  const wrapStyle: React.CSSProperties = {
    position: 'absolute', left: (width - pw) / 2, top, width: pw, height: ph,
    transform: `translateY(${interpolate(enter, [0, 1], [ph * 0.35, 0]) + exit * 40}px) rotate(${interpolate(enter, [0, 1], [-3, 0])}deg) scale(${1 - exit * 0.05})`, opacity: (1 - exit) * interpolate(enter, [0, 0.3], [0, 1], clamp),
  };

  /* --- Notificaciones de pantalla de bloqueo ---------------------------------------------------------------------- */
  if (hook === 'notificacion') {
    const last = shown.length - 1;
    // El celular vibra un instante cuando llega cada notificación.
    const shake = shown.reduce((s, b) => s + (frame - b.showAt >= 0 && frame - b.showAt < 7 ? Math.sin((frame - b.showAt) * 3.1) * (1 - (frame - b.showAt) / 7) * pw * 0.012 : 0), 0);
    return (
      <AbsoluteFill>
        <div style={{ ...wrapStyle, transform: `${wrapStyle.transform} translateX(${shake}px)` }}>
          <div style={{ width: '100%', height: '100%', borderRadius: pw * 0.12, background: BRAND.black, padding: pad, boxShadow: '0 50px 90px -30px rgba(0,0,0,0.5)' }}>
            <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: pw * 0.095, overflow: 'hidden', background: `linear-gradient(170deg, ${palette.bg2 === palette.bg ? palette.deep : palette.bg2}, ${palette.bg})` }}>
              <div style={{ position: 'absolute', left: '50%', top: pw * 0.04, width: pw * 0.28, height: pw * 0.075, marginLeft: -pw * 0.14, borderRadius: 999, background: BRAND.black, zIndex: 3 }} />
              <div style={{ position: 'absolute', top: ph * 0.1, left: 0, right: 0, textAlign: 'center', fontFamily: fonts.ui, color: palette.dark ? BRAND.white : onColor(palette.bg) }}>
                <div style={{ fontSize: u * 0.8, fontWeight: 600, opacity: 0.8 }}>Pantalla de bloqueo</div>
                <div style={{ fontSize: pw * 0.2, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1.05 }}>{CLOCK}</div>
              </div>
              <div style={{ position: 'absolute', left: pw * 0.04, right: pw * 0.04, top: ph * 0.29 }}>
                {shown.filter((_, k) => last - k < 3).map((b) => {
                  const age = last - shown.indexOf(b); // 0 = la más nueva (arriba): las anteriores bajan y se achican un poco
                  const p = spring({ frame: frame - b.showAt, fps, config: springs.bouncy });
                  const m = msgs[b.index];
                  return (
                    <div
                      key={b.index}
                      style={{
                        position: 'absolute', left: 0, right: 0, top: age * u * 5.2, height: u * 4.5, boxSizing: 'border-box', overflow: 'hidden',
                        transform: `translateY(${interpolate(p, [0, 1], [-u * 6, 0])}px) scale(${interpolate(p, [0, 1], [0.92, 1]) * (1 - age * 0.025)})`, opacity: interpolate(p, [0, 0.35], [0, 1], clamp) * (1 - age * 0.08),
                        background: 'rgba(255,255,255,0.9)', borderRadius: u * 1.1, padding: `${u * 0.8}px ${u}px`, display: 'flex', gap: u * 0.8, alignItems: 'flex-start', boxShadow: '0 12px 30px -12px rgba(0,0,0,0.35)',
                      }}
                    >
                      <Logo size={u * 2.4} bg={palette.bg} />
                      <div style={{ minWidth: 0, flex: 1, fontFamily: fonts.ui, color: BRAND.graphite }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: u, fontSize: u * 0.82, fontWeight: 700 }}>
                          <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span><span style={{ fontWeight: 500, opacity: 0.55, flexShrink: 0 }}>ahora</span>
                        </div>
                        <div style={{ fontSize: u * 0.95, lineHeight: 1.25, fontWeight: 500, marginTop: u * 0.15, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.text}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  /* --- Chat (WhatsApp o DM) ---------------------------------------------------------------------------------------- */
  const incomingBubble = (m: ChatMsg, k: number, showAt: number, isLastInGroup: boolean) => {
    const p = spring({ frame: frame - showAt, fps, config: springs.snappy });
    const mine = m.mine;
    return (
      <div key={k} style={{ flexShrink: 0, display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: u * 0.5, transform: `translateY(${interpolate(p, [0, 1], [u * 1.4, 0])}px) scale(${interpolate(p, [0, 1], [0.82, 1])})`, transformOrigin: mine ? '100% 100%' : '0% 100%', opacity: interpolate(p, [0, 0.4], [0, 1], clamp) }}>
        {skin.kind === 'dm' && !mine && (isLastInGroup ? <Logo size={u * 1.9} bg={palette.bg} /> : <div style={{ width: u * 1.9, flexShrink: 0 }} />)}
        <div
          style={{
            maxWidth: '76%', fontFamily: fonts.ui, fontSize: u, lineHeight: 1.28, fontWeight: 500, padding: `${u * 0.6}px ${u * 0.85}px ${skin.kind === 'whatsapp' ? u * 1.25 : u * 0.6}px`, position: 'relative',
            color: mine ? skin.outgoingInk : skin.incomingInk,
            background: skin.kind === 'dm' && mine ? `linear-gradient(135deg, ${palette.hero}, ${palette.accent})` : mine ? skin.outgoing : skin.incoming,
            borderRadius: skin.kind === 'dm' ? u * 1.3 : u * 0.8,
            ...(skin.kind === 'whatsapp' ? (mine ? { borderTopRightRadius: u * 0.2 } : { borderTopLeftRadius: u * 0.2 }) : {}),
            boxShadow: skin.kind === 'whatsapp' ? '0 2px 0 rgba(0,0,0,0.12)' : undefined,
          }}
        >
          {m.text}
          {skin.kind === 'whatsapp' && (
            <span style={{ position: 'absolute', right: u * 0.6, bottom: u * 0.3, display: 'inline-flex', alignItems: 'center', gap: u * 0.25, fontSize: u * 0.62, opacity: 0.75 }}>
              {CLOCK}{mine && <Ticks size={u * 0.62} color={seen ? BRAND.blue : 'currentColor'} />}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <AbsoluteFill>
      <div style={wrapStyle}>
        <div style={{ width: '100%', height: '100%', borderRadius: pw * 0.12, background: BRAND.black, padding: pad, boxShadow: '0 50px 90px -30px rgba(0,0,0,0.5)' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: pw * 0.095, overflow: 'hidden', background: skin.screen, display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'absolute', left: '50%', top: pw * 0.04, width: pw * 0.28, height: pw * 0.075, marginLeft: -pw * 0.14, borderRadius: 999, background: BRAND.black, zIndex: 3 }} />
            {/* Cabecera */}
            <div style={{ flexShrink: 0, background: skin.header, color: skin.headerInk, padding: `${pw * 0.17}px ${u}px ${u * 0.8}px`, display: 'flex', alignItems: 'center', gap: u * 0.8, borderBottom: skin.kind === 'dm' ? `${Math.max(1, u * 0.06)}px solid ${BRAND.mist}` : undefined, fontFamily: fonts.ui }}>
              <svg width={u * 0.9} height={u * 1.3} viewBox="0 0 10 16" fill="none" stroke={skin.headerInk} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 1 2 8l6 7" /></svg>
              <Logo size={u * 2.4} bg={skin.kind === 'dm' ? palette.bg : BRAND.white} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: u * 0.98, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                <div style={{ fontSize: u * 0.68, opacity: 0.75 }}>{skin.status}</div>
              </div>
            </div>
            {/* Mensajes: los nuevos entran abajo y empujan a los anteriores hacia arriba */}
            <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: u * 0.5, padding: `${u}px ${u * 0.8}px`, overflow: 'hidden', backgroundImage: skin.kind === 'whatsapp' ? `radial-gradient(${BRAND.graphite}12 18%, transparent 20%)` : undefined, backgroundSize: skin.kind === 'whatsapp' ? `${u * 2.2}px ${u * 2.2}px` : undefined }}>
              {shown.map((b, k) => incomingBubble(msgs[b.index], b.index, b.showAt, k === shown.length - 1 || msgs[shown[k + 1].index].mine !== msgs[b.index].mine))}
              {typing && (
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: u * 0.5 }}>
                  {skin.kind === 'dm' && <Logo size={u * 1.9} bg={palette.bg} />}
                  <div style={{ background: skin.incoming, borderRadius: skin.kind === 'dm' ? u * 1.3 : u * 0.8, ...(skin.kind === 'whatsapp' ? { borderTopLeftRadius: u * 0.2 } : {}) }}>
                    <Typing unit={u} color={BRAND.graphite} />
                  </div>
                </div>
              )}
              {skin.kind === 'dm' && seen && <div style={{ alignSelf: 'flex-end', fontFamily: fonts.ui, fontSize: u * 0.66, color: BRAND.stone}}>Visto</div>}
            </div>
            {/* Barra para escribir */}
            <div style={{ flexShrink: 0, padding: `${u * 0.6}px ${u * 0.8}px ${u * 1.4}px`, background: skin.kind === 'dm' ? BRAND.white : skin.screen }}>
              <div style={{ height: u * 2.1, borderRadius: 999, background: skin.kind === 'dm' ? BRAND.mist : BRAND.white, display: 'flex', alignItems: 'center', padding: `0 ${u}px`, fontFamily: fonts.ui, fontSize: u * 0.88, color: BRAND.stone }}>
                Mensaje…
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

