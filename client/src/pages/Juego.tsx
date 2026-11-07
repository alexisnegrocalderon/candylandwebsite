import { useEffect, useMemo, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { PLAY_GAME_KIND_LABEL, PLAY_TEAM_META, PLAY_TEAMS, isPlayTeam, type PlayTeam } from '@shared/playTeams';

/* /juego/<CÓDIGO>: lo que se abre al escanear el QR de una estación de juego. La persona marca de qué color es su pulsera
 * (queda guardado en su celular para las próximas estaciones) y suma los puntos del juego a su equipo, una vez por
 * celular. Es un juego a la palabra: sin cuenta ni datos. */

const TEAM_KEY = 'pm_team';
const DEVICE_KEY = 'pm_device';

const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* sin storage */ } };

function deviceKey(): string {
  const saved = read(DEVICE_KEY);
  if (saved && saved.length >= 8) return saved;
  const fresh = (crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
  write(DEVICE_KEY, fresh);
  return fresh;
}

export default function Juego() {
  const [, params] = useRoute('/juego/:code');
  const code = (params?.code ?? '').toUpperCase();
  useSeo({ title: 'Juego · PLAYMORE', description: 'Suma puntos para tu equipo.', path: `/juego/${code}`, noindex: true } as any);
  const station = trpc.playGame.station.useQuery({ code }, { enabled: !!code, retry: false });
  const [team, setTeam] = useState<PlayTeam | null>(() => { const t = read(TEAM_KEY); return isPlayTeam(t) ? t : null; });
  const [done, setDone] = useState<{ points: number } | null>(null);
  const device = useMemo(deviceKey, []);
  useEffect(() => { document.documentElement.style.background = '#07020F'; return () => { document.documentElement.style.background = ''; }; }, []);

  const scan = trpc.playGame.scan.useMutation({
    onSuccess: (r) => setDone({ points: r.points }),
    onError: (e) => toast.error(e.message),
  });

  const pick = (t: PlayTeam) => { setTeam(t); write(TEAM_KEY, t); };
  const st = station.data;
  const blocked = st && ((st.kind === 'magenta' && team === 'azul') || (st.kind === 'azul' && team === 'magenta'));

  return (
    <div className="min-h-dvh px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-white" style={{ background: 'radial-gradient(120% 60% at 50% 100%, #3a0a45 0%, #12041F 55%, #07020F 100%)' }}>
      <div className="mx-auto max-w-md">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.4em] text-[#FFC93C]">PLAYMORE · Player 1 vs Player 2</p>

        {station.isLoading ? (
          <p className="mt-16 text-center text-white/60">Cargando…</p>
        ) : !st ? (
          <div className="mt-16 text-center">
            <p className="text-2xl font-extrabold">Este juego ya no está disponible</p>
            <p className="mt-2 text-white/60">Pídele el QR a un anfitrión.</p>
          </div>
        ) : done ? (
          <div className="mt-12 text-center">
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-white/60">¡Puntos sumados!</p>
            <p className="mt-3 text-[88px] font-black leading-none" style={{ color: PLAY_TEAM_META[team!].hex, textShadow: `0 0 40px ${PLAY_TEAM_META[team!].hex}` }}>+{done.points}</p>
            <p className="mt-2 text-lg font-bold">para el equipo {PLAY_TEAM_META[team!].label}</p>
            <Link href="/marcador" className="mt-8 inline-block rounded-full bg-[#FFC93C] px-8 py-4 text-sm font-extrabold uppercase tracking-[0.18em] text-[#12041F]">Ver el marcador</Link>
          </div>
        ) : (
          <>
            <h1 className="mt-8 text-center text-3xl font-black uppercase leading-tight" style={{ fontFamily: "'Syne', 'Space Grotesk', sans-serif", textShadow: '0 0 22px #29B6FF99' }}>{st.name}</h1>
            <p className="mt-2 text-center text-sm font-semibold uppercase tracking-[0.2em] text-white/70">{PLAY_GAME_KIND_LABEL[st.kind as keyof typeof PLAY_GAME_KIND_LABEL] ?? st.kind} · +{st.points} puntos</p>

            <p className="mt-10 text-center text-xs font-bold uppercase tracking-[0.3em] text-white/60">¿De qué color es tu pulsera?</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {PLAY_TEAMS.map((t) => (
                <button
                  key={t} type="button" onClick={() => pick(t)} aria-pressed={team === t}
                  className="rounded-3xl px-3 py-6 text-center font-black text-black transition active:scale-[0.98]"
                  style={{ background: PLAY_TEAM_META[t].hex, opacity: team && team !== t ? 0.35 : 1, boxShadow: team === t ? `0 0 34px ${PLAY_TEAM_META[t].hex}` : 'none', outline: team === t ? '3px solid #fff' : 'none' }}
                >
                  <span className="block text-2xl uppercase">{PLAY_TEAM_META[t].label}</span>
                  <span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.2em]">{PLAY_TEAM_META[t].player}</span>
                </button>
              ))}
            </div>

            {blocked && <p className="mt-4 text-center text-sm font-semibold text-amber-300">Este juego es solo para pulsera {st.kind === 'magenta' ? 'magenta' : 'azul'}.</p>}
            <button
              type="button" disabled={!team || !!blocked || scan.isPending}
              onClick={() => team && scan.mutate({ code, team, deviceKey: device })}
              className="mt-6 h-16 w-full rounded-full bg-[#FFC93C] text-base font-extrabold uppercase tracking-[0.18em] text-[#12041F] shadow-[0_0_34px_rgba(255,201,60,0.6)] disabled:opacity-40"
            >
              {scan.isPending ? 'Sumando…' : '▶ Sumar mis puntos'}
            </button>
            <p className="mt-4 text-center text-xs leading-relaxed text-white/50">Todo es opcional y siempre con respeto: si no quieres jugar, no pasa nada.</p>
          </>
        )}
      </div>
    </div>
  );
}
