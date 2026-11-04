import { trpc } from '@/lib/trpc';
import { GiftSheet } from './GiftSheet';

/** La hoja «Regalar» del panel (la barra de arriba y el atajo «Invitar» del «+» la abren desde cualquier pantalla). Trae al equipo solo
 * cuando se abre, para no pedir nada de más. La supervisora (`limited`) solo invita entradas y extras. */
export function GiftHost({ open, onClose, limited = false }: { open: boolean; onClose: () => void; limited?: boolean }) {
  const team = trpc.finance.staffList.useQuery(undefined, { enabled: open && !limited, retry: false });
  return <GiftSheet open={open} onClose={onClose} limited={limited} team={(team.data as any[]) ?? []} />;
}
