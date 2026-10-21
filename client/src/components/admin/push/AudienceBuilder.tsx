import { useState } from 'react';
import { toast } from 'sonner';
import { Bookmark, Plus, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { describeRule, LEVELS, normalizeSegment, type PushRule, type PushSegment } from '@shared/pushSegments';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const LEVEL_LABEL: Record<string, string> = { vip: 'VIP', recurrente: 'Recurrente', nuevo: 'Nuevo', inactivo: 'Inactivo', sin_compras: 'Sin compras' };

interface RuleOption { id: string; label: string; make: () => PushRule }
const GROUPS: { label: string; options: RuleOption[] }[] = [
  { label: 'Compras', options: [
    { id: 'nextEvent', label: 'Con entrada para el próximo evento', make: () => ({ type: 'nextEvent' }) },
    { id: 'nextEventNoTicket', label: 'Sin entrada para el próximo evento', make: () => ({ type: 'nextEventNoTicket' }) },
    { id: 'event', label: 'Compraron un evento…', make: () => ({ type: 'event', eventId: 0 }) },
    { id: 'attended', label: 'Fueron a un evento…', make: () => ({ type: 'attended', eventId: 0 }) },
    { id: 'recentBuyers', label: 'Compraron hace poco…', make: () => ({ type: 'recentBuyers', days: 30 }) },
    { id: 'dormant', label: 'Sin comprar hace tiempo…', make: () => ({ type: 'dormant', days: 60 }) },
    { id: 'neverBought', label: 'Nunca han comprado', make: () => ({ type: 'neverBought' }) },
  ] },
  { label: 'Perfil', options: [
    { id: 'level', label: 'Nivel de cliente…', make: () => ({ type: 'level', levels: ['vip'] }) },
    { id: 'birthdayMonth', label: 'Cumplen años en un mes…', make: () => ({ type: 'birthdayMonth', month: new Date().getMonth() + 1 }) },
    { id: 'birthdayToday', label: 'Cumplen años hoy', make: () => ({ type: 'birthdayToday' }) },
    { id: 'city', label: 'Ciudad o comuna…', make: () => ({ type: 'city', city: '' }) },
    { id: 'gender', label: 'Género…', make: () => ({ type: 'gender', gender: 'mujer' }) },
    { id: 'hasBalance', label: 'Con saldo PlayCard', make: () => ({ type: 'hasBalance' }) },
    { id: 'ambassadors', label: 'Embajadores VIP', make: () => ({ type: 'ambassadors' }) },
    { id: 'member', label: 'Socios (tienen cuenta)', make: () => ({ type: 'member' }) },
  ] },
  { label: 'App y avisos', options: [
    { id: 'appActive', label: 'Abrieron la app hace poco…', make: () => ({ type: 'app', mode: 'active', days: 30 }) },
    { id: 'appInactive', label: 'Hace tiempo que no abren la app…', make: () => ({ type: 'app', mode: 'inactive', days: 30 }) },
    { id: 'clicked', label: 'Tocaron un aviso anterior…', make: () => ({ type: 'clicked', campaignId: 0 }) },
    { id: 'notClicked', label: 'NO tocaron un aviso anterior…', make: () => ({ type: 'notClicked', campaignId: 0 }) },
  ] },
];

/** Parámetros editables de una regla, en la misma fila. */
function RuleParams({ rule, onChange }: { rule: PushRule; onChange: (r: PushRule) => void }) {
  const { data: events } = trpc.events.listAll.useQuery(undefined, { enabled: rule.type === 'event' || rule.type === 'attended' });
  const { data: campaigns } = trpc.customerPush.campaigns.useQuery(undefined, { enabled: rule.type === 'clicked' || rule.type === 'notClicked' });
  const num = (v: string, min: number, max: number, fallback: number) => Math.min(max, Math.max(min, Math.round(Number(v)) || fallback));

  switch (rule.type) {
    case 'event': case 'attended':
      return (
        <Select value={rule.eventId ? String(rule.eventId) : ''} onValueChange={(v) => onChange({ ...rule, eventId: Number(v) })}>
          <SelectTrigger className="h-8 w-52 text-xs"><SelectValue placeholder="Elige el evento" /></SelectTrigger>
          <SelectContent>{(events ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}</SelectContent>
        </Select>
      );
    case 'clicked': case 'notClicked':
      return (
        <Select value={rule.campaignId ? String(rule.campaignId) : ''} onValueChange={(v) => onChange({ ...rule, campaignId: Number(v) })}>
          <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Elige el aviso" /></SelectTrigger>
          <SelectContent>{(campaigns ?? []).filter((c: any) => c.status === 'sent' || c.status === 'sending').map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}</SelectContent>
        </Select>
      );
    case 'recentBuyers': case 'dormant':
      return <span className="flex items-center gap-1.5 text-xs">{rule.type === 'recentBuyers' ? 'en los últimos' : 'más de'} <Input type="number" className="h-8 w-16" value={rule.days} onChange={(e) => onChange({ ...rule, days: num(e.target.value, 1, 730, 30) })} /> días</span>;
    case 'app':
      return <span className="flex items-center gap-1.5 text-xs">{rule.mode === 'active' ? 'en los últimos' : 'más de'} <Input type="number" className="h-8 w-16" value={rule.days} onChange={(e) => onChange({ ...rule, days: num(e.target.value, 1, 730, 30) })} /> días</span>;
    case 'level':
      return (
        <span className="flex flex-wrap gap-1">
          {LEVELS.map((l) => {
            const on = rule.levels.includes(l);
            return <button key={l} type="button" onClick={() => onChange({ ...rule, levels: on ? rule.levels.filter((x) => x !== l) : [...rule.levels, l] })} className={`rounded-full px-2.5 py-1 text-[11px] ${on ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>{LEVEL_LABEL[l]}</button>;
          })}
        </span>
      );
    case 'birthdayMonth':
      return (
        <Select value={String(rule.month)} onValueChange={(v) => onChange({ ...rule, month: Number(v) })}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
      );
    case 'city':
      return <Input className="h-8 w-44 text-xs" placeholder="Valparaíso, Viña…" value={rule.city} onChange={(e) => onChange({ ...rule, city: e.target.value })} />;
    case 'gender':
      return (
        <Select value={rule.gender} onValueChange={(v) => onChange({ ...rule, gender: v })}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{[['mujer', 'Mujeres'], ['hombre', 'Hombres'], ['pareja', 'Parejas'], ['otro', 'Otro']].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
      );
    default:
      return null;
  }
}

const optionFor = (r: PushRule) => r.type === 'app' ? (r.mode === 'active' ? 'appActive' : 'appInactive') : r.type;
const labelFor = (r: PushRule) => GROUPS.flatMap((g) => g.options).find((o) => o.id === optionFor(r))?.label.replace('…', '') ?? describeRule(r);

function RuleList({ title, hint, rules, onChange, tone }: { title: string; hint: string; rules: PushRule[]; onChange: (r: PushRule[]) => void; tone: 'include' | 'exclude' }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm"><Plus className="mr-1 h-3.5 w-3.5" /> Agregar</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
            {GROUPS.map((g, gi) => (
              <div key={g.label}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">{g.label}</DropdownMenuLabel>
                {g.options.map((o) => <DropdownMenuItem key={o.id} onSelect={() => onChange([...rules, o.make()])}>{o.label.replace('…', '')}</DropdownMenuItem>)}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {rules.map((r, i) => (
        <div key={i} className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${tone === 'exclude' ? 'border-red-500/30 bg-red-500/5' : 'border-border bg-card/60'}`}>
          <span className="text-xs font-semibold">{labelFor(r)}</span>
          <RuleParams rule={r} onChange={(nr) => onChange(rules.map((x, j) => (j === i ? nr : x)))} />
          <button type="button" aria-label="Quitar" onClick={() => onChange(rules.filter((_, j) => j !== i))} className="ml-auto p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
    </div>
  );
}

/** Quiénes reciben el aviso: reglas que se suman («y»), reglas que dejan fuera, y audiencias guardadas. */
export function AudienceBuilder({ value, onChange }: { value: PushSegment; onChange: (s: PushSegment) => void }) {
  const { data: saved, refetch } = trpc.customerPush.presets.useQuery({ kind: 'audience' });
  const savePreset = trpc.customerPush.savePreset.useMutation({ onSuccess: () => { refetch(); toast.success('Audiencia guardada'); }, onError: (e) => toast.error(e.message) });
  const delPreset = trpc.customerPush.deletePreset.useMutation({ onSuccess: () => refetch() });
  const [pick, setPick] = useState('');
  const empty = !value.include.length && !value.exclude.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(saved ?? []).length > 0 && (
          <>
            <Select value={pick} onValueChange={(v) => { setPick(v); const p = (saved ?? []).find((x: any) => String(x.id) === v); if (p) onChange(normalizeSegment(p.data)); }}>
              <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Audiencias guardadas" /></SelectTrigger>
              <SelectContent>{(saved ?? []).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            {pick && <button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => { delPreset.mutate({ id: Number(pick) }); setPick(''); }}>Borrar esta audiencia</button>}
          </>
        )}
        <WriteButton type="button" variant="outline" size="sm" disabled={empty || savePreset.isPending} onClick={() => { const name = window.prompt('Nombre de la audiencia (ej. VIP de Valparaíso)'); if (name?.trim()) savePreset.mutate({ kind: 'audience', name, data: value }); }}>
          <Bookmark className="mr-1 h-3.5 w-3.5" /> Guardar audiencia
        </WriteButton>
      </div>
      {empty && <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Sin reglas: le llega a todos los que tienen los avisos activados. Agrega reglas para afinar.</p>}
      <RuleList title="Le llega a quienes cumplen TODO esto" hint="Cada regla que agregues reduce la audiencia." rules={value.include} onChange={(include) => onChange({ ...value, include })} tone="include" />
      <RuleList title="Pero NO a quienes…" hint="Quien cumpla cualquiera de estas queda fuera." rules={value.exclude} onChange={(exclude) => onChange({ ...value, exclude })} tone="exclude" />
    </div>
  );
}
