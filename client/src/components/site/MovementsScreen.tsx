import { useMemo, useState } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatChileTime } from '@shared/chileDate';
import {
  HISTORY_EMPTY, HISTORY_FILTERS, HISTORY_ICON, formatHistoryAmount, formatHistoryBalance, historyDayKey, historyDayLabel,
  type HistoryFilter, type HistoryItem,
} from '@shared/memberHistory';

/* «Mis movimientos»: la línea de tiempo de todo lo que la persona hizo y gastó, ordenada por fecha y agrupada por
 * día, con filtros. Se lee de `member.history` (server/memberHistory.ts) y se pide por páginas. */

function Row({ item }: { item: HistoryItem }) {
  const amount = formatHistoryAmount(item.amount, item.unit);
  const balance = formatHistoryBalance(item.balanceAfter, item.unit);
  const meta = [item.eventTitle, item.orderNumber].filter(Boolean).join(' · ');
  const tone = item.unit === 'pc' ? 'text-violet-300' : (item.amount ?? 0) > 0 ? 'text-emerald-300' : 'text-white';
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.08] text-lg" aria-hidden>{HISTORY_ICON[item.kind]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-subhead font-semibold leading-tight text-white">{item.title}</p>
        {item.detail && <p className="mt-0.5 text-footnote leading-snug text-white/70">{item.detail}</p>}
        <p className="mt-0.5 truncate text-caption1 text-white/55">{formatChileTime(item.at)}{meta ? ` · ${meta}` : ''}</p>
        {item.status && <span className="mt-1 inline-block rounded-full bg-amber-300/15 px-2 py-0.5 text-caption2 font-semibold capitalize text-amber-200">{item.status}</span>}
      </div>
      {(amount || balance) && (
        <div className="shrink-0 text-right">
          {amount && <p className={`text-subhead font-bold tabular-nums ${tone}`}>{amount}</p>}
          {balance && <p className="mt-0.5 text-caption2 tabular-nums text-white/55">{balance}</p>}
        </div>
      )}
    </li>
  );
}

export function MovementsScreen({ prepaidBalance, playcoins }: { prepaidBalance: number; playcoins: number }) {
  const [filter, setFilter] = useState<HistoryFilter>('todo');
  const q = trpc.member.history.useInfiniteQuery(
    { filter },
    { getNextPageParam: (last) => last.next ?? undefined, retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const items = useMemo(() => (q.data?.pages ?? []).flatMap((p) => p.items), [q.data]);
  const groups = useMemo(() => {
    const out: { key: string; label: string; rows: HistoryItem[] }[] = [];
    const now = new Date();
    for (const it of items) {
      const key = historyDayKey(it.at);
      const last = out[out.length - 1];
      if (last?.key === key) last.rows.push(it);
      else out.push({ key, label: historyDayLabel(key, now), rows: [it] });
    }
    return out;
  }, [items]);

  return (
    <div className="space-y-4 pb-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="account-glass rounded-[20px] px-4 py-3"><p className="text-caption2 font-semibold uppercase tracking-[0.16em] text-white/60">Saldo</p><p className="mt-0.5 text-title3 font-bold tabular-nums">${prepaidBalance.toLocaleString('es-CL')}</p></div>
        <div className="account-glass rounded-[20px] px-4 py-3"><p className="text-caption2 font-semibold uppercase tracking-[0.16em] text-white/60">Playcoins</p><p className="mt-0.5 text-title3 font-bold tabular-nums text-violet-300">{playcoins.toLocaleString('es-CL')}</p></div>
      </div>

      <div role="tablist" aria-label="Filtrar movimientos" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {HISTORY_FILTERS.map(({ key, label }) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
            className={`h-9 shrink-0 rounded-full px-4 text-footnote font-semibold transition-colors ${filter === key ? 'bg-white text-[#0d0712]' : 'account-glass text-white/75'}`}>
            {label}
          </button>
        ))}
      </div>

      {q.isLoading && <div className="space-y-2" aria-label="Cargando">{[0, 1, 2, 3].map((i) => <div key={i} className="account-glass h-16 animate-pulse rounded-[18px]" />)}</div>}

      {q.isError && (
        <div className="account-glass flex flex-col items-center gap-2 rounded-[22px] px-5 py-8 text-center">
          <WifiOff className="h-6 w-6 text-white/60" />
          <p className="text-subhead font-semibold">No pudimos cargar tus movimientos</p>
          <p className="text-footnote text-white/65">Revisa tu conexión e inténtalo de nuevo. Tus entradas y tu saldo siguen disponibles en la PlayCard.</p>
          <button type="button" onClick={() => { void q.refetch(); }} className="mt-1 h-10 rounded-full bg-white px-5 text-footnote font-bold text-[#0d0712]">Reintentar</button>
        </div>
      )}

      {!q.isLoading && !q.isError && items.length === 0 && (
        <div className="account-glass rounded-[22px] px-5 py-8 text-center text-subhead text-white/70">{HISTORY_EMPTY[filter]}</div>
      )}

      {groups.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <h3 className="px-1 text-footnote font-semibold uppercase tracking-[0.14em] text-white/60">{g.label}</h3>
          <ul className="account-glass mt-1.5 divide-y divide-white/10 rounded-[22px] px-4">{g.rows.map((it) => <Row key={it.id} item={it} />)}</ul>
        </section>
      ))}

      {q.hasNextPage && (
        <button type="button" onClick={() => { void q.fetchNextPage(); }} disabled={q.isFetchingNextPage}
          className="account-glass flex h-12 w-full items-center justify-center gap-2 rounded-full text-subhead font-semibold text-white disabled:opacity-60">
          {q.isFetchingNextPage ? <><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</> : 'Ver más movimientos'}
        </button>
      )}

      {!q.isLoading && !q.isError && items.length > 0 && (
        <p className="px-3 pt-1 text-center text-caption1 leading-snug text-white/50">
          Lo que pagaste en efectivo en una caja sin dar tu correo ni mostrar tu QR no se puede asociar a tu cuenta y no aparece acá.
        </p>
      )}
    </div>
  );
}
