import { useEffect, useId, useRef, useState } from 'react';
import type { PartyGender } from '@shared/party';

/* La «ficha PlayRoom» de cada perfil (cuando no hay foto): un círculo de vidrio oscuro con aura neón, las orejas de
 * conejo del logo arriba y el símbolo de quien es — ♀ rosa, ♂ azul, el símbolo no binario violeta; una pareja lleva
 * los dos símbolos entrelazados, como el logo. `avatarId` elige el color del aura. En Halloween (.pm-halloween) se
 * pinta naranja y morado.
 *
 * Colores en hex y no con variables CSS: var() no resuelve dentro de atributos SVG como stop-color. */

const AURAS = ['#ec4899', '#a855f7', '#3b82f6', '#22d3ee', '#d946ef', '#fb7185'];
const HALLOWEEN_AURAS = ['#ff7a1a', '#7c3aed', '#ff7a1a', '#7c3aed', '#ff7a1a', '#7c3aed'];
const PINK = '#ff4fa8';
const BLUE = '#2f8bff';
const VIOLET = '#b07cff';
const SKY = '#5fd4ff';
const ORANGE = '#ff8a2a';
const PURPLE = '#9b5cff';

type Sym = { kind: 'f' | 'm' | 'nb'; x: number; y: number; r: number; color: string };

/** Un símbolo en trazo grueso y redondeado (se lee bien a 32 px). */
function Symbol({ kind, x, y, r, color }: Sym) {
  const w = r * 0.42;
  const common = { stroke: color, strokeWidth: w, strokeLinecap: 'round' as const, fill: 'none' };
  if (kind === 'f') {
    const y1 = y + r, y2 = y + r * 2.1, cross = y + r * 1.6;
    return (
      <g {...common}>
        <circle cx={x} cy={y} r={r} />
        <line x1={x} y1={y1} x2={x} y2={y2} />
        <line x1={x - r * 0.55} y1={cross} x2={x + r * 0.55} y2={cross} />
      </g>
    );
  }
  if (kind === 'm') {
    const d = r / Math.SQRT2;
    const sx = x + d, sy = y - d, ex = x + d + r * 0.95, ey = y - d - r * 0.95;
    return (
      <g {...common} strokeLinejoin="round">
        <circle cx={x} cy={y} r={r} />
        <line x1={sx} y1={sy} x2={ex} y2={ey} />
        <polyline points={`${ex - r * 0.7},${ey} ${ex},${ey} ${ex},${ey + r * 0.7}`} />
      </g>
    );
  }
  // No binario: círculo con un trazo hacia arriba y un asterisco en la punta.
  const top = y - r * 2.05;
  const a = r * 0.5;
  return (
    <g {...common}>
      <circle cx={x} cy={y + r * 0.35} r={r} />
      <line x1={x} y1={y - r * 0.65} x2={x} y2={top} />
      <line x1={x - a} y1={top - a * 0.6} x2={x + a} y2={top + a * 0.6} />
      <line x1={x + a} y1={top - a * 0.6} x2={x - a} y2={top + a * 0.6} />
    </g>
  );
}

function symbolsFor(gender: PartyGender, pairType: string | null | undefined, halloween: boolean): Sym[] {
  const f1 = halloween ? ORANGE : PINK;
  const m1 = halloween ? PURPLE : BLUE;
  if (gender === 'mujer') return [{ kind: 'f', x: 50, y: 54, r: 14, color: f1 }];
  if (gender === 'hombre') return [{ kind: 'm', x: 45, y: 63, r: 14, color: m1 }];
  if (gender === 'no_binario') return [{ kind: 'nb', x: 50, y: 64, r: 12, color: halloween ? ORANGE : VIOLET }];
  // Pareja: entrelazados como el logo.
  if (pairType === 'chicas') return [{ kind: 'f', x: 39, y: 54, r: 11.5, color: f1 }, { kind: 'f', x: 61, y: 54, r: 11.5, color: halloween ? PURPLE : VIOLET }];
  if (pairType === 'chicos') return [{ kind: 'm', x: 30, y: 66, r: 10.5, color: m1 }, { kind: 'm', x: 55, y: 68, r: 10.5, color: halloween ? ORANGE : SKY }];
  return [{ kind: 'f', x: 39, y: 54, r: 11.5, color: f1 }, { kind: 'm', x: 58, y: 60, r: 11.5, color: m1 }];
}

/** ¿Está dentro del tema Halloween? Se mira una vez montado (la clase la pone la pantalla de la fiesta). */
function useHalloween(ref: React.RefObject<SVGSVGElement | null>) {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(!!ref.current?.closest('.pm-halloween')); }, [ref]);
  return on;
}

export function PartyAvatar({ gender, avatarId, pairType, className = '' }: {
  gender: PartyGender;
  avatarId: number;
  pairType?: string | null;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const ref = useRef<SVGSVGElement>(null);
  const halloween = useHalloween(ref);
  const idx = Math.min(AURAS.length - 1, Math.max(0, (avatarId || 1) - 1));
  const aura = (halloween ? HALLOWEEN_AURAS : AURAS)[idx];
  const earOuter = halloween ? ORANGE : PINK;
  const earInner = halloween ? PURPLE : BLUE;

  return (
    <svg ref={ref} viewBox="0 0 100 100" className={className} role="img" aria-label="Ficha PlayRoom">
      <defs>
        <radialGradient id={`aura${uid}`} cx="50%" cy="78%" r="75%">
          <stop offset="0%" stopColor={aura} stopOpacity="0.75" />
          <stop offset="55%" stopColor={aura} stopOpacity="0.18" />
          <stop offset="100%" stopColor="#120a1c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`ring${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={earOuter} />
          <stop offset="100%" stopColor={aura} />
        </linearGradient>
        <clipPath id={`clip${uid}`}><circle cx="50" cy="50" r="48" /></clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill="#120a1c" />
      <g clipPath={`url(#clip${uid})`}>
        <circle cx="50" cy="50" r="48" fill={`url(#aura${uid})`} />
        {/* Orejas de conejo del logo: rosa por fuera, azul por dentro. */}
        <g>
          <ellipse cx="39" cy="17" rx="6" ry="13" transform="rotate(-20 39 17)" fill={earOuter} />
          <ellipse cx="39.5" cy="18.2" rx="2.9" ry="8.5" transform="rotate(-20 39.5 18.2)" fill={earInner} />
          <ellipse cx="61" cy="17" rx="6" ry="13" transform="rotate(20 61 17)" fill={earOuter} />
          <ellipse cx="60.5" cy="18.2" rx="2.9" ry="8.5" transform="rotate(20 60.5 18.2)" fill={earInner} />
        </g>
        {symbolsFor(gender, pairType, halloween).map((s, i) => <Symbol key={i} {...s} />)}
        {/* Brillo de vidrio. */}
        <ellipse cx="50" cy="12" rx="34" ry="10" fill="#ffffff" opacity="0.06" />
      </g>
      <circle cx="50" cy="50" r="47" fill="none" stroke={`url(#ring${uid})`} strokeWidth="2.5" opacity="0.9" />
    </svg>
  );
}
