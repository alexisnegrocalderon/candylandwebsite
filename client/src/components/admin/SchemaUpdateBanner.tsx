import { useState } from 'react';
import { toast } from 'sonner';
import { DatabaseZap } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useIsDemo } from '@/lib/demoMode';
import { AdminPasswordDialog } from '@/components/admin/AdminPasswordDialog';

/** ¿La base ya tiene las columnas del staff unificado (migración 0129)? Mientras no, Staff no puede guardar. */
export function useStaffSchema() {
  const isDemo = useIsDemo();
  const { data } = trpc.finance.staffSchema.useQuery(undefined, { enabled: !isDemo, retry: false, staleTime: 60_000 });
  return { ready: data?.ready ?? true, missing: data?.missing ?? [] };
}

/** Aviso (solo cuando falta) con el botón que agrega las columnas nuevas. Pide la clave de admin: cambia la base. */
export function SchemaUpdateBanner() {
  const utils = trpc.useUtils();
  const { ready, missing } = useStaffSchema();
  const [open, setOpen] = useState(false);
  const apply = trpc.finance.staffSchemaApply.useMutation({
    onSuccess: (r) => {
      utils.finance.staffSchema.invalidate();
      utils.finance.staffList.invalidate();
      utils.operators.listAll.invalidate();
      toast.success(r.applied.length ? 'Base de datos actualizada: ya puedes agregar staff' : 'La base ya estaba al día');
    },
    onError: (e) => toast.error(e.message || 'No se pudo actualizar la base'),
  });
  if (ready) return null;
  return (
    <>
      <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
        <DatabaseZap className="h-6 w-6 shrink-0 text-amber-300" />
        <div className="min-w-[14rem] flex-1">
          <p className="font-semibold">Falta actualizar la base de datos</p>
          <p className="text-sm text-muted-foreground">
            El staff nuevo necesita {missing.length} {missing.length === 1 ? 'cambio' : 'cambios'} en la base (solo agrega columnas, no toca tus datos). Hasta que se aplique, no se puede agregar staff.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} disabled={apply.isPending}
          className="rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-black transition active:scale-95 disabled:opacity-60">
          {apply.isPending ? 'Actualizando…' : 'Actualizar ahora'}
        </button>
      </div>
      <AdminPasswordDialog
        open={open} title="Actualizar la base de datos" actionLabel="Actualizar"
        description="Agrega las columnas del staff nuevo (correo, cargo y PIN). No borra ni cambia nada de lo que ya hay. Confirma con tu clave de admin."
        onConfirm={(adminPassword) => apply.mutateAsync({ adminPassword })} onClose={() => setOpen(false)}
      />
    </>
  );
}
