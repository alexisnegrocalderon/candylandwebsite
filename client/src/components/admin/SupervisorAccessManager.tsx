import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, KeyRound, ShieldOff, UserPlus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminPasswordDialog } from './AdminPasswordDialog';
import { useDemoProps } from '@/lib/demoMode';

/** Ajustes → Supervisoras: crea la cuenta de una supervisora con acceso propio
 * al panel (ej. Belén), cambia su clave o le quita el acceso. Ve solo
 * Playmatch, Stock de barra, enviar entradas y descuentos; sin ventas,
 * costos, configuración ni borrados. Cada cosa que hace queda en la
 * bitácora con su nombre. */
type Pending =
  | { kind: 'create'; name: string }
  | { kind: 'reset'; id: number; name: string }
  | { kind: 'revoke'; id: number; name: string };

export function SupervisorAccessManager() {
  const utils = trpc.useUtils();
  const demoProps = useDemoProps();
  const { data: rows, isLoading } = trpc.panelSupervisors.list.useQuery(undefined, { retry: false });
  const [name, setName] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [shown, setShown] = useState<{ name: string; password: string } | null>(null);
  const refresh = () => utils.panelSupervisors.list.invalidate();
  const onError = (e: { message: string }) => toast.error(e.message);

  const create = trpc.panelSupervisors.create.useMutation({ onError });
  const reset = trpc.panelSupervisors.resetPassword.useMutation({ onError });
  const revoke = trpc.panelSupervisors.revoke.useMutation({ onError });

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success('Copiado'), () => toast.error('No se pudo copiar'));

  const dialog = pending && {
    create: { title: `¿Crear acceso para ${pending.name}?`, description: 'Se genera una clave que verás una sola vez. Al entrar la primera vez configura su código de verificación (2FA).', action: 'Crear acceso' },
    reset: { title: `¿Cambiar la clave de ${pending.name}?`, description: 'La clave anterior deja de servir, se cierran sus sesiones y tendrá que configurar su 2FA de nuevo.', action: 'Cambiar clave' },
    revoke: { title: `¿Quitar el acceso de ${pending.name}?`, description: 'Se cierran sus sesiones y ya no podrá entrar al panel.', action: 'Quitar acceso' },
  }[pending.kind];

  const confirm = async (adminPassword: string) => {
    if (!pending) return;
    if (pending.kind === 'create') {
      const r = await create.mutateAsync({ name: pending.name, adminPassword });
      setShown({ name: pending.name, password: r.password });
      setName('');
    } else if (pending.kind === 'reset') {
      const r = await reset.mutateAsync({ id: pending.id, adminPassword });
      setShown({ name: pending.name, password: r.password });
    } else {
      await revoke.mutateAsync({ id: pending.id, adminPassword });
      toast.success('Acceso quitado');
    }
    refresh();
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-2xl">Supervisoras</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Acceso propio al panel para una supervisora: ve Playmatch, Stock de barra, Enviar entrada y Descuentos. No ve ventas, costos, ajustes ni puede borrar.
        </p>
      </div>

      {shown && (
        <section className="admin-clay space-y-2 p-5">
          <p className="font-semibold">Clave de {shown.name} (se muestra una sola vez)</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-black/30 px-3 py-2 text-base">{shown.password}</code>
            <Button size="sm" variant="outline" onClick={() => copy(shown.password)}><Copy className="mr-1.5 h-4 w-4" /> Copiar</Button>
            <Button size="sm" variant="ghost" onClick={() => setShown(null)}>Listo, ya la guardé</Button>
          </div>
          <p className="text-xs text-muted-foreground">Se entra en el mismo /admin, con esta clave. La primera vez pide escanear un QR con una app autenticadora.</p>
        </section>
      )}

      <section className="admin-clay space-y-3 p-5">
        <p className="font-semibold">Nueva supervisora</p>
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. Belén García)" className="min-w-56 flex-1" maxLength={120} />
          <Button disabled={name.trim().length < 2} {...demoProps} onClick={() => setPending({ kind: 'create', name: name.trim() })}>
            <UserPlus className="mr-1.5 h-4 w-4" /> Crear acceso
          </Button>
        </div>
      </section>

      <section className="admin-clay divide-y divide-white/10 p-0">
        {isLoading ? <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
          : (rows ?? []).length === 0 ? <p className="p-4 text-sm text-muted-foreground">Aún no hay supervisoras con acceso al panel.</p>
          : (rows ?? []).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {!r.hasAccess ? 'Sin acceso' : r.twoFactorReady ? 'Acceso activo · 2FA listo' : 'Acceso creado · falta que configure su 2FA'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" {...demoProps} onClick={() => setPending({ kind: 'reset', id: r.id, name: r.name })}>
                  <KeyRound className="mr-1.5 h-4 w-4" /> {r.hasAccess ? 'Cambiar clave' : 'Dar acceso'}
                </Button>
                {r.hasAccess && (
                  <Button size="sm" variant="outline" {...demoProps} onClick={() => setPending({ kind: 'revoke', id: r.id, name: r.name })}>
                    <ShieldOff className="mr-1.5 h-4 w-4" /> Quitar
                  </Button>
                )}
              </div>
            </div>
          ))}
      </section>

      <AdminPasswordDialog
        open={!!pending}
        title={dialog?.title ?? ''}
        description={dialog?.description ?? ''}
        actionLabel={dialog?.action ?? ''}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
