import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatCLP } from '@/config/candyland';

/* Los estilos van como <style> embebido (no un `import './WalletCard.css'`)
 * a propósito: este componente también se pre-renderiza en el build
 * (scripts/generate-static-pages.ts -- la página del blog que explica la
 * tarjeta), que corre con `tsx` puro sin Vite -- un import de .css ahí
 * revienta con "Unknown file extension .css" (Node no sabe procesar CSS,
 * a diferencia del navegador/Vite). Un string plano funciona en los dos
 * mundos sin depender de ningún loader especial. */
const WALLET_CARD_CSS = `
.wcard-scene {
  --wcard-ink: #0d0712;
  --wcard-panel: #1c0f26;
  --wcard-magenta: #ff3f8e;
  --wcard-violet: #8c7bff;
  --wcard-gold: #f0c674;
  --wcard-paper: #fbeee0;
  --wcard-muted: #b79fc0;
  --wcard-muted-2: #8a7495;
  --wcard-line: rgba(251, 238, 224, 0.14);
  --wcard-mono: ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace;

  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  aspect-ratio: 1.586;
  perspective: 1600px;
}
.wcard-flip {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.7s cubic-bezier(.2, .7, .2, 1);
  cursor: pointer;
}
.wcard-scene.is-flipped .wcard-flip { transform: rotateY(180deg); }
@media (prefers-reduced-motion: reduce) {
  .wcard-flip { transition: none; }
}

.wcard-face {
  position: absolute;
  inset: 0;
  border-radius: 22px;
  backface-visibility: hidden;
  overflow: hidden;
  display: grid;
  padding: 20px 22px;
  color: var(--wcard-paper);
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(140, 123, 255, 0.32), transparent 55%),
    radial-gradient(110% 130% at 0% 100%, rgba(255, 63, 142, 0.28), transparent 55%),
    linear-gradient(155deg, rgba(36, 20, 50, 0.58), rgba(13, 7, 18, 0.5) 75%);
  backdrop-filter: blur(22px) saturate(165%);
  -webkit-backdrop-filter: blur(22px) saturate(165%);
  box-shadow:
    0 2px 0 rgba(255, 255, 255, 0.06) inset,
    0 30px 60px -20px rgba(10, 2, 12, 0.85),
    0 8px 24px -8px rgba(255, 63, 142, 0.25);
}
.wcard-face.is-back { transform: rotateY(180deg); grid-template-rows: auto auto auto 1fr auto; row-gap: 10px; padding: 20px 22px 18px; }
.wcard-face.is-front { grid-template-rows: auto 1fr auto; row-gap: 14px; }

.wcard-face::before {
  content: "";
  position: absolute;
  inset: 0;
  padding: 1.5px;
  border-radius: inherit;
  background: conic-gradient(from var(--wcard-rim-angle, 0deg), var(--wcard-gold), var(--wcard-magenta), var(--wcard-violet), var(--wcard-gold));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: wcard-spin-rim 9s linear infinite;
  opacity: 0.9;
}
@keyframes wcard-spin-rim { to { --wcard-rim-angle: 360deg; } }
@property --wcard-rim-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@media (prefers-reduced-motion: reduce) {
  .wcard-face::before { animation: none; }
}

.wcard-face::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg,
    rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.06) 16%,
    transparent 34%, transparent 70%,
    rgba(255, 255, 255, 0.1) 88%, rgba(255, 255, 255, 0.22) 100%);
  mix-blend-mode: screen;
  pointer-events: none;
}

.wcard-brand-row { display: flex; align-items: center; justify-content: space-between; z-index: 1; position: relative; }
.wcard-wordmark { display: flex; align-items: center; gap: 9px; font-family: var(--font-heading, 'Syne', sans-serif); font-weight: 800; font-size: 15.5px; letter-spacing: 0.03em; }
.wcard-badge { width: 30px; height: 30px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; background: rgba(251, 238, 224, 0.14); border: 1px solid rgba(251, 238, 224, 0.35); box-shadow: 0 3px 10px -2px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06) inset; }
.wcard-badge img { width: 20px; height: 20px; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4)); }
.wcard-face.is-back .wcard-badge { width: 24px; height: 24px; }
.wcard-face.is-back .wcard-badge img { width: 16px; height: 16px; }

.wcard-tier { font-family: var(--wcard-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--wcard-ink); background: linear-gradient(100deg, var(--wcard-gold), #fbe3a8); padding: 4px 9px; border-radius: 999px; font-weight: 600; }

.wcard-mid { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 0; z-index: 1; position: relative; }
.wcard-qr { background: var(--wcard-paper); padding: 7px; border-radius: 12px; width: 92px; height: 92px; flex: none; box-shadow: 0 6px 18px -6px rgba(0, 0, 0, 0.6); }
.wcard-qr img { width: 100%; height: 100%; display: block; border-radius: 6px; object-fit: contain; }
.wcard-qr-fallback {
  width: 100%; height: 100%; border-radius: 6px;
  background-image: radial-gradient(var(--wcard-ink) 1.6px, transparent 1.6px);
  background-size: 8px 8px;
  background-color: var(--wcard-paper);
  opacity: 0.55;
}

.wcard-holder { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.wcard-holder-label { font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--wcard-muted-2); margin: 0 0 4px; }
.wcard-holder-name { font-family: var(--font-heading, 'Syne', sans-serif); font-weight: 700; font-size: 17px; margin: 0 0 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.wcard-stat-row { display: flex; gap: 14px; }
.wcard-stat { display: flex; flex-direction: column; gap: 2px; }
.wcard-stat-label { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--wcard-muted-2); }
.wcard-stat-value { font-family: var(--wcard-mono); font-variant-numeric: tabular-nums; font-size: 14.5px; font-weight: 600; }
.wcard-stat-value.is-money { color: var(--wcard-gold); }
.wcard-stat-value.is-points { color: var(--wcard-violet); }

.wcard-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 12px; border-top: 1px solid var(--wcard-line); z-index: 1; position: relative; }
.wcard-number { font-family: var(--wcard-mono); font-size: 12px; letter-spacing: 0.06em; color: var(--wcard-muted); min-width: 0; flex: 1 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wcard-event-tag { font-family: var(--wcard-mono); font-size: 10px; letter-spacing: 0.06em; background: rgba(255, 63, 142, 0.18); border: 1px solid rgba(255, 63, 142, 0.4); padding: 4px 8px; border-radius: 7px; white-space: nowrap; flex: none; }

.wcard-back-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; z-index: 1; position: relative; }
.wcard-back-head .wcard-number { flex: none; font-size: 11px; }
.wcard-barcode { height: 34px; border-radius: 6px; background: repeating-linear-gradient(90deg, var(--wcard-paper) 0 2px, transparent 2px 4px, var(--wcard-paper) 4px 6px, transparent 6px 9px, var(--wcard-paper) 9px 10px, transparent 10px 13px); opacity: 0.92; z-index: 1; position: relative; }

.wcard-movs { flex: 1; display: flex; flex-direction: column; gap: 6px; justify-content: center; z-index: 1; position: relative; }
.wcard-mov { display: flex; justify-content: space-between; gap: 10px; font-size: 11.5px; color: var(--wcard-muted); }
.wcard-mov b { color: var(--wcard-paper); font-weight: 500; }
.wcard-mov .wcard-amt { font-family: var(--wcard-mono); font-variant-numeric: tabular-nums; flex: none; }
.wcard-mov .wcard-amt.is-neg { color: var(--wcard-magenta); }
.wcard-mov .wcard-amt.is-pos { color: var(--wcard-gold); }
.wcard-mov .wcard-amt.is-points { color: var(--wcard-violet); }
.wcard-movs-empty { font-size: 11.5px; color: var(--wcard-muted-2); text-align: center; }

.wcard-flip-hint { font-family: var(--wcard-mono, ui-monospace, monospace); font-size: 11.5px; letter-spacing: 0.06em; color: var(--wcard-muted-2, #8a7495); display: flex; align-items: center; gap: 7px; background: rgba(36, 20, 50, 0.4); backdrop-filter: blur(10px) saturate(150%); -webkit-backdrop-filter: blur(10px) saturate(150%); border: 1px solid var(--wcard-line, rgba(251, 238, 224, 0.14)); padding: 8px 14px; border-radius: 999px; cursor: pointer; margin: 18px auto 0; color-scheme: dark; }
.wcard-flip-hint:hover { border-color: rgba(240, 198, 116, 0.5); color: var(--wcard-gold, #f0c674); }
.wcard-flip-hint:focus-visible { outline: 2px solid var(--wcard-gold, #f0c674); outline-offset: 2px; }
`;

/** Máscara tipo tarjeta de crédito para el código completo: mantiene el
 * prefijo real (ej. "MP") y los últimos 4 caracteres, oculta el resto --
 * el código completo de verdad solo se ve en el reverso de la tarjeta. */
function maskTicketCode(code: string): string {
  const parts = code.split('-');
  const prefix = parts[0] || code.slice(0, 2);
  const tail = code.slice(-4).toUpperCase();
  return `${prefix} •••• •••• ${tail}`;
}

export type WalletMovement = { type: 'money' | 'points'; label: string; delta: number; createdAt?: string | Date };

/** La tarjeta digital en sí (frente + reverso, con flip) -- diseño aprobado
 * por el dueño (glassmorphism/liquid-glass real vía backdrop-filter,
 * borde holográfico, isotipo de la marca). Componente compartido: la usa
 * tanto /verificar/:ticketCode (con datos reales) como la página del blog
 * que explica la tarjeta (con datos de ejemplo, `qrImageUrl={null}`). */
export function WalletCard({
  eventTitle, eventDateShort, holderName, ticketCode, qrImageUrl,
  prepaidBalance, playcoins, movements,
}: {
  eventTitle: string;
  eventDateShort: string;
  holderName: string;
  ticketCode: string;
  qrImageUrl: string | null;
  prepaidBalance: number;
  playcoins: number;
  movements: WalletMovement[];
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <>
      <style>{WALLET_CARD_CSS}</style>
      <div className={`wcard-scene ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
        <div className="wcard-flip">
          <div className="wcard-face is-front">
            <div className="wcard-brand-row">
              <div className="wcard-wordmark">
                <span className="wcard-badge"><img src="/candyland/logo-isotipo-transparent.png" alt="" /></span>
                PLAYROOM
              </div>
              <span className="wcard-tier">Miembro</span>
            </div>

            <div className="wcard-mid">
              <div className="wcard-qr">
                {qrImageUrl ? <img src={qrImageUrl} alt="Código QR de tu entrada" /> : <div className="wcard-qr-fallback" />}
              </div>
              <div className="wcard-holder">
                <p className="wcard-holder-label">Titular</p>
                <p className="wcard-holder-name">{holderName}</p>
                <div className="wcard-stat-row">
                  <div className="wcard-stat">
                    <span className="wcard-stat-label">Saldo</span>
                    <span className="wcard-stat-value is-money">{formatCLP(prepaidBalance)}</span>
                  </div>
                  <div className="wcard-stat">
                    <span className="wcard-stat-label">Playcoins</span>
                    <span className="wcard-stat-value is-points">{playcoins.toLocaleString('es-CL')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="wcard-foot">
              <span className="wcard-number">{maskTicketCode(ticketCode)}</span>
              {eventTitle && <span className="wcard-event-tag">{eventTitle}{eventDateShort ? ` · ${eventDateShort}` : ''}</span>}
            </div>
          </div>

          <div className="wcard-face is-back">
            <div className="wcard-back-head">
              <div className="wcard-wordmark" style={{ fontSize: 13 }}>
                <span className="wcard-badge"><img src="/candyland/logo-isotipo-transparent.png" alt="" /></span>
                PLAYROOM
              </div>
            </div>

            <div className="wcard-barcode" />
            <p className="wcard-number" style={{ textAlign: 'center', fontSize: 11 }}>{ticketCode}</p>

            <div className="wcard-movs">
              {movements.length === 0 && <p className="wcard-movs-empty">Todavía no hay movimientos en tu tarjeta</p>}
              {movements.map((m, i) => {
                const isMoney = m.type === 'money';
                const sign = m.delta >= 0 ? '+' : '−';
                const amountText = isMoney ? `${sign}${formatCLP(Math.abs(m.delta))}` : `${sign}${Math.abs(m.delta)}`;
                return (
                  <div className="wcard-mov" key={i}>
                    <span><b>{m.label}</b></span>
                    <span className={`wcard-amt ${isMoney ? (m.delta >= 0 ? 'is-pos' : 'is-neg') : 'is-points'}`}>{amountText}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <button type="button" className="wcard-flip-hint" onClick={() => setFlipped((f) => !f)}>
        <RefreshCw className="w-3.5 h-3.5" />
        {flipped ? 'Ver el frente' : 'Ver el reverso'}
      </button>
    </>
  );
}
