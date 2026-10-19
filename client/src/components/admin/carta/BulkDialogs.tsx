import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { WriteButton } from '@/components/admin/WriteButton';
import { adjustPrice, planCartaImport, type CartaImportPlan, type CartaProduct, type PriceAdjustment } from '@shared/carta';

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Sube o baja el precio de varios productos a la vez, mostrando cómo queda
 * antes de aplicar. */
export function PriceAdjustDialog({ open, onOpenChange, products, applying, onApply }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: CartaProduct[];
  applying: boolean;
  onApply: (updates: { id: number; price: number }[]) => void;
}) {
  const [adj, setAdj] = useState<PriceAdjustment>({ mode: 'percent', value: 10, direction: 'up', roundTo: 100 });
  const changes = useMemo(
    () => products.map((p) => ({ id: p.id, name: p.name, from: Number(p.price), to: adjustPrice(p.price, adj) })).filter((c) => c.to !== c.from),
    [products, adj],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar precios</DialogTitle>
          <DialogDescription>Se aplica a {products.length} {products.length === 1 ? 'producto' : 'productos'}.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Acción</Label>
            <Select value={adj.direction} onValueChange={(v) => setAdj({ ...adj, direction: v as 'up' | 'down' })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="up">Subir</SelectItem><SelectItem value="down">Bajar</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label>En</Label>
            <Select value={adj.mode} onValueChange={(v) => setAdj({ ...adj, mode: v as 'percent' | 'amount' })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="percent">Porcentaje (%)</SelectItem><SelectItem value="amount">Pesos ($)</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cuánto</Label>
            <Input type="number" inputMode="numeric" min={0} value={adj.value} onChange={(e) => setAdj({ ...adj, value: Math.max(0, Number(e.target.value)) })} className="mt-1" />
          </div>
          <div>
            <Label>Redondear a</Label>
            <Select value={String(adj.roundTo)} onValueChange={(v) => setAdj({ ...adj, roundTo: Number(v) })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">No redondear</SelectItem>
                <SelectItem value="10">$10</SelectItem>
                <SelectItem value="100">$100</SelectItem>
                <SelectItem value="500">$500</SelectItem>
                <SelectItem value="1000">$1.000</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2 text-sm">
          {changes.length === 0 ? (
            <p className="p-2 text-center text-xs text-muted-foreground">Con esos valores ningún precio cambia.</p>
          ) : changes.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{money(c.from)} → <strong className="text-foreground">{money(c.to)}</strong></span>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <WriteButton disabled={applying || changes.length === 0} onClick={() => onApply(changes.map((c) => ({ id: c.id, price: c.to })))}>
            {applying ? 'Aplicando…' : `Aplicar a ${changes.length}`}
          </WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NEW_SECTION = '__nueva__';
const NONE = '__ninguna__';

/** Mueve varios productos a otra sección (elegida de la lista o nueva). */
export function MoveSectionDialog({ open, onOpenChange, count, sections, applying, onApply }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  sections: string[];
  applying: boolean;
  onApply: (groupName: string | null) => void;
}) {
  const [choice, setChoice] = useState<string>(sections[0] ?? NEW_SECTION);
  const [custom, setCustom] = useState('');
  const target = choice === NEW_SECTION ? custom.trim() : choice === NONE ? '' : choice;
  const invalid = choice === NEW_SECTION && !target;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mover a otra sección</DialogTitle>
          <DialogDescription>{count} {count === 1 ? 'producto' : 'productos'} seleccionados.</DialogDescription>
        </DialogHeader>
        <Select value={choice} onValueChange={setChoice}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {sections.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            <SelectItem value={NONE}>Sin sección</SelectItem>
            <SelectItem value={NEW_SECTION}>+ Nueva sección…</SelectItem>
          </SelectContent>
        </Select>
        {choice === NEW_SECTION && <Input autoFocus value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Nombre de la sección" />}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <WriteButton disabled={applying || invalid} onClick={() => onApply(target || null)}>{applying ? 'Moviendo…' : 'Mover'}</WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Importa un CSV (el mismo que baja "Exportar"): muestra qué se va a
 * actualizar, crear y qué filas tienen error antes de tocar nada. */
export function ImportDialog({ open, onOpenChange, existing, defaultCategory, applying, onApply }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: CartaProduct[];
  defaultCategory: string;
  applying: boolean;
  onApply: (plan: CartaImportPlan) => void;
}) {
  const [text, setText] = useState('');
  const plan = useMemo(() => (text.trim() ? planCartaImport(text, existing, defaultCategory) : null), [text, existing, defaultCategory]);
  const canApply = !!plan && (plan.updates.length > 0 || plan.creates.length > 0);

  const onFile = async (file: File | undefined) => { if (file) setText(await file.text()); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setText(''); onOpenChange(v); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar carta desde CSV</DialogTitle>
          <DialogDescription>
            Exporta la carta, edítala en Excel o Google Sheets y súbela. Las filas con <code>id</code> actualizan ese producto; las filas sin <code>id</code> crean uno nuevo. Nada se borra.
          </DialogDescription>
        </DialogHeader>
        <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm" />
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="…o pega aquí el contenido del CSV" className="font-mono text-xs" />
        {plan && (
          <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
            <p>
              <strong>{plan.updates.length}</strong> por actualizar · <strong>{plan.creates.length}</strong> por crear · {plan.unchanged} sin cambios
              {plan.errors.length > 0 && <> · <strong className="text-red-500">{plan.errors.length} con error</strong></>}
            </p>
            {plan.updates.length > 0 && (
              <ul className="max-h-28 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                {plan.updates.map((u) => <li key={u.id}>{u.name}: {Object.keys(u.data).join(', ')}</li>)}
              </ul>
            )}
            {plan.errors.length > 0 && (
              <ul className="max-h-28 space-y-0.5 overflow-y-auto text-xs text-red-500">
                {plan.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <WriteButton disabled={applying || !canApply} onClick={() => plan && onApply(plan)}>{applying ? 'Importando…' : 'Aplicar cambios'}</WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
