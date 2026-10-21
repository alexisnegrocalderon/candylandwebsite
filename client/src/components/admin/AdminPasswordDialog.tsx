import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle,
  AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

/** Igual que ConfirmDeleteButton pero para cambios que no borran (marcar un
 * gasto, cambiar cuánto resta del resultado): pide la clave de admin, que el
 * servidor valida en cada llamada (`adminPasswordProcedure`). Controlado:
 * quien lo usa decide cuándo abrirlo. */
export function AdminPasswordDialog({ open, title, description, actionLabel, onConfirm, onClose }: {
  open: boolean;
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: (adminPassword: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [adminPassword, setAdminPassword] = useState('');
  const [working, setWorking] = useState(false);
  const close = () => { setAdminPassword(''); setWorking(false); onClose(); };
  const run = async () => {
    if (!adminPassword || working) return;
    setWorking(true);
    try {
      await onConfirm(adminPassword);
      close();
    } catch {
      // El error lo muestra la mutation; el diálogo queda abierto para reintentar.
      setWorking(false);
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          type="password" autoFocus value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }}
          placeholder="Tu clave de admin"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); run(); }} disabled={!adminPassword || working}>
            {working ? 'Guardando…' : actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
