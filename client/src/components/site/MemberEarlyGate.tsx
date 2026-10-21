import { Crown } from 'lucide-react';
import { MemberLogin } from '@/components/site/MemberLogin';
import { fmtDateTime } from '@/lib/member';

/* Preventa anticipada de socios (events.memberEarlyUntil): hasta esa fecha
 * las entradas las compra quien entró a «Mi cuenta». El servidor lo exige
 * también al crear la orden; esto es la puerta amable. */
export function MemberEarlyGate({ event }: { event: { title: string; memberEarlyUntil?: string | Date | null } }) {
  return (
    <div className="min-h-dvh pt-28 pb-16">
      <div className="container max-w-md space-y-6">
        <div className="text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary"><Crown className="h-7 w-7" /></span>
          <h1 className="font-heading text-3xl font-extrabold leading-tight">Preventa para socios</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Las entradas de <b className="text-foreground">{event.title}</b> están abiertas por adelantado para quienes tienen cuenta. Se abren para todos el <b className="text-foreground">{fmtDateTime(event.memberEarlyUntil)}</b>.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <p className="text-sm font-medium">Entra con el correo de tus compras</p>
          <MemberLogin />
        </div>
        <p className="text-center text-xs text-muted-foreground">La cuenta es opcional y sin contraseña: te mandamos un código al correo. Solo pueden entrar quienes ya compraron con nosotros.</p>
      </div>
    </div>
  );
}
