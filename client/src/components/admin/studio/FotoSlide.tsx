import type { CSSProperties, ReactNode } from 'react';
import { resolveBubblePalette } from '@shared/studioBubble';
import { fitFontSize, type StudioFormat, type StudioSlide, type StudioTheme } from '@shared/contentStudio';
import { BigPill, BubbleHeadline, Caption, OutlinePill } from './BubbleSlide';

/* Lámina «foto»: una foto propia con título, etiqueta, botón y texto chico,
 * en cualquiera de las cuatro plantillas. La foto va de cuatro maneras
 * (`slide.photoStyle`): a sangre, con marco, en círculo o como polaroid.
 * Se dibuja a tamaño real, igual que las demás láminas. */

const DISPLAY = "'Gliker Semi Bold Expanded', 'Syne', sans-serif";
const SYNE = "'Syne', sans-serif";
const BODY = "'Inter', 'Josefin Sans Variable', sans-serif";

interface Look {
  bg: string;
  /** Color del botón y de los acentos (aro del círculo, etiqueta). */
  accent: string;
  /** Color del título sobre el fondo de la plantilla. */
  title: string;
  /** Letra del título (las plantillas que no son Bubble). */
  font: { family: string; weight: number; upper: boolean; spacing: string; charWidth: number };
  /** Color del texto chico sobre el fondo. */
  text: string;
}

function lookFor(theme: StudioTheme, slide: StudioSlide): Look {
  if (theme === 'bubble') {
    const p = resolveBubblePalette(slide.palette);
    return { bg: p.bg, accent: p.pill, title: '#FFFFFF', text: '#FFFFFF', font: { family: DISPLAY, weight: 600, upper: true, spacing: '0', charWidth: 0.68 } };
  }
  if (theme === 'pastel') {
    return { bg: '#E3CAFD', accent: '#A020F0', title: '#A020F0', text: '#111111', font: { family: DISPLAY, weight: 600, upper: true, spacing: '-0.04em', charWidth: 0.95 } };
  }
  if (theme === 'playcard') {
    return { bg: '#FFD6F5', accent: '#E866C2', title: '#E866C2', text: '#3B2236', font: { family: SYNE, weight: 800, upper: false, spacing: '-0.03em', charWidth: 0.7 } };
  }
  return { bg: '#00A3FF', accent: '#FF0A9C', title: '#FF0A9C', text: '#FFFFFF', font: { family: DISPLAY, weight: 600, upper: true, spacing: '-0.04em', charWidth: 0.95 } };
}

function Photo({ url, style }: { url: string; style: CSSProperties }) {
  if (!url) {
    return (
      <div style={{
        ...style, background: 'linear-gradient(135deg, #F9C4EC 0%, #F48FD8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.92)', fontFamily: BODY, fontWeight: 600, fontSize: 40, textAlign: 'center', padding: 40, boxSizing: 'border-box',
      }}>
        Sube tu foto
      </div>
    );
  }
  return <img src={url} alt="" crossOrigin="anonymous" style={{ display: 'block', objectFit: 'cover', ...style }} />;
}

function Title({ theme, look, text, box, onPhoto }: { theme: StudioTheme; look: Look; text: string; box: { width: number; height: number }; onPhoto: boolean }) {
  if (!text.trim()) return null;
  if (theme === 'bubble') return <BubbleHeadline text={text} box={box} max={onPhoto ? 170 : 200} />;
  const size = fitFontSize(text, box, { max: onPhoto ? 150 : 170, min: 44, charWidth: look.font.charWidth, lineHeight: 1.02 });
  return (
    <div style={{
      fontFamily: look.font.family, fontWeight: look.font.weight, fontSize: size, lineHeight: 1.02, letterSpacing: look.font.spacing,
      textTransform: look.font.upper ? 'uppercase' : 'none', textAlign: 'center', whiteSpace: 'pre-line', maxWidth: box.width,
      // Sobre la foto el título va blanco con sombra del color de la plantilla: se lee en cualquier foto.
      color: onPhoto ? '#FFFFFF' : look.title, textShadow: onPhoto ? `0 6px 0 ${look.accent}, 0 12px 30px rgba(0,0,0,0.45)` : 'none',
    }}>
      {text}
    </div>
  );
}

function Tag({ theme, look, text, onPhoto }: { theme: StudioTheme; look: Look; text: string; onPhoto: boolean }) {
  if (!text) return null;
  if (theme === 'bubble' || onPhoto) return <OutlinePill text={text} size={38} />;
  return (
    <div style={{ background: look.accent, color: '#FFFFFF', borderRadius: 999, padding: '16px 40px', fontFamily: BODY, fontWeight: 700, fontSize: 38, letterSpacing: '0.04em', textAlign: 'center', maxWidth: 900 }}>
      {text}
    </div>
  );
}

function Button({ theme, look, text }: { theme: StudioTheme; look: Look; text: string }) {
  if (!text) return null;
  if (theme === 'bubble') return <BigPill text={text} color={look.accent} />;
  const size = text.length > 22 ? Math.max(34, Math.round(52 * (22 / text.length))) : 52;
  return (
    <div style={{
      background: look.accent, color: '#FFFFFF', border: '5px solid #FFFFFF', borderRadius: 999, padding: '24px 56px', fontFamily: BODY, fontWeight: 800,
      fontSize: size, textAlign: 'center', whiteSpace: 'nowrap', maxWidth: 940, boxShadow: '0 14px 30px rgba(0,0,0,0.22)',
    }}>
      {text}
    </div>
  );
}

function Foot({ look, text, onPhoto }: { look: Look; text: string; onPhoto: boolean }) {
  return <Caption text={text} size={30} style={{ color: onPhoto ? '#FFFFFF' : look.text }} />;
}

export interface FotoSlideProps {
  theme: StudioTheme;
  slide: StudioSlide;
  format: StudioFormat;
  width: number;
  height: number;
}

export function FotoSlide({ theme, slide, format, width, height }: FotoSlideProps) {
  const look = lookFor(theme, slide);
  const story = format === 'historia';
  const side = 90;
  const boxWidth = width - side * 2;
  // Historias: arriba va el nombre de la cuenta y abajo «Enviar mensaje».
  const top = story ? 240 : 90;
  const bottom = story ? 270 : 96;
  const style = slide.photoStyle;
  const onPhoto = style === 'sangre';

  const text = (titleHeight: number, gap = 30): ReactNode => (
    <>
      <Title theme={theme} look={look} text={slide.title} box={{ width: boxWidth, height: titleHeight }} onPhoto={onPhoto} />
      {slide.body && <div style={{ marginTop: gap }}><Tag theme={theme} look={look} text={slide.body} onPhoto={onPhoto} /></div>}
      {slide.cta && <div style={{ marginTop: gap }}><Button theme={theme} look={look} text={slide.cta} /></div>}
      {slide.footnote && <div style={{ marginTop: gap * 0.9 }}><Foot look={look} text={slide.footnote} onPhoto={onPhoto} /></div>}
    </>
  );
  const column: CSSProperties = { position: 'absolute', left: side, right: side, display: 'flex', flexDirection: 'column', alignItems: 'center' };

  if (style === 'sangre') {
    return (
      <div style={{ position: 'absolute', inset: 0, background: look.bg }}>
        <Photo url={slide.imageUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,0,20,0) 30%, rgba(10,0,20,0.62) 58%, rgba(10,0,20,0.92) 100%)' }} />
        <div style={{ ...column, bottom, justifyContent: 'flex-end' }}>{text(height * 0.2, 26)}</div>
      </div>
    );
  }

  const area = height - top - bottom;
  if (style === 'marco') {
    const photoHeight = Math.round(area * (story ? 0.56 : 0.5));
    return (
      <div style={{ position: 'absolute', inset: 0, background: look.bg }}>
        <div style={{ ...column, top, bottom, justifyContent: 'center' }}>
          <div style={{ border: '14px solid #FFFFFF', borderRadius: 48, overflow: 'hidden', boxShadow: `18px 18px 0 ${look.accent}`, marginBottom: 56 }}>
            <Photo url={slide.imageUrl} style={{ width: boxWidth - 28, height: photoHeight }} />
          </div>
          {text(area * 0.26)}
        </div>
      </div>
    );
  }

  if (style === 'circulo') {
    const d = Math.round(Math.min(boxWidth * 0.82, area * (story ? 0.5 : 0.46)));
    return (
      <div style={{ position: 'absolute', inset: 0, background: look.bg }}>
        <div style={{ ...column, top, bottom, justifyContent: 'center' }}>
          <div style={{ width: d, height: d, borderRadius: '50%', overflow: 'hidden', border: '16px solid #FFFFFF', boxShadow: `0 0 0 14px ${look.accent}, 0 24px 50px rgba(0,0,0,0.25)`, marginBottom: 70 }}>
            <Photo url={slide.imageUrl} style={{ width: '100%', height: '100%' }} />
          </div>
          {text(area * 0.26)}
        </div>
      </div>
    );
  }

  // polaroid
  const photoWidth = Math.round(boxWidth * (story ? 0.82 : 0.66));
  const photoHeight = Math.round(Math.min(photoWidth * 1.15, area * (story ? 0.5 : 0.42)));
  return (
    <div style={{ position: 'absolute', inset: 0, background: look.bg }}>
      <div style={{ ...column, top, bottom, justifyContent: 'center' }}>
        <div style={{ background: '#FFFFFF', padding: '28px 28px 110px', transform: 'rotate(-4deg)', boxShadow: '0 30px 60px rgba(0,0,0,0.3)', marginBottom: 60 }}>
          <Photo url={slide.imageUrl} style={{ width: photoWidth, height: photoHeight }} />
        </div>
        {text(area * 0.26)}
      </div>
    </div>
  );
}
