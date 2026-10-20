import { useRef } from 'react';
import { toast } from 'sonner';
import { Loader2, MessageSquare, Download, Trophy } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { downloadSlide } from '@/components/admin/studio/exportSlides';
import type { ContestConfig } from '@shared/contest';

/* Pestaña «Ranking» del concurso: las dos tablas, el empuje automático
 * (comentario diario, respuestas públicas, tips por DM, correo a compradores)
 * y la imagen para historias. Lo que corre solo vive en
 * server/contestRanking.ts; acá solo se mira y se ajusta. */

const onError = (error: unknown) => {
  toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción.');
};

type Row = { position: number; username: string | null; points: number; probability: number };

const MEDAL = ['🥇', '🥈', '🥉'];

/** La imagen 9:16 para historias (1080×1920), dibujada fuera de pantalla y
 * capturada con el mismo método del Estudio. */
function StoryCard({ nodeRef, title, drawText, vipLabel, double, vip }: {
  nodeRef: React.RefObject<HTMLDivElement | null>; title: string; drawText: string; vipLabel: string; double: Row[]; vip: Row[];
}) {
  const list = (rows: Row[], n: number) => rows.slice(0, n).map((r) => (
    <div key={`${r.position}-${r.username}`} style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: 52, padding: '14px 0', borderBottom: '2px solid rgba(255,255,255,0.12)' }}>
      <span style={{ width: 90, textAlign: 'center' }}>{MEDAL[r.position - 1] ?? `${r.position}.`}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>@{r.username ?? '—'}</span>
      <span style={{ fontWeight: 800, color: '#ffb3e6' }}>{r.points} pts</span>
    </div>
  ));
  const section = (heading: string, rows: Row[], n: number) => rows.length === 0 ? null : (
    <div style={{ marginTop: 64 }}>
      <div style={{ fontSize: 56, fontWeight: 800, marginBottom: 12 }}>{heading}</div>
      {list(rows, n)}
    </div>
  );
  return (
    <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
      <div ref={nodeRef} style={{
        width: 1080, height: 1920, boxSizing: 'border-box', padding: '150px 80px', color: '#fff', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        background: 'radial-gradient(circle at 30% 0%, #5b1a58 0%, #1b0b24 55%, #0a0a0c 100%)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ fontSize: 40, letterSpacing: 10, color: '#ffb3e6', textTransform: 'uppercase' }}>Mansion Playroom</div>
        <div style={{ fontSize: 120, fontWeight: 900, lineHeight: 1.05, marginTop: 24 }}>🏆 RANKING</div>
        <div style={{ fontSize: 44, opacity: 0.8, marginTop: 16 }}>{title}</div>
        {section('🎟️ Entrada doble', double, 7)}
        {section(`⭐ ${vipLabel}`, vip, 4)}
        <div style={{ marginTop: 'auto', fontSize: 46, lineHeight: 1.3 }}>
          <div style={{ fontWeight: 800 }}>¿Cuántos puntos llevas?</div>
          <div style={{ opacity: 0.85 }}>Etiqueta amigos, comparte en tu historia e invita a comprar.</div>
          <div style={{ marginTop: 24, color: '#ffb3e6', fontWeight: 800 }}>Sorteo: {drawText}</div>
        </div>
      </div>
    </div>
  );
}

function Table({ title, rows, count }: { title: string; rows: Row[]; count: number }) {
  return (
    <div>
      <p className="font-semibold mb-2">{title} <span className="text-xs text-muted-foreground font-normal">· {count} participan</span></p>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay nadie.</p> : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.position}-${r.username}`} className="border-t">
                <td className="py-1.5 pr-2 w-8">{MEDAL[r.position - 1] ?? `${r.position}.`}</td>
                <td className="py-1.5 pr-2 font-medium">@{r.username ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.points} pts</td>
                <td className="py-1.5 text-right text-xs text-muted-foreground tabular-nums">≈{r.probability < 1 ? '<1' : Math.round(r.probability)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function ContestRankingPanel({ id, config, patch }: { id: number; config: ContestConfig; patch: (fn: (c: ContestConfig) => ContestConfig) => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.contests.rankingAdmin.useQuery({ id }, { refetchInterval: 60_000 });
  const cardRef = useRef<HTMLDivElement>(null);
  const publish = trpc.contests.publishRanking.useMutation({
    onSuccess: (r) => { utils.contests.rankingAdmin.invalidate({ id }); toast.success(`Ranking publicado en el reel (${r.posted}).`); },
    onError,
  });
  const download = async () => {
    if (!cardRef.current) return;
    try {
      await downloadSlide(cardRef.current, 'ranking-concurso.png');
    } catch (err) {
      onError(err);
    }
  };
  const r = config.ranking;
  const set = (patchRanking: Partial<ContestConfig['ranking']>) => patch((c) => ({ ...c, ranking: { ...c.ranking, ...patchRanking } }));

  if (isLoading || !data) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <StoryCard nodeRef={cardRef} title={data.title} drawText={data.drawText} vipLabel={data.vipLabel} double={data.double} vip={data.vip} />

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="w-4 h-4" /> Ranking en vivo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <WriteButton variant="outline" disabled={publish.isPending} onClick={() => publish.mutate({ id })}>
              {publish.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />} Publicar ranking en el reel ahora
            </WriteButton>
            <Button variant="outline" onClick={download}><Download className="w-4 h-4" /> Descargar imagen para historias (9:16)</Button>
            <a href="/concurso" target="_blank" rel="noreferrer" className="text-sm underline self-center">Ver la página pública</a>
          </div>
          <p className="text-xs text-muted-foreground">
            Hoy: comentario diario {data.today.posted ? 'ya publicado ✅' : 'pendiente'} · {data.today.replies} respuestas públicas · {data.today.mails} correos a compradores en total.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <Table title="🎟️ Entrada doble" rows={data.double} count={data.counts.double} />
            <Table title={`⭐ ${data.vipLabel}`} rows={data.vip} count={data.counts.vip} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Empuje automático</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={r.dailyComment} onCheckedChange={(v) => set({ dailyComment: v })} />
              Comentario diario con el top (con @) en el reel, a las
            </label>
            <Input type="number" min={0} max={23} className="w-20" value={r.dailyHour} onChange={(e) => set({ dailyHour: Number(e.target.value) })} />
            <span className="text-sm text-muted-foreground">h (Chile). El día del sorteo sale 2 h antes.</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={r.publicReplies} onCheckedChange={(v) => set({ publicReplies: v })} />
              Responder en público a quienes están cerca de subir, máximo
            </label>
            <Input type="number" min={0} max={100} className="w-20" value={r.maxRepliesPerDay} onChange={(e) => set({ maxRepliesPerDay: Number(e.target.value) })} />
            <span className="text-sm text-muted-foreground">al día (entre 10:00 y 22:00).</span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={r.dmTips} onCheckedChange={(v) => set({ dmTips: v })} />
            Cuando un participante escribe por DM, mandarle su posición y tips (una vez al día)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={r.emailBuyers} onCheckedChange={(v) => set({ emailBuyers: v })} />
            Correo a quienes ya compraron el día antes del sorteo (respeta la reserva de correos para las confirmaciones)
          </label>
          <Label className="text-xs text-muted-foreground block">Recuerda guardar los cambios (barra de abajo).</Label>
        </CardContent>
      </Card>
    </div>
  );
}
