import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import '@fontsource-variable/josefin-sans/wght.css';
import '@fontsource-variable/josefin-sans/wght-italic.css';
import './studio-fonts.css';
import {
  fitFontSize,
  pageLabel,
  resolveImageSide,
  resolvePalette,
  STUDIO_SIZES,
  type StudioFormat,
  type StudioSlide,
  type StudioTheme,
} from '@shared/contentStudio';

/* Las plantillas de marca del Estudio de contenido, dibujadas a tamaño REAL
 * (1080 de ancho) para que el PNG exportado salga nítido. La vista previa del
 * panel las achica con `transform: scale` desde afuera (ver ContentStudio).
 *
 * Copian los diseños hechos en Claude Design:
 * - azul: carrusel "Desafío ¿Sabes jugar en Playroom?".
 * - pastel: carrusel "Test ¿Qué monstruo eres en Playroom?".
 * - playcard: carrusel de la Tarjeta PlayCard. */

const DISPLAY = "'Gliker Semi Bold Expanded', 'Syne', sans-serif";
const JOSEFIN = "'Josefin Sans Variable', 'Space Grotesk', sans-serif";
const SCRIPT = "'Allura', cursive";
const SYNE = "'Syne', sans-serif";
const GROTESK = "'Space Grotesk', sans-serif";
// La versión del correo: recortada justo al logo (la .webp del sitio es un
// cuadrado con mucho margen transparente y salía diminuta).
const LOGO = '/candyland/logo-wordmark-email.png';

const PURPLE = '#A020F0';
const PINK = '#FF0A9C';

const PASTEL_PALETTES = [
  { bg: '#FDDBAE', accent: '#D9640B', strong: PURPLE }, // durazno
  { bg: '#E3CAFD', accent: PURPLE, strong: '#111111' }, // lila
  { bg: '#EEFFA9', accent: '#111111', strong: PURPLE }, // lima
] as const;

export const PASTEL_PALETTE_LABELS = ['Durazno', 'Lila', 'Lima'];

interface Tokens {
  bg: string;
  brand: string;
  line: string;
  page: string;
  number: string;
  question: string;
  headline: string;
  text: string;
  accent: string;
  optionLetter: string;
  optionText: string;
  script: string;
  display: { fontFamily: string; fontWeight: number; textTransform: 'uppercase' | 'none'; letterSpacing: string; charWidth: number };
}

function tokensFor(theme: StudioTheme, slide: StudioSlide, index: number): Tokens {
  if (theme === 'pastel') {
    const p = PASTEL_PALETTES[resolvePalette(slide, index)];
    return {
      bg: p.bg, brand: p.strong, line: p.accent, page: p.accent, number: p.accent, question: p.strong, headline: PURPLE,
      text: p.strong, accent: p.accent, optionLetter: p.accent, optionText: p.strong, script: p.accent,
      display: { fontFamily: DISPLAY, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '-0.04em', charWidth: 0.95 },
    };
  }
  if (theme === 'playcard') {
    return {
      bg: '#FFD6F5', brand: '#3B2236', line: '#E866C2', page: '#E866C2', number: '#E866C2', question: '#3B2236', headline: '#E866C2',
      text: '#3B2236', accent: '#E866C2', optionLetter: '#E866C2', optionText: '#3B2236', script: '#E866C2',
      display: { fontFamily: SYNE, fontWeight: 800, textTransform: 'none', letterSpacing: '-0.03em', charWidth: 0.95 },
    };
  }
  return {
    bg: '#00A3FF', brand: PINK, line: '#0A2BE0', page: PINK, number: PINK, question: PINK, headline: PINK,
    text: PINK, accent: '#F5A3F0', optionLetter: '#EE7FE6', optionText: PINK, script: PINK,
    display: { fontFamily: DISPLAY, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '-0.04em', charWidth: 0.95 },
  };
}

export interface StudioSlideViewProps {
  theme: StudioTheme;
  format: StudioFormat;
  slide: StudioSlide;
  index: number;
  total: number;
}

/** Una lámina a tamaño real. El `ref` apunta al nodo que se exporta a PNG. */
export const StudioSlideView = forwardRef<HTMLDivElement, StudioSlideViewProps>(function StudioSlideView(props, ref) {
  const { theme, format, slide, index } = props;
  const { width, height } = STUDIO_SIZES[format];
  const t = tokensFor(theme, slide, index);
  const story = format === 'historia';
  // Las historias tienen zonas tapadas arriba (nombre de la cuenta) y abajo
  // (responder): el contenido se aleja de los bordes.
  const pad = { top: story ? 230 : 100, bottom: story ? 250 : 108, side: theme === 'playcard' ? 90 : 108 };

  const isPasos = slide.layout === 'pasos' && theme === 'playcard';
  const style: CSSProperties = {
    width, height, position: 'relative', overflow: 'hidden', boxSizing: 'border-box',
    background: isPasos ? '#FDF0F7' : t.bg, fontFamily: theme === 'playcard' ? GROTESK : JOSEFIN, color: t.text,
  };

  let body: ReactNode;
  if (slide.layout === 'imagen') {
    body = slide.imageUrl
      ? <img src={slide.imageUrl} alt="" crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      : <Placeholder style={{ position: 'absolute', inset: 0 }} label="Sube tu imagen (hecha en Claude Design u otra)" />;
  } else if (theme === 'azul') {
    body = <AzulSlide {...props} t={t} pad={pad} width={width} height={height} />;
  } else if (theme === 'pastel') {
    body = <PastelSlide {...props} t={t} pad={pad} width={width} height={height} />;
  } else {
    body = <PlaycardSlide {...props} t={t} pad={pad} width={width} height={height} />;
  }

  return <div ref={ref} style={style}>{body}</div>;
});

type InnerProps = StudioSlideViewProps & { t: Tokens; pad: { top: number; bottom: number; side: number }; width: number; height: number };

/* --- Piezas comunes ------------------------------------------------------- */

function Placeholder({ style, label }: { style?: CSSProperties; label?: string }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #F9C4EC 0%, #F48FD8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,255,255,0.9)', fontFamily: JOSEFIN, fontSize: 30, textAlign: 'center', padding: 40, boxSizing: 'border-box', ...style,
    }}>
      {label ?? ''}
    </div>
  );
}

function Photo({ url, style }: { url: string; style: CSSProperties }) {
  if (!url) return <Placeholder style={style} />;
  return <img src={url} alt="" crossOrigin="anonymous" style={{ objectFit: 'cover', display: 'block', ...style }} />;
}

function Display({ text, t, size, color, style }: { text: string; t: Tokens; size: number; color: string; style?: CSSProperties }) {
  return (
    <div style={{
      fontFamily: t.display.fontFamily, fontWeight: t.display.fontWeight, textTransform: t.display.textTransform,
      letterSpacing: t.display.letterSpacing, fontSize: size, lineHeight: 1.02, color, whiteSpace: 'pre-line', ...style,
    }}>
      {text}
    </div>
  );
}

function fit(text: string, t: Tokens, box: { width: number; height: number }, max: number, min = 34) {
  return fitFontSize(t.display.textTransform === 'uppercase' ? text.toUpperCase() : text, box, { max, min, charWidth: t.display.charWidth, lineHeight: 1.05 });
}

function Brand({ t, left, top, page }: { t: Tokens; left: number; top: number; page?: { text: string; right: number } }) {
  return (
    <>
      <div style={{ position: 'absolute', left, top, fontFamily: JOSEFIN, fontWeight: 600, fontSize: 30, letterSpacing: '0.2em', color: t.brand }}>
        MANSION PLAYROOM
      </div>
      {page?.text && (
        <div style={{ position: 'absolute', right: page.right, top, fontFamily: JOSEFIN, fontWeight: 700, fontSize: 30, letterSpacing: '0.08em', color: t.page }}>
          {page.text}
        </div>
      )}
    </>
  );
}

function Italic({ text, color, size = 36, style }: { text: string; color: string; size?: number; style?: CSSProperties }) {
  if (!text) return null;
  return <div style={{ fontFamily: JOSEFIN, fontStyle: 'italic', fontWeight: 300, fontSize: size, lineHeight: 1.4, color, whiteSpace: 'pre-line', ...style }}>{text}</div>;
}

function Script({ text, color, size }: { text: string; color: string; size: number }) {
  if (!text) return null;
  return <div style={{ fontFamily: SCRIPT, fontSize: size, lineHeight: 1, color, marginBottom: -size * 0.12, paddingLeft: 6 }}>{text}</div>;
}

function OptionBubble({ letter, t, size }: { letter: string; t: Tokens; size: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: '#FFFFFF', flexShrink: 0,
      boxShadow: `${size * 0.08}px ${size * 0.08}px 0 ${t.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: DISPLAY, fontWeight: 600, fontSize: size * 0.56, lineHeight: 1, color: t.optionLetter, paddingBottom: size * 0.06, boxSizing: 'border-box',
    }}>
      {letter}
    </div>
  );
}

function Options({ options, t, columns, bubble = 92, fontSize = 32, gap = 44 }: { options: string[]; t: Tokens; columns: 1 | 2; bubble?: number; fontSize?: number; gap?: number }) {
  if (options.length === 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: columns === 2 ? '1fr 1fr' : '1fr', columnGap: 40, rowGap: gap }}>
      {options.map((o, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 22 }}>
          <OptionBubble letter={String.fromCharCode(97 + i)} t={t} size={bubble} />
          <div style={{ fontFamily: JOSEFIN, fontWeight: 500, fontSize, lineHeight: 1.32, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.optionText, paddingTop: 6 }}>
            {o}
          </div>
        </div>
      ))}
    </div>
  );
}

function OutlinePill({ text, color, size = 34 }: { text: string; color: string; size?: number }) {
  if (!text) return null;
  return (
    <div style={{
      display: 'inline-block', alignSelf: 'flex-start', border: `3px solid ${color}`, borderRadius: 999, padding: `${size * 0.6}px ${size * 1.2}px`,
      fontFamily: JOSEFIN, fontWeight: 600, fontSize: size, lineHeight: 1.15, letterSpacing: '0.12em', textTransform: 'uppercase', color,
    }}>
      {text}
    </div>
  );
}

function SwipePill({ t, right, bottom }: { t: Tokens; right: number; bottom: number }) {
  return (
    <div style={{
      position: 'absolute', right, bottom, height: 80, padding: '0 22px 0 24px', border: `3px solid ${t.text}`, borderRadius: 999,
      display: 'flex', alignItems: 'center', gap: 22, fontFamily: JOSEFIN, fontWeight: 500, fontSize: 30, letterSpacing: '0.3em', color: t.text,
    }}>
      DESLIZA
      <svg width="66" height="14" viewBox="0 0 66 14" fill="none"><path d="M0 7h62M56 1l6 6-6 6" stroke={t.line} strokeWidth="2.5" /></svg>
    </div>
  );
}

function Results({ slide, t, bubble = 136 }: { slide: StudioSlide; t: Tokens; bubble?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 52 }}>
      {slide.items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <div style={{
            width: bubble, height: bubble, borderRadius: '50%', background: '#FFFFFF', flexShrink: 0, boxShadow: `10px 10px 0 ${t.accent}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: bubble * 0.55, lineHeight: 1,
          }}>
            {item.badge}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: t.display.fontFamily, fontWeight: t.display.fontWeight, textTransform: t.display.textTransform, letterSpacing: t.display.letterSpacing, fontSize: 52, lineHeight: 1.05 }}>
              <span style={{ color: '#111111' }}>{String.fromCharCode(65 + i)} = </span>
              <span style={{ color: t.headline }}>{item.title}</span>
            </div>
            <Italic text={item.body} color={t.text} size={34} style={{ fontWeight: 400, marginTop: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StepCards({ slide, t, dark = '#3B2236', muted = '#6D5468' }: { slide: StudioSlide; t: Tokens; dark?: string; muted?: string }) {
  const badgeColors = ['#E866C2', '#E866C2', '#7B7FDB', '#0A8FAF'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, flex: 1, minHeight: 0 }}>
      {slide.items.map((item, i) => (
        <div key={i} style={{ background: 'rgba(255,255,255,0.75)', border: '2px solid #F3D3E6', borderRadius: 28, padding: 36, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ alignSelf: 'flex-start', background: badgeColors[i % badgeColors.length], color: '#FFFFFF', borderRadius: 999, padding: '10px 24px', fontFamily: GROTESK, fontWeight: 600, fontSize: 30 }}>
            {item.badge || `Paso ${i + 1}`}
          </div>
          <div style={{ fontFamily: t.display.fontFamily, fontWeight: t.display.fontWeight, letterSpacing: t.display.letterSpacing, textTransform: t.display.textTransform, fontSize: 42, lineHeight: 1.05, color: dark }}>
            {item.title}
          </div>
          <div style={{ fontFamily: GROTESK, fontSize: 30, lineHeight: 1.3, color: muted }}>{item.body}</div>
        </div>
      ))}
    </div>
  );
}

/* --- Familia azul (Desafío) ------------------------------------------------ */

function AzulSlide({ slide, index, format, t, pad, width, height }: InnerProps) {
  const side = resolveImageSide(slide, index);
  const cover = slide.layout === 'portada';
  const panelWidth = cover ? 114 : 355;
  const panelTop = pad.top + 162;
  const panelHeight = Math.round(height * (format === 'historia' ? 0.5 : 0.61));
  const textLeft = side === 'left' ? panelWidth + 109 : pad.side;
  const textWidth = side === 'left' ? width - textLeft - 80 : width - panelWidth - pad.side - (cover ? 92 : 45);
  const top = pad.top + 100;

  const radius = side === 'left' ? '0 40px 40px 0' : '40px 0 0 40px';
  const panel: CSSProperties = { position: 'absolute', top: panelTop, height: panelHeight, width: panelWidth, borderRadius: radius, [side]: 0 };

  let content: ReactNode;
  if (cover) {
    const size = fit(slide.title, t, { width: textWidth, height: 420 }, 92);
    content = (
      <>
        <Script text={slide.script} color={t.script} size={190} />
        <Display text={slide.title} t={t} size={size} color={t.headline} />
        <Italic text={slide.body} color={t.text} size={38} style={{ marginTop: 70 }} />
      </>
    );
  } else if (slide.layout === 'cierre') {
    const size = fit(slide.title, t, { width: textWidth, height: 260 }, 84);
    content = (
      <>
        <Display text={slide.title} t={t} size={size} color={t.headline} style={{ marginTop: 20 }} />
        <Italic text={slide.body} color={t.text} size={36} style={{ marginTop: 36 }} />
        {slide.cta && <div style={{ marginTop: 50 }}><OutlinePill text={slide.cta} color={t.text} size={32} /></div>}
        <Italic text={slide.footnote} color={t.text} size={32} style={{ marginTop: 40 }} />
      </>
    );
  } else if (slide.layout === 'resultados') {
    const size = fit(slide.title, t, { width: textWidth, height: 200 }, 72);
    content = (
      <>
        <Display text={slide.title} t={t} size={size} color={t.headline} />
        <Italic text={slide.body} color={t.text} size={34} style={{ margin: '20px 0 44px' }} />
        <Results slide={slide} t={t} bubble={110} />
      </>
    );
  } else if (slide.layout === 'pasos') {
    content = (
      <>
        <Display text={slide.title} t={t} size={fit(slide.title, t, { width: textWidth, height: 200 }, 72)} color={t.headline} />
        <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 36 }}>
          {slide.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 22 }}>
              <OptionBubble letter={item.badge || String(i + 1)} t={t} size={80} />
              <div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 36, textTransform: 'uppercase', color: t.headline }}>{item.title}</div>
                <Italic text={item.body} color={t.text} size={30} />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  } else {
    const twoCols = slide.options.length > 2 && textWidth > 700;
    const size = fit(slide.title, t, { width: textWidth, height: slide.options.length ? 380 : 620 }, slide.options.length ? 72 : 88);
    content = (
      <>
        {slide.number && <Display text={slide.number} t={t} size={86} color={t.number} style={{ marginBottom: 34 }} />}
        <Display text={slide.title} t={t} size={size} color={t.question} />
        {slide.options.length > 0 && <div style={{ marginTop: 60 }}><Options options={slide.options} t={t} columns={twoCols ? 2 : 1} bubble={90} fontSize={31} gap={36} /></div>}
        <Italic text={slide.body} color={t.text} size={34} style={{ marginTop: 40 }} />
      </>
    );
  }

  return (
    <>
      <Brand t={t} left={pad.side} top={pad.top} />
      <div style={{ position: 'absolute', left: 0, top: pad.top + 60, width: 372, height: 3, background: t.line }} />
      <Photo url={slide.imageUrl} style={panel} />
      <div style={{ position: 'absolute', left: textLeft, top: cover ? top + 20 : top, width: textWidth, display: 'flex', flexDirection: 'column' }}>
        {content}
      </div>
      {slide.swipeHint && <SwipePill t={t} right={108} bottom={pad.bottom} />}
    </>
  );
}

/* --- Familia pastel (Test) ------------------------------------------------- */

function PastelSlide({ slide, index, total, format, t, pad, width, height }: InnerProps) {
  const inner = width - pad.side * 2;
  const story = format === 'historia';
  const imageHeight = story ? 640 : 520;

  let content: ReactNode;
  if (slide.layout === 'portada') {
    content = (
      <>
        <Script text={slide.script} color={t.script} size={170} />
        <Display text={slide.title} t={t} size={fit(slide.title, t, { width: inner * 0.82, height: 360 }, 92)} color={t.headline} style={{ marginTop: 30 }} />
        <Italic text={slide.body} color={t.text} size={38} style={{ marginTop: 34, fontWeight: 400 }} />
        <div style={{ flex: 1, minHeight: 60 }} />
        {slide.imageUrl && <Photo url={slide.imageUrl} style={{ width: inner, height: Math.min(380, height * 0.27), borderRadius: 48 }} />}
      </>
    );
  } else if (slide.layout === 'resultados') {
    content = (
      <>
        <Display text={slide.title} t={t} size={fit(slide.title, t, { width: inner, height: 200 }, 84)} color={t.headline} style={{ marginTop: 50 }} />
        <Italic text={slide.body} color={t.text} size={40} style={{ marginTop: 20, marginBottom: 70, fontWeight: 400 }} />
        <Results slide={slide} t={t} />
      </>
    );
  } else if (slide.layout === 'cierre') {
    content = (
      <>
        {slide.imageUrl && <Photo url={slide.imageUrl} style={{ width: inner, height: imageHeight - 50, borderRadius: 48, marginBottom: 70 }} />}
        <Display text={slide.title} t={t} size={fit(slide.title, t, { width: inner * 0.8, height: 260 }, 84)} color={t.headline} />
        <Italic text={slide.body} color={t.text} size={40} style={{ marginTop: 30, fontWeight: 400 }} />
        {slide.cta && <div style={{ marginTop: 50 }}><OutlinePill text={slide.cta} color={t.text} size={32} /></div>}
        <Italic text={slide.footnote} color={t.text} size={38} style={{ marginTop: 50, fontWeight: 400 }} />
      </>
    );
  } else if (slide.layout === 'pasos') {
    content = (
      <>
        <Display text={slide.title} t={t} size={fit(slide.title, t, { width: inner, height: 200 }, 84)} color={t.headline} style={{ marginBottom: 50 }} />
        <StepCards slide={slide} t={t} dark="#111111" muted={t.text} />
      </>
    );
  } else {
    const titleWidth = inner - (slide.number ? 220 : 0);
    content = (
      <>
        {slide.imageUrl && <Photo url={slide.imageUrl} style={{ width: inner, height: imageHeight, borderRadius: 48, marginBottom: 56 }} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {slide.number && <Display text={slide.number.replace(/\.$/, '')} t={t} size={118} color={t.number} style={{ flexShrink: 0, letterSpacing: '-0.04em' }} />}
          <Display text={slide.title} t={t} size={fit(slide.title, t, { width: titleWidth, height: slide.imageUrl ? 130 : 400 }, slide.imageUrl ? 58 : 84, 30)} color={t.question} />
        </div>
        {slide.options.length > 0 && <div style={{ marginTop: 56 }}><Options options={slide.options} t={t} columns={slide.options.length > 2 ? 2 : 1} bubble={88} fontSize={30} gap={50} /></div>}
        <Italic text={slide.body} color={t.text} size={34} style={{ marginTop: 40, fontWeight: 400 }} />
      </>
    );
  }

  return (
    <>
      <Brand t={t} left={pad.side} top={pad.top} page={{ text: pageLabel(index, total), right: pad.side }} />
      <div style={{ position: 'absolute', left: pad.side, right: pad.side, top: pad.top + 44, height: 3, background: t.line }} />
      <div style={{ position: 'absolute', left: pad.side, right: pad.side, top: pad.top + 96, bottom: pad.bottom, display: 'flex', flexDirection: 'column' }}>
        {content}
      </div>
      {slide.swipeHint && slide.layout !== 'portada' && <SwipePill t={t} right={pad.side} bottom={pad.bottom - 60} />}
    </>
  );
}

/* --- Familia PlayCard ------------------------------------------------------ */

function PlaycardSlide({ slide, t, pad, width, height }: InnerProps) {
  const inner = width - pad.side * 2;
  const diagonal = slide.layout !== 'pasos';

  let content: ReactNode;
  if (slide.layout === 'cierre') {
    content = (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 0 }}>
        <img src={LOGO} alt="" style={{ height: 150, marginBottom: 50 }} />
        <Display text={slide.title} t={t} size={fit(slide.title, t, { width: inner, height: 420 }, 150, 60)} color={t.headline} />
        {slide.body && <div style={{ fontFamily: GROTESK, fontSize: 44, color: t.text, marginTop: 50 }}>{slide.body}</div>}
        {slide.cta && (
          <div style={{ marginTop: 50, background: '#E866C2', color: '#FFFFFF', borderRadius: 999, padding: '30px 64px', fontFamily: GROTESK, fontWeight: 700, fontSize: 36, letterSpacing: '0.02em', textTransform: 'uppercase', boxShadow: '0 12px 30px rgba(232,102,194,0.35)' }}>
            {slide.cta}
          </div>
        )}
        {slide.footnote && <div style={{ fontFamily: GROTESK, fontWeight: 600, fontSize: 36, color: t.text, marginTop: 34 }}>{slide.footnote}</div>}
      </div>
    );
  } else if (slide.layout === 'pasos') {
    content = (
      <>
        {slide.script && <div style={{ fontFamily: GROTESK, fontWeight: 500, fontSize: 32, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#E866C2', marginBottom: 20 }}>{slide.script}</div>}
        <Display text={slide.title} t={t} size={fit(slide.title, t, { width: inner, height: 260 }, 130, 60)} color="#3B2236" style={{ marginBottom: 56 }} />
        <StepCards slide={slide} t={t} />
      </>
    );
  } else if (slide.layout === 'resultados') {
    content = (
      <>
        <img src={LOGO} alt="" style={{ height: 110, alignSelf: 'flex-start', marginBottom: 40 }} />
        <Display text={slide.title} t={t} size={fit(slide.title, t, { width: inner, height: 260 }, 120, 50)} color={t.headline} />
        {slide.body && <div style={{ fontFamily: GROTESK, fontSize: 40, color: t.text, margin: '24px 0 56px' }}>{slide.body}</div>}
        <Results slide={slide} t={t} bubble={120} />
      </>
    );
  } else {
    const question = slide.layout === 'pregunta';
    content = (
      <>
        <img src={LOGO} alt="" style={{ height: 130, alignSelf: 'flex-start', marginBottom: 44 }} />
        {slide.script && <div style={{ fontFamily: GROTESK, fontWeight: 500, fontSize: 32, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#E866C2', marginBottom: 16 }}>{slide.script}</div>}
        {slide.number && <Display text={slide.number} t={t} size={110} color={t.number} />}
        <Display text={slide.title} t={t} size={fit(slide.title, t, { width: inner, height: question ? 300 : 420 }, question ? 110 : 160, 50)} color={question ? t.question : t.headline} />
        {slide.body && <div style={{ fontFamily: GROTESK, fontSize: 46, lineHeight: 1.3, color: t.text, marginTop: 30 }}>{slide.body}</div>}
        {slide.options.length > 0 && <div style={{ marginTop: 56 }}><Options options={slide.options} t={t} columns={slide.options.length > 2 ? 2 : 1} bubble={88} fontSize={30} /></div>}
        <div style={{ flex: 1, minHeight: 40 }} />
        {slide.imageUrl && (
          <img src={slide.imageUrl} alt="" crossOrigin="anonymous" style={{ alignSelf: 'center', width: inner * 0.72, height: Math.min(500, height * 0.3), objectFit: 'cover', borderRadius: 40, boxShadow: '0 30px 60px rgba(59,34,54,0.25)' }} />
        )}
        <div style={{ flex: 1, minHeight: 40 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: GROTESK, fontWeight: 600, fontSize: 32, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#3B2236' }}>{slide.footnote}</div>
          {slide.swipeHint && <div style={{ fontFamily: GROTESK, fontWeight: 700, fontSize: 34, letterSpacing: '0.16em', color: '#E866C2' }}>DESLIZA →</div>}
        </div>
      </>
    );
  }

  return (
    <>
      {diagonal && <div style={{ position: 'absolute', inset: 0, background: '#BFEBFB', clipPath: 'polygon(0 70%, 100% 43%, 100% 100%, 0 100%)' }} />}
      <div style={{ position: 'absolute', left: pad.side, right: pad.side, top: pad.top - 40, bottom: pad.bottom - 30, display: 'flex', flexDirection: 'column' }}>
        {content}
      </div>
    </>
  );
}
