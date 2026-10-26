import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, DatabaseZap, FilePlus2, ListChecks, Plus, ScrollText, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useIsDemo, DEMO_TOOLTIP } from '@/lib/demoMode';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AdminPasswordDialog } from '@/components/admin/AdminPasswordDialog';
import { STAFF_CARGOS } from '@shared/staffCargos';
import { MANUAL_GENERAL, MANUAL_LIMITS, manualKeysFor, normalizeSections, type ManualKey } from '@shared/staffManuals';
import { MANUAL_DRAFTS } from '@shared/staffManualDefaults';
import { formatChileDateTime } from '@shared/chileDate';

/* Admin → Noche → Staff → Manuales: el reglamento general y el manual de cada cargo. Se escribe una vez y sirve para
 * todas las fiestas; al publicar nace una versión nueva y cada persona vuelve a aceptar («Leí y acepto» en su app). */

const onErr = (e: unknown) => toast.error((e as { message?: string })?.message || 'No se pudo completar la acción');
const pill = 'rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95 disabled:opacity-60';
const pillOn = 'bg-pink-500 text-white shadow-sm';
const pillOff = 'bg-black/5 text-[var(--admin-muted)] hover:bg-black/10';

interface DraftSection { title: string; kind: 'text' | 'checklist'; text: string; itemsText: string }
const toDraft = (sections: { title: string; kind: 'text' | 'checklist'; text: string; items: string[] }[]): DraftSection[] =>
  sections.map((s) => ({ title: s.title, kind: s.kind, text: s.text, itemsText: s.items.join('\n') }));
const fromDraft = (sections: DraftSection[]) =>
  sections.map((s) => ({ title: s.title, kind: s.kind, text: s.text, items: s.itemsText.split('\n') }));

const DOCS: { key: ManualKey; label: string; emoji: string }[] = [
  { key: MANUAL_GENERAL, label: 'Reglamento general', emoji: '📜' },
  ...STAFF_CARGOS.map((c) => ({ key: c.key as ManualKey, label: c.label, emoji: c.emoji })),
];

export function ManualsEditor({ team }: { team: any[] }) {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const { data: schema } = trpc.finance.manualSchema.useQuery(undefined, { enabled: !isDemo, retry: false });
  const ready = schema?.ready ?? true;
  const { data: current } = trpc.finance.manualsCurrent.useQuery(undefined, { enabled: ready });
  const { data: overview } = trpc.finance.manualsOverview.useQuery(undefined, { enabled: ready });
  const [key, setKey] = useState<ManualKey>(MANUAL_GENERAL);
  const published = (current ?? []).find((d: any) => d.key === key) ?? null;
  const { data: history } = trpc.finance.manualsHistory.useQuery({ key }, { enabled: ready });

  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<DraftSection[]>([]);
  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [askPassword, setAskPassword] = useState(false);

  // Al cambiar de manual (o cuando llega lo publicado) se carga lo vigente; si no hay, queda vacío para escribir o cargar el borrador.
  useEffect(() => {
    if (dirty) return;
    setTitle(published?.title ?? MANUAL_DRAFTS[key].title);
    setSections(published ? toDraft(published.sections) : []);
    setNote('');
  }, [key, published?.version, current === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = trpc.finance.manualSchemaApply.useMutation({
    onSuccess: (r) => { utils.finance.manualSchema.invalidate(); toast.success(r.applied.length ? 'Base de datos actualizada' : 'La base ya estaba al día'); },
    onError: onErr,
  });
  const publish = trpc.finance.manualsPublish.useMutation({
    onSuccess: (r) => {
      utils.finance.manualsCurrent.invalidate(); utils.finance.manualsHistory.invalidate(); utils.finance.manualsOverview.invalidate();
      setDirty(false); setNote('');
      toast.success(`Publicado: versión ${r.version}. Cada persona debe aceptarla de nuevo.`);
    },
    onError: onErr,
  });

  const edit = (next: DraftSection[]) => { setSections(next); setDirty(true); };
  const patch = (i: number, p: Partial<DraftSection>) => edit(sections.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= sections.length) return; const n = [...sections]; [n[i], n[j]] = [n[j], n[i]]; edit(n); };
  const loadDraft = () => {
    if (sections.length > 0 && !window.confirm('Esto reemplaza lo que tienes escrito por el borrador. ¿Seguir?')) return;
    setTitle(MANUAL_DRAFTS[key].title); setSections(toDraft(MANUAL_DRAFTS[key].sections)); setDirty(true);
  };

  const clean = useMemo(() => normalizeSections(fromDraft(sections)), [sections]);
  const nextVersion = (published?.version ?? 0) + 1;

  // Quién aceptó lo vigente de cada manual: general = todos; un cargo = los de ese cargo.
  const stats = (k: ManualKey) => {
    const people = team.filter((m) => m.active && (k === MANUAL_GENERAL || manualKeysFor(m.cargo).includes(k)));
    const ok = people.filter((m) => (overview ?? []).find((o: any) => o.staffId === m.id)?.status === 'al_dia').length;
    return { total: people.length, ok };
  };
  const st = stats(key);

  if (!ready) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
        <DatabaseZap className="h-6 w-6 shrink-0 text-amber-500" />
        <div className="min-w-[14rem] flex-1">
          <p className="font-semibold">Falta crear las tablas del manual</p>
          <p className="text-sm text-[var(--admin-muted)]">Solo agrega 2 tablas nuevas ({schema?.missing.length ?? 0} cambios); no toca tus datos. El resto del staff sigue funcionando igual.</p>
        </div>
        <button type="button" disabled={apply.isPending} onClick={() => setAskPassword(true)} className="rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-black transition active:scale-95 disabled:opacity-60">
          {apply.isPending ? 'Actualizando…' : 'Actualizar ahora'}
        </button>
        <AdminPasswordDialog open={askPassword} title="Crear las tablas del manual" actionLabel="Actualizar"
          description="Agrega las tablas del manual del staff y sus aceptaciones. No borra ni cambia nada de lo que ya hay. Confirma con tu clave de admin."
          onConfirm={(adminPassword) => apply.mutateAsync({ adminPassword })} onClose={() => setAskPassword(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--admin-muted)]">
        Escribe una vez el reglamento general y el manual de cada cargo: sirve para todas las fiestas. Cada persona lo lee en su app y toca «Leí y acepto»; si cambias algo y publicas, vuelve a aceptar.
        Lo propio de cada noche (citación, vestimenta, contactos) sigue en Finanzas → Staff de la noche.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {DOCS.map((d) => {
          const pub = (current ?? []).find((x: any) => x.key === d.key);
          const s = stats(d.key);
          return (
            <button key={d.key} type="button" aria-pressed={key === d.key} onClick={() => { if (dirty && !window.confirm('Tienes cambios sin publicar. ¿Descartarlos?')) return; setDirty(false); setKey(d.key); }}
              className={`${pill} ${key === d.key ? pillOn : pillOff}`}>
              {d.emoji} {d.label}{pub ? ` · v${pub.version}${s.total ? ` · ${s.ok}/${s.total}` : ''}` : ' · sin publicar'}
            </button>
          );
        })}
      </div>

      <div className="admin-clay-sm space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-semibold"><ScrollText className="h-4 w-4" /> {published ? `Versión vigente: v${published.version}` : 'Todavía no hay una versión publicada'}</p>
          {published && st.total > 0 && <p className="text-xs font-semibold text-[var(--admin-muted)]">{st.ok} de {st.total} aceptaron la vigente</p>}
        </div>
        {published && history && history.length > 0 && (
          <details className="text-xs text-[var(--admin-muted)]">
            <summary className="cursor-pointer">Historial de versiones ({history.length})</summary>
            <ul className="mt-1 space-y-0.5">
              {history.map((h: any) => <li key={h.version}>v{h.version} · {formatChileDateTime(h.publishedAt)}{h.changeNote ? ` · ${h.changeNote}` : ''}</li>)}
            </ul>
          </details>
        )}

        <Input placeholder="Título" maxLength={MANUAL_LIMITS.docTitle} value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />

        {sections.length === 0 && (
          <div className="rounded-2xl bg-black/5 p-4 text-center text-sm text-[var(--admin-muted)]">
            Vacío. Carga el borrador y corrígelo, o agrega tus propias secciones.
          </div>
        )}

        {sections.map((s, i) => (
          <div key={i} className="space-y-2 rounded-2xl bg-black/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="min-w-[10rem] flex-1" placeholder="Título de la sección" maxLength={MANUAL_LIMITS.title} value={s.title} onChange={(e) => patch(i, { title: e.target.value })} />
              <div className="flex rounded-full bg-black/5 p-0.5">
                {(['text', 'checklist'] as const).map((k) => (
                  <button key={k} type="button" onClick={() => patch(i, { kind: k })} className={`rounded-full px-3 py-1 text-xs font-semibold ${s.kind === k ? 'bg-white shadow-sm' : 'text-[var(--admin-muted)]'}`}>{k === 'text' ? 'Texto' : 'Checklist'}</button>
                ))}
              </div>
              <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-full p-1.5 hover:bg-black/5 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" aria-label="Bajar" disabled={i === sections.length - 1} onClick={() => move(i, 1)} className="rounded-full p-1.5 hover:bg-black/5 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" aria-label="Quitar sección" onClick={() => edit(sections.filter((_, j) => j !== i))} className="rounded-full p-1.5 hover:bg-black/5"><Trash2 className="h-4 w-4" /></button>
            </div>
            {s.kind === 'text'
              ? <Textarea rows={4} placeholder="Texto de la sección" value={s.text} onChange={(e) => patch(i, { text: e.target.value })} />
              : <Textarea rows={4} placeholder={'Una tarea por línea:\nRevisar stock\nEncender la plancha'} value={s.itemsText} onChange={(e) => patch(i, { itemsText: e.target.value })} />}
          </div>
        ))}

        {sections.length < MANUAL_LIMITS.sections && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${pill} ${pillOff} flex items-center gap-1`} onClick={() => edit([...sections, { title: '', kind: 'text', text: '', itemsText: '' }])}><Plus className="h-4 w-4" /> Sección de texto</button>
            <button type="button" className={`${pill} ${pillOff} flex items-center gap-1`} onClick={() => edit([...sections, { title: '', kind: 'checklist', text: '', itemsText: '' }])}><ListChecks className="h-4 w-4" /> Checklist</button>
            <button type="button" className={`${pill} ${pillOff} flex items-center gap-1`} onClick={loadDraft}><FilePlus2 className="h-4 w-4" /> Cargar borrador</button>
          </div>
        )}

        <div className="space-y-2 border-t border-black/5 pt-3">
          <Input placeholder={published ? 'Qué cambió (opcional, queda en el historial)' : 'Nota de la versión (opcional)'} maxLength={MANUAL_LIMITS.changeNote} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={isDemo || publish.isPending || clean.length === 0 || !title.trim()} title={isDemo ? DEMO_TOOLTIP : undefined}
              onClick={() => { if (window.confirm(published ? `Se publica la versión ${nextVersion}. Todas las personas de este manual deberán aceptarla de nuevo. ¿Publicar?` : 'Se publica el manual y las personas lo verán en su app. ¿Publicar?')) publish.mutate({ key, title: title.trim(), sections: fromDraft(sections), changeNote: note.trim() || null }); }}
              className={`${pill} bg-emerald-500 px-6 py-2 text-white`}>
              {publish.isPending ? 'Publicando…' : `Publicar versión ${nextVersion}`}
            </button>
            {dirty && <span className="text-xs font-semibold text-amber-600">Cambios sin publicar</span>}
            {clean.length !== sections.length && <span className="text-xs text-[var(--admin-muted)]">Las secciones vacías no se publican.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
