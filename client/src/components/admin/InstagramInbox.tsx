import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Instagram, Bot, Hand, Send, Sparkles, AlertTriangle, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/admin/EmptyState';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { InstagramAutomations } from '@/components/admin/InstagramAutomations';
import { formatChileDateTime } from '@shared/chileDate';
import { IG_MAX_REPLY_CHARS, type InstagramAgentConfig } from '@shared/instagramAgentConfig';

/* Bandeja del agente que contesta el Instagram (server/instagram.ts).
 *
 * La idea rectora de esta pantalla: el dueño tiene que poder ver EXACTAMENTE
 * qué se dijo en su nombre y poder cortar el bot en cualquier conversación
 * con un toque. Un agente que contesta solo y no se puede auditar ni frenar
 * es un riesgo de marca, no una ayuda. */

const onError = (error: unknown) => {
  toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción.');
};

export function InstagramInbox() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl flex items-center gap-2"><Instagram className="w-6 h-6" /> Instagram</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Mensajes directos de @mansionplayroom y el agente de IA que los contesta.
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Las conversaciones sin actividad por más de 30 días se borran solas. Puedes borrar una antes con el ícono de tacho al abrirla.
        </p>
      </div>

      <ConnectionCard />
      <AgentConfigCard />
      <InstagramAutomations />

      {selectedId === null
        ? <ThreadList onOpen={setSelectedId} />
        : <ThreadDetail threadId={selectedId} onBack={() => setSelectedId(null)} />}
    </div>
  );
}

/** Qué falta para que esto funcione. Sin esta tarjeta, una variable sin
 * configurar en Vercel se manifiesta como una bandeja vacía sin explicación
 * -- que es indistinguible de "nadie ha escrito". */
function ConnectionCard() {
  const { data } = trpc.instagram.connectionStatus.useQuery();
  if (!data) return null;

  const items: { ok: boolean; label: string }[] = [
    { ok: data.hasAppSecret, label: 'IG_APP_SECRET (firma del webhook)' },
    { ok: data.hasVerifyToken, label: 'IG_VERIFY_TOKEN (alta del webhook)' },
    { ok: data.hasAccessToken, label: 'IG_ACCESS_TOKEN (para poder responder)' },
    { ok: data.hasUserId, label: 'IG_USER_ID (cuenta de la productora)' },
  ];
  const pending = items.filter((i) => !i.ok);
  if (pending.length === 0) return null;

  return (
    <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Falta terminar la conexión con Meta</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.label} className={i.ok ? 'text-muted-foreground' : ''}>
              {i.ok ? '✅' : '⬜'} {i.label}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          Se configuran como variables de entorno en Vercel. El paso a paso completo está en <code>docs/INSTAGRAM-AGENT.md</code>.
        </p>
        <p className="text-muted-foreground">
          URL del webhook para pegar en el panel de Meta: <code className="break-all">{data.webhookUrl}</code>
        </p>
      </CardContent>
    </Card>
  );
}

function AgentConfigCard() {
  const utils = trpc.useUtils();
  const { data: config } = trpc.instagram.getConfig.useQuery();
  const { data: contextPreview } = trpc.instagram.previewContext.useQuery();
  const save = trpc.instagram.saveConfig.useMutation({
    onSuccess: () => { utils.instagram.getConfig.invalidate(); toast.success('Guardado.'); },
    onError,
  });
  const preview = trpc.instagram.preview.useMutation({ onError });

  const [draft, setDraft] = useState<InstagramAgentConfig | null>(null);
  const [testMessage, setTestMessage] = useState('hola, cuánto vale la entrada?');
  const [showContext, setShowContext] = useState(false);
  useEffect(() => { if (config && !draft) setDraft(config); }, [config, draft]);

  if (!draft) return null;

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="w-5 h-5" /> Agente de IA</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">Contestar automáticamente</p>
            <p className="text-sm text-muted-foreground">
              Apagado, los mensajes igual llegan a esta bandeja: simplemente nadie recibe respuesta automática.
            </p>
          </div>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(enabled) => { const next = { ...draft, enabled }; setDraft(next); save.mutate(next); }}
          />
        </div>

        <div className="space-y-2">
          <Label>Qué tiene que saber el agente</Label>
          <Textarea
            rows={8}
            value={draft.brandNotes}
            onChange={(e) => setDraft({ ...draft, brandNotes: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Tono de la marca y respuestas a las preguntas de siempre. Las fechas y los precios NO se escriben acá: salen
            solos de los eventos cargados en el panel.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Mensaje cuando deriva a una persona</Label>
          <Input
            value={draft.handoffMessage}
            maxLength={IG_MAX_REPLY_CHARS}
            onChange={(e) => setDraft({ ...draft, handoffMessage: e.target.value })}
          />
        </div>

        <StyleExamplesField
          value={draft.styleExamples}
          onChange={(styleExamples) => setDraft({ ...draft, styleExamples })}
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Mensajes de historial</Label>
            <Input
              type="number" min={2} max={40}
              value={draft.historyLimit}
              onChange={(e) => setDraft({ ...draft, historyLimit: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Tope de respuestas por día y persona</Label>
            <Input
              type="number" min={1} max={200}
              value={draft.dailyReplyLimitPerThread}
              onChange={(e) => setDraft({ ...draft, dailyReplyLimitPerThread: Number(e.target.value) })}
            />
          </div>
        </div>

        <WriteButton onClick={() => save.mutate(draft)} disabled={save.isPending}>
          {save.isPending ? 'Guardando...' : 'Guardar'}
        </WriteButton>

        <div className="border-t pt-5 space-y-3">
          <p className="font-medium flex items-center gap-2"><Sparkles className="w-4 h-4" /> Probar sin mandar nada</p>
          <div className="flex gap-2">
            <Input value={testMessage} onChange={(e) => setTestMessage(e.target.value)} placeholder="Escribe un mensaje como si fueras un seguidor" />
            <WriteButton onClick={() => preview.mutate({ message: testMessage })} disabled={preview.isPending}>
              {preview.isPending ? '...' : 'Probar'}
            </WriteButton>
          </div>
          {preview.data && (
            <div className="rounded-2xl border p-4 space-y-2 text-sm">
              {preview.data.isPersonal ? (
                <p className="text-muted-foreground">
                  🤫 Esto lo marcó como mensaje personal (no de cliente): no se mandaría ninguna respuesta automática, quedaría en la bandeja para que lo veas y contestes vos.
                </p>
              ) : (
                <>
                  <p className="whitespace-pre-wrap">{preview.data.reply}</p>
                  {preview.data.handoff && (
                    <p className="text-amber-600 text-xs">Derivaría a una persona: {preview.data.handoffReason}</p>
                  )}
                </>
              )}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowContext((v) => !v)}>
            {showContext ? 'Ocultar' : 'Ver'} los datos que recibe la IA
          </Button>
          {showContext && (
            <pre className="text-xs bg-muted/40 rounded-2xl p-4 overflow-x-auto whitespace-pre-wrap">
              {contextPreview?.context ?? 'Cargando...'}
            </pre>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Ejemplos de tono del dueño, guardados uno por uno con Enter en vez de un
 * solo bloque de texto libre -- más fácil de armar y de revisar de un
 * vistazo que un párrafo largo. Por dentro sigue siendo un solo string
 * (`InstagramAgentConfig.styleExamples`, una frase por línea): no hace
 * falta ningún cambio de esquema, esto es puramente presentación. */
function StyleExamplesField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draftPhrase, setDraftPhrase] = useState('');
  const phrases = value.split('\n').map((p) => p.trim()).filter(Boolean);

  const addPhrase = () => {
    const trimmed = draftPhrase.trim();
    if (!trimmed) return;
    onChange([...phrases, trimmed].join('\n'));
    setDraftPhrase('');
  };

  const removePhrase = (index: number) => {
    onChange(phrases.filter((_, i) => i !== index).join('\n'));
  };

  return (
    <div className="space-y-2">
      <Label>Ejemplos de tu forma de escribir (opcional)</Label>
      <div className="flex gap-2">
        <Input
          value={draftPhrase}
          onChange={(e) => setDraftPhrase(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhrase(); } }}
          placeholder='Escribe una frase como tú la mandarías y presiona Enter. Ej.: "hola! sí, disfraz es obligatorio, pero no tiene que ser producido, algo simple ya cuenta jaja"'
        />
        <Button type="button" variant="outline" onClick={addPhrase} disabled={!draftPhrase.trim()}>Agregar</Button>
      </div>
      {phrases.length > 0 && (
        <ul className="space-y-1.5">
          {phrases.map((phrase, i) => (
            <li key={i} className="flex items-start justify-between gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
              <span className="whitespace-pre-wrap break-words">{phrase}</span>
              <button
                type="button"
                onClick={() => removePhrase(i)}
                className="text-muted-foreground hover:text-destructive shrink-0"
                aria-label="Eliminar esta frase"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        El agente las usa como muestra de tono a imitar, no como texto fijo para copiar. Igual que el resto de esta
        tarjeta, quedan guardadas recién al tocar "Guardar" más abajo.
      </p>
    </div>
  );
}

function ThreadList({ onOpen }: { onOpen: (id: number) => void }) {
  // Refresco periódico: el webhook escribe en la base desde otra invocación,
  // así que esta pantalla no se entera por sí sola de un mensaje nuevo.
  const { data: threads, isLoading } = trpc.instagram.listThreads.useQuery(undefined, { refetchInterval: 30_000 });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando conversaciones...</p>;
  if (!threads || threads.length === 0) {
    return (
      <EmptyState
        icon={Instagram}
        title="Todavía no hay mensajes"
        description="Cuando alguien le escriba al Instagram de la productora, la conversación va a aparecer acá."
      />
    );
  }

  return (
    <div className="space-y-3">
      {threads.map((t) => (
        <button
          key={t.id}
          onClick={() => onOpen(t.id)}
          className="w-full text-left p-4 rounded-2xl border border-border/60 bg-card hover:border-primary/40 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold truncate">
                {t.username ? `@${t.username}` : t.name ?? t.igUserId}
                {t.unreadCount > 0 && <span className="ml-2 text-xs rounded-full bg-primary text-primary-foreground px-2 py-0.5">{t.unreadCount}</span>}
              </p>
              <p className="text-sm text-muted-foreground truncate mt-1">{t.lastMessagePreview ?? ''}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground">{t.lastMessageAt ? formatChileDateTime(t.lastMessageAt) : ''}</p>
              {t.botPaused === 1 && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1 justify-end"><Hand className="w-3 h-3" /> esperando al equipo</p>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function ThreadDetail({ threadId, onBack }: { threadId: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.instagram.getThread.useQuery({ threadId }, { refetchInterval: 20_000 });
  const [text, setText] = useState('');

  const markRead = trpc.instagram.markRead.useMutation({
    onSuccess: () => { utils.instagram.listThreads.invalidate(); },
  });
  const setPaused = trpc.instagram.setBotPaused.useMutation({
    onSuccess: () => { utils.instagram.getThread.invalidate({ threadId }); utils.instagram.listThreads.invalidate(); },
    onError,
  });
  const reply = trpc.instagram.reply.useMutation({
    onSuccess: () => {
      setText('');
      utils.instagram.getThread.invalidate({ threadId });
      utils.instagram.listThreads.invalidate();
    },
    onError,
  });
  const deleteThread = trpc.instagram.deleteThread.useMutation({
    onSuccess: () => { utils.instagram.listThreads.invalidate(); onBack(); },
    onError,
  });

  // Abrir la conversación ya cuenta como haberla visto.
  useEffect(() => { markRead.mutate({ threadId }); }, [threadId]);

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Cargando conversación...</p>;

  const { thread, messages } = data;

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">{thread.username ? `@${thread.username}` : thread.name ?? thread.igUserId}</CardTitle>
          {thread.botPaused === 1 && thread.handoffReason && (
            <p className="text-xs text-amber-600 mt-1">Bot pausado: {thread.handoffReason}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ConfirmDeleteButton
            description={`Vas a eliminar toda la conversación con ${thread.username ? `@${thread.username}` : thread.name ?? thread.igUserId}.`}
            onConfirm={(adminPassword) => deleteThread.mutateAsync({ threadId, adminPassword })}
          />
          <Button variant="ghost" size="sm" onClick={onBack}>Volver</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-2xl border p-3">
          <div className="text-sm">
            <p className="font-medium">Respuesta automática en esta conversación</p>
            <p className="text-muted-foreground text-xs">
              Se pausa sola apenas mandas un mensaje a mano. Usa este switch para pausarla antes de contestar, o para
              que el agente vuelva a responder este hilo.
            </p>
          </div>
          <Switch
            checked={thread.botPaused === 0}
            onCheckedChange={(on) => setPaused.mutate({ threadId, paused: !on })}
          />
        </div>

        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === 'in' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.direction === 'in' ? 'bg-muted' : 'bg-primary/10'}`}>
                <p className="whitespace-pre-wrap break-words">{m.text ?? '[adjunto]'}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {m.source === 'bot' ? 'IA · ' : m.source === 'admin' ? 'Equipo · ' : ''}
                  {formatChileDateTime(m.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {thread.canReply ? (
          <div className="flex gap-2">
            <Input
              value={text}
              maxLength={IG_MAX_REPLY_CHARS}
              placeholder="Escribe tu respuesta..."
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) reply.mutate({ threadId, text: text.trim() }); }}
            />
            <WriteButton onClick={() => reply.mutate({ threadId, text: text.trim() })} disabled={reply.isPending || text.trim().length === 0}>
              <Send className="w-4 h-4" />
            </WriteButton>
          </div>
        ) : (
          /* Regla de Meta, no nuestra: pasadas 24 horas del último mensaje de
           * la persona, la API rechaza cualquier respuesta. Mejor decirlo acá
           * que dejar escribir un mensaje que se va a perder. */
          <p className="text-sm text-muted-foreground rounded-2xl border p-3">
            Pasaron más de 24 horas desde su último mensaje: Instagram ya no permite responder por acá. Hay que
            contestarle desde la app de Instagram.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
