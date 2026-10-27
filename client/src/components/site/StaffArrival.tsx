import { useState } from 'react';
import { toast } from 'sonner';
import { BadgeCheck, Car, MapPin, Undo2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatChileTime } from '@shared/chileDate';

/** «Llegué»: el staff (y el administrador) marcan su llegada desde su propia app. Queda adentro y contado, con su
 * entrada «Staff» usada, Playmatch abierto y, si vino en auto, su estacionamiento sin cobro. */
export function StaffArrival() {
  const utils = trpc.useUtils();
  const { data } = trpc.member.staffArrival.useQuery(undefined, { retry: false, staleTime: 30_000, refetchInterval: 60_000 });
  const [enAuto, setEnAuto] = useState(false);
  const done = () => { utils.member.staffArrival.invalidate(); utils.member.me.invalidate(); };
  const check = trpc.member.staffCheckIn.useMutation({
    onSuccess: (r) => {
      toast.success(r.parking === 'dado' ? '¡Llegaste! Tu estacionamiento quedó sin cobro.' : r.parking === 'sin_producto' ? '¡Llegaste! (No hay estacionamiento configurado: avisa al administrador.)' : '¡Llegaste! Ya estás adentro.');
      done();
    },
    onError: (e) => toast.error(e.message),
  });
  const undo = trpc.member.staffUndoCheckIn.useMutation({ onSuccess: () => { toast.success('Listo, lo deshice.'); done(); }, onError: (e) => toast.error(e.message) });

  if (!data) return null;
  const box = 'rounded-[24px] bg-gradient-to-br from-emerald-400/60 via-teal-400/40 to-sky-400/50 p-[1.5px]';
  const inner = 'rounded-[23px] bg-[#0b1a17] p-4';

  if (data.arrivedAt) {
    return (
      <div className={box}>
        <div className={inner}>
          <p className="flex items-center gap-1.5 text-callout font-bold text-emerald-300"><BadgeCheck className="h-5 w-5" /> Llegaste a las {formatChileTime(data.arrivedAt)}</p>
          <p className="mt-1 text-footnote text-white/70">
            Tu entrada Staff está usada y cuentas en la fiesta. Playmatch ya está abierto{data.withCar ? ' y tu estacionamiento quedó sin cobro 🚗' : ''}.
          </p>
          {data.canUndo && (
            <button type="button" onClick={() => undo.mutate()} disabled={undo.isPending} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-subhead font-semibold disabled:opacity-50">
              <Undo2 className="h-4 w-4" /> {undo.isPending ? 'Deshaciendo…' : 'Me equivoqué, deshacer'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (data.phase === 'cerrado') return null;
  const opensAt = data.opensAt ? formatChileTime(data.opensAt) : '';

  return (
    <div className={box}>
      <div className={inner}>
        <p className="flex items-center gap-1.5 text-callout font-bold"><MapPin className="h-5 w-5 text-emerald-300" /> Tu llegada</p>
        {data.phase === 'antes' ? (
          <p className="mt-1 text-footnote text-white/70">Podrás marcar «Llegué» desde las {opensAt}. Tu entrada Staff ya está en «Mis entradas».</p>
        ) : (
          <>
            <p className="mt-1 text-footnote text-white/70">Toca cuando llegues: quedas adentro, cuentas en la fiesta y se abre Playmatch.</p>
            {data.parkingAvailable && (
              <label className="mt-3 flex items-center gap-2.5 rounded-2xl bg-white/5 px-3 py-2.5 text-subhead">
                <input type="checkbox" checked={enAuto} onChange={(e) => setEnAuto(e.target.checked)} className="h-5 w-5 accent-emerald-400" />
                <Car className="h-5 w-5 text-emerald-300" /> Vine en auto <span className="text-footnote text-white/50">(sin cobro)</span>
              </label>
            )}
            <button type="button" onClick={() => check.mutate({ enAuto: enAuto && data.parkingAvailable })} disabled={check.isPending}
              className="mt-3 h-14 w-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 text-body font-extrabold text-black disabled:opacity-60">
              {check.isPending ? 'Marcando…' : '📍 Llegué'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
