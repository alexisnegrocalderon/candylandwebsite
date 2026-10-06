import { useState } from 'react';
import { toast } from 'sonner';
import { Link2, CheckCircle2, Search } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { WriteButton } from '@/components/admin/WriteButton';

/** Aviso en la conversación de Instagram: si la persona dijo que ya compró y su
 * @ no está en ninguna ficha de cliente, propone a quién vincular (compradores
 * reales del próximo evento) y deja buscar a mano. Nada se vincula sin tocar
 * el botón. */
export function IgCustomerLinkCard({ threadId }: { threadId: number }) {
  const utils = trpc.useUtils();
  const { data } = trpc.instagram.customerLink.useQuery({ threadId });
  const [search, setSearch] = useState('');
  const { data: found } = trpc.instagram.searchCustomersToLink.useQuery({ search }, { enabled: search.trim().length >= 2 });
  const link = trpc.instagram.linkCustomer.useMutation({
    onSuccess: () => {
      toast.success('Listo, el @ quedó guardado en la ficha del cliente.');
      utils.instagram.customerLink.invalidate({ threadId });
      utils.instagram.listThreads.invalidate();
    },
    onError: (e) => toast.error(e.message || 'No se pudo vincular.'),
  });

  if (!data) return null;
  if (data.linked) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Vinculado a la ficha de {data.linked.fullName ?? data.linked.email}
      </p>
    );
  }
  if (!data.saysBought) return null;

  const Row = ({ customerId, title, detail }: { customerId: number; title: string; detail: string }) => (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-background p-2.5">
      <div className="min-w-0 text-sm">
        <p className="font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{detail}</p>
      </div>
      <WriteButton size="sm" disabled={link.isPending || !data.canLink} onClick={() => link.mutate({ threadId, customerId })}>Sí, vincular</WriteButton>
    </div>
  );

  return (
    <div className="rounded-2xl border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
      <p className="text-sm font-medium flex items-center gap-2"><Link2 className="w-4 h-4" /> Dice que ya compró y este @ no está en ninguna ficha de cliente</p>
      {!data.canLink && <p className="text-xs text-muted-foreground">Esta conversación no trae @ de Instagram, así que no se puede vincular.</p>}
      {data.suggestions.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Posibles compradores{data.eventTitle ? ` de ${data.eventTitle}` : ''} (revisa que sea la persona):</p>
          {data.suggestions.map((s) => (
            <Row key={s.customerId} customerId={s.customerId} title={s.fullName ?? s.email} detail={`${s.email} · ${s.tickets || 'orden ' + s.orderNumber}`} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No encontré a nadie parecido entre los compradores. Búscalo a mano:</p>
      )}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar cliente por nombre o correo" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {found && found.length > 0 && (
        <div className="space-y-1.5">
          {found.map((c) => <Row key={c.customerId} customerId={c.customerId} title={c.fullName ?? c.email} detail={`${c.email}${c.instagram ? ' · ya tiene ' + c.instagram : ''}`} />)}
        </div>
      )}
    </div>
  );
}
