import { Check, Loader2, Send, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export type PublicacionEstadoUi = 'por_aprobar' | 'aprobado' | 'publicado';

/* Cola de la marca: el video del Estudio pasa de «Por aprobar» a «Aprobado»
 * y, solo después, se publica como Reel en @mansionplayroom. No tiene nada
 * que ver con «Contenido embajadores». */
export function PublicacionControls({
  estado,
  igMediaId,
  error,
  mp4Fresh,
  busy,
  onApprove,
  onUnapprove,
  onPublish,
}: {
  estado: PublicacionEstadoUi;
  igMediaId: string | null;
  error: string | null;
  mp4Fresh: boolean;
  busy: boolean;
  onApprove: () => void;
  onUnapprove: () => void;
  onPublish: () => void;
}) {
  if (estado === 'publicado') {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <Check className="h-4 w-4" /> Publicado como Reel{igMediaId ? ` (${igMediaId})` : ''}
      </span>
    );
  }

  if (estado === 'aprobado') {
    return (
      <>
        <span className="text-sm font-medium text-emerald-700">Aprobado</span>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <WriteButton size="sm" disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Publicar Reel en Instagram
            </WriteButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Publicar este Reel en @mansionplayroom?</AlertDialogTitle>
              <AlertDialogDescription>
                Queda público en el Instagram de la marca con el texto del pie de foto actual. Esta acción no se puede deshacer desde aquí.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onPublish}>Sí, publicar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onUnapprove}>
          <Undo2 className="mr-1 h-4 w-4" /> Quitar aprobación
        </Button>
        {error && <span className="text-sm text-red-700">No se pudo publicar: {error}</span>}
      </>
    );
  }

  // por_aprobar
  return (
    <>
      <span className="text-sm text-muted-foreground">Por aprobar</span>
      <WriteButton size="sm" variant="outline" disabled={busy || !mp4Fresh} title={mp4Fresh ? undefined : 'Graba el MP4 de esta versión antes de aprobar'} onClick={onApprove}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Aprobar para Instagram
      </WriteButton>
    </>
  );
}
