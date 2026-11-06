import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, ArrowUp, Check, Sparkles, X } from 'lucide-react';
import { OPEN_SECTION_EVENT } from '@/components/admin/studio/handoff';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { ASSISTANT_QUESTION_MAX, TOOL_LABELS, type AssistantMessageView, type AssistantProposal } from '@shared/assistant';
import { Markdown } from './Markdown';
import { AssistantChart } from './AssistantChart';
import { VoiceNoteButton } from './VoiceNoteButton';

export const ASSISTANT_SUGGESTIONS = [
  '¿Cómo va la venta del próximo evento?',
  '¿Qué falta comprar para 300 personas?',
  '¿Cuál fue la fiesta más rentable?',
  '¿Quiénes son mis 10 mejores clientes?',
  '¿Cuánto debo hoy?',
  '¿Qué insumos están por acabarse?',
];

// Mientras Claude consulta, se van mostrando las cosas que suele revisar (la respuesta llega de una vez).
const THINKING = ['Revisando ventas…', 'Revisando eventos…', 'Revisando finanzas…', 'Revisando clientes…', 'Revisando el stock…', 'Armando la respuesta…'];

function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setI((v) => (v + 1) % THINKING.length), 1800); return () => window.clearInterval(t); }, []);
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
      <span className="flex gap-1" aria-hidden>{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${d * 120}ms` }} />)}</span>
      {THINKING[i]}
    </div>
  );
}

function ProposalCard({ p, messageId, onDone }: { p: AssistantProposal; messageId: number; onDone: () => void }) {
  const run = trpc.assistant.runAction.useMutation({
    onSuccess: (r) => { if (r.estado === 'hecha') toast.success(r.resultado); onDone(); },
    onError: (e) => { toast.error(e.message); onDone(); },
  });
  const done = p.estado !== 'pendiente';
  return (
    <div className={`rounded-2xl border-2 p-3 ${done ? 'border-border bg-muted/30' : 'border-primary/60 bg-primary/5'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acción por confirmar</p>
      <p className="mt-1 text-sm font-semibold">{p.resumen}</p>
      {done ? (
        <p className={`mt-2 text-sm ${p.estado === 'hecha' ? 'text-emerald-500' : p.estado === 'fallida' ? 'text-red-500' : 'text-muted-foreground'}`}>
          {p.estado === 'hecha' ? '✓ ' : p.estado === 'fallida' ? '✗ ' : ''}{p.resultado ?? (p.estado === 'cancelada' ? 'Cancelada' : '')}
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" disabled={run.isPending} onClick={() => run.mutate({ messageId, proposalId: p.id })}><Check className="mr-1 h-4 w-4" /> {run.isPending ? 'Haciendo…' : 'Confirmar'}</Button>
          <Button type="button" size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate({ messageId, proposalId: p.id, cancel: true })}><X className="mr-1 h-4 w-4" /> Cancelar</Button>
        </div>
      )}
    </div>
  );
}

function Bubble({ m, onChanged }: { m: AssistantMessageView; onChanged: () => void }) {
  if (m.role === 'user') {
    return <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] text-primary-foreground">{m.ui.text}</div>;
  }
  return (
    <div className="max-w-full space-y-3">
      <div className={`rounded-3xl rounded-bl-md px-4 py-3 ${m.ui.error ? 'bg-amber-500/10 text-amber-200' : 'bg-muted/60'}`}><Markdown text={m.ui.text} /></div>
      {(m.ui.charts ?? []).map((c, i) => <AssistantChart key={i} chart={c} />)}
      {(m.ui.proposals ?? []).map((p) => <ProposalCard key={p.id} p={p} messageId={m.id} onDone={onChanged} />)}
      {/* «Llévame a…»: un botón grande por pantalla; abre la sección y cierra la hoja del asistente. */}
      {(m.ui.links ?? []).map((l) => (
        <button key={l.section} type="button"
          onClick={() => window.dispatchEvent(new CustomEvent<string>(OPEN_SECTION_EVENT, { detail: l.section }))}
          className="flex h-12 w-full items-center justify-between gap-2 rounded-2xl bg-primary px-4 text-base font-semibold text-primary-foreground active:scale-[0.98]">
          Abrir {l.label} <ArrowRight className="h-5 w-5" />
        </button>
      ))}
      {!!m.ui.sources?.length && (
        <div className="flex flex-wrap gap-1.5">
          {m.ui.sources.map((s) => <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">📊 {TOOL_LABELS[s] ?? s}</span>)}
        </div>
      )}
    </div>
  );
}

/** El chat con el asistente (pantalla del menú y hoja del botón flotante). `context` le dice en qué pantalla y evento estás. */
export function AssistantChat({ threadId, onThread, context, autoFocus = true }: {
  threadId: number | null;
  onThread: (id: number) => void;
  context: { section?: string | null; eventId?: number | null };
  autoFocus?: boolean;
}) {
  const utils = trpc.useUtils();
  const thread = trpc.assistant.thread.useQuery({ id: threadId ?? 0 }, { enabled: !!threadId, retry: false });
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ask = trpc.assistant.ask.useMutation({
    onSuccess: (r) => {
      setPending(null);
      if (r.threadId !== threadId) onThread(r.threadId);
      utils.assistant.thread.invalidate({ id: r.threadId });
      utils.assistant.threads.invalidate();
    },
    onError: (e) => { setPending(null); toast.error(e.message); },
  });

  const messages = threadId ? thread.data?.messages ?? [] : [];
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, pending]);
  useEffect(() => { if (autoFocus) window.setTimeout(() => inputRef.current?.focus(), 200); }, [autoFocus, threadId]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || ask.isPending) return;
    setPending(q);
    setQuestion('');
    ask.mutate({ threadId, question: q, context: { section: context.section ?? null, eventId: context.eventId ?? null } });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-1 py-2" aria-live="polite">
        {messages.length === 0 && !pending && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary"><Sparkles className="h-7 w-7" /></span>
            <div>
              <p className="font-heading text-xl">Pregúntame lo que quieras</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">Ventas, entradas, clientes, stock, compras, finanzas, staff o regalos: reviso los datos en el momento y te digo de dónde sale cada número.</p>
            </div>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {ASSISTANT_SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border bg-card/60 px-3 py-1.5 text-sm hover:bg-muted">{s}</button>
              ))}
            </div>
          </div>
        )}
        {threadId && thread.isLoading && <p className="text-sm text-muted-foreground">Cargando la conversación…</p>}
        {messages.map((m) => <Bubble key={m.id} m={m} onChanged={() => threadId && utils.assistant.thread.invalidate({ id: threadId })} />)}
        {pending && (
          <>
            <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] text-primary-foreground">{pending}</div>
            <div className="rounded-3xl rounded-bl-md bg-muted/60 px-4 py-3"><Thinking /></div>
          </>
        )}
        <div ref={endRef} />
      </div>

      <form className="relative mt-2 flex items-end gap-2 rounded-3xl border border-border bg-card/70 p-2" onSubmit={(e) => { e.preventDefault(); send(question); }}>
        <textarea ref={inputRef} value={question} rows={1} maxLength={ASSISTANT_QUESTION_MAX} aria-label="Tu pregunta para el asistente"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(question); } }}
          placeholder="Escribe o mantén apretado 🎤 para hablar…"
          className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground" />
        {/* Como en WhatsApp: sin texto escrito, el botón es el micrófono (mantener apretado para una nota de voz). */}
        {question.trim()
          ? <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full" disabled={ask.isPending} aria-label="Preguntar"><ArrowUp className="h-5 w-5" /></Button>
          : <VoiceNoteButton disabled={ask.isPending} onText={(text) => send(text)} />}
      </form>
    </div>
  );
}
