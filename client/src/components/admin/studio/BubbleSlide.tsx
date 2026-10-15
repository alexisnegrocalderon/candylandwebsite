import type { CSSProperties, ReactNode } from 'react';
import {
  BUBBLE_LINE_HEIGHT,
  isBubbleHeroKey,
  layoutBubbleHeadline,
  resolveBubblePalette,
  type BubbleHeroKey,
} from '@shared/studioBubble';
import type { StudioFormat, StudioSlide } from '@shared/contentStudio';

/* Tema "Bubble": el estilo oficial de la marca. Letras gruesas estilo globo
 * (Fredoka, rosa y blanco con contorno), fondos lisos, íconos grandes y poco
 * texto: se entiende en un segundo. Las láminas se dibujan a tamaño REAL
 * (1080 de ancho) y se exportan a PNG igual que las demás.
 *
 * El "inflado" de las letras se arma apilando copias del mismo texto (borde
 * claro, aro, relleno con brillo) y no con `background-clip: text`, que en
 * Safari del iPad se rompe al exportar. */

const BUBBLE = "'Fredoka Bubble', 'Fredoka', 'Baloo 2', sans-serif";
const BODY = "'Inter', 'Josefin Sans Variable', sans-serif";

const PINK_FILL = '#F0287A';
const PINK_RIM = '#D40F63';
const PINK_EDGE = '#FFC4DD';
const WHITE_EDGE = '#FFA8D0';
const WHITE_RIM = '#FFD9EA';

type Tone = 'pink' | 'white';

/** Una línea de letras globo. Tres capas idénticas encimadas: borde claro,
 * aro intermedio y relleno (con un brillo arriba a la izquierda). */
function BubbleLine({ text, size, tone }: { text: string; size: number; tone: Tone }) {
  const pink = tone === 'pink';
  const common: CSSProperties = {
    fontFamily: BUBBLE, fontWeight: 700, fontSize: size, lineHeight: BUBBLE_LINE_HEIGHT, letterSpacing: '0.008em',
    textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'center', paintOrder: 'stroke fill',
  };
  const edge = pink ? PINK_EDGE : WHITE_EDGE;
  const rim = pink ? PINK_RIM : WHITE_RIM;
  const fill = pink ? PINK_FILL : '#FFFFFF';
  const k = size;
  return (
    <div style={{ position: 'relative', display: 'inline-block', margin: `0 auto` }}>
      <div style={{ ...common, color: edge, WebkitTextStroke: `${k * 0.125}px ${edge}`, textShadow: `0 ${k * 0.055}px ${k * 0.05}px rgba(60,0,80,0.36)` }}>{text}</div>
      <div style={{ ...common, position: 'absolute', inset: 0, color: rim, WebkitTextStroke: `${k * 0.062}px ${rim}` }}>{text}</div>
      <div style={{
        ...common, position: 'absolute', inset: 0, color: fill, WebkitTextStroke: `${k * 0.026}px ${fill}`,
        textShadow: pink ? `${-k * 0.014}px ${-k * 0.034}px 0 rgba(255,255,255,0.32)` : `0 ${k * 0.03}px 0 #F7D2E4`,
      }}>{text}</div>
    </div>
  );
}

/** El titular completo: líneas alternadas rosa / blanco. */
function BubbleHeadline({ text, box, max = 190, tone0 = 'pink' }: { text: string; box: { width: number; height: number }; max?: number; tone0?: Tone }) {
  const { lines, size } = layoutBubbleHeadline(text, box, { max, min: 64, maxLines: 5 });
  if (lines.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.1 }}>
      {lines.map((line, i) => (
        <BubbleLine key={i} text={line} size={size} tone={(i % 2 === 0) === (tone0 === 'pink') ? 'pink' : 'white'} />
      ))}
    </div>
  );
}

/** Píldora con borde: la etiqueta de apoyo ("NO ES LO QUE MUCHOS IMAGINAN"). */
function pillSize(text: string, size: number, maxChars: number) {
  return text.length > maxChars ? Math.max(26, Math.round(size * (maxChars / text.length))) : size;
}

function OutlinePill({ text, size: base = 40 }: { text: string; size?: number }) {
  if (!text) return null;
  const size = pillSize(text, base, 26);
  return (
    <div style={{
      border: `${Math.max(3, size * 0.08)}px solid rgba(255,255,255,0.92)`, borderRadius: 999, padding: `${size * 0.42}px ${size * 1.1}px`, boxSizing: 'border-box',
      fontFamily: BODY, fontWeight: 700, fontSize: size, lineHeight: 1.2, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#FFFFFF', textAlign: 'center', maxWidth: 900, whiteSpace: 'nowrap',
    }}>
      {text}
    </div>
  );
}

/** Botón grande relleno ("COMENTA PLAYROOM"). */
function BigPill({ text, color }: { text: string; color: string }) {
  if (!text) return null;
  const size = pillSize(text, 74, 18);
  return (
    <div style={{
      background: color, border: '6px solid rgba(255,255,255,0.95)', borderRadius: 999, padding: '30px 70px', boxSizing: 'border-box', maxWidth: 940, whiteSpace: 'nowrap',
      fontFamily: BUBBLE, fontWeight: 700, fontSize: size, lineHeight: 1.05, letterSpacing: '0.01em', textTransform: 'uppercase', color: '#FFFFFF', textAlign: 'center',
      textShadow: '0 4px 0 rgba(0,40,120,0.35)', boxShadow: '0 14px 30px rgba(0,30,90,0.28)',
    }}>
      {text}
    </div>
  );
}

function Caption({ text, size = 34, style }: { text: string; size?: number; style?: CSSProperties }) {
  if (!text) return null;
  return (
    <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: size, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#FFFFFF', textAlign: 'center', whiteSpace: 'nowrap', ...style }}>
      {text}
    </div>
  );
}

/* --- Gráficos (aproximan los 3D de los carruseles originales) -------------- */

let gradientSeq = 0;
/** Id único por gráfico: dos corazones en la misma lámina no comparten degradado. */
function gid(prefix: string) {
  gradientSeq += 1;
  return `${prefix}${gradientSeq}`;
}

export function GlossyHeart({ size, color = 'pink', style }: { size: number; color?: 'pink' | 'blue'; style?: CSSProperties }) {
  const id = gid('hg');
  const [a, b] = color === 'pink' ? ['#FF5C9E', '#D8135F'] : ['#4DB8FF', '#0070D6'];
  return (
    <svg width={size} height={size * 0.92} viewBox="0 0 100 92" style={{ display: 'block', filter: 'drop-shadow(0 6px 6px rgba(60,0,80,0.35))', ...style }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
      <path d="M50 88 C18 64 4 46 4 28 C4 14 15 5 28 5 C38 5 46 10 50 19 C54 10 62 5 72 5 C85 5 96 14 96 28 C96 46 82 64 50 88Z" fill={`url(#${id})`} />
      <path d="M20 22 C22 14 30 11 37 14" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function GlossyStar({ size, color = 'blue', style }: { size: number; color?: 'pink' | 'blue'; style?: CSSProperties }) {
  const id = gid('sg');
  const [a, b] = color === 'pink' ? ['#FF5C9E', '#D8135F'] : ['#4DB8FF', '#0070D6'];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', filter: 'drop-shadow(0 6px 6px rgba(20,0,80,0.35))', ...style }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0.5" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
      <path d="M50 6 L62 36 L94 38 L69 58 L78 90 L50 72 L22 90 L31 58 L6 38 L38 36Z" fill={`url(#${id})`} stroke={a} strokeWidth="6" strokeLinejoin="round" />
      <path d="M40 30 L50 14" stroke="#FFFFFF" strokeOpacity="0.65" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Ring({ size, style }: { size: number; style?: CSSProperties }) {
  const id = gid('rg');
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', filter: 'drop-shadow(0 8px 8px rgba(0,20,90,0.3))', ...style }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4DB8FF" /><stop offset="1" stopColor="#0070D6" /></linearGradient></defs>
      <circle cx="50" cy="50" r="34" fill="none" stroke={`url(#${id})`} strokeWidth="26" />
      <path d="M24 38 C28 26 38 20 50 20" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Sparkle({ size, style }: { size: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', ...style }}>
      <path d="M50 0 C52 30 70 48 100 50 C70 52 52 70 50 100 C48 70 30 52 0 50 C30 48 48 30 50 0Z" fill="#FFFFFF" />
    </svg>
  );
}

export function Lollipop({ size, style }: { size: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size * 1.5} viewBox="0 0 100 150" style={{ display: 'block', filter: 'drop-shadow(0 8px 8px rgba(60,0,80,0.3))', ...style }}>
      <rect x="46" y="62" width="8" height="86" rx="4" fill="#FFE3EE" />
      <circle cx="50" cy="48" r="44" fill="#FFFFFF" />
      <path d="M50 48 m0 -40 a40 40 0 0 1 0 80 a30 30 0 0 1 0 -60 a22 22 0 0 1 0 44 a14 14 0 0 1 0 -28 a7 7 0 0 1 0 14" fill="none" stroke="#FF5C9E" strokeWidth="9" strokeLinecap="round" />
      <path d="M22 28 C26 18 34 12 44 10" stroke="#FFFFFF" strokeOpacity="0.8" strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Door({ size }: { size: number }) {
  const id = gid('dg');
  return (
    <svg width={size} height={size * 1.12} viewBox="0 0 100 112" style={{ display: 'block', filter: 'drop-shadow(0 10px 10px rgba(0,20,90,0.35))' }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF5C9E" /><stop offset="1" stopColor="#E01A68" /></linearGradient></defs>
      <path d="M12 106 V50 C12 28 28 10 50 10 C72 10 88 28 88 50 V106Z" fill={`url(#${id})`} />
      <path d="M20 106 V52 C20 33 33 18 50 18 C67 18 80 33 80 52 V106Z" fill="none" stroke="#FFA3CB" strokeWidth="2.5" />
      <path d="M26 106 V54 C26 38 36 26 50 26 C64 26 74 38 74 54 V106Z" fill="#F0357E" />
      <path d="M50 38 C46 33 40 36 41 41 C42 46 50 51 50 51 C50 51 58 46 59 41 C60 36 54 33 50 38Z" fill="#FF8DBB" />
      <rect x="31" y="60" width="17" height="19" rx="2.5" fill="none" stroke="#FFA3CB" strokeWidth="2" />
      <rect x="52" y="60" width="17" height="19" rx="2.5" fill="none" stroke="#FFA3CB" strokeWidth="2" />
      <rect x="31" y="84" width="17" height="16" rx="2.5" fill="none" stroke="#FFA3CB" strokeWidth="2" />
      <rect x="52" y="84" width="17" height="16" rx="2.5" fill="none" stroke="#FFA3CB" strokeWidth="2" />
      <circle cx="49" cy="82" r="1.8" fill="#FFC2DB" />
      <rect x="6" y="104" width="88" height="7" rx="3" fill="#FF4F97" />
    </svg>
  );
}

function Mansion({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 100 82" style={{ display: 'block', filter: 'drop-shadow(0 8px 8px rgba(40,0,70,0.3))' }}>
      <g fill="none" stroke="#FF5C9E" strokeWidth="3.6" strokeLinejoin="round" strokeLinecap="round">
        <path d="M6 78 V40 L20 28 L34 40 V30 L50 8 L66 30 V40 L80 28 L94 40 V78Z" />
        <path d="M42 78 V58 C42 52 58 52 58 58 V78" />
        <rect x="14" y="48" width="9" height="14" rx="3" />
        <rect x="77" y="48" width="9" height="14" rx="3" />
        <rect x="45" y="30" width="10" height="13" rx="3" />
      </g>
      <path d="M50 24 C48 21 44 23 45 26 C46 29 50 31 50 31 C50 31 54 29 55 26 C56 23 52 21 50 24Z" fill="#FF5C9E" />
    </svg>
  );
}

function Check({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', filter: 'drop-shadow(0 8px 8px rgba(60,0,80,0.3))' }}>
      <circle cx="50" cy="50" r="46" fill="#FFFFFF" stroke="#F0357E" strokeWidth="7" />
      <path d="M28 52 L44 68 L74 34" fill="none" stroke="#F0226F" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Un gráfico grande: uno de los dibujados o un emoji. `size` es el alto aprox. */
export function BubbleHero({ hero, size, tone = 'pink' }: { hero: string; size: number; tone?: Tone }) {
  const value = hero.trim();
  if (!value) return null;
  if (isBubbleHeroKey(value)) {
    const key: BubbleHeroKey = value;
    switch (key) {
      case 'interrogacion':
        return (
          <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `${Math.max(3, size * 0.007)}px solid rgba(255,255,255,0.92)`, boxShadow: '0 0 22px rgba(255,255,255,0.55)' }} />
            <Sparkle size={size * 0.12} style={{ position: 'absolute', left: -size * 0.02, top: size * 0.26 }} />
            <Sparkle size={size * 0.14} style={{ position: 'absolute', right: size * 0.02, bottom: size * 0.16 }} />
            <BubbleLine text="?" size={size * 0.92} tone={tone} />
          </div>
        );
      case 'puerta': return <Door size={size * 0.9} />;
      case 'corazon': return <GlossyHeart size={size * 0.95} />;
      case 'estrella': return <GlossyStar size={size * 0.95} />;
      case 'caramelo': return <Lollipop size={size * 0.6} />;
      case 'check': return <Check size={size * 0.8} />;
      case 'mansion': return <Mansion size={size} />;
      case 'aro': return <Ring size={size * 0.9} />;
    }
  }
  return <div style={{ fontSize: size * 0.82, lineHeight: 1, textAlign: 'center' }}>{value}</div>;
}

/** Decoración suelta en las esquinas (cambia según el número de lámina para
 * que un carrusel no repita siempre lo mismo). */
function Decor({ index, hasHero }: { index: number; hasHero: boolean }) {
  const set = index % 3;
  const abs = (s: CSSProperties): CSSProperties => ({ position: 'absolute', ...s });
  // Todo va en las esquinas (x < 180 o x > 900): el centro queda libre para el texto.
  if (set === 0) {
    return (
      <>
        <GlossyHeart size={96} style={abs({ left: 64, top: 280, transform: 'rotate(-12deg)' })} />
        <Sparkle size={64} style={abs({ right: 96, top: 340 })} />
        <Ring size={330} style={abs({ right: -100, bottom: -80, transform: 'rotate(18deg)' })} />
      </>
    );
  }
  if (set === 1) {
    return (
      <>
        <GlossyStar size={120} style={abs({ right: 56, top: 300, transform: 'rotate(14deg)' })} />
        {!hasHero && <Sparkle size={60} style={abs({ left: 70, top: 420 })} />}
        <GlossyHeart size={104} style={abs({ left: 56, bottom: 90, transform: 'rotate(-10deg)' })} />
        <Sparkle size={56} style={abs({ right: 80, bottom: 150 })} />
      </>
    );
  }
  return (
    <>
      <Lollipop size={150} style={abs({ left: 36, bottom: 36, transform: 'rotate(18deg)' })} />
      <Sparkle size={66} style={abs({ left: 80, top: 300 })} />
      <GlossyStar size={110} style={abs({ right: 60, top: 330, transform: 'rotate(-12deg)' })} />
      <GlossyHeart size={92} style={abs({ right: 64, bottom: 80, transform: 'rotate(12deg)' })} />
    </>
  );
}

export interface BubbleSlideProps {
  slide: StudioSlide;
  index: number;
  format: StudioFormat;
  width: number;
  height: number;
}

export function BubbleSlide({ slide, index, format, width, height }: BubbleSlideProps) {
  const palette = resolveBubblePalette(slide.palette);
  const story = format === 'historia';
  const side = 90;
  const boxWidth = width - side * 2;
  // El logo va arriba, con la versión de ROOM en blanco (la de dos tonos se pierde sobre azul).
  const lila = palette.key === 'lila';
  const logo = lila ? '/candyland/logo-wordmark-email.png' : '/studio/logo-wordmark-white.png';
  const logoTop = story ? 230 : 70;
  const logoHeight = 150;
  const contentTop = logoTop + logoHeight + (story ? 40 : 10);
  const contentBottom = story ? 260 : 96;
  const items = slide.items.filter((it) => it.badge || it.title);
  const iconRow = (slide.layout === 'resultados' || slide.layout === 'pasos') && items.length > 0;
  const hasPhoto = !!slide.imageUrl && slide.layout !== 'imagen';
  const hasHero = hasPhoto || !!slide.hero.trim();
  const area = height - contentTop - contentBottom;
  const heroSize = Math.min(boxWidth * (slide.layout === 'portada' ? 0.6 : 0.72), area * 0.46);

  let main: ReactNode;
  if (slide.layout === 'imagen') {
    main = null;
  } else if (iconRow) {
    // Una palabra grande + íconos con su nombre debajo (VIVE / CONECTA).
    const iconSize = Math.min(260, (boxWidth - 40) / items.length - 16);
    // Que el nombre más largo quepa en su columna sin pisar al vecino.
    const longestLabel = Math.max(...items.map((it) => it.title.length), 1);
    const labelSize = Math.max(24, Math.min(36, Math.floor((boxWidth / items.length - 20) / (longestLabel * 0.9))));
    main = (
      <>
        <BubbleHeadline text={slide.title} box={{ width: boxWidth, height: area * 0.34 }} max={300} />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 24, marginTop: 30, width: boxWidth }}>
          {items.map((it, i) => (
            <div key={i} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
              <div style={{ height: iconSize, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BubbleHero hero={it.badge || ''} size={iconSize} />
              </div>
              <Caption text={it.title} size={labelSize} style={{ letterSpacing: '0.08em', lineHeight: 1.25 }} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 56 }}><OutlinePill text={slide.cta || slide.body} size={38} /></div>
        <Caption text={slide.footnote} size={30} style={{ marginTop: 34 }} />
      </>
    );
  } else {
    const headlineHeight = hasHero ? area * 0.36 : area * 0.6;
    main = (
      <>
        {hasHero && (
          <div style={{ marginBottom: 26 }}>
            {hasPhoto
              ? <img src={slide.imageUrl} alt="" crossOrigin="anonymous" style={{ display: 'block', maxWidth: boxWidth, maxHeight: heroSize * 1.15, objectFit: 'contain' }} />
              : <BubbleHero hero={slide.hero} size={heroSize} />}
          </div>
        )}
        <BubbleHeadline text={slide.title} box={{ width: boxWidth, height: headlineHeight }} max={hasHero ? 160 : 230} />
        {slide.layout === 'cierre' || (slide.layout === 'portada' && slide.cta)
          ? (
            <>
              <div style={{ marginTop: 44 }}><OutlinePill text={slide.body} size={36} /></div>
              <div style={{ marginTop: slide.body ? 30 : 50 }}><BigPill text={slide.cta} color={palette.pill} /></div>
            </>
          )
          : <div style={{ marginTop: 40 }}><OutlinePill text={slide.body} size={38} /></div>}
        {slide.options.length > 0 && (
          <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
            {slide.options.map((o, i) => <OutlinePill key={i} text={o} size={34} />)}
          </div>
        )}
        <Caption text={slide.footnote} size={32} style={{ marginTop: 34 }} />
        {slide.swipeHint && !slide.footnote && slide.layout !== 'cierre' && (
          <Caption text="Desliza →" size={32} style={{ marginTop: 36 }} />
        )}
      </>
    );
  }

  return (
    <>
      {slide.layout !== 'imagen' && <Decor index={index} hasHero={hasHero} />}
      {slide.layout !== 'imagen' && <img src={logo} alt="" style={{ position: 'absolute', left: '50%', top: logoTop, height: logoHeight, transform: 'translateX(-50%)', filter: 'drop-shadow(0 4px 4px rgba(0,20,90,0.3))' }} />}
      {slide.layout !== 'imagen' && (
        <div style={{ position: 'absolute', left: side, right: side, top: contentTop, bottom: contentBottom, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {main}
        </div>
      )}
    </>
  );
}
