import { useEffect, useState } from 'react';
import { MessageSquarePlus, Sparkles, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { AssistantChat } from './AssistantChat';
import { readLastThread, saveLastThread } from './AssistantSection';

/** El chat del asistente encima de la pantalla donde estés (botón flotante y atajo del «+»). Sigue la última conversación;
 * «Nueva» empieza otra. Sabe en qué pantalla y evento estás. */
export function AssistantSheet({ open, onClose, context }: { open: boolean; onClose: () => void; context: { section?: string | null; eventId?: number | null } }) {
  const [threadId, setThreadId] = useState<number | null>(null);
  useEffect(() => { if (open) setThreadId(readLastThread()); }, [open]);
  const pick = (id: number | null) => { setThreadId(id); saveLastThread(id); };
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" hideClose overlayClassName="z-[100]" className="z-[100] flex h-[100dvh] w-full flex-col gap-0 p-0 sm:max-w-lg">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Sparkles className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-lg">Asistente IA</SheetTitle>
            <SheetDescription className="truncate text-xs">{context.section ? `Estás en ${context.section}` : 'Pregúntale lo que quieras'}</SheetDescription>
          </div>
          <button type="button" onClick={() => pick(null)} className="grid h-9 w-9 place-items-center rounded-full bg-muted" aria-label="Nueva conversación" title="Nueva conversación"><MessageSquarePlus className="h-4 w-4" /></button>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-muted" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2">
          {open && <AssistantChat threadId={threadId} onThread={pick} context={context} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
