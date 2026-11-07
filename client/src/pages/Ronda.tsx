import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, Shuffle } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';
import { PLAY_TEAMS, PLAY_TEAM_META, otherTeam, type PlayTeam } from '@shared/playTeams';
import { LIVE_GAMES, MAX_PER_TEAM, callText, cleanCount, gameByKey, isComplete, missingText, pickGame, type LiveGame, type Need } from '@shared/playRound';

/* /ronda: los juegos en vivo de PLAYMORE · Player 1 vs Player 2, para el anfitrión (en su celular o proyectado).
 * Se elige el juego y cuántas personas de cada color hacen falta («2 azules y 2 magenta»); la gente de esas pulseras va
 * llegando; el anfitrión toca cada lugar cuando alguien llega; al completarse se juega en vivo y se marca al equipo ganador,
 * que se lleva un copete. Sin puntos ni nada en el celular de los invitados. Siempre opcional y con consentimiento. */

type Phase = 'armando' | 'abierta' | 'jugando' | 'gano';
interface State {
  gameKey: string | null;
  need: Need;
  here: Need;
  phase: Phase;
  winner: PlayTeam | null;
  /** Copetes entregados hoy (por equipo ganador). */
  copetes: number;
  day: string;
}

const KEY = 'pm_ronda_v1';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const fresh = (copetes = 0): State => ({ gameKey: null, need: { magenta: 2, azul: 2 }, here: { magenta: 0, azul: 0 }, phase: 'armando', winner: null, copetes, day: today() });

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as State | null;
    if (!s || typeof s !== 'object') return fresh();
    // Otro día (otra fiesta): el contador de copetes arranca de cero.
    return s.day === today() ? { ...fresh(), ...s, need: { magenta: cleanCount(s.need?.magenta), azul: cleanCount(s.need?.azul) }, here: { magenta: cleanCount(s.here?.magenta), azul: cleanCount(s.here?.azul) } } : fresh();
  } catch { return fresh(); }
}

const DISPLAY = "'Syne', 'Space Grotesk', sans-serif";
const glow = (hex: string) => `0 0 22px ${hex}, 0 0 60px ${hex}88`;

/** Un lugar de la ronda: un círculo del color de la pulsera que se llena cuando llega la persona. */
function Slot({ team, filled, onTap }: { team: PlayTeam; filled: boolean; onTap: () => void }) {
  const hex = PLAY_TEAM_META[team].hex;
  return (
    <button
      type="button" onClick={onTap} aria-pressed={filled} aria-label={`${PLAY_TEAM_META[team].label}: ${filled ? 'llegó' : 'falta'}`}
      className="grid h-[clamp(68px,17vw,120px)] w-[clamp(68px,17vw,120px)] place-items-center rounded-full border-[5px] text-[clamp(26px,7vw,48px)] font-black transition active:scale-95"
      style={{ borderColor: hex, background: filled ? hex : 'transparent', color: filled ? '#12041F' : hex, boxShadow: filled ? glow(hex) : 'none' }}
    >
      {filled ? '✓' : '?'}
    </button>
  );
}

function Counter({ team, value, onChange }: { team: PlayTeam; value: number; onChange: (n: number) => void }) {
  const meta = PLAY_TEAM_META[team];
  return (
    <div className="flex items-center justify-between gap-3 rounded-3xl border-2 px-4 py-3" style={{ borderColor: meta.hex }}>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: meta.hex }}>{meta.player}</p>
        <p className="text-2xl font-black uppercase">{meta.label}</p>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`Menos ${meta.label}`} onClick={() => onChange(cleanCount(value - 1))} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 active:scale-95"><Minus className="h-5 w-5" /></button>
        <span className="w-10 text-center text-4xl font-black tabular-nums">{value}</span>
        <button type="button" aria-label={`Más ${meta.label}`} onClick={() => onChange(cleanCount(value + 1))} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 active:scale-95"><Plus className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

export default function Ronda() {
  useSeo({ title: 'Juegos en vivo · PLAYMORE', description: 'Juegos en vivo de PLAYMORE.', path: '/ronda', noindex: true });
  const [s, setS] = useState<State>(load);
  const [spinning, setSpinning] = useState<LiveGame | null>(null);
  const spinTimer = useRef<number | null>(null);
  const game = gameByKey(s.gameKey);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sin storage */ } }, [s]);
  useEffect(() => { document.documentElement.style.background = '#07020F'; return () => { document.documentElement.style.background = ''; }; }, []);
  // La pantalla no se apaga mientras el anfitrión está en la ronda.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as any).wakeLock?.request('screen').then((l: any) => { lock = l; }).catch(() => {});
    return () => { void lock?.release(); };
  }, []);
  useEffect(() => () => { if (spinTimer.current) window.clearInterval(spinTimer.current); }, []);

  const set = useCallback((patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch })), []);
  const chooseGame = (g: LiveGame) => set({ gameKey: g.key, need: { ...g.need } });

  // La ruleta de juegos: pasa por varios y se detiene en uno al azar.
  const spin = () => {
    if (spinTimer.current) return;
    let n = 0;
    const total = 14;
    spinTimer.current = window.setInterval(() => {
      n++;
      setSpinning(pickGame(Math.random, null));
      if (n >= total) {
        window.clearInterval(spinTimer.current!);
        spinTimer.current = null;
        const final = pickGame(Math.random, s.gameKey);
        setSpinning(null);
        chooseGame(final);
      }
    }, 90 + 0);
  };

  const open = () => set({ phase: 'abierta', here: { magenta: 0, azul: 0 }, winner: null });
  const toggleSlot = (team: PlayTeam, index: number) => {
    const next = { ...s.here, [team]: index < s.here[team] ? index : index + 1 } as Need;
    const complete = isComplete(s.need, next);
    set({ here: next, phase: complete ? 'jugando' : 'abierta' });
  };
  const declare = (team: PlayTeam) => set({ winner: team, phase: 'gano' });
  const delivered = () => setS((p) => ({ ...fresh(p.copetes + 1), gameKey: p.gameKey, need: p.need }));
  const again = () => setS((p) => ({ ...fresh(p.copetes), gameKey: p.gameKey, need: p.need }));

  const shown = spinning ?? game;
  const total = s.need.magenta + s.need.azul;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden text-white" style={{ background: 'radial-gradient(120% 70% at 50% 100%, #3a0a45 0%, #12041F 55%, #07020F 100%)' }}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%] opacity-50" style={{ backgroundImage: 'linear-gradient(#FF2BD6AA 3px, transparent 3px), linear-gradient(90deg, #29B6FF88 3px, transparent 3px)', backgroundSize: '120px 90px', transform: 'perspective(700px) rotateX(62deg)', transformOrigin: '50% 100%' }} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0 2px, transparent 2px 6px)' }} />

      <header className="relative z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.2em] text-[#FFC93C]">PLAYMORE · Juegos en vivo</p>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-[#FFC93C]/60 px-3 py-1 text-xs font-bold text-[#FFC93C]">🍹 {s.copetes} hoy</span>
          <button type="button" aria-label="Pantalla completa" onClick={() => { void document.documentElement.requestFullscreen?.().catch(() => {}); }} className="grid h-9 w-9 place-items-center rounded-full bg-white/10"><Maximize2 className="h-4 w-4" /></button>
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-5 py-4">

          {s.phase === 'armando' && (
            <>
              <h1 className="text-center text-[clamp(22px,6vw,40px)] font-black uppercase leading-tight" style={{ fontFamily: DISPLAY, textShadow: '0 0 24px #29B6FF99' }}>¿Qué jugamos?</h1>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {LIVE_GAMES.map((g) => (
                  <button key={g.key} type="button" onClick={() => chooseGame(g)} aria-pressed={s.gameKey === g.key}
                    className="shrink-0 rounded-2xl border-2 px-3 py-2 text-left active:scale-95" style={{ borderColor: s.gameKey === g.key ? '#FFC93C' : 'rgba(255,255,255,0.2)', background: s.gameKey === g.key ? 'rgba(255,201,60,0.15)' : 'transparent' }}>
                    <span className="block text-2xl">{g.emoji}</span>
                    <span className="block max-w-[7.5rem] text-xs font-bold leading-tight">{g.name}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={spin} className="mx-auto flex items-center gap-2 rounded-full border-2 border-white/30 px-5 py-2 text-sm font-bold uppercase tracking-[0.15em] active:scale-95"><Shuffle className="h-4 w-4" /> Sortear juego</button>

              {shown && (
                <div className="rounded-3xl border border-white/15 bg-white/[0.04] p-4 text-center">
                  <p className="text-4xl">{shown.emoji}</p>
                  <p className="text-xl font-black uppercase">{shown.name}</p>
                  {!spinning && <p className="mt-1 text-sm text-white/70">{shown.rule}</p>}
                </div>
              )}

              <div className="space-y-3">
                <p className="text-center text-xs font-bold uppercase tracking-[0.3em] text-white/60">¿Cuántos jugadores de cada color?</p>
                {PLAY_TEAMS.slice().reverse().map((t) => (
                  <Counter key={t} team={t} value={s.need[t]} onChange={(n) => set({ need: { ...s.need, [t]: n } })} />
                ))}
                <p className="text-center text-xs text-white/50">Hasta {MAX_PER_TEAM} de cada color.</p>
              </div>
              <button type="button" disabled={total === 0 || !game} onClick={open}
                className="h-16 w-full rounded-full bg-[#FFC93C] text-base font-extrabold uppercase tracking-[0.18em] text-[#12041F] shadow-[0_0_34px_rgba(255,201,60,0.6)] disabled:opacity-40">
                ▶ Abrir la ronda
              </button>
            </>
          )}

          {(s.phase === 'abierta' || s.phase === 'jugando') && game && (
            <>
              <div className="text-center">
                <p className="text-3xl">{game.emoji}</p>
                <p className="text-[clamp(15px,4vw,24px)] font-black uppercase tracking-[0.1em] text-[#FFC93C]">{game.name}</p>
                <h1 className="mt-2 text-[clamp(26px,7.5vw,56px)] font-black uppercase leading-[1.05]" style={{ fontFamily: DISPLAY, textShadow: '0 0 24px #FF2BD688' }}>
                  {s.phase === 'jugando' ? '¡Completo! ¡A jugar!' : callText(s.need)}
                </h1>
                {s.phase === 'abierta' && <p className="mt-2 text-[clamp(14px,3.6vw,22px)] font-bold text-white/80">{missingText(s.need, s.here)}</p>}
              </div>

              {PLAY_TEAMS.slice().reverse().map((t) => s.need[t] > 0 && (
                <div key={t} className="text-center">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: PLAY_TEAM_META[t].hex }}>Pulsera {PLAY_TEAM_META[t].label}</p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {Array.from({ length: s.need[t] }, (_, i) => <Slot key={i} team={t} filled={i < s.here[t]} onTap={() => toggleSlot(t, i)} />)}
                  </div>
                </div>
              ))}

              <p className="mx-auto max-w-md text-center text-sm text-white/70">{game.rule}</p>
              <p className="text-center text-xs text-white/45">Toca un círculo cuando esa persona llegue. Juega solo quien quiere: siempre se puede pasar.</p>

              {s.phase === 'jugando' ? (
                <div className="space-y-2">
                  <p className="text-center text-xs font-bold uppercase tracking-[0.3em] text-white/60">¿Quién ganó?</p>
                  <div className="grid grid-cols-2 gap-3">
                    {PLAY_TEAMS.map((t) => (
                      <button key={t} type="button" onClick={() => declare(t)} className="rounded-3xl px-3 py-5 text-xl font-black uppercase text-black active:scale-95" style={{ background: PLAY_TEAM_META[t].hex, boxShadow: glow(PLAY_TEAM_META[t].hex) }}>
                        Ganó {PLAY_TEAM_META[t].label}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={again} className="mx-auto block rounded-full border border-white/30 px-5 py-2 text-xs font-bold uppercase tracking-[0.15em]">Empate: otra ronda</button>
                </div>
              ) : (
                <button type="button" onClick={again} className="mx-auto block rounded-full border border-white/30 px-5 py-2 text-xs font-bold uppercase tracking-[0.15em]">Cancelar la ronda</button>
              )}
            </>
          )}

          {s.phase === 'gano' && s.winner && (
            <div className="text-center">
              <p className="text-6xl">🎉</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.35em] text-white/60">Ganó el equipo</p>
              <h1 className="text-[clamp(44px,15vw,120px)] font-black uppercase leading-none" style={{ fontFamily: DISPLAY, color: PLAY_TEAM_META[s.winner].hex, textShadow: glow(PLAY_TEAM_META[s.winner].hex) }}>
                {PLAY_TEAM_META[s.winner].label}
              </h1>
              <p className="mt-4 text-[clamp(18px,5vw,32px)] font-extrabold text-[#FFC93C]">🍹 ¡Pasa por tu copete!</p>
              <p className="mt-1 text-sm text-white/60">{PLAY_TEAM_META[s.winner].player} · {PLAY_TEAM_META[s.winner].world}. ¡Un aplauso para {PLAY_TEAM_META[otherTeam(s.winner)].label} también!</p>
              <button type="button" onClick={delivered} className="mt-8 h-16 w-full max-w-md rounded-full bg-[#FFC93C] text-base font-extrabold uppercase tracking-[0.18em] text-[#12041F] shadow-[0_0_34px_rgba(255,201,60,0.6)]">Copete entregado · otra ronda</button>
              <button type="button" onClick={again} className="mt-3 block w-full text-xs font-semibold uppercase tracking-[0.15em] text-white/50">Otra ronda sin contar el copete</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
