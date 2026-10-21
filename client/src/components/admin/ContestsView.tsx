import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Trophy, Users, AtSign, Share2, ShoppingBag, Ticket, Percent, Banknote, Play, Pause, Square, RefreshCw, Dices, Loader2,
  ExternalLink, Ban, Undo2, MailCheck, SkipForward, Copy, CheckCircle2, AlertTriangle, Plus, X,
} from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../../server/routers';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatTile } from '@/components/admin/StatTile';
import { getContestTemplate } from '@shared/contestTemplates';
import { ContestWizard } from '@/components/admin/ContestWizard';
import { ContestRankingPanel } from '@/components/admin/ContestRankingPanel';
import { DEFAULT_CONTEST_MESSAGES, commentEnrolls, dmEnrolls, missingKeywords, parseKeywords, type ContestConfig, type ContestMessages } from '@shared/contest';

/* Concursos de Instagram (admin → Comunidad → Concursos). Aquí solo se
 * configura y se mira: el concurso corre solo (server/contests.ts) -- recoge
 * comentarios, manda cupones y regalos por DM, suma chances con las compras,
 * sortea a la hora y pasa suplentes si un ganador no reclama. */

const onError = (error: unknown) => {
  toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción.');
};

const PHASE_LABEL: Record<string, { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'bg-muted text-muted-foreground' },
  scheduled: { label: 'Programado', className: 'bg-[var(--admin-warning-bg)] text-[var(--admin-warning-text)]' },
  live: { label: 'En vivo', className: 'bg-[var(--admin-success-bg)] text-[var(--admin-success-text)]' },
  drawn: { label: 'Sorteado', className: 'bg-[var(--admin-success-bg)] text-[var(--admin-success-text)]' },
  paused: { label: 'Pausado', className: 'bg-[var(--admin-warning-bg)] text-[var(--admin-warning-text)]' },
  finished: { label: 'Cerrado', className: 'bg-muted text-muted-foreground' },
};

const WINNER_STATUS: Record<string, string> = {
  alternate: 'Suplente',
  verifying: 'Esperando sus datos de verificación',
  review: 'Datos recibidos: por aprobar',
  rejected: 'Rechazado (no cumple requisitos)',
  notified: 'Esperando que escriba',
  choosing: 'Eligiendo devolución o regalo',
  delivered: 'Premio entregado',
  expired: 'No reclamó / pasado',
  skipped: 'No hizo falta',
};

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** ISO → valor de <input type="datetime-local"> en la hora del navegador. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function NumberField({ label, value, onChange, help, min = 0, suffix }: { label: string; value: number; onChange: (n: number) => void; help?: string; min?: number; suffix?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <Input type="number" min={min} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-28" />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {help && <p className="text-xs text-muted-foreground mt-1">{help}</p>}
    </div>
  );
}

function TicketTypeSelect({ label, value, onChange, types, categories, help, allowNone = true }: {
  label: string; value: number | null; onChange: (id: number | null) => void;
  types: { id: number; name: string; category: string; price: string | number }[]; categories: string[]; help?: string; allowNone?: boolean;
}) {
  const options = types.filter((t) => categories.includes(t.category));
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value ? String(value) : 'none'} onValueChange={(v) => onChange(v === 'none' ? null : Number(v))}>
        <SelectTrigger className="mt-1"><SelectValue placeholder="Elegir" /></SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="none">— Ninguno —</SelectItem>}
          {options.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name} · {clp(Number(t.price))}</SelectItem>)}
        </SelectContent>
      </Select>
      {help && <p className="text-xs text-muted-foreground mt-1">{help}</p>}
    </div>
  );
}

const MESSAGE_FIELDS: { key: Exclude<keyof ContestMessages, 'publicReplies'>; label: string; help: string }[] = [
  { key: 'noTicket', label: 'DM a quien participa SIN entrada', help: 'Va con el botón para usar el cupón.' },
  { key: 'holderAsk', label: 'Pregunta "¿ya tienes entrada?"', help: 'Se agrega al final del mensaje anterior.' },
  { key: 'holder', label: 'DM a quien YA tiene entrada', help: 'Regalos de asistente + código para un amigo.' },
  { key: 'boughtUpgrade', label: 'DM cuando compra durante el concurso', help: 'Pasa al sorteo VIP con chances multiplicadas.' },
  { key: 'extraChances', label: 'DM al compartir en historia', help: '' },
  { key: 'emailNotFound', label: 'DM si el correo no tiene compra', help: '' },
  { key: 'storyToReel', label: 'DM a quien responde la historia (entra con puntos base)', help: 'Lo inscribe con los puntos base y lo invita a comentar el reel para sumar más. Variables: {{link_reel}}, {{frase}}.' },
  { key: 'winnerVerify', label: 'DM al ganador: pedir datos de verificación', help: 'Primer aviso. Pide RUT, fecha de nacimiento y ACEPTO. Variables: {{plazo}}.' },
  { key: 'verifyReceived', label: 'Verificación: datos recibidos', help: 'Se manda cuando el ganador completó los datos y quedan por aprobar.' },
  { key: 'verifyMissing', label: 'Verificación: falta algo', help: 'Usa {{faltante}} para listar lo que falta.' },
  { key: 'verifyRejected', label: 'Verificación: no cumple requisitos', help: 'Se manda si rechazas al ganador.' },
  { key: 'winnerDouble', label: 'DM al ganador de la entrada doble', help: 'Va con el botón "Canjear mi premio".' },
  { key: 'winnerBuyer', label: 'DM/correo al ganador que YA había comprado', help: 'Lleva el link para elegir devolución o entrada para regalar.' },
  { key: 'choiceGift', label: 'DM cuando elige la entrada para regalar', help: '' },
  { key: 'refundDone', label: 'DM/correo cuando marcas la devolución como hecha', help: '' },
  { key: 'winnerVip', label: 'DM al ganador del premio VIP', help: '' },
  { key: 'winnerPublic', label: 'Respuesta pública al comentario del ganador', help: 'Cuando ya le llegó el DM.' },
  { key: 'winnerPublicNoDm', label: 'Respuesta pública si no se le pudo escribir', help: 'Le pide escribir por DM antes del plazo.' },
  { key: 'afterDraw', label: 'DM a quien comenta después del sorteo', help: '' },
];

const PLACEHOLDERS = '{{nombre}} {{chances}} {{cupon}} {{porcentaje}} {{horas}} {{link_invitar}} {{fecha_sorteo}} {{link_bases}} {{premio}} {{premio_singular}} {{premio_vip}} {{ganadores_doble}} {{codigo_amigo}} {{porcentaje_amigo}} {{lista_regalos}} {{codigo_premio}} {{plazo}} {{evento}} {{por_etiqueta}} {{max_etiquetas}} {{bonus_historia}} {{bonus_compra_amigo}} {{multiplicador}} {{congelado_hasta}} {{link_elegir}} {{monto_devolucion}} {{link_reel}} {{frase}} {{faltante}} {{puntos_texto}}';

/* ── Ruleta para grabar el sorteo ─────────────────────────────────────────── */

function DrawWheel({ contestId, winners, onClose }: {
  contestId: number;
  winners: { id: number; pool: 'double' | 'vip'; username: string | null; position: number; status: string }[];
  onClose: () => void;
}) {
  const { data: wheel } = trpc.contests.wheel.useQuery({ id: contestId });
  const sequence = useMemo(() => winners.filter((w) => w.status !== 'alternate' && w.status !== 'skipped'), [winners]);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState<string>('');
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const spin = (i: number) => {
    const target = sequence[i];
    if (!target || !wheel) return;
    const names = (target.pool === 'double' ? wheel.double : wheel.vip).map((p) => p.username ?? '¿?');
    const pool = names.length ? names : [target.username ?? '¿?'];
    setDone(false);
    let step = 0;
    const total = 38;
    const tick = () => {
      step++;
      if (step >= total) {
        setShown(target.username ?? '¿?');
        setDone(true);
        return;
      }
      setShown(pool[Math.floor(Math.random() * pool.length)]);
      // Empieza rápido y frena, como una tómbola.
      timer.current = setTimeout(tick, 40 + Math.pow(step / total, 3) * 520);
    };
    tick();
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (wheel && sequence.length) spin(0); }, [wheel]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = sequence[index];
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,#3b1238_0%,#0a0a0c_70%)] text-white p-6">
      <button onClick={onClose} className="absolute top-4 right-4 rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Cerrar"><X className="w-5 h-5" /></button>
      {!current ? (
        <p className="text-lg">Todavía no hay ganadores.</p>
      ) : (
        <>
          <p className="uppercase tracking-[0.3em] text-sm text-pink-200/80 mb-4">
            {current.pool === 'double' ? 'Sorteo entrada doble' : 'Sorteo VIP'} · ganador {index + 1} de {sequence.length}
          </p>
          <div className={`text-center font-heading break-all transition-transform ${done ? 'scale-110' : ''}`} style={{ fontSize: 'clamp(2.2rem, 9vw, 6rem)' }}>
            @{shown || '…'}
          </div>
          {done && <p className="mt-6 text-3xl animate-bounce">🎉🍬🎉</p>}
          <div className="mt-10 flex gap-3">
            {done && index + 1 < sequence.length && (
              <Button size="lg" onClick={() => { setIndex(index + 1); spin(index + 1); }}>Siguiente ganador</Button>
            )}
            {done && <Button size="lg" variant="outline" className="text-foreground" onClick={() => spin(index)}>Repetir animación</Button>}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Vista principal ──────────────────────────────────────────────────────── */

export function ContestsView() {
  const utils = trpc.useUtils();
  const list = trpc.contests.list.useQuery(undefined, { retry: false });
  const { data: events } = trpc.events.listAll.useQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    if (selectedId === null && list.data && list.data.length > 0) setSelectedId(list.data[0].id);
  }, [list.data, selectedId]);

  const upcoming = useMemo(
    () => (events ?? []).filter((e: any) => e.status === 'published' && new Date(e.eventDate).getTime() > Date.now()),
    [events],
  );

  if (list.error) {
    return <Card><CardContent className="py-8 text-sm text-muted-foreground">{list.error.message}</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Trophy className="w-5 h-5" /> Concursos de Instagram</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            El concurso corre solo: cada comentario en el post recibe su premio por DM, las etiquetas y compras suman chances,
            el sorteo se hace a la hora programada y, si un ganador no reclama a tiempo, pasa el suplente.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            {(list.data?.length ?? 0) > 0 && (
              <div className="min-w-[240px]">
                <Label>Concurso</Label>
                <Select value={selectedId ? String(selectedId) : ''} onValueChange={(v) => setSelectedId(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Elegir" /></SelectTrigger>
                  <SelectContent>
                    {list.data!.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{getContestTemplate(c.template).emoji} {c.title} · {c.participants} participantes</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <WriteButton onClick={() => setWizardOpen(true)}>
              <Plus className="w-4 h-4" /> Nuevo concurso
            </WriteButton>
          </div>
        </CardContent>
      </Card>

      <ContestWizard open={wizardOpen} onOpenChange={setWizardOpen} events={upcoming.map((e: any) => ({ id: e.id, title: e.title }))} onCreated={setSelectedId} />
      {selectedId && <ContestDetail key={selectedId} id={selectedId} />}
    </div>
  );
}

/** Probador: escribe una frase y mira si inscribiría (por comentario y por DM / respuesta a historia). */
function KeywordTester({ keyword }: { keyword: string }) {
  const [text, setText] = useState('quiero entrada');
  const keywords = parseKeywords(keyword);
  const missing = missingKeywords(text, keywords);
  return (
    <div className="mt-3 rounded-lg border p-3 space-y-2">
      <Label className="text-xs">Probar una frase</Label>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="quiero entrada" />
      {keywords.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin palabras clave: cualquier comentario participa.</p>
      ) : (
        <div className="text-xs space-y-0.5">
          <p>Palabras que se exigen: <b>{keywords.join(' + ')}</b></p>
          <p>{commentEnrolls(text, keyword, false) ? '✅' : '❌'} En un comentario del post{missing.length > 0 ? ` (faltan: ${missing.join(', ')})` : ''}</p>
          <p>{dmEnrolls(text, keyword) ? '✅' : '❌'} Por DM o respondiendo una historia{!dmEnrolls(text, keyword) && missing.length === 0 ? ' (es muy larga o tiene una pregunta)' : ''}</p>
        </div>
      )}
      {keywords.length === 1 && keywords[0].split(' ').length >= 3 && (
        <p className="text-xs text-[var(--admin-warning-text)]">Ojo: escribiste una frase completa. Separa las palabras con coma (ej. «quiero, entrada») para que calce con variaciones.</p>
      )}
    </div>
  );
}

function ContestDetail({ id }: { id: number }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.contests.get.useQuery({ id }, { refetchInterval: 30_000 });
  const [title, setTitle] = useState('');
  const [config, setConfig] = useState<ContestConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showWheel, setShowWheel] = useState(false);
  const [pickMedia, setPickMedia] = useState(false);

  useEffect(() => {
    if (data && !dirty) {
      setTitle(data.contest.title);
      setConfig(data.config);
    }
  }, [data, dirty]);

  const types = trpc.contests.ticketTypes.useQuery({ eventId: data?.event.id ?? 0 }, { enabled: !!data });
  const media = trpc.contests.media.useQuery(undefined, { enabled: pickMedia, retry: false });

  const invalidate = () => { utils.contests.get.invalidate({ id }); utils.contests.list.invalidate(); };
  const update = trpc.contests.update.useMutation({ onSuccess: () => { setDirty(false); invalidate(); toast.success('Guardado.'); }, onError });
  const setStatus = trpc.contests.setStatus.useMutation({
    onSuccess: (r, v) => {
      invalidate();
      const sync = r.sync && 'processed' in r.sync ? ` Se procesaron ${r.sync.processed} comentarios que ya estaban.` : '';
      toast.success(v.status === 'active' ? `¡Concurso activo!${sync}` : 'Estado actualizado.');
    },
    onError,
  });
  const syncNow = trpc.contests.syncNow.useMutation({ onSuccess: (r) => { invalidate(); toast.success(`${r.processed} comentarios nuevos de ${r.total}.`); }, onError });
  const resend = trpc.contests.resendWelcomes.useMutation({
    onSuccess: (r) => toast.success(`${r.sent} DM enviados, ${r.failed} no salieron (ya lo habían recibido o Instagram lo rechazó).${r.lastError ? ` Último error: ${r.lastError}` : ''}`, { duration: 12000 }),
    onError,
  });
  const drawNow = trpc.contests.drawNow.useMutation({ onSuccess: () => { invalidate(); toast.success('¡Sorteo hecho! Los premios se están entregando.'); setShowWheel(true); }, onError });

  if (isLoading || !data || !config) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const patch = (fn: (c: ContestConfig) => ContestConfig) => { setConfig(fn(config)); setDirty(true); };
  const save = () => update.mutate({ id, title, config });
  const phase = PHASE_LABEL[data.phase] ?? PHASE_LABEL.draft;
  const s = data.stats;
  const accesos = types.data ?? [];

  return (
    <div className="space-y-6">
      {showWheel && <DrawWheel contestId={id} winners={data.winners as any} onClose={() => setShowWheel(false)} />}

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${phase.className}`}>{phase.label}</span>
            <span className="font-heading text-lg">{data.contest.title}</span>
            <span className="text-sm text-muted-foreground">· {data.event.title}</span>
            {data.contest.mediaPermalink && (
              <a href={data.contest.mediaPermalink} target="_blank" rel="noreferrer" className="text-sm inline-flex items-center gap-1 underline">
                Ver post <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <a href="/concurso" target="_blank" rel="noreferrer" className="text-sm inline-flex items-center gap-1 underline">Bases públicas <ExternalLink className="w-3.5 h-3.5" /></a>
          </div>

          {data.blockers.length > 0 && data.contest.status === 'draft' && (
            <div className="rounded-lg border border-[var(--admin-warning-text)]/30 bg-[var(--admin-warning-bg)] p-3 text-sm space-y-1">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Antes de lanzar:</p>
              {data.blockers.map((b) => <p key={b}>• {b}</p>)}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {(data.contest.status === 'draft' || data.contest.status === 'paused') && (
              <WriteButton disabled={dirty || setStatus.isPending || data.blockers.length > 0} title={dirty ? 'Guarda los cambios primero' : undefined}
                onClick={() => setStatus.mutate({ id, status: 'active' })}>
                <Play className="w-4 h-4" /> {data.contest.status === 'paused' ? 'Reanudar' : 'Lanzar concurso'}
              </WriteButton>
            )}
            {data.contest.status === 'active' && (
              <WriteButton variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id, status: 'paused' })}>
                <Pause className="w-4 h-4" /> Pausar
              </WriteButton>
            )}
            {data.contest.status === 'active' && (
              <WriteButton variant="outline" disabled={syncNow.isPending} onClick={() => syncNow.mutate({ id })}>
                {syncNow.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Revisar comentarios ahora
              </WriteButton>
            )}
            {data.contest.status === 'active' && (
              <WriteButton variant="outline" disabled={resend.isPending} onClick={() => resend.mutate({ id })}>
                {resend.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />} Reenviar DM a quienes no lo recibieron
              </WriteButton>
            )}
            {data.contest.status === 'active' && !data.contest.drawnAt && (
              <WriteButton variant="outline" disabled={drawNow.isPending}
                onClick={() => { if (confirm('¿Sortear AHORA? Se cierra la participación en el sorteo y se entregan los premios. No se puede deshacer.')) drawNow.mutate({ id }); }}>
                <Dices className="w-4 h-4" /> Sortear ahora
              </WriteButton>
            )}
            {data.contest.drawnAt && (
              <Button variant="outline" onClick={() => setShowWheel(true)}><Dices className="w-4 h-4" /> Ruleta (para grabar)</Button>
            )}
            {data.contest.status !== 'finished' && data.contest.status !== 'draft' && (
              <WriteButton variant="ghost" disabled={setStatus.isPending}
                onClick={() => { if (confirm('¿Cerrar el concurso? Ya no recibirá participantes.')) setStatus.mutate({ id, status: 'finished' }); }}>
                <Square className="w-4 h-4" /> Cerrar
              </WriteButton>
            )}
          </div>
          {data.contest.status === 'active' && (
            <p className="text-xs text-muted-foreground">
              Sorteo automático: {config.drawAt ? new Date(config.drawAt).toLocaleString('es-CL', { dateStyle: 'full', timeStyle: 'short' }) : '—'}.
              {data.contest.lastSyncAt && ` Última revisión de comentarios: ${new Date(data.contest.lastSyncAt).toLocaleTimeString('es-CL', { timeStyle: 'short' })}.`}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={Users} value={s.participants} label="Participantes" />
        <StatTile icon={AtSign} value={s.mentions} label="Amigos etiquetados" />
        <StatTile icon={Share2} value={s.storyShares} label="Compartieron en historia" />
        <StatTile icon={Ticket} value={s.withTicket} label="Con entrada" tone="success" />
        <StatTile icon={Percent} value={`${s.couponsUsed}/${s.couponsSent}`} label="Cupones usados" tone="alert" />
        <StatTile icon={ShoppingBag} value={s.invitedPurchases} label="Amigos que compraron" tone="success" />
        <StatTile icon={ShoppingBag} value={s.orders} label="Compras del concurso" tone="success" />
        <StatTile icon={Banknote} value={clp(s.revenue)} label="Ventas del concurso" tone="revenue" />
        {s.refundsPending > 0 && <StatTile icon={Banknote} value={clp(s.refundsPending)} label="Devoluciones pendientes" tone="danger" />}
      </div>

      <Tabs defaultValue={data.contest.status === 'draft' ? 'config' : data.contest.drawnAt ? 'winners' : 'people'}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="config">Configuración</TabsTrigger>
          <TabsTrigger value="messages">Mensajes</TabsTrigger>
          <TabsTrigger value="people">Participantes ({s.participants})</TabsTrigger>
          {data.contest.template === 'ranking' && <TabsTrigger value="ranking">Ranking</TabsTrigger>}
          <TabsTrigger value="winners">Sorteo y ganadores</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Publicación y fechas</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nombre interno</Label>
                <Input className="mt-1" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
              </div>
              <div>
                <Label>Publicación del concurso</Label>
                <div className="mt-1 flex items-center gap-3">
                  {data.contest.mediaImage && <img src={data.contest.mediaImage} alt="" className="w-16 h-16 rounded-lg object-cover" />}
                  <Button variant="outline" size="sm" onClick={() => setPickMedia((v) => !v)}>{data.contest.mediaId ? 'Cambiar publicación' : 'Elegir publicación'}</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Cualquier comentario en esta publicación participa. Publícala primero en Instagram y después elígela acá.</p>
                {pickMedia && (
                  <div className="mt-3">
                    {media.isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                    {media.error && <p className="text-sm text-destructive">{media.error.message}</p>}
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {(media.data ?? []).map((m) => (
                        <button key={m.id} type="button"
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 ${m.id === data.contest.mediaId ? 'border-primary' : 'border-transparent'}`}
                          onClick={() => { update.mutate({ id, mediaId: m.id, mediaPermalink: m.permalink, mediaImage: m.image }); setPickMedia(false); }}>
                          <img src={m.image} alt="" className="w-full h-full object-cover" />
                          {m.comments !== null && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">💬 {m.comments}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Empieza</Label>
                  <Input type="datetime-local" className="mt-1" value={toLocalInput(config.startsAt)} onChange={(e) => patch((c) => ({ ...c, startsAt: fromLocalInput(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground mt-1">Vacío = apenas lo lances.</p>
                </div>
                <div>
                  <Label>Sorteo automático</Label>
                  <Input type="datetime-local" className="mt-1" value={toLocalInput(config.drawAt)} onChange={(e) => patch((c) => ({ ...c, drawAt: fromLocalInput(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground mt-1">Propuesto: 3 días antes de la fiesta. Se sortea solo a esa hora (± 15 min).</p>
                </div>
                <div>
                  <Label>Palabras clave para participar</Label>
                  <Input className="mt-1" value={config.keyword} onChange={(e) => patch((c) => ({ ...c, keyword: e.target.value }))} />
                  <p className="text-xs text-muted-foreground mt-1">Separa con coma: el comentario tiene que traerlas todas (ej. «quiero, entrada» calza con «quiero mi entrada doble»). Quien comenta otra cosa no recibe nada. Vacía = cualquier comentario participa.</p>
                  <KeywordTester keyword={config.keyword} />
                </div>
                <div>
                  <Label>Frase que ve la gente (opcional)</Label>
                  <Input className="mt-1" value={config.keywordPhrase} placeholder="quiero mi entrada doble" onChange={(e) => patch((c) => ({ ...c, keywordPhrase: e.target.value }))} />
                  <p className="text-xs text-muted-foreground mt-1">Aparece en las bases y en la respuesta que pide escribir por DM. Vacía = las palabras clave tal cual.</p>
                </div>
                <NumberField label="Plazo para reclamar el premio" value={config.claimHours} suffix="horas" onChange={(n) => patch((c) => ({ ...c, claimHours: n }))}
                  help="Solo si no se le pudo escribir al ganador. Pasado el plazo, pasa el suplente." />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={config.publicReply} onCheckedChange={(v) => patch((c) => ({ ...c, publicReply: v }))} />
                Responder públicamente cada primer comentario ("¡Ya estás participando! Revisa tus DM")
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={config.couponsAfterDraw} onCheckedChange={(v) => patch((c) => ({ ...c, couponsAfterDraw: v }))} />
                Después del sorteo, seguir regalando el cupón a quien comente (hasta la fiesta)
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Premios</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid sm:grid-cols-3 gap-4">
                <TicketTypeSelect label="Entrada que se regala" value={config.prizes.prizeTicketTypeId} types={accesos} categories={['acceso']} allowNone={false}
                  onChange={(v) => patch((c) => ({ ...c, prizes: { ...c.prizes, prizeTicketTypeId: v } }))}
                  help="El ganador recibe un código que cubre 1 unidad de esta entrada." />
                <NumberField label="Ganadores entrada doble" value={config.prizes.doubleWinners} onChange={(n) => patch((c) => ({ ...c, prizes: { ...c.prizes, doubleWinners: n } }))} />
                <NumberField label="Suplentes" value={config.prizes.doubleAlternates} onChange={(n) => patch((c) => ({ ...c, prizes: { ...c.prizes, doubleAlternates: n } }))} />
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <NumberField label="Descuento extra sobre el precio congelado" value={config.prizes.couponPercent} suffix="%" onChange={(n) => patch((c) => ({ ...c, prizes: { ...c.prizes, couponPercent: n } }))} />
                <NumberField label="El descuento extra dura" value={config.prizes.couponHours} suffix="horas" onChange={(n) => patch((c) => ({ ...c, prizes: { ...c.prizes, couponHours: n } }))}
                  help="Desde que participa: empuja a comprar ya. 0 = sin extra." />
                <NumberField label="Precio congelado hasta" value={config.prizes.priceLockHoursAfterDraw} suffix="h después del sorteo" onChange={(n) => patch((c) => ({ ...c, prizes: { ...c.prizes, priceLockHoursAfterDraw: n } }))}
                  help="Su código le mantiene el precio de la tanda del día en que participó, aunque la tanda suba. Usa la escala de tandas del evento." />
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <NumberField label="Plazo para elegir devolución o regalo" value={config.prizes.choiceHours} suffix="horas" onChange={(n) => patch((c) => ({ ...c, prizes: { ...c.prizes, choiceHours: n } }))}
                  help="Si gana alguien que compró durante el concurso. Si no elige, queda la devolución pendiente." />
              </div>
              <div className="border-t pt-4 space-y-4">
                <p className="text-sm font-semibold">Para quienes ya tienen entrada</p>
                <div className="grid sm:grid-cols-3 gap-4">
                  <NumberField label="Código para un amigo" value={config.prizes.friendPercent} suffix="%" onChange={(n) => patch((c) => ({ ...c, prizes: { ...c.prizes, friendPercent: n } }))} help="0 = sin código." />
                  <TicketTypeSelect label="Producto de regalo" value={config.prizes.holderGiftTicketTypeId} types={accesos} categories={['consumo', 'extra', 'merch']}
                    onChange={(v) => patch((c) => ({ ...c, prizes: { ...c.prizes, holderGiftTicketTypeId: v } }))}
                    help="Se carga gratis en su entrada y se canjea en caja." />
                  <NumberField label="PlayCoins de regalo" value={config.prizes.holderPlaycoins} onChange={(n) => patch((c) => ({ ...c, prizes: { ...c.prizes, holderPlaycoins: n } }))} help="1 PlayCoin = $1." />
                </div>
                <div className="grid sm:grid-cols-4 gap-4">
                  <div>
                    <Label>Premio del sorteo VIP</Label>
                    <Input className="mt-1" value={config.prizes.vipPrizeLabel} onChange={(e) => patch((c) => ({ ...c, prizes: { ...c.prizes, vipPrizeLabel: e.target.value } }))} />
                  </div>
                  <TicketTypeSelect label="Producto que se entrega" value={config.prizes.vipPrizeTicketTypeId} types={accesos} categories={['consumo', 'extra', 'merch']}
                    onChange={(v) => patch((c) => ({ ...c, prizes: { ...c.prizes, vipPrizeTicketTypeId: v } }))}
                    help="Se carga solo en su entrada. Ninguno = lo entregas a mano." />
                  <NumberField label="Ganadores VIP" value={config.prizes.vipWinners} onChange={(n) => patch((c) => ({ ...c, prizes: { ...c.prizes, vipWinners: n } }))} />
                  <NumberField label="Suplentes VIP" value={config.prizes.vipAlternates} onChange={(n) => patch((c) => ({ ...c, prizes: { ...c.prizes, vipAlternates: n } }))} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Chances</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-3 gap-4">
              <NumberField label="Por participar" value={config.chances.base} min={1} onChange={(n) => patch((c) => ({ ...c, chances: { ...c.chances, base: n } }))} />
              <NumberField label="Por cada amigo etiquetado" value={config.chances.perMention} onChange={(n) => patch((c) => ({ ...c, chances: { ...c.chances, perMention: n } }))} />
              <NumberField label="Tope de etiquetas" value={config.chances.maxMentions} onChange={(n) => patch((c) => ({ ...c, chances: { ...c.chances, maxMentions: n } }))} help="Evita el spam de etiquetas." />
              <NumberField label="Por compartir en historia" value={config.chances.storyBonus} onChange={(n) => patch((c) => ({ ...c, chances: { ...c.chances, storyBonus: n } }))} help="Una vez, mencionando la cuenta." />
              <NumberField label="Por cada amigo que compra" value={config.chances.perInvitedPurchase} onChange={(n) => patch((c) => ({ ...c, chances: { ...c.chances, perInvitedPurchase: n } }))} help="Con su link o su código." />
              <NumberField label="Multiplicador al comprar" value={config.chances.buyerMultiplier} min={1} suffix="x" onChange={(n) => patch((c) => ({ ...c, chances: { ...c.chances, buyerMultiplier: n } }))}
                help="Quien compra durante el concurso sigue por la entrada doble con sus chances multiplicadas (si gana: devolución o regalo)." />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-5">
              <p className="text-xs text-muted-foreground">Variables disponibles: <span className="font-mono">{PLACEHOLDERS}</span></p>
              {MESSAGE_FIELDS.map((f) => (
                <div key={f.key}>
                  <div className="flex items-center justify-between">
                    <Label>{f.label}</Label>
                    {config.messages[f.key] !== DEFAULT_CONTEST_MESSAGES[f.key] && (
                      <button className="text-xs underline text-muted-foreground" onClick={() => patch((c) => ({ ...c, messages: { ...c.messages, [f.key]: DEFAULT_CONTEST_MESSAGES[f.key] } }))}>Volver al propuesto</button>
                    )}
                  </div>
                  <Textarea className="mt-1 text-sm" rows={f.key === 'noTicket' || f.key === 'holder' ? 9 : 3} value={config.messages[f.key]}
                    onChange={(e) => patch((c) => ({ ...c, messages: { ...c.messages, [f.key]: e.target.value } }))} />
                  {f.help && <p className="text-xs text-muted-foreground mt-1">{f.help}</p>}
                </div>
              ))}
              <div>
                <Label>Respuestas públicas al primer comentario (una por línea, se elige al azar)</Label>
                <Textarea className="mt-1 text-sm" rows={4} value={config.messages.publicReplies.join('\n')}
                  onChange={(e) => patch((c) => ({ ...c, messages: { ...c.messages, publicReplies: e.target.value.split('\n') } }))} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="people">
          <ParticipantsTable contestId={id} participants={data.participants} onChanged={invalidate} />
        </TabsContent>

        <TabsContent value="ranking">
          <ContestRankingPanel id={id} config={config} patch={patch} />
        </TabsContent>

        <TabsContent value="winners">
          <WinnersPanel data={data} onChanged={invalidate} onWheel={() => setShowWheel(true)} />
        </TabsContent>
      </Tabs>

      {dirty && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <div className="admin-clay flex items-center gap-3 px-4 py-3">
            <span className="text-sm">Tienes cambios sin guardar</span>
            <Button variant="ghost" onClick={() => { setDirty(false); setConfig(data.config); setTitle(data.contest.title); }}>Descartar</Button>
            <WriteButton disabled={update.isPending} onClick={save}>{update.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Guardar</WriteButton>
          </div>
        </div>
      )}
    </div>
  );
}

type AdminData = NonNullable<inferRouterOutputs<AppRouter>['contests']['get']>;

function ParticipantsTable({ participants, onChanged }: { contestId: number; participants: AdminData['participants']; onChanged: () => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'ticket' | 'noticket' | 'out'>('all');
  const disq = trpc.contests.setDisqualified.useMutation({ onSuccess: () => { onChanged(); toast.success('Listo.'); }, onError });
  const holder = trpc.contests.markHolder.useMutation({ onSuccess: () => { onChanged(); toast.success('Marcado con entrada: regalos entregados.'); }, onError });

  const rows = participants
    .filter((p) => !search || (p.username ?? '').toLowerCase().includes(search.toLowerCase().replace(/^@/, '')))
    .filter((p) => filter === 'all' || (filter === 'ticket' ? p.hasTicket && !p.disqualified : filter === 'noticket' ? !p.hasTicket && !p.disqualified : p.disqualified))
    .sort((a, b) => b.chances - a.chances);

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Buscar @usuario" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="noticket">Sin entrada</SelectItem>
              <SelectItem value="ticket">Con entrada</SelectItem>
              <SelectItem value="out">Descalificados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Todavía no hay participantes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Participante</th>
                  <th className="py-2 pr-3 text-right">Chances</th>
                  <th className="py-2 pr-3">Suma</th>
                  <th className="py-2 pr-3">Entrada</th>
                  <th className="py-2 pr-3">Cupón</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={`border-t ${p.disqualified ? 'opacity-50' : ''}`}>
                    <td className="py-2 pr-3">
                      <a href={`https://instagram.com/${p.username ?? ''}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">@{p.username ?? p.igUserId}</a>
                      <div className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })} · {p.source === 'comment' ? 'comentario' : p.source === 'story' ? 'historia' : 'DM'}</div>
                      {p.disqualifyReason && <div className="text-xs text-destructive">{p.disqualifyReason}</div>}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{p.chances}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {p.mentions.length > 0 && <div title={p.mentions.map((m) => `@${m}`).join(' ')}>👥 {p.mentions.length} etiquetados</div>}
                      {p.storyMentioned && <div>📲 historia</div>}
                      {p.invitedPurchases > 0 && <div>🛒 {p.invitedPurchases} amigos compraron</div>}
                      {p.boughtDuringContest && <div>🔥 compró en el concurso (x)</div>}
                      <div>{p.pool === 'double' ? '🎟️ sorteo entrada doble' : '⭐ sorteo VIP'}</div>
                    </td>
                    <td className="py-2 pr-3">{p.hasTicket ? <span className="inline-flex items-center gap-1 text-[var(--admin-success-text)]"><CheckCircle2 className="w-4 h-4" /> Sí</span> : 'No'}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{p.couponCode ?? p.friendCode ?? '—'}{p.couponUsed && ' ✅'}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {!p.hasTicket && !p.disqualified && (
                        <Button size="sm" variant="ghost" title="Marcar que ya tiene entrada" disabled={holder.isPending}
                          onClick={() => { const email = prompt('Correo con el que compró su entrada:'); if (email) holder.mutate({ participantId: p.id, email }); }}>
                          <MailCheck className="w-4 h-4" />
                        </Button>
                      )}
                      {p.disqualified ? (
                        <Button size="sm" variant="ghost" title="Volver a incluir" onClick={() => disq.mutate({ participantId: p.id, disqualified: false })}><Undo2 className="w-4 h-4" /></Button>
                      ) : (
                        <Button size="sm" variant="ghost" title="Descalificar" onClick={() => { const reason = prompt('Motivo (opcional, ej. cuenta falsa):'); if (reason !== null) disq.mutate({ participantId: p.id, disqualified: true, reason }); }}>
                          <Ban className="w-4 h-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WinnersPanel({ data, onChanged, onWheel }: { data: AdminData; onChanged: () => void; onWheel: () => void }) {
  const skip = trpc.contests.skipWinner.useMutation({
    onSuccess: (r) => { onChanged(); toast.success(r.promoted ? 'Pasó el siguiente suplente.' : 'No quedan suplentes.'); },
    onError,
  });
  const approve = trpc.contests.approveWinner.useMutation({
    onSuccess: () => { onChanged(); toast.success('Aprobado: se entregó el premio.'); },
    onError,
  });
  const reject = trpc.contests.rejectWinner.useMutation({
    onSuccess: (r) => { onChanged(); toast.success(r.promoted ? 'Rechazado: pasó el siguiente suplente.' : 'Rechazado: no quedan suplentes.'); },
    onError,
  });
  const [follows, setFollows] = useState<Record<number, boolean | null>>({});
  const checkFollows = trpc.contests.checkFollows.useMutation({
    onSuccess: (r, v) => { setFollows((f) => ({ ...f, [v.winnerId]: r.follows })); if (r.follows == null) toast.message('Meta no entregó el dato: revisa el perfil a mano.'); },
    onError,
  });
  const refund = trpc.contests.markRefundDone.useMutation({
    onSuccess: () => { onChanged(); toast.success('Devolución marcada y avisada al ganador.'); },
    onError,
  });
  const copy = (text: string) => { navigator.clipboard?.writeText(text).then(() => toast.success('Copiado.')).catch(() => {}); };

  if (!data.contest.drawnAt) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-2 text-sm">
          <p>El sorteo se hace solo el <b>{data.config.drawAt ? new Date(data.config.drawAt).toLocaleString('es-CL', { dateStyle: 'full', timeStyle: 'short' }) : '—'}</b>.</p>
          {data.contest.template === 'likes' && (
            <p className="text-muted-foreground">
              Al cierre se leen los "me gusta" de los comentarios del reel (1 por persona, solo con la palabra clave, empate = el más antiguo), gana el más votado y se publica el top 3 con @ en el reel.
              {data.config.ranking.dailyComment ? ` Cada día desde las ${data.config.ranking.dailyHour}:00 se comenta cómo va el top.` : ''} Cada ganador pasa por la verificación antes de recibir el premio.
            </p>
          )}
          {data.contest.template === 'referrals' && (
            <p className="text-muted-foreground">
              Al cierre ganan quienes más compras lograron con su link (empate = quien entró antes) y se publica la tabla final en el reel.
              {data.config.ranking.dailyComment ? ` Cada día desde las ${data.config.ranking.dailyHour}:00 se comenta la tabla parcial.` : ''} Cada ganador pasa por la verificación antes de recibir el premio.
            </p>
          )}
          {(data.contest.template === 'ranking' || data.contest.template === 'draw') && <p className="text-muted-foreground">
            Boletos hoy: {data.stats.tickets.double} en el sorteo de entradas dobles (sin entrada o compraron durante el concurso) y {data.stats.tickets.vip} en el VIP (ya tenían entrada).
            El 1º del ranking de cada tabla gana uno de los premios seguro (si hay empate arriba se sortea entre los empatados) y el resto se sortea.
            Si gana alguien que compró durante el concurso, elige devolución o una entrada para regalar.
            A cada ganador sin entrada se le pide por DM RUT, fecha de nacimiento y ACEPTO, y el premio se entrega solo cuando lo apruebas aquí (+18, sin bloqueo, sigue la cuenta); a quien ya tenía entrada se le avisa directo. Si no se le puede escribir, se le responde el comentario pidiéndole que escriba
            y, si no reclama en {data.config.claimHours} h, pasa el suplente.
          </p>}
        </CardContent>
      </Card>
    );
  }
  const pools: { key: 'double' | 'vip'; title: string }[] = [
    { key: 'double', title: 'Entradas dobles (sin entrada o compraron en el concurso)' },
    { key: 'vip', title: `${data.config.prizes.vipPrizeLabel} (ya tenían entrada)` },
  ];
  const log = (data.contest.drawLog ?? {}) as Record<string, { participants: number; tickets: number; guaranteed?: number | null }>;
  return (
    <div className="space-y-4">
      {(data.contest.template === 'ranking' || data.contest.template === 'draw') && <Button variant="outline" onClick={onWheel}><Dices className="w-4 h-4" /> Abrir ruleta para grabar</Button>}
      {pools.map((pool) => {
        const rows = data.winners.filter((w) => w.pool === pool.key);
        return (
          <Card key={pool.key}>
            <CardHeader>
              <CardTitle className="text-base">{pool.title}</CardTitle>
              {log[pool.key] && <p className="text-xs text-muted-foreground">{log[pool.key].participants} participantes · {log[pool.key].tickets} boletos</p>}
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? <p className="text-sm text-muted-foreground">Sin participantes en este sorteo.</p> : (
                <div className="space-y-2">
                  {rows.map((w) => (
                    <div key={w.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
                      <span className="font-semibold w-6">{w.position}.</span>
                      <a href={`https://instagram.com/${w.username ?? ''}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">@{w.username ?? '—'}</a>
                      <span className="text-muted-foreground">{w.chances} chances</span>
                      {log[pool.key]?.guaranteed === w.participantId && <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-semibold">🏆 1º del ranking (seguro)</span>}
                      <span className="px-2 py-0.5 rounded-full bg-muted text-xs">{WINNER_STATUS[w.status] ?? w.status}</span>
                      {w.status === 'notified' && w.claimDeadline && (
                        <span className="text-xs text-muted-foreground">plazo: {new Date(w.claimDeadline).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      )}
                      {(w.status === 'verifying' || w.status === 'review') && (
                        <div className="basis-full rounded-md border border-dashed p-3 space-y-2">
                          <p className="font-medium">Verificar que puede asistir a Playroom</p>
                          <ul className="space-y-1 text-xs">
                            <li>{w.verify?.adult == null ? '⏳' : w.verify.adult ? '✅' : '❌'} +18 el día del evento: {w.verify?.birthDate ? `${w.verify.birthDate.split('-').reverse().join('/')} (${w.verify.age} años)` : 'esperando su fecha de nacimiento'}</li>
                            <li>{!w.verify?.rut ? '⏳' : w.verify.blocked ? '❌' : '✅'} Bloqueo de clientes: {w.verify?.rut ? `${w.verify.rut}${w.verify.blocked ? ` — BLOQUEADO${w.verify.blocked.reason ? ` (${w.verify.blocked.reason})` : ''}` : ' — no figura'}` : 'esperando su RUT'}</li>
                            <li>{w.verify?.acceptedAt ? '✅' : '⏳'} Aceptó valores y derecho de permanencia (ACEPTO)</li>
                            <li>
                              {follows[w.id] == null ? '❔' : follows[w.id] ? '✅' : '❌'} Sigue la cuenta y es un perfil real:{' '}
                              <a href={`https://instagram.com/${w.username ?? ''}`} target="_blank" rel="noreferrer" className="underline">ver perfil</a>{' · '}
                              <button className="underline" disabled={checkFollows.isPending} onClick={() => checkFollows.mutate({ winnerId: w.id })}>comprobar si nos sigue</button>
                            </li>
                          </ul>
                          {w.status === 'verifying' && w.claimDeadline && (
                            <p className="text-xs text-muted-foreground">Si no manda los datos antes del {new Date(w.claimDeadline).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}, pasa el suplente.</p>
                          )}
                          <div className="flex gap-2">
                            <WriteButton size="sm" disabled={approve.isPending || w.status !== 'review'}
                              onClick={() => {
                                const warn = w.verify?.blocked ? '\n\n⚠️ Su RUT figura en Bloqueo de clientes.' : w.verify?.adult === false ? '\n\n⚠️ Es menor de 18 años.' : '';
                                if (confirm(`¿Aprobar a @${w.username} y entregarle el premio?${warn}`)) approve.mutate({ winnerId: w.id });
                              }}>
                              Aprobar y entregar premio
                            </WriteButton>
                            <WriteButton size="sm" variant="outline" disabled={reject.isPending}
                              onClick={() => { const note = prompt(`Motivo del rechazo de @${w.username} (opcional, solo interno):`); if (note !== null) reject.mutate({ winnerId: w.id, note }); }}>
                              Rechazar y pasar al suplente
                            </WriteButton>
                          </div>
                        </div>
                      )}
                      {w.status === 'rejected' && w.verifyNote && <span className="text-xs text-muted-foreground">motivo: {w.verifyNote}</span>}
                      {w.prizeCode && (
                        <button className="font-mono text-xs inline-flex items-center gap-1 underline" onClick={() => copy(w.prizeCode!)}>
                          {w.prizeCode} <Copy className="w-3 h-3" />{w.prizeUsed && ' ✅ usado'}
                        </button>
                      )}
                      {w.choice && (
                        <span className="text-xs">
                          {w.choice === 'gift' ? '🎁 Eligió entrada para regalar' : `💸 Devolución ${clp(w.refundAmount ?? 0)} · ${w.refundStatus === 'done' ? 'hecha' : 'pendiente'}`}
                        </span>
                      )}
                      {w.status === 'choosing' && w.refundAmount != null && <span className="text-xs text-muted-foreground">devolución posible: {clp(w.refundAmount)}</span>}
                      {w.refundStatus === 'pending' && (
                        <>
                          {w.paymentId && <span className="text-xs font-mono text-muted-foreground">pago MP {w.paymentId}</span>}
                          <WriteButton size="sm" disabled={refund.isPending}
                            onClick={() => { if (confirm(`¿Ya devolviste ${clp(w.refundAmount ?? 0)} a @${w.username} en Mercado Pago? Se registrará en la orden (la entrada sigue válida) y se le avisará.`)) refund.mutate({ winnerId: w.id }); }}>
                            Marcar devuelto
                          </WriteButton>
                        </>
                      )}
                      {(w.status === 'notified' || w.status === 'delivered' || w.status === 'choosing' || w.status === 'verifying' || w.status === 'review') && (
                        <WriteButton size="sm" variant="ghost" className="ml-auto" disabled={skip.isPending}
                          onClick={() => { if (confirm(`¿Quitarle el premio a @${w.username} y pasar al siguiente suplente?`)) skip.mutate({ winnerId: w.id }); }}>
                          <SkipForward className="w-4 h-4" /> Pasar al suplente
                        </WriteButton>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
