import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, BadgeCheck, Instagram, MessageCircle, UserCheck, UserX } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useIsDemo, DEMO_TOOLTIP } from '@/lib/demoMode';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/admin/EmptyState';
import { TableSkeleton } from '@/components/admin/TableSkeleton';
import { SOLTERO_STATUS_LABEL, type SolteroStatus } from '@shared/soltero';
import { formatChileShortDate } from '@shared/chileDate';

/* Clientes → Solteros: las solicitudes que llegan desde la app («Mi cuenta» →
 * Acceso Soltero). Aprobado, la persona compra Soltero sin
 * código con su sesión (el Dúo de dos hombres siempre pide código); se puede revocar cuando sea (server/solteros.ts). */

const pill = 'rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95 disabled:opacity-60';
const pillOn = 'bg-pink-500 text-white shadow-sm';
const pillOff = 'bg-black/5 text-[var(--admin-muted)] hover:bg-black/10';
const onErr = (e: unknown) => toast.error((e as { message?: string })?.message || 'No se pudo completar la acción');
const dial = (p: string | null) => (p ?? '').replace(/[^\d]/g, '');

type Tab = 'pendiente' | 'aprobado' | 'otros';
const STATUS_TONE: Record<SolteroStatus, string> = {
  pendiente: 'bg-amber-500/20 text-amber-800',
  aprobado: 'bg-emerald-500/15 text-emerald-700',
  rechazado: 'bg-black/5 text-[var(--admin-muted)]',
  revocado: 'bg-red-500/15 text-red-700',
};

export function SolterosManager() {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.solteros.list.useQuery();
  const [tab, setTab] = useState<Tab>('pendiente');
  const [direct, setDirect] = useState({ email: '', fullName: '' });
  const review = trpc.solteros.review.useMutation({
    onSuccess: (r) => { utils.solteros.list.invalidate(); toast.success(r.status === 'aprobado' ? 'Aprobado · le avisamos por push y correo' : `Quedó ${SOLTERO_STATUS_LABEL[r.status as SolteroStatus].toLowerCase()}`); },
    onError: onErr,
  });
  const approveDirect = trpc.solteros.approveDirect.useMutation({
    onSuccess: () => { utils.solteros.list.invalidate(); setDirect({ email: '', fullName: '' }); toast.success('Aprobado · le avisamos por correo'); },
    onError: onErr,
  });

  const rows: any[] = data ?? [];
  const counts = useMemo(() => ({
    pendiente: rows.filter((r) => r.status === 'pendiente').length,
    aprobado: rows.filter((r) => r.status === 'aprobado').length,
    otros: rows.filter((r) => r.status === 'rechazado' || r.status === 'revocado').length,
  }), [rows]);
  const list = rows.filter((r) => (tab === 'otros' ? r.status === 'rechazado' || r.status === 'revocado' : r.status === tab));

  const decide = (id: number, decision: 'aprobar' | 'rechazar' | 'revocar', name: string) => {
    if (decision === 'aprobar') { review.mutate({ id, decision }); return; }
    const note = window.prompt(decision === 'revocar' ? `¿Por qué revocas a ${name}? (solo lo ves tú)` : `Motivo del rechazo de ${name} (opcional, solo lo ves tú)`);
    if (note === null) return;
    review.mutate({ id, decision, note: note || null });
  };

  return (
    <Card className="admin-clay border-0">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5" /> Solteros</CardTitle>
        <p className="text-sm text-[var(--admin-muted)]">
          Los hombres que vienen solos piden su aprobación desde su app. Aprobados, compran el acceso Soltero sin código (con el mismo correo de su cuenta). El Dúo de dos hombres es solo para parejas y siempre pide código de comunidad, aunque estén aprobados. El código sigue funcionando para quien no está aprobado.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {([['pendiente', 'Por revisar'], ['aprobado', 'Aprobados'], ['otros', 'Rechazados y revocados']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`${pill} ${tab === k ? pillOn : pillOff}`}>{label} ({counts[k]})</button>
          ))}
        </div>

        {isLoading && <TableSkeleton rows={4} />}
        {!isLoading && list.length === 0 && (
          <EmptyState icon={UserCheck} title={tab === 'pendiente' ? 'No hay solicitudes por revisar' : 'Nadie en esta lista'} description="Las solicitudes llegan desde «Mi cuenta» → Acceso Soltero. Te avisamos por push." />
        )}

        <div className="space-y-2">
          {list.map((r) => (
            <div key={r.id} className="admin-clay-sm space-y-2 p-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-[12rem] flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {r.fullName || r.email}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[r.status as SolteroStatus]}`}>{SOLTERO_STATUS_LABEL[r.status as SolteroStatus]}</span>
                    {r.blocked === 'block' && <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-700"><AlertTriangle className="h-3 w-3" /> En lista de bloqueados</span>}
                    {r.blocked === 'review' && <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-800"><AlertTriangle className="h-3 w-3" /> Nombre parecido a un bloqueado</span>}
                  </p>
                  <p className="text-xs text-[var(--admin-muted)]">{[r.email, r.rut, r.requestedAt ? `pidió ${formatChileShortDate(new Date(r.requestedAt))}` : null].filter(Boolean).join(' · ')}</p>
                  {r.referredBy && <p className="text-xs"><span className="text-[var(--admin-muted)]">Lo recomienda:</span> {r.referredBy}</p>}
                  {r.message && <p className="text-xs italic text-[var(--admin-muted)]">“{r.message}”</p>}
                  {r.adminNote && <p className="text-xs text-[var(--admin-muted)]">Nota: {r.adminNote}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.instagram && <a href={`https://instagram.com/${r.instagram}`} target="_blank" rel="noopener noreferrer" className={`${pill} ${pillOff} flex items-center gap-1`}><Instagram className="h-3.5 w-3.5" /> @{r.instagram}</a>}
                  {r.phone && <a href={`https://wa.me/${dial(r.phone)}`} target="_blank" rel="noopener noreferrer" className={`${pill} ${pillOff} flex items-center gap-1`}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.status !== 'aprobado' && (
                  <button type="button" disabled={isDemo || review.isPending} title={isDemo ? DEMO_TOOLTIP : undefined} onClick={() => decide(r.id, 'aprobar', r.fullName || r.email)} className={`${pill} flex items-center gap-1 bg-emerald-500 text-white`}><BadgeCheck className="h-4 w-4" /> Aprobar</button>
                )}
                {r.status === 'pendiente' && (
                  <button type="button" disabled={isDemo || review.isPending} onClick={() => decide(r.id, 'rechazar', r.fullName || r.email)} className={`${pill} ${pillOff} flex items-center gap-1`}><UserX className="h-4 w-4" /> Rechazar</button>
                )}
                {r.status === 'aprobado' && (
                  <button type="button" disabled={isDemo || review.isPending} onClick={() => decide(r.id, 'revocar', r.fullName || r.email)} className={`${pill} ${pillOff} flex items-center gap-1 text-red-700`}><UserX className="h-4 w-4" /> Revocar</button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-black/5 pt-3">
          <p className="text-sm font-semibold">Aprobar directo</p>
          <p className="text-xs text-[var(--admin-muted)]">Para alguien que ya validaste por otro lado (por ejemplo, por WhatsApp). Usa el correo con que entra a su app.</p>
          <div className="flex flex-wrap gap-2">
            <Input type="email" inputMode="email" autoCapitalize="none" placeholder="correo@de.su.cuenta" className="min-w-[14rem] flex-1" value={direct.email} onChange={(e) => setDirect({ ...direct, email: e.target.value })} />
            <Input placeholder="Nombre (opcional)" className="min-w-[10rem] flex-1" value={direct.fullName} onChange={(e) => setDirect({ ...direct, fullName: e.target.value })} />
            <button type="button" disabled={isDemo || !direct.email.includes('@') || approveDirect.isPending} onClick={() => approveDirect.mutate({ email: direct.email.trim(), fullName: direct.fullName.trim() || null })} className={`${pill} ${pillOn} px-5`}>Aprobar</button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
