import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WriteButton } from '@/components/admin/WriteButton';
import { INSUMO_UNITS, type InsumoUnit } from '@shared/insumos';

export interface InsumoFormValue {
  id?: number;
  name: string;
  unit: InsumoUnit;
  containerSize: number;
  containerLabel: string;
  costPerContainer: number | null;
  alertDrinks: number;
  /** Solo al crear: con cuánto parte. */
  initialContainers: number;
  initialLoose: number;
}

/** Crear o editar un insumo (ron, jugo, hielo…). */
export function InsumoDialog({ value, saving, onClose, onSave }: {
  value: InsumoFormValue | null;
  saving: boolean;
  onClose: () => void;
  onSave: (v: InsumoFormValue) => void;
}) {
  const [form, setForm] = useState<InsumoFormValue | null>(value);
  useEffect(() => { setForm(value); }, [value]);
  if (!form) return <Dialog open={false} />;
  const set = (patch: Partial<InsumoFormValue>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const unit = INSUMO_UNITS.find((u) => u.id === form.unit)!.short;
  const valid = form.name.trim().length > 0 && form.containerSize > 0;

  return (
    <Dialog open={!!value} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Editar insumo' : 'Nuevo insumo'}</DialogTitle>
          <DialogDescription>Una base que usan los tragos: un destilado, un jugo, una bebida, hielo, fruta…</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ins-name">Nombre</Label>
            <Input id="ins-name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ron Havana 3" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Se mide en</Label>
              <Select value={form.unit} onValueChange={(v) => set({ unit: v as InsumoUnit, ...(v === 'un' && form.containerSize === 750 ? { containerSize: 1, containerLabel: 'unidad' } : {}) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{INSUMO_UNITS.map((u) => <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ins-label">Envase</Label>
              <Input id="ins-label" value={form.containerLabel} onChange={(e) => set({ containerLabel: e.target.value })} placeholder="botella" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ins-size">Trae ({unit} por envase)</Label>
              <Input id="ins-size" type="number" inputMode="numeric" min={1} value={form.containerSize || ''} onChange={(e) => set({ containerSize: Number(e.target.value) })} />
            </div>
            <div>
              <Label htmlFor="ins-cost">Costo por envase</Label>
              <Input id="ins-cost" type="number" inputMode="numeric" min={0} value={form.costPerContainer ?? ''} placeholder="$" onChange={(e) => set({ costPerContainer: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label htmlFor="ins-alert">Avisar cuando alcance para menos de (tragos)</Label>
            <Input id="ins-alert" type="number" inputMode="numeric" min={0} value={form.alertDrinks} onChange={(e) => set({ alertDrinks: Math.max(0, Number(e.target.value) || 0) })} />
            <p className="mt-1 text-xs text-muted-foreground">0 = no avisar. También avisa al 25 % y al 10 % de lo que había al abrir la noche.</p>
          </div>
          {!form.id && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ins-init">Hay ahora (envases)</Label>
                <Input id="ins-init" type="number" inputMode="numeric" min={0} value={form.initialContainers || ''} placeholder="0" onChange={(e) => set({ initialContainers: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <Label htmlFor="ins-loose">+ suelto ({unit})</Label>
                <Input id="ins-loose" type="number" inputMode="numeric" min={0} value={form.initialLoose || ''} placeholder="0" onChange={(e) => set({ initialLoose: Number(e.target.value) || 0 })} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <WriteButton disabled={!valid || saving} onClick={() => onSave({ ...form, name: form.name.trim() })}>{saving ? 'Guardando…' : 'Guardar'}</WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
