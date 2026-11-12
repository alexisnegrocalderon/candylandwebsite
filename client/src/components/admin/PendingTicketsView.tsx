import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Ticket, Search, Mail, MessageCircle, Ban } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { formatChileShortDate } from '@shared/chileDate';
import { whatsappLinkFor } from '@shared/ambassadorApplication';
import { onMutationError } from '@/pages/admin/sections/shared';

type Cat = 'pendiente' | 'proceso' | 'usada' | 'anulada';
import type { PendingCreditRow } from '../../../../server/accessCredit';
type Row = PendingCreditRow;

const CATS: { id: Cat; label: string; help: string }[] = [
  { id: 'pendiente', label: 'Pendientes', help: 'Siguen sin usar' },
  { id: 'proceso', label: 'En proceso', help: 'Alguien las está comprando ahora' },
  { id: 'usada', label: 'Usadas', help: 'Ya se canjearon' },
  { id: 'anulada', label: 'Anuladas', help: 'Sacadas de la lista' },
];

/** Estado real de una entrada pendiente: «en proceso» = reservada por una compra que aún no termina. */
const catOf = (r: Row): Cat => (r.status === 'cancelled' ? 'anulada' : r.status === 'used' ? 'usada' : r.status === 'reserved' && r.availability === 'used' ? 'proceso' : 'pendiente');

const waLink = (phone: string | null) => {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  return whatsappLinkFor(digits.length === 9 && digits.startsWith('9') ? `56${digits}` : digits);
};

/** «Entradas pendientes»: las entradas que quedaron guardadas por una reprogramación (créditos de acceso), de todas las fiestas, para
 * ver quién las tiene, recordarles por correo y anular las que ya se devolvieron por fuera. Anular pide la clave de admin y un motivo,
 * y solo toca el crédito: la entrada original ya estaba cancelada y el cupo ya había vuelto a la venta. */
export function PendingTicketsView() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.accessCredit.listPending.useQuery();
  const [cat, setCat] = useState<Cat>('pendiente');
  const [q, setQ] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [target, setTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');

  const remind = trpc.accessCredit.remind.useMutation({
    onSuccess: (r) => (r.sent ? toast.success('Recordatorio enviado') : toast.error('No se pudo enviar el correo')),
    onError: onMutationError,
  });
  const cancel = trpc.accessCredit.cancel.useMutation({
    onSuccess: () => {
      toast.success('Entrada anulada');
      setTarget(null); setReason(''); setPassword('');
      utils.accessCredit.listPending.invalidate();
      utils.accessCredit.list.invalidate();
    },
    onError: (e) => { onMutationError(e); utils.accessCredit.listPending.invalidate(); },
  });

  const rows = data ?? [];
  const counts = useMemo(() => {
    const c: Record<Cat, number> = { pendiente: 0, proceso: 0, usada: 0, anulada: 0 };
    for (const r of rows) c[catOf(r)]++;
    return c;
  }, [rows]);
  const events = useMemo(() => Array.from(new Set(rows.map((r) => r.originEventTitle).filter((t): t is string => !!t))), [rows]);

  const needle = q.trim().toLowerCase();
  const people = useMemo(() => {
    const filtered = rows.filter((r) => catOf(r) === cat
      && (!eventFilter || r.originEventTitle === eventFilter)
      && (!needle || [r.buyerName ?? '', r.buyerEmail, r.code, r.accesoName, r.originOrderNumber ?? ''].some((v) => v.toLowerCase().includes(needle))));
    const byPerson = new Map<string, Row[]>();
    for (const r of filtered) byPerson.set(r.buyerEmail, [...(byPerson.get(r.buyerEmail) ?? []), r]);
    return Array.from(byPerson.values());
  }, [rows, cat, eventFilter, needle]);

  const close = () => { if (!cancel.isPending) { setTarget(null); setReason(''); setPassword(''); } };
  const canSubmit = !!target && reason.trim().length >= 3 && password.length > 0 && !cancel.isPending;

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader className="px-3 sm:px-6"><CardTitle className="flex items-center gap-2"><Ticket className="h-5 w-5" /> Entradas pendientes</CardTitle></CardHeader>
      <CardContent className="space-y-4 px-3 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Entradas que quedaron guardadas por una reprogramación: la persona las usa cuando compre otra fiesta. Si ya se le devolvió el dinero por fuera, anúlala para sacarla de la lista.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Estado">
          {CATS.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)}
              className={`rounded-2xl border-2 px-3 py-2 text-left transition ${cat === c.id ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:bg-muted'}`}>
              <span className="block text-2xl font-extrabold leading-none">{counts[c.id]}</span>
              <span className="block text-sm font-semibold">{c.label}</span>
              <span className="block text-xs text-muted-foreground">{c.help}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, correo, código u orden" className="pl-9" aria-label="Buscar" />
          </div>
          {events.length > 1 && (
            <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} aria-label="Fiesta de origen"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Todas las fiestas</option>
              {events.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!isLoading && people.length === 0 && <p className="text-sm text-muted-foreground">No hay entradas {CATS.find((c) => c.id === cat)!.label.toLowerCase()}{needle || eventFilter ? ' con ese filtro' : ''}.</p>}

        {people.map((list) => {
          const first = list[0];
          const wa = waLink(first.buyerPhone);
          return (
            <div key={first.buyerEmail} className="space-y-2 rounded-2xl border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{first.buyerName ?? first.buyerEmail} <span className="font-normal text-muted-foreground">· {list.length} {list.length === 1 ? 'entrada' : 'entradas'}</span></p>
                  <p className="break-all text-xs text-muted-foreground">{first.buyerEmail}{first.buyerPhone ? ` · ${first.buyerPhone}` : ''}</p>
                </div>
                {cat === 'pendiente' && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={remind.isPending} onClick={() => remind.mutate({ creditId: first.id })}><Mail className="mr-1.5 h-3.5 w-3.5" /> Recordar</Button>
                    {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline"><MessageCircle className="mr-1.5 h-3.5 w-3.5" /> WhatsApp</Button></a>}
                  </div>
                )}
              </div>
              <ul className="space-y-1.5">
                {list.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/30 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-mono text-xs">{r.code}</span> · <strong>{r.accesoName}</strong>
                      <span className="block text-xs text-muted-foreground">
                        {r.originEventTitle ? `de ${r.originEventTitle}` : 'de una fiesta anterior'}{r.originOrderNumber ? ` · orden ${r.originOrderNumber}` : ''} · desde {formatChileShortDate(r.createdAt as unknown as string)}
                      </span>
                      {cat === 'anulada' && r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}
                    </span>
                    {cat === 'pendiente' && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setTarget(r)}><Ban className="mr-1.5 h-3.5 w-3.5" /> Anular</Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </CardContent>

      <AlertDialog open={!!target} onOpenChange={(v) => { if (!v) close(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular esta entrada pendiente</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p><strong>{target?.buyerName ?? target?.buyerEmail}</strong> · {target?.accesoName} · <span className="font-mono">{target?.code}</span></p>
                <p>Deja de servir para comprar. No toca las ventas ni los cupos: la entrada original ya estaba cancelada. Queda anotado en el historial.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Motivo (ej. devolución por transferencia)" aria-label="Motivo" />
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tu clave de admin" aria-label="Clave de admin"
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) { e.preventDefault(); cancel.mutate({ creditId: target!.id, reason: reason.trim(), adminPassword: password }); } }} />
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction disabled={!canSubmit} onClick={(e) => { e.preventDefault(); if (canSubmit) cancel.mutate({ creditId: target!.id, reason: reason.trim(), adminPassword: password }); }}>
              {cancel.isPending ? 'Anulando…' : 'Anular entrada'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
