import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Lock, MessageCircle, Instagram, Mail, ChevronLeft, ChevronRight, Sparkles, X, BellOff } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { WriteButton } from '@/components/admin/WriteButton';
import { formatChileDate, formatChileDateTime } from '@shared/chileDate';
import {
  CUSTOMER_LEVEL_META, GENDER_OPTIONS, SOURCE_OPTIONS, formatBirthDate, whatsappUrl,
} from '@shared/customerInsights';

/* Ficha de cliente (Admin → Clientes): panel lateral con pestañas. Lo editable
 * vive en la pestaña Datos y en Notas; todo lo demás se calcula en el servidor
 * (server/customerProfile.ts) y es de solo lectura. Una sola barra de
 * "Guardar" abajo, visible en cualquier pestaña mientras haya cambios. */

const NONE = '__none__';
const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

type FormState = {
  fullName: string; phone: string; rut: string; instagram: string; birthDate: string; gender: string; city: string;
  source: string; ambassadorCode: string; levelOverride: string; emailOptOut: boolean; whatsappOptOut: boolean;
  optOutReason: string; notes: string;
};

function formFromCustomer(c: any): FormState {
  return {
    fullName: c.fullName ?? '', phone: c.phone ?? '', rut: c.rut ?? '', instagram: c.instagram ?? '',
    birthDate: formatBirthDate(c.birthDate), gender: c.gender ?? '', city: c.city ?? '', source: c.source ?? '',
    ambassadorCode: c.ambassadorCode ?? '', levelOverride: c.levelOverride ?? '', emailOptOut: !!c.emailOptOut,
    whatsappOptOut: !!c.whatsappOptOut, optOutReason: c.optOutReason ?? '', notes: c.notes ?? '',
  };
}

const initials = (name: string | null | undefined, email: string) =>
  ((name || email).trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')) || '?';

export function CustomerDrawer({ customerId, onClose, onPrev, onNext, onChanged }: {
  customerId: number | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** Para que la lista de atrás se refresque después de guardar. */
  onChanged: () => void;
}) {
  const open = customerId != null;
  const utils = trpc.useUtils();
  const { data, isLoading, isError, error } = trpc.customers.detail.useQuery({ id: customerId ?? 0 }, { enabled: open });
  const [form, setForm] = useState<FormState | null>(null);
  const [initial, setInitial] = useState<FormState | null>(null);
  const [tab, setTab] = useState('datos');
  const [newTag, setNewTag] = useState('');
  const [adjust, setAdjust] = useState('');

  // Se recarga el formulario cuando llega otro cliente o se guardó (updatedAt).
  const loadedKey = data ? `${data.customer.id}:${String(data.customer.updatedAt)}` : null;
  useEffect(() => {
    if (!data) return;
    const f = formFromCustomer(data.customer);
    setForm(f);
    setInitial(f);
  }, [loadedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTab('datos'); setNewTag(''); setAdjust(''); }, [customerId]);

  const refresh = () => {
    utils.customers.detail.invalidate();
    onChanged();
  };
  const update = trpc.customers.update.useMutation({
    onSuccess: () => { toast.success('Ficha guardada'); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const addTag = trpc.customers.addTag.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const removeTag = trpc.customers.removeTag.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const adjustPlaycoins = trpc.customers.adjustPlaycoins.useMutation({
    onSuccess: () => { setAdjust(''); refresh(); },
    onError: (e) => toast.error(e.message),
  });

  const dirtyKeys = useMemo(
    () => (form && initial ? (Object.keys(form) as (keyof FormState)[]).filter((k) => form[k] !== initial[k]) : []),
    [form, initial],
  );
  const dirty = dirtyKeys.length > 0;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const save = () => {
    if (!form || !data || !dirty) return;
    // Solo viajan los campos que cambiaron: lo que se manda se protege de las
    // compras nuevas, y no hay por qué proteger un dato que no se tocó.
    const payload: Record<string, unknown> = { id: data.customer.id };
    for (const k of dirtyKeys) {
      const v = form[k];
      if (typeof v === 'boolean') payload[k] = v;
      else payload[k] = v.trim() === '' ? null : v.trim();
    }
    update.mutate(payload as any);
  };

  const c = data?.customer;
  const level = data ? CUSTOMER_LEVEL_META[data.level as keyof typeof CUSTOMER_LEVEL_META] : null;
  const locked: string[] = (c?.lockedFields as string[] | undefined) ?? [];
  const wa = whatsappUrl(form?.phone || c?.phone);
  const ig = (form?.instagram || c?.instagram || '').replace(/^@/, '');
  const tags: string[] = Array.isArray(c?.tags) ? (c!.tags as string[]) : [];

  const requestClose = () => {
    if (dirty && !window.confirm('Tienes cambios sin guardar. ¿Cerrar igual?')) return;
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) requestClose(); }}>
      <SheetContent className="w-full sm:max-w-3xl p-0 gap-0 bg-background [&>button]:hidden">
        <SheetHeader className="sr-only">
          <SheetTitle>Ficha de cliente</SheetTitle>
          <SheetDescription>Datos, historial y consumo del cliente</SheetDescription>
        </SheetHeader>

        {/* Barra superior */}
        <div className="flex items-center gap-1 px-3 pt-3 pb-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={onPrev} disabled={!onPrev} aria-label="Cliente anterior"><ChevronLeft className="w-5 h-5" /></Button>
          <Button variant="ghost" size="icon" onClick={onNext} disabled={!onNext} aria-label="Cliente siguiente"><ChevronRight className="w-5 h-5" /></Button>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={requestClose} aria-label="Cerrar"><X className="w-5 h-5" /></Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-6">
          {isLoading && <p className="text-sm text-muted-foreground py-8">Cargando ficha…</p>}
          {isError && <p className="text-sm text-destructive py-8">{error?.message ?? 'No se pudo cargar la ficha.'}</p>}

          {data && c && form && (
            <div className="space-y-5">
              {/* Encabezado */}
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/15 text-primary font-heading text-xl flex items-center justify-center shrink-0">
                  {initials(c.fullName, c.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-heading text-2xl truncate">{c.fullName || '(sin nombre)'}</h3>
                    {level && <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${level.chip}`}>{level.label}</span>}
                    {(c.emailOptOut || c.whatsappOptOut) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive flex items-center gap-1"><BellOff className="w-3 h-3" /> No contactar</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{c.email}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={!wa || !!c.whatsappOptOut} asChild={!!wa && !c.whatsappOptOut}>
                      {wa && !c.whatsappOptOut ? <a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a> : <span><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</span>}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={!ig} asChild={!!ig}>
                      {ig ? <a href={`https://instagram.com/${ig}`} target="_blank" rel="noopener noreferrer"><Instagram className="w-3.5 h-3.5" /> Instagram</a> : <span><Instagram className="w-3.5 h-3.5" /> Instagram</span>}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={!!c.emailOptOut} asChild={!c.emailOptOut}>
                      {!c.emailOptOut ? <a href={`mailto:${c.email}`}><Mail className="w-3.5 h-3.5" /> Correo</a> : <span><Mail className="w-3.5 h-3.5" /> Correo</span>}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => { navigator.clipboard?.writeText(c.email); toast.success('Email copiado'); }}>
                      <Copy className="w-3.5 h-3.5" /> Copiar email
                    </Button>
                  </div>
                </div>
              </div>

              {/* Indicadores */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Gastado" value={money(data.kpis.totalSpent)} />
                <Kpi label="Compras" value={String(data.kpis.totalOrders)} sub={`${data.kpis.eventsBought} fiesta${data.kpis.eventsBought === 1 ? '' : 's'}`} />
                <Kpi label="Asistencias" value={String(data.kpis.attendances)} sub="entrada escaneada" />
                <Kpi
                  label="Última actividad"
                  value={data.recency.daysSinceLastActivity != null ? `hace ${data.recency.daysSinceLastActivity} d` : '—'}
                  tone={data.recency.tone}
                />
              </div>

              {/* Próxima mejor acción */}
              {data.nextAction && (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex gap-3">
                  <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-primary font-semibold">Próxima mejor acción</p>
                    <p className="font-medium">{data.nextAction.title}</p>
                    <p className="text-sm text-muted-foreground">{data.nextAction.reason}</p>
                  </div>
                </div>
              )}

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="grid grid-cols-4 w-full">
                  <TabsTrigger value="datos">Datos</TabsTrigger>
                  <TabsTrigger value="historial">Historial</TabsTrigger>
                  <TabsTrigger value="consumo">Consumo</TabsTrigger>
                  <TabsTrigger value="notas">Notas</TabsTrigger>
                </TabsList>

                {/* DATOS */}
                <TabsContent value="datos" className="space-y-6 pt-4">
                  <Section title="Contacto">
                    <Field label="Nombre completo" locked={locked.includes('fullName')}>
                      <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
                    </Field>
                    <Field label="Email (no se puede cambiar)">
                      <Input value={c.email} disabled />
                    </Field>
                    <Field label="Teléfono / WhatsApp" locked={locked.includes('phone')}>
                      <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" placeholder="+56 9 1234 5678" />
                    </Field>
                    <Field label="Instagram" locked={locked.includes('instagram')}>
                      <Input value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@usuario" />
                    </Field>
                    <Field label="RUT" locked={locked.includes('rut')}>
                      <Input value={form.rut} onChange={(e) => set('rut', e.target.value)} placeholder="12.345.678-9" />
                    </Field>
                  </Section>

                  <Section title="Personal">
                    <Field label="Cumpleaños" hint={data.birthday.daysUntil != null ? `Cumple en ${data.birthday.daysUntil} día${data.birthday.daysUntil === 1 ? '' : 's'}${data.birthday.age != null ? ` · ${data.birthday.age + (data.birthday.daysUntil === 0 ? 0 : 1)} años` : ''}` : 'DD/MM/AAAA, o DD/MM si no sabes el año'}>
                      <Input value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} placeholder="15/03/1995" />
                      {data.suggestions.birthDate && !form.birthDate && (
                        <Suggestion text={`Cumpleañeros tiene ${formatBirthDate(data.suggestions.birthDate)}`} onUse={() => set('birthDate', formatBirthDate(data.suggestions.birthDate!))} />
                      )}
                    </Field>
                    <Field label="Género">
                      <Select value={form.gender || NONE} onValueChange={(v) => set('gender', v === NONE ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Sin definir" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Sin definir</SelectItem>
                          {GENDER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {data.suggestions.gender && !form.gender && (
                        <Suggestion text={`Playmatch lo registró como ${GENDER_OPTIONS.find((o) => o.value === data.suggestions.gender)?.label}`} onUse={() => set('gender', data.suggestions.gender!)} />
                      )}
                    </Field>
                    <Field label="Ciudad / comuna">
                      <Input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Viña del Mar" />
                    </Field>
                  </Section>

                  <Section title="Comercial">
                    <Field label="Cómo llegó">
                      <Select value={form.source || NONE} onValueChange={(v) => set('source', v === NONE ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Sin definir" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Sin definir</SelectItem>
                          {SOURCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {data.suggestions.source && !form.source && (
                        <Suggestion
                          text={`Su primera compra vino de: ${SOURCE_OPTIONS.find((o) => o.value === data.suggestions.source)?.label}`}
                          onUse={() => { set('source', data.suggestions.source!); if (data.suggestions.ambassadorCode && !form.ambassadorCode) set('ambassadorCode', data.suggestions.ambassadorCode); }}
                        />
                      )}
                    </Field>
                    <Field label="Embajador que lo trajo (código)">
                      <Input value={form.ambassadorCode} onChange={(e) => set('ambassadorCode', e.target.value.toUpperCase())} placeholder="SOFIA" />
                    </Field>
                    <Field label="Nivel" hint="Automático según compras y actividad; puedes forzarlo.">
                      <Select value={form.levelOverride || NONE} onValueChange={(v) => set('levelOverride', v === NONE ? '' : v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Automático ({level?.label})</SelectItem>
                          <SelectItem value="vip">Forzar VIP</SelectItem>
                          <SelectItem value="inactivo">Forzar inactivo</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </Section>

                  <Section title="Permisos de contacto">
                    <div className="sm:col-span-2 space-y-3">
                      <ToggleRow label="No enviarle correos" help="Queda fuera de mailing, promos automáticas y encuestas." checked={form.emailOptOut} onChange={(v) => set('emailOptOut', v)} />
                      <ToggleRow label="No escribirle por WhatsApp" help="Se desactiva el botón de WhatsApp y las sugerencias por ese canal." checked={form.whatsappOptOut} onChange={(v) => set('whatsappOptOut', v)} />
                      {(form.emailOptOut || form.whatsappOptOut) && (
                        <div>
                          <Label className="text-xs">Motivo (opcional)</Label>
                          <Input value={form.optOutReason} onChange={(e) => set('optOutReason', e.target.value)} placeholder="Pidió la baja por Instagram" className="mt-1" />
                          {c.optOutAt && <p className="text-xs text-muted-foreground mt-1">Baja registrada el {formatChileDate(c.optOutAt)}</p>}
                        </div>
                      )}
                    </div>
                  </Section>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Lock className="w-3 h-3" /> Lo que edites a mano (nombre, teléfono, RUT, Instagram) no se vuelve a sobrescribir con compras nuevas.</p>
                </TabsContent>

                {/* HISTORIAL */}
                <TabsContent value="historial" className="space-y-5 pt-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Por fiesta</p>
                    {data.eventHistory.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay compras.</p>}
                    <div className="space-y-2">
                      {data.eventHistory.map((e) => (
                        <div key={e.eventId} className="rounded-xl border border-border/60 p-3 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{e.title}</p>
                            <p className="text-xs text-muted-foreground">{e.eventDate ? formatChileDate(e.eventDate) : 'Sin fecha'}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${e.attended ? 'bg-emerald-500/15 text-emerald-700' : e.bought ? 'bg-amber-500/15 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                            {e.attended ? 'Asistió' : e.bought ? 'Compró, no asistió' : 'Solo barra'}
                          </span>
                          <div className="text-right text-xs tabular-nums w-28 shrink-0">
                            <p>Entradas {money(e.ticketsSpent)}</p>
                            <p className="text-muted-foreground">Barra {money(e.barSpent)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Compras recientes</p>
                    <div className="space-y-2">
                      {data.purchases.map((p) => (
                        <div key={p.orderNumber} className="rounded-xl border border-border/60 p-3 text-sm">
                          <div className="flex justify-between gap-3">
                            <span className="font-mono text-xs text-muted-foreground">{p.orderNumber}</span>
                            <span className="font-semibold tabular-nums">{money(p.total)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{p.eventTitle} · {p.channel === 'caja' ? 'Caja' : 'Web'}{p.paymentMethod ? ` · ${p.paymentMethod}` : ''} · {formatChileDateTime(p.createdAt)}</p>
                          {p.items.length > 0 && <p className="text-xs mt-1">{p.items.join(', ')}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* CONSUMO */}
                <TabsContent value="consumo" className="space-y-5 pt-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Kpi label="En entradas" value={money(data.kpis.ticketsSpent)} />
                    <Kpi label="En barra y caja" value={money(data.kpis.barSpent)} />
                    <Kpi label="Ticket promedio" value={data.kpis.averageTicket != null ? money(data.kpis.averageTicket) : '—'} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Lo que más consume</p>
                    {data.topProducts.length === 0 && <p className="text-sm text-muted-foreground">Sin compras en caja con su email todavía. Pídele el email en la caja para ir armando esto.</p>}
                    <div className="space-y-2">
                      {data.topProducts.map((p) => {
                        const max = data.topProducts[0].quantity || 1;
                        return (
                          <div key={p.name} className="text-sm">
                            <div className="flex justify-between"><span>{p.name}</span><span className="tabular-nums text-muted-foreground">{p.quantity} · {money(p.spent)}</span></div>
                            <div className="h-1.5 rounded-full bg-muted mt-1"><div className="h-full rounded-full bg-primary/70" style={{ width: `${(p.quantity / max) * 100}%` }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>

                {/* NOTAS */}
                <TabsContent value="notas" className="space-y-6 pt-4">
                  <div>
                    <Label>Notas internas</Label>
                    <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={6} className="mt-1" placeholder="Preferencias, conversaciones, alergias, VIP por…" />
                  </div>
                  <div>
                    <Label>Etiquetas</Label>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {tags.map((tag) => (
                        <span key={tag} className="text-xs pl-2.5 pr-1.5 py-1 rounded-full bg-secondary/20 flex items-center gap-1">
                          {tag}
                          <button onClick={() => removeTag.mutate({ customerId: c.id, tag })} className="hover:text-destructive" aria-label={`Quitar ${tag}`}><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                      <Input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && newTag.trim()) { addTag.mutate({ customerId: c.id, tag: newTag.trim() }); setNewTag(''); } }}
                        placeholder="+ etiqueta (Enter)"
                        className="h-8 w-40 text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border/60 p-3">
                      <p className="text-xs text-muted-foreground">Playcoins</p>
                      <p className="text-2xl font-semibold">🪙 {c.playcoins}</p>
                      <div className="flex gap-2 mt-2">
                        <Input type="number" value={adjust} onChange={(e) => setAdjust(e.target.value)} placeholder="+/-" className="h-8 w-24 text-xs" />
                        <WriteButton size="sm" variant="outline" className="h-8" disabled={adjustPlaycoins.isPending}
                          onClick={() => { const delta = Number(adjust); if (!Number.isFinite(delta) || delta === 0) return; adjustPlaycoins.mutate({ customerId: c.id, delta, note: 'Ajuste manual desde la ficha' }); }}>
                          Ajustar
                        </WriteButton>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 p-3">
                      <p className="text-xs text-muted-foreground">Saldo prepagado</p>
                      <p className="text-2xl font-semibold">{money(c.prepaidBalance)}</p>
                    </div>
                  </div>
                  {data.playcoinHistory.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Últimos movimientos de Playcoins</p>
                      <div className="space-y-1">
                        {data.playcoinHistory.map((h, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{formatChileDate(h.createdAt)} · {h.note || h.reason}</span>
                            <span className={`tabular-nums ${h.delta >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{h.delta >= 0 ? '+' : ''}{h.delta}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>

        {/* Barra de guardado: visible en cualquier pestaña mientras haya cambios */}
        {dirty && (
          <div className="shrink-0 border-t bg-background px-5 py-3 flex items-center gap-3">
            <p className="text-sm text-muted-foreground flex-1">Cambios sin guardar ({dirtyKeys.length})</p>
            <Button variant="ghost" onClick={() => initial && setForm(initial)} disabled={update.isPending}>Descartar</Button>
            <WriteButton onClick={save} disabled={update.isPending}>{update.isPending ? 'Guardando…' : 'Guardar ficha'}</WriteButton>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'reciente' | 'tibio' | 'frio' | null }) {
  const toneClass = tone === 'frio' ? 'text-destructive' : tone === 'tibio' ? 'text-amber-600' : tone === 'reciente' ? 'text-emerald-600' : '';
  return (
    <div className="rounded-2xl bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">{title}</p>
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, locked, children }: { label: string; hint?: string; locked?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">{label}{locked && <Lock className="w-3 h-3 text-muted-foreground" aria-label="Editado a mano" />}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Suggestion({ text, onUse }: { text: string; onUse: () => void }) {
  return (
    <button type="button" onClick={onUse} className="text-xs text-primary underline underline-offset-2 text-left">
      {text} — usar
    </button>
  );
}

function ToggleRow({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
