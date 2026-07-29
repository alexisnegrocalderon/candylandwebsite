import { useId } from 'react';
import type { PartyGender } from '@shared/party';

/* Los 4 avatares por género de "Caramelo". Dibujados en SVG y no como
 * imágenes: pesan casi nada, se ven nítidos en cualquier pantalla y el
 * dueño los puede recolorear cambiando la paleta de abajo.
 *
 * Todos llevan antifaz. Es la firma visual de Candyland y, sobre todo, es
 * coherente con la promesa de la función: acá nadie muestra la cara. */

const DEEP = '#2a1526';

// Cada variante tiene un fondo claramente distinto: a 48px en una pantalla
// a oscuras, la gente distingue el color mucho antes que el peinado.
//
// En hex y no con las variables CSS de la paleta a propósito: var() no
// resuelve dentro de atributos SVG como stop-color, así que con variables
// los cuatro salían del mismo color. De paso, esto deja los avatares
// utilizables en un email, donde no hay hoja de estilos.
const PALETTES = [
  { bg: '#e35da2', mask: '#fdf4e3' }, // rosa Candyland
  { bg: '#9a86e8', mask: '#fdf4e3' }, // violeta eléctrico
  { bg: '#f0906a', mask: '#fdf4e3' }, // cereza
  { bg: '#6fb2e0', mask: '#fdf4e3' }, // azul caramelo
];

// Cuatro tonos de piel: los avatares se distinguen por algo más que el
// color de fondo, y la fiesta se parece un poco más a la fiesta.
const SKINS = ['#f2cdaa', '#d9a173', '#a86f47', '#75462c'];
const HAIR = ['#211018', '#5e3722', '#120b12', '#8a4a52'];

function clampIndex(avatarId: number) {
  return Math.min(3, Math.max(0, avatarId - 1));
}

/** Antifaz con los ojos calados de verdad (fillRule evenodd): por los
 * huecos se ve la piel, que es lo que lo hace leer como máscara y no como
 * una venda. */
function Mask({ fill, cx = 50, cy = 40, s = 1 }: { fill: string; cx?: number; cy?: number; s?: number }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s})`}>
      <path
        fillRule="evenodd"
        fill={fill}
        d="
          M-16 -3 q0 -6 6 -7 q10 -1.5 20 0 q6 1 6 7 q0 7 -6 9 q-5 1.5 -8 -1.5
          q-1.5 -1.5 -2 -3.5 q-0.5 2 -2 3.5 q-3 3 -8 1.5 q-6 -2 -6 -9 z
          M-12 -1 a4.5 3.5 0 1 0 9 0 a4.5 3.5 0 1 0 -9 0 z
          M3 -1 a4.5 3.5 0 1 0 9 0 a4.5 3.5 0 1 0 -9 0 z
        "
      />
      <circle cx="-7.5" cy="-1" r="2" fill={DEEP} />
      <circle cx="7.5" cy="-1" r="2" fill={DEEP} />
    </g>
  );
}

/** Una boca chica: sin ella la cara queda incompleta y el avatar se lee
 * como un objeto en vez de como una persona. */
function Mouth({ cx = 50, cy = 53, s = 1 }: { cx?: number; cy?: number; s?: number }) {
  return (
    <path
      d="M-4 0 q4 4 8 0"
      transform={`translate(${cx} ${cy}) scale(${s})`}
      fill="none"
      stroke={DEEP}
      strokeWidth="1.8"
      strokeLinecap="round"
      opacity="0.6"
    />
  );
}

function Bust({ hair }: { hair: string }) {
  return <path d="M50 66 q-26 3 -30 34 h60 q-4 -31 -30 -34 z" fill={hair} opacity="0.55" />;
}

function Hombre({ i, skin, hair, mask }: { i: number; skin: string; hair: string; mask: string }) {
  return (
    <>
      {/* Pelo de atrás / volumen, distinto en cada variante. */}
      {i === 1 && <ellipse cx="50" cy="30" rx="21" ry="15" fill={hair} />}
      {i === 2 && <circle cx="50" cy="17" r="7" fill={hair} />}
      {i === 3 && <ellipse cx="50" cy="26" rx="23" ry="17" fill={hair} />}

      <Bust hair={hair} />
      <ellipse cx="50" cy="42" rx="18" ry="20" fill={skin} />

      {/* Pelo de adelante. */}
      {i === 0 && <path d="M32 34 q3 -16 18 -16 q15 0 18 16 q-6 -7 -18 -7 q-12 0 -18 7 z" fill={hair} />}
      {i === 1 && <path d="M32 33 q4 -18 18 -18 q14 0 18 18 q-7 -9 -18 -9 q-11 0 -18 9 z" fill={hair} />}
      {i === 2 && <path d="M32 32 q5 -14 18 -14 q13 0 18 14 q-7 -6 -18 -6 q-11 0 -18 6 z" fill={hair} />}
      {i === 3 && <path d="M31 34 q2 -19 19 -19 q17 0 19 19 q-8 -10 -19 -10 q-11 0 -19 10 z" fill={hair} />}

      <Mask fill={mask} />
      <Mouth />
    </>
  );
}

function Mujer({ i, skin, hair, mask }: { i: number; skin: string; hair: string; mask: string }) {
  return (
    <>
      {/* Melena: la silueta de atrás es lo que más distingue una de otra. */}
      {i === 0 && <path d="M26 88 q-6 -58 24 -58 q30 0 24 58 q-9 -16 -24 -16 q-15 0 -24 16 z" fill={hair} />}
      {i === 1 && <path d="M29 58 q-3 -30 21 -30 q24 0 21 30 q-8 -9 -21 -9 q-13 0 -21 9 z" fill={hair} />}
      {i === 2 && (
        <>
          <ellipse cx="50" cy="20" rx="11" ry="9" fill={hair} />
          <path d="M31 46 q-2 -28 19 -28 q21 0 19 28 q-8 -12 -19 -12 q-11 0 -19 12 z" fill={hair} />
        </>
      )}
      {i === 3 && <ellipse cx="50" cy="38" rx="27" ry="26" fill={hair} />}

      <Bust hair={hair} />
      <ellipse cx="50" cy="42" rx="17" ry="19" fill={skin} />

      {/* Pelo de adelante. */}
      {i === 0 && <path d="M33 33 q4 -15 17 -15 q13 0 17 15 q-7 -7 -17 -7 q-10 0 -17 7 z" fill={hair} />}
      {i === 1 && <path d="M33 34 q1 -17 17 -17 q16 0 17 17 q-5 -10 -17 -10 q-12 0 -17 10 z" fill={hair} />}
      {i === 2 && <path d="M33 32 q6 -13 17 -13 q11 0 17 13 q-7 -6 -17 -6 q-10 0 -17 6 z" fill={hair} />}
      {i === 3 && <path d="M33 33 q5 -14 17 -14 q12 0 17 14 q-7 -7 -17 -7 q-10 0 -17 7 z" fill={hair} />}

      {/* Un detalle de color que la diferencia del resto. */}
      {i === 1 && <circle cx="69" cy="34" r="4.5" fill="#fdf4e3" />}

      <Mask fill={mask} />
      <Mouth />
    </>
  );
}

function Pareja({ i, skin, hair, mask }: { i: number; skin: string; hair: string; mask: string }) {
  const skin2 = SKINS[(i + 2) % SKINS.length];
  const hair2 = HAIR[(i + 1) % HAIR.length];

  return (
    <>
      {/* Dos siluetas juntas: se lee "pareja" de un vistazo, aunque el
          avatar se vea a 48px en la mansión. */}
      <path d="M70 60 q-19 2 -22 40 h44 q-3 -38 -22 -40 z" fill={hair2} opacity="0.5" />
      {i % 2 === 0
        ? <path d="M55 52 q-3 -26 15 -26 q18 0 15 26 q-7 -10 -15 -10 q-8 0 -15 10 z" fill={hair2} />
        : <ellipse cx="70" cy="38" rx="17" ry="14" fill={hair2} />}
      <ellipse cx="70" cy="44" rx="14" ry="15" fill={skin2} />
      <path d="M56 38 q4 -12 14 -12 q10 0 14 12 q-6 -6 -14 -6 q-8 0 -14 6 z" fill={hair2} />
      <Mask fill={mask} cx={70} cy={43} s={0.62} />
      <Mouth cx={70} cy={51} s={0.62} />

      <path d="M34 62 q-21 2 -24 39 h48 q-3 -37 -24 -39 z" fill={hair} opacity="0.55" />
      {i < 2
        ? <path d="M18 50 q-3 -26 16 -26 q19 0 16 26 q-7 -10 -16 -10 q-9 0 -16 10 z" fill={hair} />
        : <ellipse cx="34" cy="42" rx="20" ry="18" fill={hair} />}
      <ellipse cx="34" cy="46" rx="15" ry="16" fill={skin} />
      <path d="M19 40 q4 -13 15 -13 q11 0 15 13 q-7 -6 -15 -6 q-8 0 -15 6 z" fill={hair} />
      <Mask fill={mask} cx={34} cy={45} s={0.66} />
      <Mouth cx={34} cy={54} s={0.66} />
    </>
  );
}

export function PartyAvatar({ gender, avatarId, className = '' }: {
  gender: PartyGender;
  avatarId: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const i = clampIndex(avatarId);
  const palette = PALETTES[i];
  const skin = SKINS[i];
  const hair = HAIR[i];

  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={`Avatar ${gender}`}>
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={palette.bg} />
          <stop offset="58%" stopColor={palette.bg} />
          <stop offset="100%" stopColor={DEEP} />
        </linearGradient>
        <clipPath id={`clip${uid}`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip${uid})`}>
        <circle cx="50" cy="50" r="50" fill={`url(#bg${uid})`} />
        {gender === 'hombre' && <Hombre i={i} skin={skin} hair={hair} mask={palette.mask} />}
        {gender === 'mujer' && <Mujer i={i} skin={skin} hair={hair} mask={palette.mask} />}
        {gender === 'pareja' && <Pareja i={i} skin={skin} hair={hair} mask={palette.mask} />}
      </g>
    </svg>
  );
}
