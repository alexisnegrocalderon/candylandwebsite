import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MessageCircle, Bot, Hand, Send, Sparkles, AlertTriangle, List, Link as LinkIcon } from 'lucide-react';
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl flex items-center gap-2"><MessageCircle className="w-6 h-6" /> WhatsApp</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Mensajes del WhatsApp de la productora y el agente de IA que los contesta (el mismo del Instagram).
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Las conversaciones sin actividad por más de 30 días se borran solas.
        </p>
      </div>

      <ConnectionCard />
      <AgentConfigCard />

      {selectedId === null
        ? <ThreadList onOpen={setSelectedId} />
        : <ThreadDetail threadId={selectedId} onBack={() => setSelectedId(null)} />}
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
  const { data: config } = trpc.whatsapp.getConfig.useQuery();
  const save = trpc.whatsapp.saveConfig.useMutation({
    onSuccess: () => { utils.whatsapp.getConfig.invalidate(); toast.success('Guardado.'); },
    onError,
  });
  const preview = trpc.whatsapp.preview.useMutation({ onError });

  const [draft, setDraft] = useState<WhatsAppAgentConfig | null>(null);
  const [testMessage, setTestMessage] = useState('hola, cuándo es la próxima fiesta?');
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
          en la sección <strong>Instagram</strong> y aplica a los dos canales.
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

function ThreadList({ onOpen }: { onOpen: (id: number) => void }) {
  const { data: threads, isLoading } = trpc.whatsapp.listThreads.useQuery(undefined, { refetchInterval: 30_000 });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando conversaciones...</p>;
  if (!threads || threads.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="Todavía no hay mensajes"
        description="Cuando alguien le escriba al WhatsApp de la productora, la conversación va a aparecer acá."
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
                {threadTitle(t)}
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

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Cargando conversación...</p>;

  const { thread, messages } = data;

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">{threadTitle(thread)}</CardTitle>
          {thread.botPaused === 1 && thread.handoffReason && (
            <p className="text-xs text-amber-600 mt-1">Bot pausado: {thread.handoffReason}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ConfirmDeleteButton
            description={`Vas a eliminar toda la conversación con ${threadTitle(thread)}.`}
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
              Se pausa sola apenas contestas a mano, desde este panel o desde la app del teléfono.
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
                <InteractiveSummary value={m.interactive} />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {SOURCE_LABEL[m.source] ?? ''}
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
              maxLength={WA_MAX_REPLY_CHARS}
              placeholder="Escribe tu respuesta..."
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) reply.mutate({ threadId, text: text.trim() }); }}
            />
            <WriteButton onClick={() => reply.mutate({ threadId, text: text.trim() })} disabled={reply.isPending || text.trim().length === 0}>
              <Send className="w-4 h-4" />
            </WriteButton>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground rounded-2xl border p-3">
            Pasaron más de 24 horas desde su último mensaje: WhatsApp solo deja escribirle con una plantilla aprobada.
            Contéstale desde la app WhatsApp Business del teléfono.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
