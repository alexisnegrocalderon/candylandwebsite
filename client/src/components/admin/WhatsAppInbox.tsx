import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MessageCircle, Bot, Hand, Send, Sparkles, AlertTriangle, List, Link as LinkIcon, Info, Settings2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useAdminDeepLink } from '@/lib/adminDeepLink';
import { AgentAutoResumeNote } from '@/components/admin/AgentAutoResumeNote';
import { CustomerNotesCard } from '@/components/admin/CustomerNotesCard';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SplitInbox, InboxList, ThreadRow, InboxTag, ChatHeader, ChatMessages, ChatBubble, ChatComposer, chatTime, inboxTime } from '@/components/admin/inbox/SplitInbox';
import { EmptyState } from '@/components/admin/EmptyState';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { formatChileDateTime } from '@shared/chileDate';
import { WA_MAX_REPLY_CHARS, type WhatsAppAgentConfig } from '@shared/whatsappAgentConfig';

/* Bandeja del agente que contesta el WhatsApp (server/whatsapp.ts). Misma
 * idea rectora que InstagramInbox: ver exactamente qué se dijo en nombre de
 * la productora y poder cortar el bot en cualquier conversación.
 *
 * El conocimiento del agente (notas de marca, tono, mensaje de derivación) se
 * edita en la sección Instagram y lo comparten los dos canales. */

const onError = (error: unknown) => {
  toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción.');
};

export function WhatsAppInbox() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  useAdminDeepLink('whatsapp', (link) => { if (link.thread) setSelectedId(link.thread); });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto flex items-center gap-2 font-heading text-2xl"><MessageCircle className="h-6 w-6" /> WhatsApp</h2>
        <button type="button" onClick={() => setAgentOpen(true)}
          className="admin-tab flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium">
          <Settings2 className="h-4 w-4" /> Agente
        </button>
      </div>

      <ConnectionCard />

      <SplitInbox
        hasSelection={selectedId !== null}
        list={<ThreadList selectedId={selectedId} onOpen={setSelectedId} />}
        detail={selectedId !== null && <ThreadDetail key={selectedId} threadId={selectedId} onBack={() => setSelectedId(null)} />}
        empty={(
          <div className="space-y-3 text-muted-foreground">
            <MessageCircle className="mx-auto h-12 w-12 opacity-60" />
            <p className="font-heading text-lg text-foreground">Tus mensajes</p>
            <p className="text-sm">Elige una conversación de la lista para leerla y responder.</p>
            <p className="text-xs">Las conversaciones sin actividad por más de 30 días se borran solas.</p>
          </div>
        )}
      />

      {/* El conocimiento (notas de marca, tono, derivación) se edita en el
          agente de Instagram y lo comparten los dos canales. */}
      <Sheet open={agentOpen} onOpenChange={setAgentOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
          <SheetHeader className="border-b border-white/10 px-5 py-4">
            <SheetTitle className="flex items-center gap-2 font-heading text-xl"><Bot className="h-5 w-5" /> Agente de WhatsApp</SheetTitle>
            <SheetDescription>El mismo agente del Instagram: su conocimiento y tono se editan allá.</SheetDescription>
          </SheetHeader>
          <div className="px-5 py-4">
            <AgentConfigCard />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ConnectionCard() {
  const { data } = trpc.whatsapp.connectionStatus.useQuery();
  if (!data) return null;

  const items: { ok: boolean; label: string }[] = [
    { ok: data.hasAppSecret, label: 'WA_APP_SECRET (firma del webhook)' },
    { ok: data.hasVerifyToken, label: 'WA_VERIFY_TOKEN (alta del webhook)' },
    { ok: data.hasAccessToken, label: 'WA_ACCESS_TOKEN (token permanente del usuario del sistema)' },
    { ok: data.hasPhoneNumberId, label: 'WA_PHONE_NUMBER_ID (id del número en la Cloud API)' },
  ];
  if (items.every((i) => i.ok)) return null;

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
          Se configuran como variables de entorno en Vercel. El paso a paso completo está en <code>docs/WHATSAPP-AGENT.md</code>.
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
  const configQuery = trpc.whatsapp.getConfig.useQuery();
  const config = configQuery.data;
  const save = trpc.whatsapp.saveConfig.useMutation({
    onSuccess: () => { utils.whatsapp.getConfig.invalidate(); toast.success('Guardado.'); },
    onError,
  });
  const preview = trpc.whatsapp.preview.useMutation({ onError });

  const [draft, setDraft] = useState<WhatsAppAgentConfig | null>(null);
  const [testMessage, setTestMessage] = useState('hola, cuándo es la próxima fiesta?');
  useEffect(() => { if (config && !draft) setDraft(config); }, [config, draft]);

  // Nunca una tarjeta vacía en silencio (ver el mismo caso en InstagramInbox).
  if (!draft) {
    if (configQuery.isError) {
      return (
        <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
          <CardContent className="space-y-3 pt-6 text-sm">
            <p className="font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> No se pudo cargar la configuración del agente</p>
            <p className="text-muted-foreground break-words">{configQuery.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => configQuery.refetch()} disabled={configQuery.isFetching}>
              {configQuery.isFetching ? 'Reintentando...' : 'Reintentar'}
            </Button>
          </CardContent>
        </Card>
      );
    }
    return <p className="text-sm text-muted-foreground">Cargando la configuración del agente...</p>;
  }

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="w-5 h-5" /> Agente de IA</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">Contestar automáticamente</p>
            <p className="text-sm text-muted-foreground">
              Apagado, los mensajes igual llegan a esta bandeja. Antes de prenderlo, apaga el asistente de IA de Meta en
              la app WhatsApp Business para que no contesten los dos.
            </p>
          </div>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(enabled) => { const next = { ...draft, enabled }; setDraft(next); save.mutate(next); }}
          />
        </div>

        <p className="text-sm rounded-2xl border p-3 text-muted-foreground">
          Lo que el agente sabe (notas de la marca, ejemplos de tono, mensaje cuando deriva y cuando agradecen) se edita
          en la sección <strong>Instagram</strong>, pestaña <strong>Conocimiento y tono</strong>, y aplica a los dos canales.
        </p>

        <div className="space-y-3 rounded-2xl border p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Menú de bienvenida</p>
              <p className="text-sm text-muted-foreground">
                Si alguien escribe por primera vez solo un saludo, recibe este texto con tres botones: "Próximas fechas",
                "Precios" y "Hablar con alguien". Las fechas y precios salen de los eventos del panel, sin IA.
              </p>
            </div>
            <Switch
              checked={draft.welcomeMenuEnabled}
              onCheckedChange={(welcomeMenuEnabled) => setDraft({ ...draft, welcomeMenuEnabled })}
            />
          </div>
          <Textarea
            rows={2}
            value={draft.welcomeMessage}
            maxLength={1000}
            onChange={(e) => setDraft({ ...draft, welcomeMessage: e.target.value })}
          />
        </div>

        <div className="space-y-3 rounded-2xl border p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Recordatorio si no contesta</p>
              <p className="text-sm text-muted-foreground">
                Un único mensaje de cierre si la persona no vuelve a escribir pasado este tiempo desde la última
                respuesta del bot.
              </p>
            </div>
            <Switch
              checked={draft.followUpEnabled}
              onCheckedChange={(followUpEnabled) => setDraft({ ...draft, followUpEnabled })}
            />
          </div>
          <div className="max-w-[180px] space-y-2">
            <Label>Minutos de silencio</Label>
            <Input
              type="number" min={1} max={1440}
              value={draft.followUpMinutes}
              onChange={(e) => setDraft({ ...draft, followUpMinutes: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Mensaje de cierre</Label>
            <Input
              value={draft.followUpMessage}
              maxLength={WA_MAX_REPLY_CHARS}
              onChange={(e) => setDraft({ ...draft, followUpMessage: e.target.value })}
            />
          </div>
        </div>

        <div className="max-w-[260px] space-y-2">
          <Label>Tope de respuestas por día y persona</Label>
          <Input
            type="number" min={1} max={200}
            value={draft.dailyReplyLimitPerThread}
            onChange={(e) => setDraft({ ...draft, dailyReplyLimitPerThread: Number(e.target.value) })}
          />
        </div>

        <WriteButton onClick={() => save.mutate(draft)} disabled={save.isPending}>
          {save.isPending ? 'Guardando...' : 'Guardar'}
        </WriteButton>

        <div className="border-t pt-5 space-y-3">
          <p className="font-medium flex items-center gap-2"><Sparkles className="w-4 h-4" /> Probar sin mandar nada</p>
          <div className="flex gap-2">
            <Input value={testMessage} onChange={(e) => setTestMessage(e.target.value)} placeholder="Escribe un mensaje como si fueras un cliente" />
            <WriteButton onClick={() => preview.mutate({ message: testMessage })} disabled={preview.isPending}>
              {preview.isPending ? '...' : 'Probar'}
            </WriteButton>
          </div>
          {preview.data && (
            <div className="rounded-2xl border p-4 space-y-2 text-sm">
              {preview.data.isPersonal ? (
                <p className="text-muted-foreground">
                  🤫 Lo marcó como mensaje personal (no de cliente): no se mandaría nada automático.
                </p>
              ) : (
                <>
                  <p className="whitespace-pre-wrap">{preview.data.reply}</p>
                  {preview.data.buttons.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {preview.data.buttons.map((b) => (
                        <span key={b} className="rounded-full border px-3 py-1 text-xs">{b}</span>
                      ))}
                    </div>
                  )}
                  {preview.data.action === 'event_list' && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><List className="w-3 h-3" /> + lista de próximas fechas</p>
                  )}
                  {preview.data.action === 'buy_link' && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><LinkIcon className="w-3 h-3" /> + botón "Comprar entrada"</p>
                  )}
                  {preview.data.handoff && (
                    <p className="text-amber-600 text-xs">Derivaría a una persona: {preview.data.handoffReason}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function threadTitle(t: { profileName: string | null; waId: string }) {
  return t.profileName ? `${t.profileName} · +${t.waId}` : `+${t.waId}`;
}

function ThreadList({ selectedId, onOpen }: { selectedId: number | null; onOpen: (id: number) => void }) {
  const { data: threads, isLoading } = trpc.whatsapp.listThreads.useQuery(undefined, { refetchInterval: 30_000 });
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const visible = (threads ?? []).filter((t) => !q
    || `${t.profileName ?? ''} ${t.waId} ${t.lastMessagePreview ?? ''}`.toLowerCase().includes(q));

  return (
    <InboxList search={search} onSearch={setSearch}>
      {isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando conversaciones...</p>}
      {!isLoading && (threads ?? []).length === 0 && (
        <EmptyState
          icon={MessageCircle}
          title="Todavía no hay mensajes"
          description="Cuando alguien le escriba al WhatsApp de la productora, la conversación va a aparecer acá."
        />
      )}
      {!isLoading && (threads ?? []).length > 0 && visible.length === 0 && (
        <p className="p-4 text-center text-sm text-muted-foreground">Nada coincide con “{search}”.</p>
      )}
      {visible.map((t) => (
        <ThreadRow
          key={t.id}
          title={threadTitle(t)}
          preview={t.lastMessagePreview ?? ''}
          time={inboxTime(t.lastMessageAt)}
          unread={t.unreadCount}
          active={t.id === selectedId}
          onClick={() => onOpen(t.id)}
          tags={t.botPaused === 1 && <InboxTag tone="warn"><Hand className="h-3 w-3" /> Esperando al equipo</InboxTag>}
        />
      ))}
    </InboxList>
  );
}

/** Botones, lista o link que acompañaron un mensaje, tal como se vieron en
 * el teléfono. */
function InteractiveSummary({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object') return null;
  const v = value as { type?: string; buttons?: string[]; rows?: string[]; label?: string; url?: string; title?: string };
  if (v.type === 'button' && v.buttons?.length) {
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {v.buttons.map((b) => <span key={b} className="rounded-full border px-2 py-0.5 text-[11px]">{b}</span>)}
      </div>
    );
  }
  if (v.type === 'list' && v.rows?.length) {
    return <p className="text-[11px] text-muted-foreground mt-1">Lista: {v.rows.join(' · ')}</p>;
  }
  if (v.type === 'cta_url' && v.url) {
    return <p className="text-[11px] text-muted-foreground mt-1">Botón "{v.label}" → {v.url}</p>;
  }
  if (v.type === 'reply') {
    return <p className="text-[11px] text-muted-foreground mt-1">(tocó un botón)</p>;
  }
  return null;
}

const SOURCE_LABEL: Record<string, string> = {
  bot: 'IA · ',
  admin: 'Equipo (panel) · ',
  owner_app: 'Equipo (app) · ',
};

function ThreadDetail({ threadId, onBack }: { threadId: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.whatsapp.getThread.useQuery({ threadId }, { refetchInterval: 20_000 });
  const [text, setText] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  const markRead = trpc.whatsapp.markRead.useMutation({
    onSuccess: () => { utils.whatsapp.listThreads.invalidate(); },
  });
  const setPaused = trpc.whatsapp.setBotPaused.useMutation({
    onSuccess: () => { utils.whatsapp.getThread.invalidate({ threadId }); utils.whatsapp.listThreads.invalidate(); },
    onError,
  });
  const reply = trpc.whatsapp.reply.useMutation({
    onSuccess: () => {
      setText('');
      utils.whatsapp.getThread.invalidate({ threadId });
      utils.whatsapp.listThreads.invalidate();
    },
    onError,
  });
  const deleteThread = trpc.whatsapp.deleteThread.useMutation({
    onSuccess: () => { utils.whatsapp.listThreads.invalidate(); onBack(); },
    onError,
  });

  useEffect(() => { markRead.mutate({ threadId }); }, [threadId]);

  if (isLoading || !data) return <p className="p-6 text-sm text-muted-foreground">Cargando conversación...</p>;

  const { thread, messages } = data;

  return (
    <>
      <ChatHeader
        title={threadTitle(thread)}
        onBack={onBack}
        subtitle={thread.botPaused === 1
          ? <span className="text-amber-200">Bot pausado{thread.handoffReason ? `: ${thread.handoffReason}` : ''}</span>
          : <span>La IA responde</span>}
        actions={(
          <>
            <label className="hidden items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-xs sm:flex" title="Respuesta automática en esta conversación">
              <Bot className="h-3.5 w-3.5" /> IA
              <Switch checked={thread.botPaused === 0} onCheckedChange={(on) => setPaused.mutate({ threadId, paused: !on })} />
            </label>
            <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setShowInfo((v) => !v)} aria-label="Ficha de la persona" aria-pressed={showInfo}>
              <Info className="h-5 w-5" />
            </Button>
            <ConfirmDeleteButton
              description={`Vas a eliminar toda la conversación con ${threadTitle(thread)}.`}
              onConfirm={(adminPassword) => deleteThread.mutateAsync({ threadId, adminPassword })}
            />
          </>
        )}
      />

      {showInfo && (
        <div className="max-h-[45%] shrink-0 space-y-3 overflow-y-auto border-b border-white/10 bg-black/20 p-3 md:p-4">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 p-3">
            <div className="text-sm">
              <p className="font-medium">Respuesta automática en esta conversación</p>
              <p className="text-xs text-muted-foreground">
                Se pausa sola apenas contestas a mano, desde este panel o desde la app del teléfono.
              </p>
            </div>
            <Switch checked={thread.botPaused === 0} onCheckedChange={(on) => setPaused.mutate({ threadId, paused: !on })} />
          </div>
          {thread.botPaused === 1 && (
            <AgentAutoResumeNote botPausedAt={thread.botPausedAt} handoffReason={thread.handoffReason} />
          )}
          <CustomerNotesCard channel="whatsapp" threadId={threadId} notes={thread.customerNotes} />
        </div>
      )}

      <ChatMessages count={messages.length}>
        {messages.map((m) => (
          <ChatBubble key={m.id} outgoing={m.direction !== 'in'} meta={`${SOURCE_LABEL[m.source] ?? ''}${chatTime(m.createdAt)}`}>
            <p className="whitespace-pre-wrap break-words">{m.text ?? '[adjunto]'}</p>
            <InteractiveSummary value={m.interactive} />
          </ChatBubble>
        ))}
      </ChatMessages>

      {thread.canReply ? (
        <ChatComposer
          value={text}
          onChange={setText}
          onSend={() => reply.mutate({ threadId, text: text.trim() })}
          sending={reply.isPending}
          maxLength={WA_MAX_REPLY_CHARS}
        />
      ) : (
        <p className="shrink-0 border-t border-white/10 p-3 text-center text-sm text-muted-foreground">
          Pasaron más de 24 horas desde su último mensaje: WhatsApp solo deja escribirle con una plantilla aprobada.
          Contéstale desde la app WhatsApp Business del teléfono.
        </p>
      )}
    </>
  );
}
