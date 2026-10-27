import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WriteButton } from '@/components/admin/WriteButton';
import { COMMON_BOTTLE_SIZES, INSUMO_UNITS, OPEN_FRACTIONS, OPEN_PORTIONS, formatSize, insumoSizes, type InsumoUnit } from '@shared/insumos';
import { SizeCounts } from './SizeCounts';

export interface InsumoFormValue {
  id?: number;
  name: string;
  unit: InsumoUnit;
  containerSize: number;
  containerLabel: string;
  /** Tamaños de botella con que llega (el de compra incluido). */
  sizes: number[];
  costPerContainer: number | null;
  alertDrinks: number;
  /** Solo al crear: con cuánto parte, botellas por tamaño + suelto. */
  initialBySize: Record<number, number>;
  initialLoose: number;
}

/** ¿Qué tipo de insumo es? Deja listos el envase, los tamaños y el aviso de poco stock para no pedir datos técnicos. */
const PRESETS: { id: string; emoji: string; label: string; hint: string; placeholder: string; value: Pick<InsumoFormValue, 'unit' | 'containerSize' | 'containerLabel' | 'sizes' | 'alertDrinks'> }[] = [
  { id: 'licor', emoji: '🥃', label: 'Licor', hint: 'pisco, ron, gin, whisky…', placeholder: 'Ej: Vodka Absolut', value: { unit: 'ml', containerSize: 750, containerLabel: 'botella', sizes: [750], alertDrinks: 15 } },
  { id: 'bebida', emoji: '🥤', label: 'Bebida o jugo', hint: 'jugo de limón, ginger, soda…', placeholder: 'Ej: Jugo de limón', value: { unit: 'ml', containerSize: 1000, containerLabel: 'botella', sizes: [1000], alertDrinks: 15 } },
  { id: 'jarabe', emoji: '🍓', label: 'Jarabe o pulpa', hint: 'siropes, goma, pulpas…', placeholder: 'Ej: Sirope de frutilla', value: { unit: 'ml', containerSize: 1000, containerLabel: 'botella', sizes: [1000], alertDrinks: 15 } },
  { id: 'unidad', emoji: '🥫', label: 'Botella o lata', hint: 'cerveza, energética…', placeholder: 'Ej: Cerveza Royal Guard', value: { unit: 'un', containerSize: 1, containerLabel: 'botella', sizes: [], alertDrinks: 10 } },
];

/** Crear o editar un insumo (ron, jugo, hielo…). Al crear, parte eligiendo qué es y cuántas botellas hay (cerradas por
 * tamaño y, si hay, una abierta del 1 al 9); al editar solo cambia sus datos. */
export function InsumoDialog({ value, saving, onClose, onSave }: {
  value: InsumoFormValue | null;
  saving: boolean;
  onClose: () => void;
  onSave: (v: InsumoFormValue) => void;
}) {
  const [form, setForm] = useState<InsumoFormValue | null>(value);
  // Todos los hooks van ANTES del return condicional: si no, al abrir el diálogo React cuenta un hook más
  // que en el render anterior (error #310) y la pantalla se cae.
  const [otherSize, setOtherSize] = useState('');
  const [preset, setPreset] = useState<string>('licor');
  const [openPortions, setOpenPortions] = useState<number | null>(null);
  const [openSize, setOpenSize] = useState<number | null>(null);
  useEffect(() => {
    setForm(value);
    setOtherSize(''); setOpenPortions(null); setOpenSize(null);
    // Un insumo nuevo parte como licor, salvo que ya venga con otra forma (ej. creado desde un producto en botella).
    setPreset(value && !value.id ? (value.unit === 'un' ? 'unidad' : 'licor') : 'licor');
  }, [value]);
  if (!form) return <Dialog open={false} />;

  const isNew = !form.id;
  const set = (patch: Partial<InsumoFormValue>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const unit = INSUMO_UNITS.find((u) => u.id === form.unit)!.short;
  const isUnits = form.unit === 'un';
  const valid = form.name.trim().length > 0 && form.containerSize > 0;
  const sizes = insumoSizes(form);
  const presetInfo = PRESETS.find((p) => p.id === preset) ?? PRESETS[0];
  const toggleSize = (s: number) => {
    if (s === form.containerSize) return; // el de compra no se saca
    set({ sizes: form.sizes.includes(s) ? form.sizes.filter((x) => x !== s) : [...form.sizes, s] });
  };
  const pickPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPreset(id);
    setOpenPortions(null);
    set({ ...p.value, initialBySize: {}, initialLoose: 0 });
  };
  const sizeOfOpen = openSize ?? form.containerSize;

  const submit = () => {
    // La botella abierta (1 a 9 de 10) se suma al stock inicial como líquido suelto.
    const loose = form.initialLoose + (openPortions ? Math.round((sizeOfOpen * openPortions) / OPEN_PORTIONS) : 0);
    onSave({ ...form, name: form.name.trim(), initialLoose: loose });
  };

  return (
    <Dialog open={!!value} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-[96vw] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Nuevo insumo' : 'Editar insumo'}</DialogTitle>
          <DialogDescription>Una base que usan los tragos: un licor, un jugo, una bebida, una cerveza…</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isNew && (
            <div>
              <Label>¿Qué es?</Label>
              <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de insumo">
                {PRESETS.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} onClick={() => pickPreset(p.id)}
                    className={`flex items-center gap-2 rounded-2xl border-2 px-3 py-2.5 text-left transition active:scale-95 ${preset === p.id ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:bg-muted'}`}>
                    <span className="text-2xl leading-none">{p.emoji}</span>
                    <span className="min-w-0"><span className="block text-sm font-semibold">{p.label}</span><span className="block truncate text-[11px] text-muted-foreground">{p.hint}</span></span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="ins-name">Nombre</Label>
            <Input id="ins-name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={isNew ? presetInfo.placeholder : 'Ron Havana 3'} autoFocus className="h-11" />
          </div>

          {!isUnits && (
            <div>
              <Label>Tamaños de {form.containerLabel || 'botella'} que llegan</Label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {Array.from(new Set([...COMMON_BOTTLE_SIZES, ...sizes])).sort((a, b) => a - b).map((s) => {
                  const on = sizes.includes(s);
                  return (
                    <button key={s} type="button" onClick={() => toggleSize(s)} aria-pressed={on}
                      className={`rounded-full px-3.5 py-2 text-sm font-medium active:scale-95 ${on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {formatSize(s, form.unit)}
                    </button>
                  );
                })}
                <Input type="number" inputMode="numeric" min={1} value={otherSize} placeholder={`Otro (${unit})`} className="h-10 w-28"
                  onChange={(e) => setOtherSize(e.target.value)}
                  onKeyDown={(e) => {
                    const v = Math.round(Number(otherSize));
                    if (e.key === 'Enter' && v > 0) { e.preventDefault(); set({ sizes: Array.from(new Set([...form.sizes, v])) }); setOtherSize(''); }
                  }}
                  onBlur={() => { const v = Math.round(Number(otherSize)); if (v > 0) { set({ sizes: Array.from(new Set([...form.sizes, v])) }); setOtherSize(''); } }}
                />
              </div>
            </div>
          )}

          {isNew && (
            <div className="space-y-3 rounded-2xl border border-border bg-card/40 p-3">
              <p className="text-sm font-semibold">Hay ahora</p>
              {isUnits ? (
                <div>
                  <Label htmlFor="ins-cant">Cuántas hay</Label>
                  <Input id="ins-cant" type="number" inputMode="numeric" min={0} value={form.initialLoose || ''} placeholder="0" className="h-11"
                    onChange={(e) => set({ initialLoose: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
                </div>
              ) : (
                <>
                  <div>
                    <Label>Botellas cerradas (por tamaño)</Label>
                    <div className="mt-1"><SizeCounts sizes={sizes} unit={form.unit} value={form.initialBySize} onChange={(v) => set({ initialBySize: v })} idPrefix="ins-init" /></div>
                  </div>
                  <div>
                    <Label>¿Hay una botella abierta? Cuánto le queda (1 a 9)</Label>
                    <div className="mt-1 grid grid-cols-9 gap-1.5">
                      {OPEN_FRACTIONS.map((f) => (
                        <button key={f.label} type="button" aria-label={`Quedan ${f.portions} de ${OPEN_PORTIONS}`} aria-pressed={openPortions === f.portions}
                          onClick={() => setOpenPortions((cur) => (cur === f.portions ? null : f.portions))}
                          className={`h-11 rounded-xl text-base font-semibold active:scale-95 ${openPortions === f.portions ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                    {openPortions !== null && sizes.length > 1 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>La abierta es de</span>
                        {sizes.map((s) => (
                          <button key={s} type="button" onClick={() => setOpenSize(s)}
                            className={`rounded-full px-2.5 py-1 font-medium ${sizeOfOpen === s ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{formatSize(s, form.unit)}</button>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">Toca el mismo número otra vez para quitarla. Una botella llena va entre las cerradas.</p>
                  </div>
                </>
              )}
            </div>
          )}

          <details className="rounded-2xl border border-border px-3 py-2 [&_summary]:cursor-pointer [&_summary]:select-none [&_summary]:text-sm [&_summary]:font-medium">
            <summary>Más opciones (costo, avisos, medida)</summary>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Se mide en</Label>
                  <Select value={form.unit} onValueChange={(v) => set({ unit: v as InsumoUnit, ...(v === 'un' && form.containerSize === 750 ? { containerSize: 1, containerLabel: 'unidad', sizes: [] } : {}) })}>
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
                  <Label htmlFor="ins-size">Tamaño de compra ({unit})</Label>
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
            </div>
          </details>
        </div>

        <DialogFooter>
          <WriteButton disabled={!valid || saving} onClick={submit} className="h-12 w-full text-base sm:w-auto sm:px-8">{saving ? 'Guardando…' : isNew ? 'Crear insumo' : 'Guardar'}</WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
