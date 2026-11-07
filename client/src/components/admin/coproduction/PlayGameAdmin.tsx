import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Copy, Download, ExternalLink, Gamepad2, Loader2, Minus, Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PLAY_GAME_KINDS, PLAY_GAME_KIND_LABEL, PLAY_TEAM_META, PLAY_TEAMS, leader, type PlayGameKind, type PlayTeam } from '@shared/playTeams';

/* «Juegos y marcador» de PLAYMORE · Player 1 vs Player 2 (admin → Playroom × Dalmore → Configuración).
 * Un QR por juego: quien lo escanea marca su pulsera y suma los puntos a su equipo. El anfitrión también puede sumar a mano. */

const onError = (e: { message: string }) => toast.error(e.message);

function StationQr({ url, name, code }: { url: string; name: string; code: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { void QRCode.toDataURL(url, { width: 640, margin: 2 }).then(setSrc).catch(() => setSrc('')); }, [url]);
  if (!src) return <div className="h-28 w-28 rounded-xl bg-white/10" />;
  return (
    <div className="flex flex-col items-center gap-1">
      <img src={src} alt={`QR de ${name}`} className="h-28 w-28 rounded-xl bg-white p-1" />
      <a href={src} download={`juego-${code}.png`} className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"><Download className="h-3 w-3" /> PNG</a>
    </div>
  );
}

export function PlayGameAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.playGame.stations.useQuery(undefined, { refetchInterval: 5000 });
  const refresh = () => { void utils.playGame.stations.invalidate(); void utils.playGame.score.invalidate(); };
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PlayGameKind>('cruzado');
  const [points, setPoints] = useState(10);
  const [label, setLabel] = useState('');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const boardUrl = `${origin}/marcador`;

  const create = trpc.playGame.createStation.useMutation({ onSuccess: () => { setName(''); toast.success('Juego creado'); refresh(); }, onError });
  const toggle = trpc.playGame.setStationActive.useMutation({ onSuccess: refresh, onError });
  const del = trpc.playGame.deleteStation.useMutation({ onSuccess: refresh, onError });
  const add = trpc.playGame.addPoints.useMutation({ onSuccess: refresh, onError });
  const reset = trpc.playGame.resetScore.useMutation({ onSuccess: () => { toast.success('Marcador en cero'); refresh(); }, onError });
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success('Copiado'), () => toast.error('No se pudo copiar'));

  const score = data?.score ?? { magenta: 0, azul: 0 };
  const lead = leader(score);

  return (
    <section className="admin-clay space-y-4 p-5">
      <p className="flex items-center gap-2 font-semibold"><Gamepad2 className="h-4 w-4" /> Juegos y marcador · Player 1 vs Player 2</p>
      <p className="text-sm text-muted-foreground">
        En la puerta cada persona recibe una pulsera magenta o azul que sortea el sistema (la ves en la ficha del anfitrión; en la app aparece como «Tu equipo» cuando ya entró).
        Cada juego tiene un QR: quien lo escanea marca su color y suma los puntos para su equipo, una vez por celular. Todo opcional y con consentimiento.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl bg-black/30 px-3 py-2 text-xs">{boardUrl}</code>
        <Button variant="outline" size="sm" onClick={() => copy(boardUrl)}><Copy className="mr-1 h-4 w-4" /> Copiar</Button>
        <Button variant="outline" size="sm" asChild><a href={boardUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-4 w-4" /> Marcador para la pantalla grande</a></Button>
      </div>

      {/* Marcador y suma a mano */}
      <div className="grid gap-3 sm:grid-cols-2">
        {PLAY_TEAMS.map((t: PlayTeam) => (
          <div key={t} className="rounded-2xl border p-4" style={{ borderColor: PLAY_TEAM_META[t].hex }}>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: PLAY_TEAM_META[t].hex }}>{PLAY_TEAM_META[t].player} · {PLAY_TEAM_META[t].label} · {PLAY_TEAM_META[t].world}</p>
            <p className="mt-1 text-5xl font-black tabular-nums" style={{ color: PLAY_TEAM_META[t].hex }}>{score[t]}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[-10, 10, 25, 50].map((n) => (
                <Button key={n} size="sm" variant="outline" disabled={add.isPending} onClick={() => add.mutate({ team: t, points: n, label })}>
                  {n < 0 ? <Minus className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />}{Math.abs(n)}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <Label>Motivo de los puntos a mano (opcional, sale en el marcador)</Label>
          <Input className="mt-1" value={label} placeholder="Ej. Piedra, papel o tijera" onChange={(e) => setLabel(e.target.value)} />
        </div>
        <p className="pb-2 text-sm text-muted-foreground">{lead === 'empate' ? 'Van empatados.' : `Va ganando ${PLAY_TEAM_META[lead].label}.`}</p>
        <Button variant="ghost" size="sm" disabled={reset.isPending} onClick={() => { if (confirm('¿Dejar el marcador en cero? Se borran todos los puntos.')) reset.mutate(); }}>Marcador en cero</Button>
      </div>

      {/* Estaciones */}
      <div className="space-y-3 border-t border-white/10 pt-4">
        <p className="text-sm font-semibold">Juegos con QR</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_200px_110px_auto]">
          <div><Label>Nombre del juego</Label><Input className="mt-1" value={name} placeholder="Ej. Dados del brindis" onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>Quién juega</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as PlayGameKind)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{PLAY_GAME_KINDS.map((k) => <SelectItem key={k} value={k}>{PLAY_GAME_KIND_LABEL[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Puntos</Label><Input className="mt-1" type="number" min={1} max={100} value={points} onChange={(e) => setPoints(Math.round(Number(e.target.value)) || 10)} /></div>
          <div className="flex items-end"><Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ name, kind, points })}>{create.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Crear</Button></div>
        </div>

        {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : !data?.eventId ? (
          <p className="text-sm text-muted-foreground">Enlaza primero el evento de PLAYMORE (arriba, «Evento y reparto»).</p>
        ) : data.stations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay juegos. Crea el primero y imprime su QR para la mesa.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.stations.map((s) => {
              const url = `${origin}/juego/${s.code}`;
              return (
                <div key={s.id} className="flex items-start gap-3 rounded-2xl border border-white/10 p-3">
                  <StationQr url={url} name={s.name} code={s.code} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{PLAY_GAME_KIND_LABEL[s.kind]} · +{s.points} puntos</p>
                    <button type="button" className="mt-1 block max-w-full truncate text-left font-mono text-xs underline" onClick={() => copy(url)}>{url}</button>
                    <div className="mt-2 flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs"><Switch checked={s.active} onCheckedChange={(active) => toggle.mutate({ id: s.id, active })} /> {s.active ? 'Abierto' : 'Cerrado'}</label>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm(`¿Borrar «${s.name}»? Su QR deja de funcionar.`)) del.mutate({ id: s.id }); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data && data.recent.length > 0 && (
        <div className="border-t border-white/10 pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Últimos puntos</p>
          <ul className="flex flex-wrap gap-2">
            {data.recent.map((r, i) => (
              <li key={`${r.at}-${i}`} className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: PLAY_TEAM_META[r.team].hex, color: PLAY_TEAM_META[r.team].hex }}>
                {r.points > 0 ? '+' : ''}{r.points} {PLAY_TEAM_META[r.team].label}{r.label ? ` · ${r.label}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
