import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Check, Copy, Crown, Link2 } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../../server/routers';
import { trpc } from '@/lib/trpc';
import { AmbassadorContent } from './AmbassadorContent';

/* La parte de embajador de «Mi cuenta»: si el correo con el que entró es de
 * un embajador activo, ve acá sus números del evento, su link y su código, y
 * todo el contenido aprobado para compartir -- sin tener que acordarse de
 * /embajador/<CODIGO>. Los datos son los mismos del panel por código
 * (server/ambassadorProgram.ts → getAmbassadorPanel). */

export type AmbassadorPanel = NonNullable<inferRouterOutputs<AppRouter>['member']['ambassador']>;

/** `null` mientras carga o si no es embajador: «Mi cuenta» queda igual que siempre. */
export function useAmbassadorPanel(): AmbassadorPanel | null {
  const { data } = trpc.member.ambassador.useQuery(undefined, { retry: false, staleTime: 60_000 });
  return data ?? null;
}

function CopyChip({ text, label, mono = false }: { text: string; label: string; mono?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); }).catch(() => {}); }}
      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-2xl bg-white/[0.08] px-4 py-3 text-left interactive"
    >
      <span className="min-w-0">
        <span className="block text-[11px] text-white/55">{done ? '¡Copiado!' : label}</span>
        <span className={`block truncate text-sm font-semibold ${mono ? 'font-mono' : ''}`}>{text}</span>
      </span>
      {done ? <Check className="h-4 w-4 shrink-0 text-emerald-300" /> : <Copy className="h-4 w-4 shrink-0 text-white/60" />}
    </button>
  );
}

/** Resumen corto: lo que más importa a la vista, con lo demás a un toque. */
export function AmbassadorSummary({ panel }: { panel: AmbassadorPanel }) {
  const stats = panel.stats;
  return (
    <div className="account-glass space-y-3 rounded-[26px] p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-sky-500"><Crown className="h-4 w-4 text-white" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight">Eres embajador{panel.name ? `: ${panel.name}` : ''}</p>
          {stats && <p className="truncate text-xs text-white/55">{stats.eventTitle}</p>}
        </div>
      </div>
      {stats && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white/[0.06] px-2 py-2.5"><p className="text-lg font-bold leading-none">{stats.eventSales}</p><p className="mt-1 text-[10.5px] text-white/55">ventas</p></div>
          <div className="rounded-2xl bg-white/[0.06] px-2 py-2.5"><p className="text-lg font-bold leading-none text-pink-300">{stats.currentPercent}%</p><p className="mt-1 text-[10.5px] text-white/55">comisión</p></div>
          <div className="rounded-2xl bg-white/[0.06] px-2 py-2.5"><p className="text-lg font-bold leading-none">${(panel.eventStats?.commission ?? stats.eventCommission ?? 0).toLocaleString('es-CL')}</p><p className="mt-1 text-[10.5px] text-white/55">ganado</p></div>
        </div>
      )}
      {stats?.nextTarget && (
        <p className="text-xs text-white/60">Te faltan <strong className="text-white">{stats.nextTarget.salesNeeded}</strong> venta{stats.nextTarget.salesNeeded === 1 ? '' : 's'} para subir al <strong className="text-pink-300">{stats.nextTarget.nextPercent}%</strong>.</p>
      )}
      <div className="grid gap-2">
        {panel.referralUrl && <CopyChip text={panel.referralUrl} label="Tu link (para el sticker «Enlace» o WhatsApp)" />}
        <CopyChip text={panel.code} label="Tu código" mono />
      </div>
      <Link href={`/embajador/${panel.code}`} className="flex items-center justify-center gap-1.5 text-xs font-semibold text-pink-300">
        <Link2 className="h-3.5 w-3.5" /> Ver todas mis ventas y beneficios <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/** Resumen + todo el contenido para compartir. */
export function AmbassadorAccount({ panel }: { panel: AmbassadorPanel }) {
  return (
    <div className="space-y-4">
      <AmbassadorSummary panel={panel} />
      <AmbassadorContent code={panel.code} events={panel.contentEvents ?? []} items={panel.contentItems ?? []} material={panel.weeklyMaterial ?? null} />
    </div>
  );
}
