import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Instagram, Bot, Hand, Send, Sparkles, AlertTriangle, X, GraduationCap, TrendingUp, Lightbulb, Link2, Info, Settings2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { deliverAdminDeepLink, useAdminDeepLink } from '@/lib/adminDeepLink';
import { AdminNavContext } from '@/pages/admin/sections/shared';
import { AgentConfigCard as WhatsAppAgentConfigCard, ConnectionCard as WhatsAppConnectionCard } from '@/components/admin/WhatsAppInbox';
import { AgentAutoResumeNote } from '@/components/admin/AgentAutoResumeNote';
import { CustomerNotesCard } from '@/components/admin/CustomerNotesCard';
import { IgCustomerLinkCard } from '@/components/admin/IgCustomerLinkCard';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SplitInbox, InboxList, ThreadRow, InboxTag, ChatHeader, ChatMessages, ChatBubble, ChatComposer, chatTime, inboxTime } from '@/components/admin/inbox/SplitInbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/admin/EmptyState';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { InstagramAutomations } from '@/components/admin/InstagramAutomations';
import { InstagramComments } from '@/components/admin/InstagramComments';
import { InstagramLinkKit } from '@/components/admin/InstagramLinkKit';
import { formatChileDateTime } from '@shared/chileDate';
import { BRAND_BLOCKS, SALES_BLOCKS, joinBlocks, splitBlocks, type BlockDef } from '@shared/agentKnowledgeBlocks';
import { classifyHandoffNoise, NOISE_LABEL } from '@shared/agentKnowledge';
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

/* Pantalla al estilo del chat de Instagram: las conversaciones al frente
 * (lista + chat), Comentarios al lado, y todo lo que configura al agente
 * (conocimiento, ajustes, ventas, automatizaciones, kit de links) en el panel
 * "Agente" que se abre con el engranaje -- antes eran 7 pestañas seguidas y
 * el chat quedaba escondido entre configuraciones. La vista elegida se
 * recuerda en este navegador. */
const TAB_STORAGE_KEY = 'admin-instagram-tab';
const VIEWS = ['conversaciones', 'comentarios'] as const;
type InboxView = (typeof VIEWS)[number];
const AGENT_TABS = ['conocimiento', 'ajustes', 'ventas', 'automatizaciones', 'links'] as const;
type AgentTab = (typeof AGENT_TABS)[number];
/** Cada pestaña del agente es una sección del panel (hub «Agente IA»): `agente-<pestaña>`. */
export const agentSectionId = (tab: AgentTab | 'whatsapp') => `agente-${tab}`;

function readStoredView(): InboxView {
  try {
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (stored && (VIEWS as readonly string[]).includes(stored)) return stored as InboxView;
  } catch { /* sin localStorage (modo privado): vista por defecto */ }
  return 'conversaciones';
}

export function InstagramInbox() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setViewState] = useState<InboxView>(readStoredView);
  const setView = (next: InboxView) => {
    setViewState(next);
    try { window.localStorage.setItem(TAB_STORAGE_KEY, next); } catch { /* ídem */ }
  };
  const { openSection } = useContext(AdminNavContext);
  // El borrador vive acá arriba y no dentro de cada pestaña: las pestañas se
  // desmontan al cambiar, y "Conocimiento" y "Ajustes" editan la misma
  // config -- cambiar de pestaña (o cerrar el panel) no puede perder lo
  // escrito sin guardar.
  const agent = useAgentConfigDraft(() => openSection(agentSectionId('conocimiento')));
  const { data: pendingHandoffs } = trpc.instagram.listHandoffLog.useQuery();
  const pendingCount = pendingHandoffs?.length ?? 0;
  const { data: pendingComments } = trpc.instagramComments.pendingCount.useQuery();
  const [focusCommentId, setFocusCommentId] = useState<number | null>(null);
  const openThread = (id: number) => { setView('conversaciones'); setSelectedId(id); };
  // Llegó desde un aviso push: abre la vista y la conversación o el
  // comentario de ese aviso.
  useAdminDeepLink('instagram', (link) => {
    if (link.tab && (AGENT_TABS as readonly string[]).includes(link.tab)) openSection(agentSectionId(link.tab as AgentTab));
    if (link.tab && (VIEWS as readonly string[]).includes(link.tab)) setView(link.tab as InboxView);
    if (link.thread) openThread(link.thread);
    if (link.comment) { setView('comentarios'); setFocusCommentId(link.comment); }
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto flex items-center gap-2 font-heading text-2xl"><Instagram className="h-6 w-6" /> Instagram</h2>
        <div className="order-last flex w-full rounded-full border border-white/10 bg-white/5 p-1 sm:order-none sm:w-auto" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'conversaciones'} onClick={() => setView('conversaciones')}
            className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium sm:flex-none ${view === 'conversaciones' ? 'admin-tab-active' : 'text-muted-foreground'}`}>
            Chats
          </button>
          <button type="button" role="tab" aria-selected={view === 'comentarios'} onClick={() => setView('comentarios')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium sm:flex-none ${view === 'comentarios' ? 'admin-tab-active' : 'text-muted-foreground'}`}>
            Comentarios
            {!!pendingComments && <span className="admin-badge">{pendingComments}</span>}
          </button>
        </div>
        <button type="button" onClick={() => openSection(agentSectionId('conocimiento'))}
          className="admin-tab relative flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium">
          <Settings2 className="h-4 w-4" /> Agente
          {pendingCount > 0 && <span className="admin-badge">{pendingCount}</span>}
          {agent.dirty && <span className="h-2 w-2 rounded-full bg-amber-400" aria-label="Cambios sin guardar" />}
        </button>
      </div>

      <ConnectionCard />
      <AgentMasterSwitch agent={agent} />

      {view === 'conversaciones' ? (
        <SplitInbox
          hasSelection={selectedId !== null}
          list={<ThreadList selectedId={selectedId} onOpen={setSelectedId} />}
          detail={selectedId !== null && <ThreadDetail key={selectedId} threadId={selectedId} onBack={() => setSelectedId(null)} />}
          empty={(
            <div className="space-y-3 text-muted-foreground">
              <Instagram className="mx-auto h-12 w-12 opacity-60" />
              <p className="font-heading text-lg text-foreground">Tus mensajes</p>
              <p className="text-sm">Elige una conversación de la lista para leerla y responder.</p>
              <p className="text-xs">Las conversaciones sin actividad por más de 30 días se borran solas.</p>
            </div>
          )}
        />
      ) : (
        <InstagramComments focusId={focusCommentId} />
      )}
    </div>
  );
}

/* El borrador vive fuera de React: cada pestaña del agente es una sección distinta del panel y se desmonta al
 * cambiar de una a otra, pero «Conocimiento» y «Ajustes» editan la misma config y no se puede perder lo escrito. */
let agentDraft: InstagramAgentConfig | null = null;
const agentDraftListeners = new Set<() => void>();
function writeAgentDraft(next: InstagramAgentConfig | null | ((d: InstagramAgentConfig | null) => InstagramAgentConfig | null)) {
  agentDraft = typeof next === 'function' ? next(agentDraft) : next;
  agentDraftListeners.forEach((l) => l());
}
function useAgentDraftStore(): [InstagramAgentConfig | null, typeof writeAgentDraft] {
  const draft = useSyncExternalStore((l) => { agentDraftListeners.add(l); return () => { agentDraftListeners.delete(l); }; }, () => agentDraft);
  return [draft, writeAgentDraft];
}

/** Un solo borrador de la config del agente, compartido por las pestañas
 * "Conocimiento y tono" y "Ajustes del agente" (un solo "Guardar"). */
function useAgentConfigDraft(onCoachAppend: () => void) {
  const utils = trpc.useUtils();
  const query = trpc.instagram.getConfig.useQuery();
  const config = query.data;
  const save = trpc.instagram.saveConfig.useMutation({
    onSuccess: () => { utils.instagram.getConfig.invalidate(); toast.success('Guardado.'); },
    onError,
  });
  const [draft, setDraft] = useAgentDraftStore();
  useEffect(() => { if (config && !draft) setDraft(config); }, [config, draft]);

  // "Agregar" desde el coach semanal: suma la sugerencia al borrador (no la
  // guarda sola -- el conocimiento del agente lo guarda el dueño) y lleva a
  // la pestaña donde quedó, para que la vea y toque "Guardar".
  const onAppendRef = useRef(onCoachAppend);
  onAppendRef.current = onCoachAppend;
  useEffect(() => {
    const onAppend = (e: Event) => {
      const { field, text } = (e as CustomEvent<CoachAppendDetail>).detail;
      setDraft((d) => (d ? { ...d, [field]: d[field].trim().length > 0 ? `${d[field].trimEnd()}\n${text}` : text } : d));
      onAppendRef.current();
      toast.success('Agregado al borrador: revísalo y toca "Guardar".');
    };
    window.addEventListener(COACH_APPEND_EVENT, onAppend);
    return () => window.removeEventListener(COACH_APPEND_EVENT, onAppend);
  }, []);

  const dirty = !!draft && !!config && JSON.stringify(draft) !== JSON.stringify(config);
  return { query, config, draft, setDraft, save, dirty };
}
type AgentDraft = ReturnType<typeof useAgentConfigDraft>;

/** Lo que se muestra mientras la config no está: nunca una tarjeta vacía en
 * silencio. Pasó (27/09): faltaba una columna en la base, `getConfig` daba
 * error y todo el conocimiento del agente "desapareció" del panel sin
 * ningún aviso. `null` = la config ya está y se puede mostrar el resto. */
function AgentConfigLoadState({ agent }: { agent: AgentDraft }) {
  if (agent.draft) return null;
  if (agent.query.isError) {
    return (
      <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
        <CardContent className="space-y-3 pt-6 text-sm">
          <p className="font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> No se pudo cargar la configuración del agente</p>
          <p className="text-muted-foreground break-words">{agent.query.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => agent.query.refetch()} disabled={agent.query.isFetching}>
            {agent.query.isFetching ? 'Reintentando...' : 'Reintentar'}
          </Button>
        </CardContent>
      </Card>
    );
  }
  return <p className="text-sm text-muted-foreground">Cargando la configuración del agente...</p>;
}

/** El interruptor maestro, siempre a la vista arriba de las pestañas: es lo
 * más importante de la pantalla. Guarda solo el cambio de encendido sobre la
 * config ya guardada, sin arrastrar ediciones a medio hacer del borrador. */
function AgentMasterSwitch({ agent }: { agent: AgentDraft }) {
  const { draft, config, setDraft, save } = agent;
  if (!draft || !config) return <AgentConfigLoadState agent={agent} />;
  return (
    <div className="admin-clay-sm flex items-center justify-between gap-4 border border-white/10 bg-white/5 px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium"><Bot className="h-5 w-5 shrink-0" /> Contestar automáticamente</p>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Apagado, los mensajes igual llegan a esta bandeja: simplemente nadie recibe respuesta automática.
        </p>
      </div>
      <Switch
        checked={draft.enabled}
        disabled={save.isPending}
        onCheckedChange={(enabled) => { setDraft({ ...draft, enabled }); save.mutate({ ...config, enabled }); }}
      />
    </div>
  );
}

/** El «Guardar» ya no va dentro de cada tarjeta: es la barra fija de abajo (StickySaveBar). */
function SaveBar(_props: { agent: AgentDraft }) {
  return null;
}

function AgentKnowledgeCard({ agent }: { agent: AgentDraft }) {
  const { draft, setDraft } = agent;

  if (!draft) return <AgentConfigLoadState agent={agent} />;

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="w-5 h-5" /> Conocimiento y tono del agente</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Instagram y WhatsApp usan este mismo conocimiento: se edita solo acá.
        </p>

        <KnowledgeBlocks draft={draft} setDraft={setDraft} />

        <StyleExamplesField
          value={draft.styleExamples}
          onChange={(styleExamples) => setDraft({ ...draft, styleExamples })}
        />

        <div className="space-y-2">
          <Label>Mensaje cuando deriva a una persona</Label>
          <Input
            value={draft.handoffMessage}
            maxLength={IG_MAX_REPLY_CHARS}
            onChange={(e) => setDraft({ ...draft, handoffMessage: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Mensaje cuando solo agradecen</Label>
          <Input
            value={draft.thanksMessage}
            maxLength={IG_MAX_REPLY_CHARS}
            onChange={(e) => setDraft({ ...draft, thanksMessage: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Si el mensaje es solo un "muchas gracias" sin ninguna pregunta nueva, se contesta con este texto fijo y no
            se deriva a una persona.
          </p>
        </div>

        <SaveBar agent={agent} />
      </CardContent>
    </Card>
  );
}

function AgentSettingsCard({ agent }: { agent: AgentDraft }) {
  const { draft, setDraft } = agent;
  if (!draft) return <AgentConfigLoadState agent={agent} />;

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="w-5 h-5" /> Ajustes del agente</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3 rounded-2xl border p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Bienvenida en el primer mensaje</p>
              <p className="text-sm text-muted-foreground">
                La primera vez que alguien te escribe, el agente le da la bienvenida estilo Playroom: si ya te sigue le
                agradece, si no le invita a seguirte, y cierra con una pregunta de enganche de la lista de abajo.
              </p>
            </div>
            <Switch
              checked={draft.welcomeEnabled}
              onCheckedChange={(welcomeEnabled) => setDraft({ ...draft, welcomeEnabled })}
            />
          </div>
          <div className="space-y-2">
            <Label>Preguntas de enganche (una por línea)</Label>
            <Textarea
              rows={5}
              value={draft.hooks.join('\n')}
              onChange={(e) => setDraft({ ...draft, hooks: e.target.value.split('\n').map((h) => h.slice(0, 160)).slice(0, 20) })}
            />
            <p className="text-xs text-muted-foreground">
              Rotan sin repetirse con la misma persona. Se usan en la bienvenida y en los mensajes que salen desde un comentario.
            </p>
          </div>
        </div>
        <div className="space-y-3 rounded-2xl border p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Recordatorio si no contesta</p>
              <p className="text-sm text-muted-foreground">
                Si la persona no vuelve a escribir pasado este tiempo desde la última respuesta del bot, se le manda
                un único mensaje de cierre con el botón para comprar.
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
              maxLength={IG_MAX_REPLY_CHARS}
              onChange={(e) => setDraft({ ...draft, followUpMessage: e.target.value })}
            />
          </div>
        </div>

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

        <div className="space-y-2">
          <Label>Reactivar el agente solo después de (horas)</Label>
          <Input
            type="number" min={0} max={720} className="max-w-[180px]"
            value={draft.autoResumeHours}
            onChange={(e) => setDraft({ ...draft, autoResumeHours: Number(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">
            Una conversación pausada (porque el agente la derivó o porque contestaste tú) vuelve a tener agente sola pasado
            este tiempo desde tu último mensaje. Solo las cuentas de confianza (abajo) se quedan sin IA. 0 = no reactivar nunca solo.
          </p>
          <ResumeAllButton />
        </div>

        <NoAiAccountsEditor />

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">Coach semanal</p>
            <p className="text-sm text-muted-foreground">
              Los lunes a las 10:00 la IA revisa las conversaciones de la semana y te manda por correo qué preguntan más, dónde
              se enfría la gente y qué agregarle al conocimiento del agente.
            </p>
          </div>
          <Switch
            checked={draft.coachWeeklyEnabled}
            onCheckedChange={(coachWeeklyEnabled) => setDraft({ ...draft, coachWeeklyEnabled })}
          />
        </div>

        <SaveBar agent={agent} />
      </CardContent>
    </Card>
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

const COACH_APPEND_EVENT = 'agent-coach-append';
type CoachAppendDetail = { field: 'brandNotes' | 'salesPlaybook'; text: string };

/** Coach semanal del agente (server/agentCoach.ts): el último reporte, con
 * botón para generarlo ahora y para sumar cada sugerencia al borrador de la
 * config del agente con un toque. */
function AgentCoachCard() {
  const utils = trpc.useUtils();
  const { data: report } = trpc.instagram.coachReport.useQuery();
  const run = trpc.instagram.runCoachNow.useMutation({
    onSuccess: (result) => {
      if (result.ran) {
        utils.instagram.coachReport.invalidate();
        toast.success('Reporte listo.');
      } else {
        toast.info(`No se generó: ${result.reason ?? 'sin datos'}.`);
      }
    },
    onError,
  });
  const append = (field: CoachAppendDetail['field'], text: string) => {
    window.dispatchEvent(new CustomEvent<CoachAppendDetail>(COACH_APPEND_EVENT, { detail: { field, text } }));
  };

  const list = (title: string, items: string[], field?: CoachAppendDetail['field']) =>
    items.length === 0 ? null : (
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{title}</p>
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="text-sm flex items-start justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2">
              <span className="whitespace-pre-wrap">{item}</span>
              {field && (
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => append(field, item)}>Agregar</Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5" /> Coach semanal del agente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {report ? (
          <>
            <p className="text-xs text-muted-foreground">
              {formatChileDateTime(report.generatedAt)} · {report.stats.conversations} conversaciones · {report.stats.handoffs} derivaciones ·{' '}
              {report.stats.agentOrders} compras por el agente
            </p>
            <p className="text-sm">{report.summary}</p>
            {list('Lo que más preguntan', report.topQuestions)}
            {list('Dónde se enfría la gente', report.dropOffPoints)}
            {list('Para agregar a "Qué tiene que saber el agente"', report.knowledgeSuggestions, 'brandNotes')}
            {list('Para agregar a la guía de ventas', report.playbookSuggestions, 'salesPlaybook')}
            {list('Lo que funcionó y lo que no', report.highlights)}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Todavía no hay reporte. Se genera solo los lunes a las 10:00, o puedes generarlo ahora.
          </p>
        )}
        <WriteButton variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? 'Analizando la semana (puede tardar un minuto)...' : 'Generar ahora'}
        </WriteButton>
      </CardContent>
    </Card>
  );
}

/** Cuánto vendió el agente: órdenes aprobadas que entraron por un botón del
 * agente (Instagram + WhatsApp), gracias a la UTM que lleva cada link. */
/* Fans frecuentes: comentan o escriben seguido. Para cuidarlos (cortesía,
 * invitación especial). */
function FansCard({ onOpen }: { onOpen: (threadId: number) => void }) {
  const { data } = trpc.instagram.fans.useQuery();
  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle className="flex items-center gap-2">⭐ Tus fans</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">Quienes comentaron o te escribieron en 3 o más ocasiones en los últimos 30 días.</p>
        {!data || data.length === 0
          ? <p className="text-sm text-muted-foreground">Todavía no hay fans frecuentes este mes.</p>
          : data.map((f) => (
            <button key={f.igUserId} disabled={!f.threadId} onClick={() => f.threadId && onOpen(f.threadId)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border p-2.5 text-left text-sm disabled:cursor-default hover:enabled:border-primary/40">
              <span className="truncate">{f.username ? `@${f.username}` : f.name ?? 'Sin conversación abierta'}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{f.interactions} interacciones{f.isCustomer ? ' · cliente' : ''}</span>
            </button>
          ))}
      </CardContent>
    </Card>
  );
}

/* Los botones que el agente manda debajo de una respuesta breve: cada uno
 * lleva a la parte del sitio que tiene la información. Solo lectura: para
 * cambiar un nombre, se pide (cuidando el largo y el emoji). */
function AgentButtonsCard() {
  const { data } = trpc.instagram.agentButtons.useQuery();
  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="w-5 h-5" /> Botones del agente</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Cuando la respuesta está en el sitio, el agente contesta breve y manda UNO de estos botones debajo. Nunca escribe el link.
        </p>
        {(data ?? []).map((b) => (
          <div key={b.path} className="flex items-center justify-between gap-3 rounded-xl border p-2.5 text-sm">
            <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 font-medium">{b.label}</span>
            <span className="min-w-0 truncate text-right text-xs text-muted-foreground">{b.topic}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 rounded-xl border p-2.5 text-sm">
          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 font-medium">Comprar entrada 🔥</span>
          <span className="min-w-0 truncate text-right text-xs text-muted-foreground">Próxima fecha (con tu link de compra)</span>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentSalesCard() {
  const { data } = trpc.instagram.agentSales.useQuery();
  if (!data) return null;
  const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
  const bySource = (source: string) => data.total.bySource.find((r) => r.source === source);
  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" /> Ventas del agente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border p-3">
            <p className="text-xs text-muted-foreground">Últimos 7 días</p>
            <p className="text-2xl font-semibold">{data.last7Days.ordersCount}</p>
            <p className="text-xs text-muted-foreground">{clp(data.last7Days.revenue)}</p>
          </div>
          <div className="rounded-2xl border p-3">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold">{data.total.ordersCount}</p>
            <p className="text-xs text-muted-foreground">{clp(data.total.revenue)}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Instagram: {bySource('instagram')?.ordersCount ?? 0} · WhatsApp: {bySource('whatsapp')?.ordersCount ?? 0}. Cuenta las compras que
          entraron tocando un botón que mandó el agente (el detalle también está en "Ventas por Origen").
        </p>
      </CardContent>
    </Card>
  );
}

/** Preguntas que el agente derivó. El dueño puede enseñarle la respuesta con
 * sus palabras (la IA la convierte en datos que el agente usa después) o
 * descartarla. Lo que es ruido (adjuntos sin texto, solo emojis, mensajes
 * personales) se descarta solo y queda en un grupo plegado. Además el agente
 * aprende solo de lo que el dueño contesta a mano en la conversación. */
function HandoffLogCard() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.instagram.listHandoffLog.useQuery();
  const { data: dismissed } = trpc.instagram.listDismissedHandoffLog.useQuery();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const refresh = () => {
    utils.instagram.listHandoffLog.invalidate();
    utils.instagram.listDismissedHandoffLog.invalidate();
    utils.instagram.listKnowledge.invalidate();
  };
  const resolve = trpc.instagram.resolveHandoffLog.useMutation({ onSuccess: refresh, onError });
  const teach = trpc.instagram.teach.useMutation({
    onSuccess: (res, vars) => {
      refresh();
      setDrafts((d) => { const n = { ...d }; if (vars.handoffId != null) delete n[vars.handoffId]; return n; });
      const first = res.saved[0];
      toast.success(res.saved.length === 0 ? 'Ya lo sabía.' : res.saved.length === 1 && first ? `Aprendido: ${first.text}` : `El agente aprendió ${res.saved.length} datos.`);
    },
    onError,
  });

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><GraduationCap className="w-5 h-5" /> Preguntas que el agente no supo resolver</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Escribe con tus palabras lo que el agente debería saber y lo guarda como conocimiento: la próxima vez responde solo,
          sin repetir tu mensaje tal cual. Si contestas tú la conversación, también aprende de tu respuesta sin que hagas nada.
        </p>
        {isLoading ? null : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada pendiente por ahora -- buena señal.</p>
        ) : (
          <ul className="space-y-3">
            {data.map((row) => (
              <li key={row.id} className="rounded-2xl border p-3 space-y-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {row.channel === 'instagram' ? 'Instagram' : 'WhatsApp'} · {row.who} · {formatChileDateTime(row.createdAt)}
                </span>
                <p className="text-sm">"{row.incomingText}"</p>
                <p className="text-xs text-amber-600">{row.reason}</p>
                <Textarea
                  value={drafts[row.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                  placeholder="¿Qué debería saber el agente para responder esto? Ej.: sí se puede entrar con coche de guagua hasta las 8 pm"
                  rows={2}
                  maxLength={1000}
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => resolve.mutate({ id: row.id })} disabled={resolve.isPending}>Descartar</Button>
                  <Button
                    size="sm"
                    onClick={() => teach.mutate({ handoffId: row.id, idea: (drafts[row.id] ?? '').trim() })}
                    disabled={teach.isPending || (drafts[row.id] ?? '').trim().length < 3}
                  >
                    Enseñarle
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {dismissed && dismissed.length > 0 && (
          <details className="rounded-2xl border p-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">Descartados automáticamente ({dismissed.length})</summary>
            <ul className="mt-2 space-y-1.5">
              {dismissed.map((row) => {
                const kind = classifyHandoffNoise({ incomingText: row.incomingText, reason: row.reason });
                return (
                  <li key={row.id} className="text-xs text-muted-foreground">
                    {kind ? NOISE_LABEL[kind] : 'Ajeno a los eventos'} · {row.who} · {formatChileDateTime(row.createdAt)}
                    {row.incomingText ? ` · "${row.incomingText.slice(0, 80)}"` : ''}
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

const STATUS_LABEL = { activo: 'Activo', revisar: 'Por revisar', pausado: 'Pausado' } as const;
const TOPIC_LABEL = { general: 'General', precios: 'Precios y descuentos', reglas: 'Reglas e ingreso' } as const;

/** Lo que el agente ha aprendido. Lo general se activa solo; precios,
 * descuentos, reembolsos y reglas de ingreso esperan tu aprobación. */
function KnowledgeCard() {
  const utils = trpc.useUtils();
  const { data } = trpc.instagram.listKnowledge.useQuery();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const refresh = () => utils.instagram.listKnowledge.invalidate();
  const add = trpc.instagram.teach.useMutation({
    onSuccess: () => { refresh(); setDraft(''); toast.success('Guardado en el conocimiento del agente.'); },
    onError,
  });
  const setStatus = trpc.instagram.setKnowledgeStatus.useMutation({ onSuccess: refresh, onError });
  const saveText = trpc.instagram.updateKnowledgeText.useMutation({ onSuccess: () => { refresh(); setEditing(null); }, onError });
  const remove = trpc.instagram.deleteKnowledge.useMutation({ onSuccess: refresh, onError });
  const pending = (data ?? []).filter((k) => k.status === 'revisar').length;

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5" /> Lo que el agente aprendió</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Datos que aprendió de ti, activos de inmediato. Lo que toque precios, descuentos, reembolsos o reglas de ingreso
          queda "Por revisar" hasta que lo apruebes. Nunca guarda datos de personas.
          {pending > 0 ? ` Tienes ${pending} por revisar.` : ''}
        </p>
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim().length >= 3) add.mutate({ idea: draft.trim() }); }}
            placeholder="Agregar un dato: ej. los coches de guagua pueden entrar hasta las 8 pm"
            maxLength={1000}
          />
          <Button onClick={() => add.mutate({ idea: draft.trim() })} disabled={add.isPending || draft.trim().length < 3}>Agregar</Button>
        </div>
        {!data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no ha aprendido nada.</p>
        ) : (
          <ul className="space-y-2">
            {data.map((k) => (
              <li key={k.id} className="rounded-2xl border p-3 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className={k.status === 'activo' ? 'text-emerald-600 font-medium' : k.status === 'revisar' ? 'text-amber-600 font-medium' : ''}>
                    {STATUS_LABEL[k.status as keyof typeof STATUS_LABEL] ?? k.status}
                  </span>
                  <span>· {TOPIC_LABEL[k.topic as keyof typeof TOPIC_LABEL] ?? k.topic}</span>
                  <span>· {k.source === 'dueno' ? 'tú' : 'de tu respuesta'}</span>
                </div>
                {editing?.id === k.id ? (
                  <div className="flex gap-2">
                    <Input value={editing.text} onChange={(e) => setEditing({ id: k.id, text: e.target.value })} maxLength={1000} />
                    <Button size="sm" onClick={() => saveText.mutate({ id: k.id, text: editing.text.trim() })} disabled={saveText.isPending || editing.text.trim().length < 3}>Guardar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words">{k.text}</p>
                )}
                <div className="flex flex-wrap gap-1 justify-end">
                  {k.status === 'revisar' && (
                    <Button size="sm" onClick={() => setStatus.mutate({ id: k.id, status: 'activo' })}>Aprobar</Button>
                  )}
                  {k.status === 'activo' && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: k.id, status: 'pausado' })}>Pausar</Button>
                  )}
                  {k.status === 'pausado' && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: k.id, status: 'activo' })}>Activar</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: k.id, text: k.text })}>Editar</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove.mutate({ id: k.id })}>Eliminar</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
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
        pestaña, quedan guardadas recién al tocar "Guardar" más abajo.
      </p>
    </div>
  );
}

function ThreadList({ selectedId, onOpen }: { selectedId: number | null; onOpen: (id: number) => void }) {
  // Refresco periódico: el webhook escribe en la base desde otra invocación,
  // así que esta pantalla no se entera por sí sola de un mensaje nuevo.
  const { data: threads, isLoading } = trpc.instagram.listThreads.useQuery(undefined, { refetchInterval: 30_000 });
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const visible = (threads ?? []).filter((t) => !q
    || `${t.username ?? ''} ${t.name ?? ''} ${t.lastMessagePreview ?? ''}`.toLowerCase().includes(q));
  const toLink = (threads ?? []).filter((t) => t.needsCustomerLink).length;

  return (
    <InboxList
      search={search}
      onSearch={setSearch}
      banner={toLink > 0 && (
        <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-2.5 text-xs text-amber-100">
          {toLink === 1 ? '1 conversación dice' : `${toLink} conversaciones dicen`} que ya compraron y no están vinculadas a una ficha de cliente. Ábrelas para vincularlas.
        </p>
      )}
    >
      {isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando conversaciones...</p>}
      {!isLoading && (threads ?? []).length === 0 && (
        <EmptyState
          icon={Instagram}
          title="Todavía no hay mensajes"
          description="Cuando alguien le escriba al Instagram de la productora, la conversación va a aparecer acá."
        />
      )}
      {!isLoading && (threads ?? []).length > 0 && visible.length === 0 && (
        <p className="p-4 text-center text-sm text-muted-foreground">Nada coincide con “{search}”.</p>
      )}
      {visible.map((t) => (
        <ThreadRow
          key={t.id}
          title={t.username ? `@${t.username}` : t.name ?? t.igUserId}
          preview={t.lastMessagePreview ?? ''}
          time={inboxTime(t.lastMessageAt)}
          unread={t.unreadCount}
          active={t.id === selectedId}
          onClick={() => onOpen(t.id)}
          tags={(t.botPaused === 1 || t.needsCustomerLink || t.isFan || t.origin) && (
            <>
              {t.botPaused === 1 && <InboxTag tone="warn"><Hand className="h-3 w-3" /> Esperando al equipo</InboxTag>}
              {t.needsCustomerLink && <InboxTag tone="warn">Falta vincular ficha</InboxTag>}
              {t.isFan && <InboxTag>⭐ Fan</InboxTag>}
              {t.origin && <InboxTag tone="info">{t.origin}</InboxTag>}
            </>
          )}
        />
      ))}
    </InboxList>
  );
}

function ThreadDetail({ threadId, onBack }: { threadId: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.instagram.getThread.useQuery({ threadId }, { refetchInterval: 20_000 });
  const [text, setText] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  const markRead = trpc.instagram.markRead.useMutation({
    onSuccess: () => { utils.instagram.listThreads.invalidate(); },
  });
  const setPaused = trpc.instagram.setBotPaused.useMutation({
    onSuccess: () => { utils.instagram.getThread.invalidate({ threadId }); utils.instagram.listThreads.invalidate(); },
    onError,
  });
  const { data: agentConfig } = trpc.instagram.getConfig.useQuery();
  const setNoAi = trpc.instagram.setNoAiAccount.useMutation({
    onSuccess: (r) => {
      utils.instagram.getConfig.invalidate(); utils.instagram.getThread.invalidate({ threadId }); utils.instagram.listThreads.invalidate();
      toast.success(`Cuentas de confianza: ${r.noAiAccounts.length}.`);
    },
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

  if (isLoading || !data) return <p className="p-6 text-sm text-muted-foreground">Cargando conversación...</p>;

  const { thread, messages } = data;
  const title = thread.username ? `@${thread.username}` : thread.name ?? thread.igUserId;

  return (
    <>
      <ChatHeader
        title={title}
        onBack={onBack}
        subtitle={thread.botPaused === 1
          ? <span className="text-amber-200">Bot pausado{thread.handoffReason ? `: ${thread.handoffReason}` : ''}</span>
          : <span>{thread.isFan ? '⭐ Fan frecuente · ' : ''}{thread.origin ? `Llegó desde: ${thread.origin} · ` : ''}La IA responde</span>}
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
              description={`Vas a eliminar toda la conversación con ${title}.`}
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
                Se pausa sola apenas mandas un mensaje a mano. Usa este switch para pausarla antes de contestar, o para
                que el agente vuelva a responder este hilo.
              </p>
            </div>
            <Switch checked={thread.botPaused === 0} onCheckedChange={(on) => setPaused.mutate({ threadId, paused: !on })} />
          </div>
          {thread.botPaused === 1 && (
            <AgentAutoResumeNote botPausedAt={thread.botPausedAt} handoffReason={thread.handoffReason} isInstagram />
          )}
          {thread.username && (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 p-3">
              <div className="text-sm">
                <p className="font-medium">Cuenta de confianza (sin IA)</p>
                <p className="text-xs text-muted-foreground">Amigos o equipo: el agente nunca les contesta y no se les reactiva solo.</p>
              </div>
              <Switch
                checked={!!agentConfig?.noAiAccounts.includes(thread.username.toLowerCase())}
                disabled={!agentConfig || setNoAi.isPending}
                onCheckedChange={(on) => setNoAi.mutate({ username: thread.username!, noAi: on, threadId })}
              />
            </div>
          )}
          <CustomerNotesCard channel="instagram" threadId={threadId} notes={thread.customerNotes} />
          <IgCustomerLinkCard threadId={threadId} />
        </div>
      )}

      <ChatMessages count={messages.length}>
        {messages.map((m) => (
          <ChatBubble
            key={m.id}
            outgoing={m.direction !== 'in'}
            meta={`${m.source === 'bot' ? 'IA · ' : m.source === 'admin' ? 'Equipo · ' : ''}${chatTime(m.createdAt)}`}
          >
            <p className="whitespace-pre-wrap break-words">{m.text ?? '[adjunto]'}</p>
          </ChatBubble>
        ))}
      </ChatMessages>

      {thread.canReply ? (
        <ChatComposer
          value={text}
          onChange={setText}
          onSend={() => reply.mutate({ threadId, text: text.trim() })}
          sending={reply.isPending}
          maxLength={IG_MAX_REPLY_CHARS}
        />
      ) : (
        /* Regla de Meta, no nuestra: pasadas 24 horas del último mensaje de
         * la persona, la API rechaza cualquier respuesta. Mejor decirlo acá
         * que dejar escribir un mensaje que se va a perder. */
        <p className="shrink-0 border-t border-white/10 p-3 text-center text-sm text-muted-foreground">
          Pasaron más de 24 horas desde su último mensaje: Instagram ya no permite responder por acá. Hay que
          contestarle desde la app de Instagram.
        </p>
      )}
    </>
  );
}

/** Reactiva el agente de una vez en todas las conversaciones pausadas (menos las cuentas de confianza). */
function ResumeAllButton() {
  const utils = trpc.useUtils();
  const resume = trpc.instagram.resumeAllThreads.useMutation({
    onSuccess: (r) => { utils.instagram.listThreads.invalidate(); toast.success(`El agente volvió a quedar activo en ${r.resumed} conversaciones.`); },
    onError,
  });
  return (
    <Button type="button" variant="outline" size="sm" disabled={resume.isPending}
      onClick={() => { if (confirm('¿Reactivar el agente en TODAS las conversaciones pausadas? Las cuentas de confianza se quedan sin IA.')) resume.mutate(); }}>
      Reactivar la IA en todas las conversaciones ahora
    </Button>
  );
}

/** Lista de cuentas de confianza: amigos o equipo a quienes el agente nunca contesta. */
function NoAiAccountsEditor() {
  const utils = trpc.useUtils();
  const { data: config } = trpc.instagram.getConfig.useQuery();
  const [username, setUsername] = useState('');
  const set = trpc.instagram.setNoAiAccount.useMutation({
    onSuccess: () => { utils.instagram.getConfig.invalidate(); utils.instagram.listThreads.invalidate(); setUsername(''); },
    onError,
  });
  return (
    <div className="space-y-2">
      <Label>Cuentas de confianza (sin IA)</Label>
      <p className="text-xs text-muted-foreground">
        Amigos o equipo a quienes el agente nunca contesta ni se les reactiva solo. También puedes agregarlas desde la ficha de cada conversación.
      </p>
      <div className="flex flex-wrap gap-2">
        {(config?.noAiAccounts ?? []).map((u) => (
          <span key={u} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs">
            @{u}
            <button type="button" aria-label={`Quitar @${u}`} onClick={() => set.mutate({ username: u, noAi: false })}>×</button>
          </span>
        ))}
        {(config?.noAiAccounts.length ?? 0) === 0 && <span className="text-xs text-muted-foreground">Ninguna todavía.</span>}
      </div>
      <div className="flex gap-2 max-w-sm">
        <Input value={username} placeholder="@usuario" onChange={(e) => setUsername(e.target.value)} />
        <Button type="button" variant="outline" disabled={!username.trim() || set.isPending} onClick={() => set.mutate({ username, noAi: true })}>Agregar</Button>
      </div>
    </div>
  );
}

/* ── Hub «Agente IA»: una sección del panel por pestaña ───────────────────────────────────────────────── */

const WA_TAB = 'whatsapp' as const;

/** Lo que va arriba de todas las pestañas del agente: los dos canales y su estado de un vistazo. */
function AgentHeader({ agent }: { agent: AgentDraft }) {
  const { data: wa } = trpc.whatsapp.getConfig.useQuery();
  const { openSection } = useContext(AdminNavContext);
  const { draft, config, setDraft, save } = agent;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="admin-clay-sm flex items-center justify-between gap-3 border border-white/10 bg-white/5 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium"><Instagram className="h-4 w-4 shrink-0" /> Instagram</p>
            <p className="text-xs text-muted-foreground">{draft?.enabled ? 'Contesta solo' : 'Apagado: los mensajes llegan y nadie responde solo'}</p>
          </div>
          <Switch
            checked={!!draft?.enabled}
            disabled={!draft || !config || save.isPending}
            onCheckedChange={(enabled) => { if (!draft || !config) return; setDraft({ ...draft, enabled }); save.mutate({ ...config, enabled }); }}
          />
        </div>
        <button type="button" onClick={() => openSection(agentSectionId(WA_TAB))}
          className="admin-clay-sm flex items-center justify-between gap-3 border border-white/10 bg-white/5 px-4 py-3 text-left">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium"><Bot className="h-4 w-4 shrink-0" /> WhatsApp</p>
            <p className="text-xs text-muted-foreground">{wa?.enabled ? 'Contesta solo' : 'Todavía no está activo'}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${wa?.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{wa?.enabled ? 'Activo' : 'No activo'}</span>
        </button>
      </div>
    </div>
  );
}

const AGENT_TITLES: Record<AgentTab | typeof WA_TAB, string> = {
  conocimiento: 'Conocimiento y tono', ajustes: 'Ajustes del agente', ventas: 'Ventas y aprendizaje',
  automatizaciones: 'Automatizaciones', links: 'Kit de links', whatsapp: 'Agente de WhatsApp',
};

/** Una pestaña del agente como pantalla completa (la registra el panel en el hub «Agente IA»). */
export function AgentSection({ tab }: { tab: AgentTab | typeof WA_TAB }) {
  const { openSection } = useContext(AdminNavContext);
  const agent = useAgentConfigDraft(() => openSection(agentSectionId('conocimiento')));
  const { data: pendingHandoffs } = trpc.instagram.listHandoffLog.useQuery(undefined, { enabled: tab === 'ventas' });
  const openThread = (id: number) => { deliverAdminDeepLink({ section: 'instagram', thread: id }); openSection('instagram'); };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 font-heading text-2xl"><Bot className="h-6 w-6" /> {AGENT_TITLES[tab]}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Lo que sabe, cómo habla, cómo vende y sus automatizaciones. Instagram y WhatsApp comparten el mismo conocimiento.</p>
      </div>
      <AgentHeader agent={agent} />
      <AgentSummary />

      {tab === 'conocimiento' && (
        <div className="space-y-6">
          <AgentKnowledgeCard agent={agent} />
          <AgentTester agent={agent} />
        </div>
      )}
      {tab === 'ajustes' && (
        <div className="space-y-6">
          <AgentSettingsCard agent={agent} />
          <AgentButtonsCard />
          <AgentTester agent={agent} />
        </div>
      )}
      {tab === 'ventas' && (
        <div className="space-y-6">
          {!!pendingHandoffs?.length && <p className="text-sm text-amber-500">{pendingHandoffs.length} {pendingHandoffs.length === 1 ? 'conversación esperando' : 'conversaciones esperando'} al equipo (abajo, «Derivaciones»).</p>}
          <AgentSalesCard />
          <FansCard onOpen={openThread} />
          <AgentCoachCard />
          <KnowledgeCard />
          <HandoffLogCard />
        </div>
      )}
      {tab === 'automatizaciones' && <InstagramAutomations />}
      {tab === 'links' && <InstagramLinkKit />}
      {tab === WA_TAB && (
        <div className="space-y-5">
          <WhatsAppConnectionCard />
          <WhatsAppAgentConfigCard />
        </div>
      )}
      {agent.dirty && <div className="h-20" aria-hidden />}
      <StickySaveBar agent={agent} />
    </div>
  );
}

/* ── Conocimiento por bloques ─────────────────────────────────────────────────────────────────────────── */

type BlockField = 'brandNotes' | 'salesPlaybook';
const BLOCK_GROUPS: { field: BlockField; defs: BlockDef[]; items: { key: string; title: string; hint: string; rows: number }[] }[] = [
  { field: 'brandNotes', defs: BRAND_BLOCKS, items: [
    { key: '_rest', title: 'Sobre la marca y el tono', hint: 'Quiénes son, cómo hablan y lo que nunca debe decir. Las fechas y los precios NO se escriben acá: salen solos de los eventos.', rows: 6 },
    { key: 'faq', title: 'Preguntas frecuentes', hint: 'Respuestas a las preguntas de siempre (guardarropía, estacionamiento, edad, qué llevar…).', rows: 6 },
  ] },
  { field: 'salesPlaybook', defs: SALES_BLOCKS, items: [
    { key: 'clientTypes', title: 'Tipos de cliente', hint: 'Cómo acompañar a cada uno: primera vez, pareja, soltera o soltero, grupo de amigos, cliente que ya vino.', rows: 8 },
    { key: 'objections', title: 'Objeciones típicas', hint: '«Está caro», «me da vergüenza», «no sé qué ponerme»… y cómo responderlas.', rows: 6 },
    { key: '_rest', title: 'Otras guías de ventas', hint: 'Lo demás que quieras que el agente tenga en cuenta al vender.', rows: 4 },
  ] },
];

/** El conocimiento en bloques que se abren y cierran. Se guarda en los mismos dos textos de siempre. */
function KnowledgeBlocks({ draft, setDraft }: { draft: InstagramAgentConfig; setDraft: (d: InstagramAgentConfig) => void }) {
  const initial = () => Object.fromEntries(BLOCK_GROUPS.map((g) => {
    const { rest, blocks } = splitBlocks(draft[g.field], g.defs);
    return [g.field, { ...blocks, _rest: rest }];
  })) as unknown as Record<BlockField, Record<string, string>>;
  const [parts, setParts] = useState(initial);

  // Cambios que llegan de afuera (el coach agrega una sugerencia, se descarta lo editado): se vuelve a leer el texto.
  useEffect(() => {
    const stale = BLOCK_GROUPS.some((g) => joinBlocks(parts[g.field]._rest ?? '', parts[g.field], g.defs) !== draft[g.field].replace(/\s+$/g, ''));
    if (stale) setParts(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.brandNotes, draft.salesPlaybook]);

  const edit = (field: BlockField, key: string, value: string) => {
    const group = BLOCK_GROUPS.find((g) => g.field === field)!;
    const next = { ...parts, [field]: { ...parts[field], [key]: value } };
    setParts(next);
    setDraft({ ...draft, [field]: joinBlocks(next[field]._rest ?? '', next[field], group.defs) });
  };

  return (
    <div className="space-y-2">
      <Label>Qué sabe el agente</Label>
      {BLOCK_GROUPS.flatMap((g) => g.items.map((item) => ({ ...item, field: g.field }))).map((item, i) => {
        const value = parts[item.field][item.key] ?? '';
        return (
          <details key={`${item.field}-${item.key}`} open={i === 0} className="group rounded-2xl border border-white/10 bg-white/[0.03]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <span className="font-medium">{item.title}</span>
              <span className="text-xs text-muted-foreground">{value.trim() ? (() => { const n = value.trim().split(/\n/).filter(Boolean).length; return `${n} ${n === 1 ? 'línea' : 'líneas'}`; })() : 'vacío'} <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span></span>
            </summary>
            <div className="space-y-2 px-4 pb-4">
              <Textarea rows={item.rows} value={value} maxLength={6000} onChange={(e) => edit(item.field, item.key, e.target.value)} />
              <p className="text-xs text-muted-foreground">{item.hint}</p>
            </div>
          </details>
        );
      })}
    </div>
  );
}

/* ── Barra fija «Guardar / Descartar» ─────────────────────────────────────────────────────────────────── */

function StickySaveBar({ agent }: { agent: AgentDraft }) {
  const { draft, config, setDraft, save, dirty } = agent;
  if (!draft || !config || !dirty) return null;
  return (
    <div className="fixed inset-x-3 bottom-24 z-40 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-white/15 bg-[#1b1126]/95 px-4 py-3 shadow-2xl backdrop-blur md:bottom-4 md:left-[calc(50%+9rem)]">
      <span className="min-w-0 flex-1 text-sm text-amber-300">Tienes cambios sin guardar</span>
      <Button variant="ghost" size="sm" onClick={() => setDraft(config)} disabled={save.isPending}>Descartar</Button>
      <WriteButton size="sm" onClick={() => save.mutate(draft)} disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar'}</WriteButton>
    </div>
  );
}

/* ── Probar el agente: una conversación de prueba con lo que hay escrito (guardado o no) ─────────────── */

function AgentTester({ agent }: { agent: AgentDraft }) {
  const [thread, setThread] = useState<{ role: 'user' | 'agent'; text: string; note?: string }[]>([]);
  const [input, setInput] = useState('');
  const [showContext, setShowContext] = useState(false);
  const { data: contextPreview } = trpc.instagram.previewContext.useQuery(undefined, { enabled: showContext });
  const bottom = useRef<HTMLDivElement>(null);
  const preview = trpc.instagram.preview.useMutation({
    onSuccess: (res) => {
      const note = res.isPersonal ? 'Lo marcó como mensaje personal: no respondería solo.'
        : res.handoff ? `Derivaría a una persona: ${res.handoffReason}`
        : res.action === 'buy_link' ? '+ botón «Comprar entrada»' : res.action === 'page_link' ? `+ botón a la página ${res.pageKey}` : undefined;
      setThread((t) => [...t, { role: 'agent', text: res.isPersonal ? '(sin respuesta automática)' : res.reply, note }]);
    },
    onError,
  });
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [thread.length, preview.isPending]);

  const send = () => {
    const text = input.trim();
    if (!text || preview.isPending) return;
    const history = thread.filter((m) => m.text !== '(sin respuesta automática)').slice(-10).map(({ role, text: t }) => ({ role, text: t }));
    setThread((t) => [...t, { role: 'user', text }]);
    setInput('');
    preview.mutate({ message: text, history, ...(agent.dirty && agent.draft ? { draft: agent.draft as unknown as Record<string, unknown> } : {}) });
  };

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Probar el agente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Escribe como si fueras un seguidor y mira qué contestaría, sin mandarle nada a nadie.
          {agent.dirty ? ' Usa tus cambios sin guardar.' : ' Usa lo que está guardado.'} Cada mensaje es una consulta real a la IA.
        </p>
        <div className="max-h-80 min-h-24 space-y-2 overflow-y-auto rounded-2xl bg-white/[0.03] p-3">
          {thread.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Prueba con: «hola, cuánto vale la entrada?»</p>}
          {thread.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-primary/80 text-primary-foreground' : 'bg-white/10'}`}>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.note && <p className="mt-1 text-xs text-amber-300">{m.note}</p>}
              </div>
            </div>
          ))}
          {preview.isPending && <p className="text-xs text-muted-foreground">Escribiendo…</p>}
          <div ref={bottom} />
        </div>
        <div className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="Escribe un mensaje como si fueras un seguidor" maxLength={1000} />
          <WriteButton onClick={send} disabled={preview.isPending || !input.trim()}><Send className="h-4 w-4" /></WriteButton>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => setThread([])} disabled={thread.length === 0}>Empezar de nuevo</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowContext((v) => !v)}>{showContext ? 'Ocultar' : 'Ver'} los datos que recibe la IA</Button>
        </div>
        {showContext && <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl bg-muted/40 p-4 text-xs">{contextPreview?.context ?? 'Cargando...'}</pre>}
      </CardContent>
    </Card>
  );
}

/* ── Resumen arriba ────────────────────────────────────────────────────────────────────────────────────── */

function AgentSummary() {
  const { data: threads } = trpc.instagram.listThreads.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const { data: sales } = trpc.instagram.agentSales.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const { data: handoffs } = trpc.instagram.listHandoffLog.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const { openSection } = useContext(AdminNavContext);
  const today = new Date().toLocaleDateString('es-CL', { timeZone: 'America/Santiago' });
  const talkedToday = (threads ?? []).filter((t: any) => t.lastInboundAt && new Date(t.lastInboundAt).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }) === today).length;
  const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
  const stats: { value: string; label: string; onClick?: () => void; alert?: boolean }[] = [
    { value: String(talkedToday), label: 'conversaciones hoy (Instagram)' },
    { value: sales ? `${sales.last7Days.ordersCount} · ${clp(sales.last7Days.revenue)}` : '—', label: 'ventas atribuidas, 7 días', onClick: () => openSection(agentSectionId('ventas')) },
    { value: String(handoffs?.length ?? 0), label: 'preguntas por enseñarle', onClick: () => openSection(agentSectionId('ventas')), alert: (handoffs?.length ?? 0) > 0 },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map((s) => (
        <button key={s.label} type="button" onClick={s.onClick} disabled={!s.onClick}
          className={`admin-clay-sm rounded-2xl border px-3 py-2.5 text-left ${s.alert ? 'border-amber-500/40' : 'border-white/10'}`}>
          <p className="text-lg font-bold tabular-nums leading-tight">{s.value}</p>
          <p className="text-[11px] leading-tight text-muted-foreground">{s.label}</p>
        </button>
      ))}
    </div>
  );
}
