import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../../../server/routers';

type Estado = inferRouterOutputs<AppRouter>['insumos']['estado'];
/** La foto de la barra cuando la base ya tiene las tablas de insumos. */
export type BarraData = Extract<Estado, { ready: true }>;
export type BarraInsumo = BarraData['insumos'][number];
export type BarraProducto = BarraData['productos'][number];

export const LEVEL_STYLE: Record<BarraInsumo['level'], { label: string; className: string }> = {
  agotado: { label: 'Agotado', className: 'bg-red-500/15 text-red-500' },
  bajo: { label: 'Queda poco', className: 'bg-amber-500/15 text-amber-500' },
  ok: { label: 'OK', className: 'bg-emerald-500/15 text-emerald-500' },
  sin_uso: { label: 'Sin receta', className: 'bg-muted text-muted-foreground' },
};

export const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
