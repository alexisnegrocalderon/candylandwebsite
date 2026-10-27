import type React from 'react';
import { useId } from 'react';
import type { Capa } from '@shared/dosierFicha';

/** El vaso de la casa dibujado con las capas de cada ingrediente a escala (igual que en el PDF del dosier). */
export function VasoSvg({ kind, capacity, capas, hielo, borde, className }: {
  kind: string;
  capacity: number;
  capas: Capa[];
  hielo: 'cubos' | 'frappe' | null;
  borde: string | null;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const copa = kind === 'copa' || kind === 'copa_xl';
  const shot = kind === 'shot';
  // Área interior donde se llenan las capas.
  const top = copa ? 10 : shot ? 62 : 24;
  const bottom = copa ? (kind === 'copa_xl' ? 108 : 100) : shot ? 150 : 166;
  const cx = 60;
  const topW = copa ? (kind === 'copa_xl' ? 100 : 88) : shot ? 46 : 74;
  const botW = copa ? 8 : shot ? 36 : 56;

  const shape = copa
    ? `M${cx - topW / 2},${top} L${cx + topW / 2},${top} C${cx + topW / 2},${bottom * 0.75} ${cx + 20},${bottom} ${cx},${bottom} C${cx - 20},${bottom} ${cx - topW / 2},${bottom * 0.75} ${cx - topW / 2},${top} Z`
    : `M${cx - topW / 2},${top} L${cx + topW / 2},${top} L${cx + botW / 2},${bottom} L${cx - botW / 2},${bottom} Z`;

  const inner = bottom - top;
  let y = bottom;
  const rects = capas.map((c, i) => {
    const h = Math.max(1.5, (c.ml / Math.max(1, capacity)) * inner);
    y -= h;
    return <rect key={i} x={cx - topW / 2 - 2} y={y} width={topW + 4} height={h + 0.6} fill={c.color} stroke="#fff" strokeOpacity={0.6} strokeWidth={0.4} />;
  });
  const hasLiquid = capas.length > 0;
  const iceTop = top + inner * 0.08;
  const cubes: React.ReactElement[] = [];
  if (hielo && hasLiquid && !shot) {
    if (hielo === 'cubos') {
      const s = topW / 4.2;
      for (let r = 0, yy = iceTop; yy < bottom - s * 0.6; yy += s * 0.92, r++) {
        for (let xx = cx - topW / 2 + (r % 2 ? s * 0.5 : 0); xx < cx + topW / 2; xx += s * 1.05) {
          cubes.push(<rect key={`${r}-${xx}`} x={xx} y={yy} width={s * 0.86} height={s * 0.86} rx={2} fill="#fff" fillOpacity={0.55} transform={`rotate(${r % 2 ? 8 : -6} ${xx + s / 2} ${yy + s / 2})`} />);
        }
      }
    } else {
      for (let r = 0, yy = iceTop; yy < bottom - 4; yy += 5, r++) {
        for (let xx = cx - topW / 2 + (r % 2) * 2.5; xx < cx + topW / 2; xx += 5) cubes.push(<circle key={`${r}-${xx}`} cx={xx} cy={yy} r={1.4} fill="#fff" fillOpacity={0.75} />);
      }
    }
  }
  const rimColor = borde ? (/taj/i.test(borde) ? '#D9481E' : '#F1F1F1') : null;

  return (
    <svg viewBox="0 0 120 180" className={className} role="img" aria-label={`Vaso ${kind}`}>
      <defs><clipPath id={`c${id}`}><path d={shape} /></clipPath></defs>
      <path d={shape} fill="#F3EFF6" />
      <g clipPath={`url(#c${id})`}>{rects}{cubes}</g>
      <path d={shape} fill="none" stroke="#9C90A6" strokeWidth={1.4} />
      {copa && (
        <>
          <line x1={cx} y1={bottom} x2={cx} y2={168} stroke="#9C90A6" strokeWidth={2} />
          <ellipse cx={cx} cy={170} rx={26} ry={4} fill="#F3EFF6" stroke="#9C90A6" />
          {kind === 'copa_xl' && <text x={cx} y={top + inner * 0.72} textAnchor="middle" fontSize={11} fontWeight={800} fill="#E8399A">XL</text>}
        </>
      )}
      {!copa && !shot && <text x={cx} y={bottom - 28} textAnchor="middle" fontSize={7} fontWeight={800} fill="#E8399A" letterSpacing={0.6}>PLAYROOM</text>}
      {rimColor && <rect x={cx - topW / 2 - 1} y={top - 1} width={topW + 2} height={5} fill={rimColor} />}
      {!copa && !shot && (
        <>
          <rect x={cx - topW / 2 - 3} y={top - 8} width={topW + 6} height={8} rx={2} fill="#fff" stroke="#9C90A6" />
          <line x1={cx + 8} y1={top - 8} x2={cx + 18} y2={top - 22} stroke="#E9E2EE" strokeWidth={3} strokeLinecap="round" />
        </>
      )}
      {copa && <line x1={cx + 12} y1={top + 28} x2={cx + 26} y2={top - 6} stroke="#E9E2EE" strokeWidth={2.5} strokeLinecap="round" />}
    </svg>
  );
}
