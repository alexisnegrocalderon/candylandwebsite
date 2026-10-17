import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, Search, Send } from 'lucide-react';
import { WriteButton } from '@/components/admin/WriteButton';
import { chileDateKey, formatChileShortDate, formatChileTime } from '@shared/chileDate';

/* Bandeja estilo Instagram, compartida por InstagramInbox y WhatsAppInbox:
 * lista de conversaciones a la izquierda y el chat abierto a la derecha. En
 * celular se ve una cosa a la vez (lista → chat con flecha para volver). */

/** Mientras el chat está a pantalla completa en el celular, la barra
 * inferior del panel se esconde (ver `.admin-chat-open` en admin.css). */
function useChatOpenFlag(open: boolean) {
  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add('admin-chat-open');
    return () => document.documentElement.classList.remove('admin-chat-open');
  }, [open]);
}

export function SplitInbox({ hasSelection, list, detail, empty }: {
  hasSelection: boolean;
  list: ReactNode;
  detail: ReactNode;
  /** Lo que se ve a la derecha (solo desktop) sin conversación abierta. */
  empty: ReactNode;
}) {
  useChatOpenFlag(hasSelection);
  return (
    // En celular, el chat abierto pasa a pantalla completa (encima de la barra
    // inferior), como en la app de Instagram: así el cuadro para responder
    // siempre queda a la vista.
    <div className={`admin-clay grid h-[calc(100dvh-14.5rem)] min-h-[460px] overflow-hidden p-0 md:h-[calc(100dvh-12.5rem)] md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr] ${hasSelection
      ? 'admin-chat-fullscreen max-md:fixed max-md:inset-0 max-md:z-50 max-md:h-dvh max-md:min-h-0 max-md:pb-[env(safe-area-inset-bottom)] max-md:pt-[env(safe-area-inset-top)]'
      : ''}`}>
      <div className={`min-h-0 flex-col border-white/10 md:flex md:border-r ${hasSelection ? 'hidden' : 'flex'}`}>{list}</div>
      <div className={`min-h-0 flex-col md:flex ${hasSelection ? 'flex' : 'hidden'}`}>
        {hasSelection ? detail : <div className="flex flex-1 items-center justify-center p-8 text-center">{empty}</div>}
      </div>
    </div>
  );
}

/** Columna izquierda: buscador + lista con scroll propio. */
export function InboxList({ search, onSearch, banner, children }: {
  search: string;
  onSearch: (value: string) => void;
  banner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="shrink-0 space-y-2 border-b border-white/10 p-3">
        <label className="flex h-10 items-center gap-2 rounded-xl bg-white/6 px-3 text-sm">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar conversación"
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
        {banner}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">{children}</div>
    </>
  );
}

export function InboxAvatar({ name, className = '' }: { name: string; className?: string }) {
  const letter = name.replace(/^@/, '').trim()[0]?.toUpperCase() ?? '?';
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.72_0.2_342)] via-[oklch(0.68_0.2_300)] to-[oklch(0.7_0.15_240)] p-[2px] ${className}`}>
      <span className="flex h-full w-full items-center justify-center rounded-full bg-[#1b1226] font-heading font-bold text-white">{letter}</span>
    </span>
  );
}

/** "15:02" si es de hoy, "16-10 15:02" si no -- debajo de cada burbuja. */
export function chatTime(date: Date | string): string {
  return chileDateKey(date) === chileDateKey(new Date())
    ? formatChileTime(date)
    : `${formatChileShortDate(date).slice(0, 5)} ${formatChileTime(date)}`;
}

/** Hora si es de hoy, fecha corta si no -- como la lista de Instagram. */
export function inboxTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  return chileDateKey(date) === chileDateKey(new Date()) ? formatChileTime(date) : formatChileShortDate(date).slice(0, 5);
}

export function ThreadRow({ title, preview, time, unread, active, onClick, tags }: {
  title: string;
  preview: string;
  time: string;
  unread: number;
  active: boolean;
  onClick: () => void;
  tags?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors ${active ? 'bg-white/12' : 'hover:bg-white/6'}`}
    >
      <InboxAvatar name={title} className="h-12 w-12 text-lg" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[15px] ${unread > 0 ? 'font-bold' : 'font-medium'}`}>{title}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{time}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-sm ${unread > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{preview}</span>
          {unread > 0 && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[oklch(0.72_0.2_342)]" aria-label={`${unread} sin leer`} />}
        </span>
        {tags && <span className="mt-1 flex flex-wrap gap-1">{tags}</span>}
      </span>
    </button>
  );
}

export function InboxTag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'info' }) {
  const cls = tone === 'warn' ? 'bg-amber-400/15 text-amber-200' : tone === 'info' ? 'bg-sky-400/15 text-sky-200' : 'bg-white/10 text-muted-foreground';
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${cls}`}>{children}</span>;
}

/** Cabecera del chat: volver (celular), persona, y acciones a la derecha. */
export function ChatHeader({ title, subtitle, onBack, actions }: {
  title: string;
  subtitle?: ReactNode;
  onBack: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-3 py-3 md:px-4">
      <button type="button" onClick={onBack} className="-ml-1 rounded-full p-1.5 hover:bg-white/10 md:hidden" aria-label="Volver a la lista">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <InboxAvatar name={title} className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{title}</p>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    </div>
  );
}

/** Mensajes con scroll propio; baja solo al último al abrir o al llegar uno nuevo. */
export function ChatMessages({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);
  return (
    <div ref={ref} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-4 md:px-5">
      {children}
    </div>
  );
}

export function ChatBubble({ outgoing, meta, children }: { outgoing: boolean; meta: string; children: ReactNode }) {
  return (
    <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[82%] px-4 py-2.5 text-[15px] md:max-w-[70%] ${outgoing
          ? 'rounded-[22px] rounded-br-md bg-gradient-to-br from-[oklch(0.62_0.22_330)] to-[oklch(0.55_0.22_295)] text-white'
          : 'rounded-[22px] rounded-bl-md bg-white/10 text-foreground'}`}
      >
        {children}
        <p className={`mt-1 text-[10px] ${outgoing ? 'text-white/70' : 'text-muted-foreground'}`}>{meta}</p>
      </div>
    </div>
  );
}

export function ChatComposer({ value, onChange, onSend, sending, maxLength }: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  maxLength: number;
}) {
  const canSend = value.trim().length > 0 && !sending;
  return (
    <div className="shrink-0 border-t border-white/10 p-3">
      <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 py-1 pl-4 pr-1">
        <input
          value={value}
          maxLength={maxLength}
          placeholder="Escribe un mensaje…"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSend) onSend(); }}
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        <WriteButton size="icon" className="h-9 w-9 shrink-0 rounded-full" onClick={onSend} disabled={!canSend} aria-label="Enviar">
          <Send className="h-4 w-4" />
        </WriteButton>
      </div>
    </div>
  );
}
