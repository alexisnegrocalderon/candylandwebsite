import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Camera, Check, Copy, Heart, Loader2, Search, Smartphone, Sparkles, Target, UserCheck, Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';

/* La pantalla de los anfitriones de Playmatch (cargo «Anfitrión Playmatch» en el Staff): ayudar a que la gente baje la
 * App, entre a Playmatch y arme su perfil, y ver cómo va la noche contra la meta. No muestra nada privado: alias, o el
 * nombre con el apellido abreviado, y qué le falta a cada persona. */

/** El query solo trae algo si la persona es anfitrión de Playmatch (o el dueño, para probarlo). */
export function useStaffPlaymatchHost() {
  const { data } = trpc.member.playmatchHost.useQuery(undefined, { retry: false, staleTime: 60_000 });
  return data ?? null;
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="account-glass rounded-[24px] p-4">
      <h3 className="mb-3 flex items-center gap-2 text-footnote font-semibold uppercase tracking-wider text-white/55">{icon}{title}</h3>
      {children}
    </section>
  );
}

function Bar({ label, value, goal, tone = 'bg-pink-400' }: { label: string; value: number; goal?: number; tone?: string }) {
  const pct = goal ? Math.min(100, Math.round((value / goal) * 100)) : 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-subhead">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-white/70">{value.toLocaleString('es-CL')}{goal ? ` / ${goal.toLocaleString('es-CL')}` : ''}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={value} aria-valuemax={goal ?? value} aria-label={label}>
        <div className={`h-full rounded-full transition-all duration-500 ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function StaffPlaymatchHost() {
  // Esta pantalla pide los números cada 10 segundos mientras está abierta.
  const { data, isLoading } = trpc.member.playmatchHost.useQuery(undefined, { retry: false, refetchInterval: 10_000 });
  const appUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/app`;
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!appUrl) return;
    let on = true;
    QRCode.toDataURL(appUrl, { width: 720, margin: 1, errorCorrectionLevel: 'M' }).then((url) => { if (on) setQr(url); }).catch(() => {});
    return () => { on = false; };
  }, [appUrl]);

  if (isLoading) return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>;
  if (!data) return <p className="rounded-2xl bg-white/5 p-4 text-subhead text-white/65">Esta pantalla es solo para los anfitriones de Playmatch. Si te toca serlo, pídele a producción que te asigne el cargo.</p>;

  const f = data.funnel;
  const copy = () => { void navigator.clipboard.writeText(appUrl).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }).catch(() => toast.error('No se pudo copiar')); };

  return (
    <div className="space-y-3 pb-4">
      <div>
        <p className="text-title3 font-bold leading-tight">💘 Anfitrión Playmatch</p>
        <p className="text-footnote text-white/60">{data.eventTitle}{data.playmatchOn ? '' : ' · Playmatch está en pausa'}</p>
      </div>

      <Section icon={<Smartphone className="h-4 w-4" />} title="Bajar la App y entrar">
        <p className="mb-3 text-subhead text-white/80">Que escaneen este QR con la cámara: abre la página para instalar la App. Con el brillo de tu pantalla al máximo se lee de lejos.</p>
        <div className="mx-auto w-full max-w-[300px] rounded-[28px] bg-white p-3">
          {qr ? <img src={qr} alt="QR para bajar la App" className="w-full" /> : <div className="grid aspect-square place-items-center"><Loader2 className="h-6 w-6 animate-spin text-black/40" /></div>}
        </div>
        <button type="button" onClick={copy} className="mt-3 flex w-full min-w-0 items-center justify-between gap-2 rounded-2xl bg-white/[0.08] px-4 py-3 text-left interactive">
          <span className="min-w-0"><span className="block text-caption2 text-white/55">{copied ? '¡Copiado!' : 'O mándales el link'}</span><span className="block truncate text-subhead font-semibold">{appUrl.replace(/^https?:\/\//, '')}</span></span>
          {copied ? <Check className="h-4 w-4 shrink-0 text-emerald-300" /> : <Copy className="h-4 w-4 shrink-0 text-white/60" />}
        </button>
        <div className="mt-4 space-y-3">
          <Bar label="Entradas" value={f.tickets} tone="bg-white/40" />
          <Bar label="Ya abrieron la App" value={f.installed} goal={Math.max(f.tickets, 1)} tone="bg-sky-400" />
          <Bar label="Ya entraron a la fiesta" value={f.entered} goal={Math.max(f.tickets, 1)} tone="bg-violet-400" />
          <Bar label="Ya armaron su perfil" value={f.profiles} goal={Math.max(f.entered, 1)} tone="bg-pink-400" />
        </div>
        {data.pending.withoutProfile > 0 && <p className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-footnote text-amber-100">Hay {data.pending.withoutProfile} {data.pending.withoutProfile === 1 ? 'persona adentro' : 'personas adentro'} que todavía no arma su perfil: ahí es donde ayudas.</p>}
      </Section>

      <HelpProfiles />

      <Section icon={<Target className="h-4 w-4" />} title="Meta de la noche">
        <div className="space-y-3">
          <Bar label="Perfiles creados" value={f.profiles} goal={data.goal.profiles} tone="bg-pink-400" />
          <Bar label="Con foto (ya juegan)" value={f.withPhoto} goal={data.goal.photos} tone="bg-fuchsia-400" />
          <Bar label="Matches" value={f.matches} goal={data.goal.matches} tone="bg-emerald-400" />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-footnote text-white/60"><Heart className="h-3.5 w-3.5 text-pink-300" /> {data.pending.withoutPhoto === 0 ? "Todos los que tienen perfil ya subieron su foto." : `${data.pending.withoutPhoto === 1 ? "Falta 1 persona" : `Faltan ${data.pending.withoutPhoto} personas`} con perfil pero sin foto: son las más fáciles de sumar.`}</p>
      </Section>
    </div>
  );
}

/** Buscar a alguien y ver qué le falta; si ya tiene perfil, mandarle un aviso para que lo termine. */
function HelpProfiles() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = window.setTimeout(() => setTerm(q.trim()), 300); return () => window.clearTimeout(t); }, [q]);
  const list = trpc.member.playmatchHostSearch.useQuery({ q: term }, { retry: false, placeholderData: (prev) => prev, refetchInterval: 15_000 });
  const nudge = trpc.member.playmatchHostNudge.useMutation({
    onSuccess: () => toast.success('Aviso enviado 📲'),
    onError: (e) => toast.error(e.message),
  });
  const [sent, setSent] = useState<Set<number>>(new Set());

  return (
    <Section icon={<UserCheck className="h-4 w-4" />} title="Ayudar a armar el perfil">
      <p className="mb-3 text-subhead text-white/80">{term ? 'Resultados de tu búsqueda.' : 'Estas personas ya están adentro y les falta algo.'} Busca por alias o por nombre.</p>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar a alguien" maxLength={60} className="h-12 w-full rounded-full bg-white/[0.08] pl-11 pr-4 text-body text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-pink-400/60" />
      </div>
      {list.isLoading ? <div className="grid place-items-center py-6"><Loader2 className="h-5 w-5 animate-spin text-white/60" /></div> : (list.data?.length ?? 0) === 0 ? (
        <p className="rounded-2xl bg-white/[0.05] p-4 text-center text-subhead text-white/65">{term ? 'Nadie coincide.' : 'Por ahora a todos los de adentro no les falta nada. ¡Buen trabajo!'}</p>
      ) : (
        <ul className="space-y-2">
          {list.data!.map((p) => {
            const what = !p.hasPhoto ? 'photo' as const : 'tastes' as const;
            const canNudge = p.profileId != null && (!p.hasPhoto || !p.hasTastes);
            return (
              <li key={p.ticketId} className="rounded-2xl bg-white/[0.06] p-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10"><Users className="h-4 w-4 text-white/70" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-headline font-bold">{p.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge ok={p.entered} yes="Entró" no="No ha entrado" />
                      <Badge ok={p.hasProfile} yes="Perfil" no="Sin perfil" />
                      {p.hasProfile && <Badge ok={p.hasPhoto} yes="Foto" no="Sin foto" icon={<Camera className="h-3 w-3" />} />}
                      {p.hasProfile && <Badge ok={p.hasTastes} yes="Gustos" no="Sin gustos" icon={<Sparkles className="h-3 w-3" />} />}
                    </div>
                  </div>
                  {canNudge && (
                    <button type="button" disabled={nudge.isPending || sent.has(p.profileId!)}
                      onClick={() => nudge.mutate({ profileId: p.profileId!, what }, { onSuccess: () => setSent((s) => new Set(s).add(p.profileId!)) })}
                      className="shrink-0 rounded-full bg-pink-500/90 px-3.5 py-2 text-footnote font-bold text-white interactive disabled:opacity-50">
                      {sent.has(p.profileId!) ? 'Avisado' : what === 'photo' ? 'Avisar foto' : 'Avisar gustos'}
                    </button>
                  )}
                </div>
                {!p.hasProfile && <p className="mt-2 text-caption1 text-white/55">{p.entered ? 'Ya está adentro pero no armó su perfil: muéstrale el QR de arriba o ayúdale a abrir la App.' : 'Todavía no pasa por la puerta.'}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function Badge({ ok, yes, no, icon }: { ok: boolean; yes: string; no: string; icon?: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption2 font-semibold ${ok ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-200'}`}>
      {ok ? <Check className="h-3 w-3" /> : icon}{ok ? yes : no}
    </span>
  );
}
