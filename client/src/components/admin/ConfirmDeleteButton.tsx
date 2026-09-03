import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useDemoProps } from '@/lib/demoMode';

/** Botón de borrar reusado en todo el panel admin.
 *
 * Además de confirmar, pide la clave de admin: pedido explícito del dueño,
 * "que no se pueda eliminar nada sin mi clave". La sesión del panel dura 7
 * días, así que sin esto el 2FA protege ENTRAR pero no BORRAR -- con el
 * teléfono desbloqueado, un toque de más borra una compra o un evento sin
 * nada que lo frene. La clave se valida en el servidor en cada llamada
 * (`adminPasswordProcedure`), nunca acá.
 *
 * `description` debe nombrar qué se está por borrar (el evento, el código)
 * para que el diálogo se entienda solo. */
export function ConfirmDeleteButton({
  description,
  onConfirm,
  disabled,
}: {
  description: string;
  onConfirm: (adminPassword: string) => void | Promise<unknown>;
  disabled?: boolean;
}) {
  const demoProps = useDemoProps();
  const [open, setOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [working, setWorking] = useState(false);

  // La clave no se conserva entre aperturas: si el diálogo se cierra, se
  // vuelve a pedir. Es justo el punto de pedirla cada vez.
  const close = () => { setOpen(false); setAdminPassword(''); setWorking(false); };

  const run = async () => {
    if (!adminPassword || working) return;
    setWorking(true);
    try {
      await onConfirm(adminPassword);
      close();
    } catch {
      // El error ya se muestra por onMutationError en cada mutation; el
      // diálogo queda abierto para reintentar con la clave correcta.
      setWorking(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive" {...demoProps} disabled={disabled || demoProps.disabled}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar definitivamente?</AlertDialogTitle>
          <AlertDialogDescription>{description} Esta acción no se puede deshacer.</AlertDialogDescription>
        </AlertDialogHeader>
        <div>
          <Input
            type="password"
            autoFocus
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }}
            placeholder="Tu clave de admin"
          />
          <p className="text-xs text-muted-foreground mt-1.5">Se pide en cada borrado, no basta con tener la sesión abierta.</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); run(); }}
            disabled={!adminPassword || working}
            className={buttonVariants({ variant: 'destructive' })}
          >
            {working ? 'Eliminando…' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
