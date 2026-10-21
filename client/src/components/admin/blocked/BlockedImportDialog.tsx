import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { WriteButton } from '@/components/admin/WriteButton';
import { trpc } from '@/lib/trpc';
import type { BlockedRow } from '@shared/blockedMatch';
import {
  FIELD_LABEL, detectMapping, defaultPlacement, parseSheet, planBlockedImport, type FieldKey, type TextPlacement,
} from '@shared/blockedImport';

const FIELD_OPTIONS = Object.keys(FIELD_LABEL) as FieldKey[];
const PLACEMENT_LABEL: Record<TextPlacement, string> = { venue: 'Es el local donde lo bloquearon', note: 'Va a las notas', name: 'Es un nombre', ignore: 'Ignorar' };

/** Importar la planilla de bloqueados: se revisa qué es cada columna y cada celda dudosa ANTES de guardar nada. */
export function BlockedImportDialog({ open, onOpenChange, existing, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; existing: BlockedRow[]; onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [mapping, setMapping] = useState<FieldKey[] | null>(null);
  const [placements, setPlacements] = useState<Record<string, TextPlacement>>({});
  const [defaultVenue, setDefaultVenue] = useState('');
  const [sourceBy, setSourceBy] = useState('');
  const apply = trpc.blockedCustomers.importApply.useMutation({ onError: (e) => toast.error(e.message) });

  const sheet = useMemo(() => (text.trim() ? parseSheet(text) : null), [text]);
  const map = mapping ?? (sheet ? detectMapping(sheet.headers) : []);
  const plan = useMemo(
    () => (sheet ? planBlockedImport(sheet.rows, { mapping: map, placements, defaultVenue: defaultVenue.trim() || null }, existing) : null),
    [sheet, map, placements, defaultVenue, existing],
  );

  const reset = () => { setText(''); setMapping(null); setPlacements({}); setDefaultVenue(''); };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (/\.(xlsx?|xls|ods)$/i.test(file.name)) { toast.error('Guarda la planilla como CSV (Archivo → Descargar → CSV en Google Sheets, o Guardar como → CSV en Excel) y súbela de nuevo.'); return; }
    setText(await file.text()); setMapping(null); setPlacements({});
  };

  const run = async () => {
    if (!plan) return;
    const rows = plan.rows.filter((r) => r.action !== 'skip').map((r) => r.fields);
    const r = await apply.mutateAsync({ rows, sourceBy: sourceBy.trim() || null });
    toast.success(`Importados: ${r.created} nuevos, ${r.merged} completados${r.skipped ? `, ${r.skipped} sin datos` : ''}`);
    reset(); onDone(); onOpenChange(false);
  };

  const sample = sheet?.rows.slice(0, 3) ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar planilla de bloqueados</DialogTitle>
          <DialogDescription>
            Sube la planilla como CSV (o pega las filas). Revisas qué es cada columna y las celdas dudosas antes de guardar. Cada fila se carga aunque falten datos; las que repiten a alguien ya cargado se completan, no se duplican.
          </DialogDescription>
        </DialogHeader>

        <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm" />
        <Textarea value={text} onChange={(e) => { setText(e.target.value); setMapping(null); setPlacements({}); }} rows={3} placeholder="…o pega aquí las filas de la planilla (con la fila de encabezados)" className="font-mono text-xs" />

        {sheet && plan && (
          <div className="space-y-4">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">1. ¿Qué es cada columna?</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {sheet.headers.map((h, i) => (
                  <div key={i} className="rounded-xl border border-border p-2">
                    <p className="truncate text-xs text-muted-foreground">Columna «{h || `${i + 1}`}»{sample[0]?.[i] ? ` · ej: ${sample.map((r) => r[i]).filter(Boolean).slice(0, 2).join(' / ')}` : ''}</p>
                    <Select value={map[i] ?? 'ignore'} onValueChange={(v) => { const next = [...map]; next[i] = v as FieldKey; setMapping(next); }}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{FIELD_OPTIONS.map((f) => <SelectItem key={f} value={f}>{FIELD_LABEL[f]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </section>

            {plan.misplaced.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">2. Celdas que no corresponden a su columna</h3>
                <p className="text-xs text-muted-foreground">Hay texto donde iba un teléfono, RUT, Instagram o correo. Dime qué es (la decisión vale para todas las filas con ese mismo texto).</p>
                <div className="space-y-1.5">
                  {plan.misplaced.map((m) => (
                    <div key={`${m.column}-${m.value}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-500/10 p-2 text-sm">
                      <span className="min-w-0 flex-1 truncate"><strong>«{m.value}»</strong> <span className="text-xs text-muted-foreground">en «{sheet.headers[m.column] ?? m.column + 1}» · {m.count} {m.count === 1 ? 'fila' : 'filas'}</span></span>
                      <Select value={placements[m.value] ?? defaultPlacement(m.value)} onValueChange={(v) => setPlacements({ ...placements, [m.value]: v as TextPlacement })}>
                        <SelectTrigger className="h-8 w-60"><SelectValue /></SelectTrigger>
                        <SelectContent>{(Object.keys(PLACEMENT_LABEL) as TextPlacement[]).map((p) => <SelectItem key={p} value={p}>{PLACEMENT_LABEL[p]}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="grid gap-3 sm:grid-cols-2">
              <div><Label>Local para las filas que no tienen (opcional)</Label><Input value={defaultVenue} onChange={(e) => setDefaultVenue(e.target.value)} placeholder="Ej: Lista de productoras amigas" className="mt-1" /></div>
              <div><Label>Quién te pasó la planilla (opcional)</Label><Input value={sourceBy} onChange={(e) => setSourceBy(e.target.value)} placeholder="Persona o productora" className="mt-1" /></div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{plan.misplaced.length > 0 ? '3' : '2'}. Resumen</h3>
              <p className="text-sm">
                <strong>{plan.counts.create}</strong> nuevos · <strong>{plan.counts.merge}</strong> completan a alguien ya cargado o repetido en el archivo · {plan.counts.skip} sin datos
                {plan.counts.onlyName > 0 && <> · <strong className="text-amber-400">{plan.counts.onlyName} solo con nombre</strong> (solo avisan, no bloquean)</>}
              </p>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-2 text-xs">
                {plan.rows.slice(0, 60).map((r) => (
                  <div key={r.line} className="flex gap-2">
                    <span className="w-8 shrink-0 text-muted-foreground">{r.line}</span>
                    <span className={`w-16 shrink-0 ${r.action === 'skip' ? 'text-muted-foreground' : r.action === 'merge' ? 'text-sky-400' : 'text-emerald-400'}`}>{r.action === 'create' ? 'nuevo' : r.action === 'merge' ? 'completa' : 'sin datos'}</span>
                    <span className="min-w-0 flex-1 truncate">{[r.fields.fullName, r.fields.rut, r.fields.phone, r.fields.instagram, r.fields.email, r.fields.sourceVenue && `📍${r.fields.sourceVenue}`].filter(Boolean).join(' · ') || '—'}</span>
                    {r.onlyName && r.action !== 'skip' && <span className="shrink-0 text-amber-400">solo nombre</span>}
                  </div>
                ))}
                {plan.rows.length > 60 && <p className="text-muted-foreground">…y {plan.rows.length - 60} filas más.</p>}
              </div>
            </section>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <WriteButton disabled={apply.isPending || !plan || plan.counts.create + plan.counts.merge === 0} onClick={run}>
            {apply.isPending ? 'Importando…' : `Importar ${plan ? plan.counts.create + plan.counts.merge : 0} filas`}
          </WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

