import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { WriteButton } from '@/components/admin/WriteButton';
import { marginOf, marginTone } from '@shared/carta';
import { COLOR_PALETTE, EMOJI_SUGGESTIONS, validateForm, type ProductForm } from './constants';

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const NEW_SECTION = '__nueva__';
const NO_SECTION_VALUE = '__ninguna__';

/** Bloque plegable del panel: así el formulario no es una pared de 12 campos. */
function Block({ title, hint, defaultOpen = true, children }: { title: string; hint?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-border bg-card/60">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="space-y-4 px-4 pb-4">{children}</div>}
    </section>
  );
}

/** Panel para crear o editar un producto de la carta: ordenado en bloques, con
 * margen en vivo, vista previa del botón de /caja y el botón Guardar siempre a
 * la vista. En celular ocupa la pantalla; en pantalla ancha, un panel lateral
 * que no mueve la lista. */
export function ProductSheet({ open, onOpenChange, mode, initial, sections, saving, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'new' | 'edit';
  initial: ProductForm;
  /** Secciones que ya existen en este evento (para elegir en vez de tipear). */
  sections: string[];
  saving: boolean;
  onSave: (form: ProductForm) => void;
}) {
  const [form, setForm] = useState<ProductForm>(initial);
  const [creatingSection, setCreatingSection] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada vez que se abre (o cambia el producto) se parte de sus datos.
  useEffect(() => {
    if (open) { setForm(initial); setCreatingSection(false); setError(null); }
  }, [open, initial]);

  const margin = marginOf(form.price, form.costPrice);
  const tone = margin ? marginTone(margin) : null;
  const sectionValue = creatingSection ? NEW_SECTION : form.groupName && sections.includes(form.groupName) ? form.groupName : form.groupName ? NEW_SECTION : NO_SECTION_VALUE;
  const showSectionInput = creatingSection || (!!form.groupName && !sections.includes(form.groupName));

  const submit = () => {
    const problem = validateForm(form);
    if (problem) { setError(problem); return; }
    setError(null);
    onSave(form);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle>{mode === 'new' ? 'Nuevo producto' : 'Editar producto'}</SheetTitle>
          <SheetDescription className="truncate">{form.name || 'Sin nombre todavía'}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          <Block title="Básico">
            <div>
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="Ej: Piscola" autoFocus={mode === 'new'} />
            </div>
            <div>
              <Label>Sección</Label>
              <Select
                value={sectionValue}
                onValueChange={(v) => {
                  if (v === NEW_SECTION) { setCreatingSection(true); setForm({ ...form, groupName: '' }); }
                  else { setCreatingSection(false); setForm({ ...form, groupName: v === NO_SECTION_VALUE ? '' : v }); }
                }}
              >
                <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SECTION_VALUE}>Sin sección</SelectItem>
                  {sections.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  <SelectItem value={NEW_SECTION}>+ Nueva sección…</SelectItem>
                </SelectContent>
              </Select>
              {showSectionInput && (
                <Input value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} className="mt-2" placeholder="Nombre de la nueva sección (ej: Cócteles)" autoFocus />
              )}
              <p className="mt-1 text-xs text-muted-foreground">Arma las pestañas de la grilla en /caja.</p>
            </div>
            <div>
              <Label>Precio</Label>
              <Input type="number" inputMode="numeric" value={form.price || ''} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} className="mt-1" placeholder="0" />
            </div>
          </Block>

          <Block title="Costo y stock" hint="Para ver el margen y avisar cuando se acaba">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Costo</Label>
                <Input type="number" inputMode="numeric" value={form.costPrice || ''} onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })} className="mt-1" placeholder="0" />
              </div>
              <div>
                <Label>Stock</Label>
                <Input type="number" inputMode="numeric" value={form.totalStock} onChange={(e) => setForm({ ...form, totalStock: Number(e.target.value) })} className="mt-1" />
              </div>
            </div>
            <div className={`rounded-xl px-3 py-2.5 text-sm ${tone === 'negative' ? 'bg-red-500/15 text-red-300' : tone === 'low' ? 'bg-amber-500/15 text-amber-300' : margin ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
              {margin
                ? <>Margen: <strong className="tabular-nums">{money(margin.amount)}</strong> · <strong>{margin.pct}%</strong>{tone === 'negative' ? ' — ¡pierdes plata en cada venta!' : tone === 'low' ? ' — margen bajo' : ''}</>
                : 'Sin costo cargado: no se puede calcular el margen. Si no se carga, ese dato se pierde para siempre.'}
            </div>
            <p className="text-xs text-muted-foreground">El stock solo avisa: nunca impide vender.</p>
          </Block>

          <Block title="Aspecto" hint="Ícono y color del botón en /caja">
            <div>
              <Label>Ícono</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {EMOJI_SUGGESTIONS[form.category].map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setForm({ ...form, emoji: em })}
                    className={`flex h-11 w-11 items-center justify-center rounded-xl border text-2xl leading-none transition-colors ${form.emoji === em ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
                  >
                    {em}
                  </button>
                ))}
                <Input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value.slice(0, 4) })} className="h-11 w-20 text-center text-xl" aria-label="Otro emoji" />
              </div>
            </div>
            <div>
              <Label>Color del botón</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    style={{ backgroundColor: c }}
                    className={`h-9 w-9 rounded-full transition-transform ${form.color === c ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''}`}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>Así lo verá la cajera en /caja</Label>
              <div
                className="mt-1 flex items-center gap-3 rounded-2xl p-3"
                style={{ backgroundColor: `${form.color}22`, border: `1px solid ${form.color}66` }}
              >
                <span className="text-3xl leading-none">{form.emoji || '🍹'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{form.name || 'Nombre del producto'}</span>
                  <span className="block text-sm text-muted-foreground tabular-nums">{money(form.price || 0)}</span>
                </span>
              </div>
            </div>
          </Block>

          <Block title="Avanzado" hint="Ingredientes, cocina, orden y códigos" defaultOpen={false}>
            <div>
              <Label>Ingredientes / sabores especiales</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" placeholder="Ej: Pisco, jugo de maracuyá natural, un toque de menta" rows={2} />
              <p className="mt-1 text-xs text-muted-foreground">Opcional. Aparece en /caja al mantener presionada la tarjeta, para que la cajera pueda responder preguntas del cliente.</p>
            </div>
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox checked={form.toKitchen === 1} onCheckedChange={(v) => setForm({ ...form, toKitchen: v ? 1 : 0 })} className="mt-0.5" />
              <span className="text-sm">
                Lo prepara la cocina
                <span className="block text-xs text-muted-foreground">Al venderse genera una comanda en la pantalla de cocina con el número de pedido.</span>
              </span>
            </label>
            <div>
              <Label>Orden</Label>
              <Input type="number" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className="mt-1" />
              <p className="mt-1 text-xs text-muted-foreground">Menor = más arriba. Más fácil: usa "Subir/Bajar" en el menú ⋯ de cada fila.</p>
            </div>
            <div>
              <Label>Código interno (opcional)</Label>
              <Input value={form.internalCode} onChange={(e) => setForm({ ...form, internalCode: e.target.value.toUpperCase() })} className="mt-1 font-mono" placeholder="Ej: BDESP" maxLength={10} />
              <p className="mt-1 text-xs text-muted-foreground">Déjalo vacío salvo que otro sistema necesite reconocer este producto por un código fijo (ej. los premios de Cumpleañeros: BDESP, BDBOT, BDCOV, BDBEB).</p>
            </div>
            {form.category === 'extra' && (
              <div>
                <Label>Carga de saldo (CLP, opcional)</Label>
                <Input type="number" inputMode="numeric" value={form.topupAmount || ''} onChange={(e) => setForm({ ...form, topupAmount: Number(e.target.value) })} className="mt-1" placeholder="Ej: 10000 -- convierte este extra en 'Cargar saldo'" />
                <p className="mt-1 text-xs text-muted-foreground">Con un valor acá, este extra no paga recargo por servicio, no genera ticket ni QR, y acredita saldo prepagado en la tarjeta de membresía en vez de un derecho canjeable.</p>
              </div>
            )}
          </Block>
        </div>

        <div className="border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error && <p className="mb-2 text-sm font-medium text-red-400" role="alert">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
            <WriteButton onClick={submit} disabled={saving} className="flex-[2]">
              {saving ? 'Guardando…' : mode === 'new' ? 'Crear producto' : 'Guardar cambios'}
            </WriteButton>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
