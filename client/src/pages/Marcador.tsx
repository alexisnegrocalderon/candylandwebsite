import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { PLAY_TEAM_META, leader, scoreShare, type PlayTeam } from '@shared/playTeams';

/* /marcador: el marcador de PLAYMORE · Player 1 vs Player 2, para la pantalla grande de la fiesta (y para mirarlo desde
 * el celular). Se actualiza solo cada 4 segundos. Sin menú ni nada del sitio: pantalla completa, estilo arcade. */

const DISPLAY = "'Syne', 'Space Grotesk', sans-serif";

function useCount(target: number) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 700);
      setValue(Math.round(start + (target - start) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

function TeamColumn({ team, points, winning }: { team: PlayTeam; points: number; winning: boolean }) {
  const meta = PLAY_TEAM_META[team];
  const shown = useCount(points);
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-2 text-center">
      <p className="text-[clamp(11px,2.2vw,22px)] font-bold uppercase tracking-[0.3em]" style={{ color: meta.hex }}>{meta.player} · {meta.world}</p>
      <p className="mt-1 text-[clamp(18px,4.2vw,64px)] font-black uppercase leading-none" style={{ fontFamily: DISPLAY, color: '#fff', textShadow: `0 0 22px ${meta.hex}, 0 0 60px ${meta.hex}88` }}>{meta.label}</p>
      <p
        className="mt-3 font-black leading-none tabular-nums"
        style={{ fontFamily: DISPLAY, fontSize: 'clamp(40px, 10vw, 200px)', color: meta.hex, textShadow: `0 0 30px ${meta.hex}, 0 0 90px ${meta.hex}99`, transform: winning ? 'scale(1.06)' : 'none', transition: 'transform .4s' }}
      >
        {shown}
      </p>
    </div>
  );
}

export default function Marcador() {
  useSeo({ title: 'Marcador PLAYMORE · Player 1 vs Player 2', description: 'El marcador en vivo de PLAYMORE.', path: '/marcador', noindex: true } as any);
  const { data } = trpc.playGame.score.useQuery(undefined, { refetchInterval: 4000, retry: false });
  useEffect(() => { document.documentElement.style.background = '#07020F'; return () => { document.documentElement.style.background = ''; }; }, []);

  const score = data && data.ready ? data.score : { magenta: 0, azul: 0 };
  const share = scoreShare(score);
  const lead = leader(score);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden text-white" style={{ background: 'radial-gradient(120% 70% at 50% 100%, #3a0a45 0%, #12041F 55%, #07020F 100%)' }}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] opacity-60" style={{ backgroundImage: 'linear-gradient(#FF2BD6AA 3px, transparent 3px), linear-gradient(90deg, #29B6FF88 3px, transparent 3px)', backgroundSize: '120px 90px', transform: 'perspective(700px) rotateX(62deg)', transformOrigin: '50% 100%' }} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 2px, transparent 2px 6px)' }} />

      <header className="relative z-10 px-6 pt-[max(1.25rem,env(safe-area-inset-top))] text-center">
        <p className="text-[clamp(11px,1.8vw,20px)] font-bold uppercase tracking-[0.4em] text-[#FFC93C]">{data && data.ready ? data.eventTitle : 'PLAYMORE'} · Playroom × Dalmore</p>
        <h1 className="mt-1 whitespace-nowrap text-[clamp(15px,4vw,56px)] font-black uppercase" style={{ fontFamily: DISPLAY, textShadow: '0 0 24px #29B6FF99' }}>Player 1 <span className="text-[#FFC93C]">vs</span> Player 2</h1>
      </header>

      <main className="relative z-10 flex flex-1 items-center">
        <TeamColumn team="magenta" points={score.magenta} winning={lead === 'magenta'} />
        <div className="self-stretch w-px bg-white/15" />
        <TeamColumn team="azul" points={score.azul} winning={lead === 'azul'} />
      </main>

      <div className="relative z-10 px-6 pb-3">
        <div className="mx-auto flex h-[clamp(18px,3.4vw,40px)] w-full max-w-5xl overflow-hidden rounded-full border border-white/25">
          <div style={{ width: `${share.magenta}%`, background: PLAY_TEAM_META.magenta.hex, boxShadow: `0 0 24px ${PLAY_TEAM_META.magenta.hex}`, transition: 'width .8s cubic-bezier(.16,1,.3,1)' }} />
          <div style={{ width: `${share.azul}%`, background: PLAY_TEAM_META.azul.hex, boxShadow: `0 0 24px ${PLAY_TEAM_META.azul.hex}`, transition: 'width .8s cubic-bezier(.16,1,.3,1)' }} />
        </div>
        <p className="mt-2 text-center text-[clamp(12px,2vw,24px)] font-bold uppercase tracking-[0.2em] text-white/80">
          {lead === 'empate' ? 'Empate' : `Va ganando ${PLAY_TEAM_META[lead].label}`}
        </p>
      </div>

      <footer className="relative z-10 min-h-[3.5rem] px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ul className="mx-auto flex max-w-5xl flex-wrap justify-center gap-2">
          {(data && data.ready ? data.recent : []).slice(0, 5).map((r, i) => (
            <li key={`${r.at}-${i}`} className="rounded-full border px-3 py-1 text-[clamp(11px,1.5vw,16px)] font-semibold" style={{ borderColor: PLAY_TEAM_META[r.team].hex, color: PLAY_TEAM_META[r.team].hex }}>
              {r.points > 0 ? '+' : ''}{r.points} {PLAY_TEAM_META[r.team].label}{r.label ? ` · ${r.label}` : ''}
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
}
