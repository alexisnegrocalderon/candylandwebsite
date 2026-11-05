import { useState } from 'react';
import { toast } from 'sonner';
import { MessageSquarePlus, Sparkles, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useTonightEvent } from '@/hooks/useTonightEvent';
import { Button } from '@/components/ui/button';
import { AssistantChat } from './AssistantChat';

const LAST_THREAD_KEY = 'assistant.lastThread';
export const readLastThread = (): number | null => { try { const n = Number(localStorage.getItem(LAST_THREAD_KEY)); return Number.isInteger(n) && n > 0 ? n : null; } catch { return null; } };
export const saveLastThread = (id: number | null) => { try { if (id) localStorage.setItem(LAST_THREAD_KEY, String(id)); else localStorage.removeItem(LAST_THREAD_KEY); } catch { /* sin storage */ } };

/** Admin → «Asistente IA»: el chat a pantalla completa con las conversaciones guardadas. */
export function AssistantSection() {
  const { eventId } = useTonightEvent();
  const [threadId, setThreadId] = useState<number | null>(readLastThread);
  const threads = trpc.assistant.threads.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const del = trpc.assistant.deleteThread.useMutation({
    onSuccess: () => { utils.assistant.threads.invalidate(); toast.success('Conversación borrada'); },
    onError: (e) => toast.error(e.message),
  });
  const pick = (id: number | null) => { setThreadId(id); saveLastThread(id); };
  const list = threads.data ?? [];

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <aside className="shrink-0 lg:w-64">
        <div className="flex items-center gap-2">
          <h2 className="flex flex-1 items-center gap-2 font-heading text-2xl"><Sparkles className="h-6 w-6 text-primary" /> Asistente IA</h2>
          <Button type="button" size="sm" onClick={() => pick(null)}><MessageSquarePlus className="mr-1 h-4 w-4" /> Nueva</Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Pregúntale lo que quieras de tus fiestas: consulta los datos del panel en el momento.</p>
        {list.length > 0 && (
          <ul className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-col lg:overflow-visible" aria-label="Conversaciones">
            {list.map((t) => (
              <li key={t.id} className="shrink-0 lg:shrink">
                <div className={`group flex items-center gap-1 rounded-xl ${threadId === t.id ? 'bg-primary/15' : 'hover:bg-muted/60'}`}>
                  <button type="button" onClick={() => pick(t.id)} className="min-w-0 max-w-[14rem] flex-1 truncate px-3 py-2 text-left text-sm lg:max-w-none" title={t.title}>{t.title}</button>
                  <button type="button" aria-label={`Borrar «${t.title}»`} onClick={() => { if (window.confirm(`¿Borrar «${t.title}»?`)) { del.mutate({ id: t.id }); if (threadId === t.id) pick(null); } }}
                    className="mr-1 rounded-lg p-1.5 text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <section className="admin-clay flex h-[calc(100dvh-15rem)] min-h-[28rem] flex-1 flex-col p-3 md:p-4">
        <AssistantChat threadId={threadId} onThread={pick} context={{ section: 'Asistente IA', eventId }} />
      </section>
    </div>
  );
}
