import { useState } from 'react';
import { toast } from 'sonner';
import { EyeOff, Eye, Loader2, ExternalLink, Trophy } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Card, CardContent } from '@/components/ui/card';

/* Galería del concurso de fotos / disfraz: el jurado (el admin) elige, en
 * orden, a los ganadores y suplentes. Los primeros N ganan (N = ganadores
 * configurados) y los siguientes son suplentes. Elegir cierra el concurso. */
export function ContestPhotoGallery({ contestId, winners, alternates, drawn, onChanged }: {
  contestId: number; winners: number; alternates: number; drawn: boolean; onChanged: () => void;
}) {
  const utils = trpc.useUtils();
  const entries = trpc.contests.photoEntries.useQuery({ id: contestId }, { refetchInterval: 30_000 });
  const [picked, setPicked] = useState<number[]>([]);
  const refresh = () => { utils.contests.photoEntries.invalidate({ id: contestId }); onChanged(); };
  const hide = trpc.contests.hidePhotoEntry.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const pick = trpc.contests.pickPhotoWinners.useMutation({
    onSuccess: (r) => { setPicked([]); refresh(); toast.success(`Listo: ${r.winners} ganador(es) y ${r.alternates} suplente(s). Se les avisó y empieza su verificación.`); },
    onError: (e) => toast.error(e.message),
  });
  const toggle = (id: number) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const list = entries.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-2 text-sm">
          <p>
            {list.length} foto{list.length === 1 ? '' : 's'} en la galería. {drawn
              ? 'Los ganadores ya fueron elegidos.'
              : `Marca en orden las fotos que ganan: las primeras ${winners} son ganadoras y las siguientes ${alternates} quedan de suplentes.`}
          </p>
          {!drawn && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-muted-foreground">Elegidas: <b>{picked.length}</b></span>
              <WriteButton disabled={picked.length === 0 || pick.isPending}
                onClick={() => { if (confirm(`¿Elegir ${Math.min(picked.length, winners)} ganador(es) y ${Math.max(0, Math.min(picked.length - winners, alternates))} suplente(s)? Se les avisa por DM y el concurso se cierra.`)) pick.mutate({ id: contestId, entryIds: picked }); }}>
                {pick.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />} Elegir ganadores y avisarles
              </WriteButton>
              {picked.length > 0 && <Button variant="ghost" size="sm" onClick={() => setPicked([])}>Limpiar</Button>}
            </div>
          )}
        </CardContent>
      </Card>
      {entries.isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      {list.length === 0 && !entries.isLoading && <p className="text-sm text-muted-foreground py-6 text-center">Todavía no hay fotos.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {list.map((e) => {
          const order = picked.indexOf(e.id);
          return (
            <div key={e.id} className={`rounded-xl border overflow-hidden ${e.hidden || e.disqualified ? 'opacity-40' : ''} ${order >= 0 ? 'border-primary border-2' : ''}`}>
              <button type="button" disabled={drawn || e.hidden || e.disqualified} onClick={() => toggle(e.id)} className="relative block w-full aspect-[3/4] bg-muted">
                <img src={e.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                {order >= 0 && (
                  <span className="absolute top-2 left-2 rounded-full bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5">
                    {order + 1}º {order < winners ? 'ganador' : 'suplente'}
                  </span>
                )}
                {e.winnerPosition !== null && <span className="absolute top-2 right-2 rounded-full bg-[var(--admin-success-bg)] text-[var(--admin-success-text)] text-xs font-bold px-2 py-0.5">🏆 {e.winnerPosition}º</span>}
              </button>
              <div className="p-2 flex items-center gap-2 text-xs">
                <a href={`https://instagram.com/${e.username ?? ''}`} target="_blank" rel="noreferrer" className="font-medium truncate hover:underline">@{e.username ?? e.igUserId}</a>
                <span className="text-muted-foreground">{e.kind === 'story' ? 'historia' : 'DM'}</span>
                <a href={e.imageUrl} target="_blank" rel="noreferrer" className="ml-auto" title="Abrir foto"><ExternalLink className="w-3.5 h-3.5" /></a>
                {!drawn && (
                  <button type="button" title={e.hidden ? 'Volver a mostrar' : 'Ocultar (no cuenta)'} onClick={() => hide.mutate({ entryId: e.id, hidden: !e.hidden })}>
                    {e.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
