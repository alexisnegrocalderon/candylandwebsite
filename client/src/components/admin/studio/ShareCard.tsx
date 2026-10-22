import { forwardRef } from 'react';
import { SHARE_CARD_SIZE } from '@shared/studioPack';
import { BubbleHeadline, OutlinePill } from './BubbleSlide';
import './studio-fonts.css';

/* La imagen que sale al pegar el link de un evento en WhatsApp, Facebook o
 * Instagram (1200×630): la foto del evento de fondo, el nombre en letras
 * globo, el día y la hora. Se dibuja a tamaño real, como las láminas, y se
 * descarga a PNG. */

export const ShareCard = forwardRef<HTMLDivElement, { title: string; when: string; footer: string; imageUrl: string }>(function ShareCard(props, ref) {
  const { width, height } = SHARE_CARD_SIZE;
  return (
    <div ref={ref} style={{ width, height, position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #07A2FC 0%, #CF71DB 100%)', fontFamily: "'Inter', sans-serif" }}>
      {props.imageUrl && <img src={props.imageUrl} alt="" crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(10,0,20,0.82) 0%, rgba(10,0,20,0.55) 55%, rgba(10,0,20,0.15) 100%)' }} />
      <img src="/studio/logo-wordmark-white.png" alt="" style={{ position: 'absolute', left: 70, top: 56, height: 84 }} />
      <div style={{ position: 'absolute', left: 70, top: 170, width: 720, height: 250, display: 'flex', alignItems: 'center' }}>
        <div style={{ textAlign: 'left' }}>
          <BubbleHeadline text={props.title} box={{ width: 720, height: 250 }} max={150} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 70, bottom: 120 }}><OutlinePill text={props.when} size={34} /></div>
      <div style={{ position: 'absolute', left: 70, bottom: 56, color: '#FFFFFF', fontWeight: 600, fontSize: 28, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{props.footer}</div>
    </div>
  );
});
