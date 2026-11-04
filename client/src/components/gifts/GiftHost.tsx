import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { GiftSheet } from './GiftSheet';
import { onGiftRequest } from './giftRequest';

/** La hoja «Regalar» lista para abrirse desde el «+» (atajo «Invitar») en cualquier pantalla del panel. Trae al equipo solo
 * cuando se abre, para no pedir nada de más. */
export function GiftHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => onGiftRequest(() => setOpen(true)), []);
  const team = trpc.finance.staffList.useQuery(undefined, { enabled: open, retry: false });
  return <GiftSheet open={open} onClose={() => setOpen(false)} team={(team.data as any[]) ?? []} />;
}
