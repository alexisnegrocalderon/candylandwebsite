import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UserRound } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Textarea } from '@/components/ui/textarea';
import { WriteButton } from '@/components/admin/WriteButton';

/** Ficha del cliente que el agente va armando sola (nombre, con quién viene,
 * primera vez, dudas...) y que le vuelve en cada mensaje para recordar a la
 * persona. El dueño la puede corregir o completar a mano. Sirve para
 * Instagram y WhatsApp. */
export function CustomerNotesCard({ channel, threadId, notes }: { channel: 'instagram' | 'whatsapp'; threadId: number; notes: string | null }) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState(notes ?? '');
  useEffect(() => { setDraft(notes ?? ''); }, [notes]);

  const onSuccess = () => {
    toast.success('Ficha guardada.');
    if (channel === 'instagram') utils.instagram.getThread.invalidate({ threadId });
    else utils.whatsapp.getThread.invalidate({ threadId });
  };
  const onError = (error: unknown) => toast.error(error instanceof Error ? error.message : 'No se pudo guardar.');
  const saveIg = trpc.instagram.setCustomerNotes.useMutation({ onSuccess, onError });
  const saveWa = trpc.whatsapp.setCustomerNotes.useMutation({ onSuccess, onError });
  const save = channel === 'instagram' ? saveIg : saveWa;

  return (
    <div className="rounded-2xl border p-3 space-y-2">
      <p className="text-sm font-medium flex items-center gap-2"><UserRound className="w-4 h-4" /> Ficha del cliente</p>
      <Textarea
        rows={3}
        maxLength={1000}
        placeholder="El agente la va completando sola a medida que conversa."
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {draft !== (notes ?? '') && (
        <WriteButton size="sm" onClick={() => save.mutate({ threadId, notes: draft })} disabled={save.isPending}>
          {save.isPending ? 'Guardando...' : 'Guardar ficha'}
        </WriteButton>
      )}
    </div>
  );
}
