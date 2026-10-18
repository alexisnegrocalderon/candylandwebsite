import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronDown, Plus, Repeat, RotateCcw, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CameraCaptureField } from '@/components/admin/CameraCaptureField';
import {
  EXPENSE_CATEGORIES, EXPENSE_DOCUMENT_TYPES, EXPENSE_PAYMENT_METHODS,
  deriveAmounts, categoryLabel,
  type ExpenseCategory, type ExpenseDocumentType, type ExpensePaymentMethod,
} from '@shared/expenses';
import { getRecentCategories, pushRecentCategory } from '@/pages/gastos/recent';
import { clp, useExpensesSummary } from './useExpensesSummary';

/* Terminal para cargar un gasto en cinco toques desde el celular. Vive en dos
 * lugares con el mismo componente:
 * - Dentro del panel, en el hub "Gastos" (`inShell`): el botón Guardar queda
 *   sobre la barra inferior del panel.
 * - En /gastos, la app instalable (sin barra del panel).
 *
 * Al guardar muestra una tarjeta de éxito con "Deshacer" (expenses.undoCreate,
 * sin clave, solo lo recién cargado por la misma persona) y vuelve sola al
 * formulario limpio. La foto escaneada se guarda con el gasto (receiptUrl). */

const SUCCESS_MS = 6000;

interface SavedExpense {
  id: number;
  amount: number;
  category: ExpenseCategory;
  documentType: ExpenseDocumentType;
  paymentMethod: ExpensePaymentMethod;
  target: string;
  targetLabel: string;
  description: string;
  supplier: string;
  receiptUrl: string | null;
}

export function ExpenseTerminal({ inShell = false }: { inShell?: boolean }) {
  const utils = trpc.useUtils();
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = eventsData ?? [];
  const { todayTotal, monthTotal, lastExpense, refetch } = useExpensesSummary();

  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<ExpenseCategory>('produccion');
  const [documentType, setDocumentType] = useState<ExpenseDocumentType>('boleta');
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>('transferencia');
  const [target, setTarget] = useState<string>('');       // id del evento, o 'general'
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const [showAllTargets, setShowAllTargets] = useState(false);
  const [saved, setSaved] = useState<SavedExpense | null>(null);

  // Por defecto, el próximo evento publicado: es el caso del 95% de las
  // compras. Si no hay ninguno, cae al más reciente.
  const defaultEventId = useMemo(() => {
    const now = Date.now();
    const upcoming = [...events]
      .filter((e: any) => e.status === 'published' && new Date(e.eventDate).getTime() >= now)
      .sort((a: any, b: any) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())[0];
    return String(upcoming?.id ?? events[0]?.id ?? '');
  }, [events]);
  useEffect(() => { if (!target && defaultEventId) setTarget(defaultEventId); }, [defaultEventId, target]);

  // Las categorías más usadas primero: en la práctica se repiten siempre las
  // mismas tres o cuatro, y así quedan sin scroll.
  const orderedCategories = useMemo(() => {
    const recent = getRecentCategories();
    return [...EXPENSE_CATEGORIES].sort((a, b) => {
      const ia = recent.indexOf(a.value), ib = recent.indexOf(b.value);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, []);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const focusAmount = () => window.setTimeout(() => amountInputRef.current?.focus(), 50);

  const resetForm = () => {
    setAmount(0); setDescription(''); setSupplier(''); setReceiptUrl(null); setShowOptional(false);
  };

  const scanReceipt = trpc.expenses.scanReceipt.useMutation({
    onSuccess: (result) => {
      if (!result.isReceipt) {
        toast.error('No pudimos leer la foto como boleta o factura -- completa a mano. La foto queda guardada.');
        return;
      }
      if (result.amountTotal) setAmount(result.amountTotal);
      if (result.category) setCategory(result.category);
      if (result.documentType) setDocumentType(result.documentType);
      if (result.description) setDescription(result.description);
      if (result.supplier) setSupplier(result.supplier);
      if (result.description || result.supplier) setShowOptional(true);
      if (result.confidence !== 'alta' || result.notes) {
        toast.warning(result.notes || 'Revisa los datos leídos antes de guardar.');
      } else {
        toast.success('Boleta leída -- revisa y guarda.');
      }
    },
    // Si la IA falla, la foto igual queda para el gasto.
    onError: (e) => toast.error(`${e.message} La foto queda guardada.`),
  });
  const handleScan = (imageUrl: string) => {
    if ((amount > 0 || description.trim() || supplier.trim())
      && !window.confirm('Ya hay datos cargados -- esto los va a reemplazar con lo que lea la foto. ¿Continuar?')) {
      setReceiptUrl(imageUrl);
      return;
    }
    setReceiptUrl(imageUrl);
    scanReceipt.mutate({ imageUrl });
  };

  const targetLabelFor = (t: string) => (t === 'general'
    ? 'Productora (gasto general)'
    : events.find((e: any) => String(e.id) === t)?.title ?? 'Elegir destino');
  const targetLabel = targetLabelFor(target);

  const afterChange = () => {
    refetch();
    utils.expenses.listAll.invalidate();
    utils.cajaReports.eventPnl.invalidate();
  };

  const create = trpc.expenses.create.useMutation({
    onSuccess: (res) => {
      pushRecentCategory(category);
      setSaved({
        id: Number(res.id), amount, category, documentType, paymentMethod, target,
        targetLabel, description, supplier, receiptUrl,
      });
      resetForm();
      afterChange();
    },
    onError: (e) => toast.error(e.message),
  });

  const undo = trpc.expenses.undoCreate.useMutation({
    onSuccess: () => {
      // Vuelven los datos al formulario para corregir y guardar de nuevo.
      if (saved) {
        setAmount(saved.amount); setCategory(saved.category); setDocumentType(saved.documentType);
        setPaymentMethod(saved.paymentMethod); setTarget(saved.target); setDescription(saved.description);
        setSupplier(saved.supplier); setReceiptUrl(saved.receiptUrl);
        if (saved.description || saved.supplier) setShowOptional(true);
      }
      setSaved(null);
      toast.success('Gasto deshecho -- corrige y vuelve a guardar.');
      afterChange();
      focusAmount();
    },
    onError: (e) => toast.error(e.message),
  });

  const preview = deriveAmounts({ amountTotal: amount, documentType });
  const canSave = amount > 0 && !!target;

  // Atajo para compras que se repiten (el mismo proveedor, el mismo monto):
  // llena el formulario con la última carga y deja el monto a un toque de
  // "Guardar". No lo guarda solo: el monto puede haber cambiado.
  const repeatLast = () => {
    if (!lastExpense) return;
    setAmount(lastExpense.amountTotal);
    setCategory(lastExpense.category);
    setDocumentType(lastExpense.documentType);
    setPaymentMethod(lastExpense.paymentMethod);
    setDescription(lastExpense.description ?? '');
    setSupplier(lastExpense.supplier ?? '');
    if (lastExpense.description || lastExpense.supplier) setShowOptional(true);
    amountInputRef.current?.focus();
    amountInputRef.current?.select();
  };

  const handleSave = () => {
    const isGeneral = target === 'general';
    create.mutate({
      scope: isGeneral ? 'general' : 'evento',
      eventId: isGeneral ? null : Number(target),
      expenseDate: new Date().toISOString(),
      category,
      description: description.trim() || categoryLabel(category),
      supplier: supplier.trim() || undefined,
      documentType,
      paymentMethod,
      amountTotal: amount,
      receiptUrl: receiptUrl ?? undefined,
    });
  };

  if (saved) {
    return (
      <SuccessCard
        saved={saved}
        undoing={undo.isPending}
        onUndo={() => undo.mutate({ id: saved.id })}
        onNext={() => { setSaved(null); focusAmount(); }}
      />
    );
  }

  const amountText = amount > 0 ? amount.toLocaleString('es-CL') : '';

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* 1. Monto + foto: lo único que cambia siempre. */}
      <section className="admin-clay p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Monto pagado</p>
          {(todayTotal > 0 || monthTotal > 0) && (
            <p className="text-right text-xs tabular-nums text-muted-foreground">
              Hoy {clp(todayTotal)} · Mes {clp(monthTotal)}
            </p>
          )}
        </div>
        <label className="mt-3 flex cursor-text items-baseline justify-center gap-1" htmlFor="expense-amount">
          <span className={`text-3xl font-bold ${amount > 0 ? 'text-white/70' : 'text-white/30'}`}>$</span>
          <input
            id="expense-amount"
            ref={amountInputRef}
            value={amountText}
            onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)}
            inputMode="numeric"
            enterKeyHint="done"
            placeholder="0"
            autoFocus
            aria-label="Monto total pagado"
            style={{ width: `${Math.max(1, amountText.length || 1) + 0.4}ch` }}
            className="min-w-[1.5ch] max-w-full bg-transparent text-center text-5xl font-bold tracking-tight tabular-nums text-white outline-none placeholder:text-white/25"
          />
        </label>
        <div className="mx-auto mt-2 h-px w-2/3 bg-gradient-to-r from-transparent via-[oklch(0.72_0.2_342)] to-transparent opacity-70" />
        {documentType === 'factura' && amount > 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Neto {clp(preview.netAmount)} · IVA {clp(preview.ivaAmount)} (crédito fiscal)
          </p>
        )}

        <div className="mt-4 flex items-center justify-center gap-3">
          <CameraCaptureField
            label={receiptUrl ? 'Cambiar foto' : 'Escanear boleta o factura'}
            pathPrefix="expenses"
            onScanned={handleScan}
            analyzing={scanReceipt.isPending}
            hidePreview
            buttonClassName="admin-tab h-10 rounded-full border-0 px-4 text-sm"
          />
          {receiptUrl && (
            <span className="relative">
              <a href={receiptUrl} target="_blank" rel="noreferrer" aria-label="Ver la foto de la boleta">
                <img src={receiptUrl} alt="" className="h-12 w-12 rounded-xl border border-white/15 object-cover" />
              </a>
              <button type="button" onClick={() => setReceiptUrl(null)} aria-label="Quitar la foto"
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-[#1b1226] text-white/80">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>

        {lastExpense && (
          <button type="button" onClick={repeatLast}
            className="mx-auto mt-3 flex max-w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-white">
            <Repeat className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Repetir "{lastExpense.description}" ({clp(lastExpense.amountTotal)})</span>
          </button>
        )}
      </section>

      {/* 2. Categoría */}
      <section className="admin-clay p-4">
        <SectionLabel>Categoría</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {orderedCategories.map((c) => (
            <button key={c.value} type="button" onClick={() => setCategory(c.value)} aria-pressed={category === c.value}
              className={`admin-tile flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-xs font-semibold leading-tight ${category === c.value ? 'admin-tab-active' : ''}`}>
              <span className="text-xl leading-none" aria-hidden="true">{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>
      </section>

      {/* 3. Documento y pago */}
      <section className="admin-clay space-y-4 p-4">
        <Segmented
          label="Documento"
          options={EXPENSE_DOCUMENT_TYPES.map((d) => ({ value: d.value, label: d.short }))}
          value={documentType}
          onChange={(v) => setDocumentType(v as ExpenseDocumentType)}
        />
        <Segmented
          label="Pago"
          options={EXPENSE_PAYMENT_METHODS.map((p) => ({ value: p.value, label: p.label }))}
          value={paymentMethod}
          onChange={(v) => setPaymentMethod(v as ExpensePaymentMethod)}
        />
      </section>

      {/* 4. Destino: preseleccionado, un toque para cambiarlo. */}
      <section className="admin-clay p-4">
        <SectionLabel>¿A qué va?</SectionLabel>
        <button type="button" onClick={() => setShowAllTargets(!showAllTargets)} aria-expanded={showAllTargets}
          className="admin-tab flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm">
          <span className="truncate">{targetLabel}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showAllTargets ? 'rotate-180' : ''}`} />
        </button>
        {showAllTargets && (
          <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
            {events.map((e: any) => (
              <button key={e.id} type="button" onClick={() => { setTarget(String(e.id)); setShowAllTargets(false); }}
                className={`admin-tab w-full rounded-xl px-4 py-2.5 text-left text-sm ${target === String(e.id) ? 'admin-tab-active' : ''}`}>
                {e.title}
              </button>
            ))}
            <button type="button" onClick={() => { setTarget('general'); setShowAllTargets(false); }}
              className={`admin-tab w-full rounded-xl px-4 py-2.5 text-left text-sm ${target === 'general' ? 'admin-tab-active' : ''}`}>
              Productora (se reparte entre los eventos del mes)
            </button>
          </div>
        )}
      </section>

      {/* 5. Opcionales, colapsados: casi nunca hacen falta en el momento. */}
      <section className="admin-clay p-4">
        <button type="button" onClick={() => setShowOptional(!showOptional)} aria-expanded={showOptional}
          className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-white">
          <span>{showOptional ? 'Detalle y proveedor' : 'Agregar detalle o proveedor'}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${showOptional ? 'rotate-180' : ''}`} />
        </button>
        {showOptional && (
          <div className="mt-3 space-y-3">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿Qué compraste?" className="h-12 rounded-xl" />
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Proveedor" className="h-12 rounded-xl" />
          </div>
        )}
      </section>

      {/* Espacio para que lo último del formulario suba por encima de Guardar. */}
      <div aria-hidden="true" className={inShell ? 'h-20 md:hidden' : 'h-20'} />

      {/* Guardar siempre a mano: fijo abajo, sobre un panel sólido para que
       * nada se lea a través. En el panel queda encima de la barra inferior
       * (en computador va al final del formulario, hay espacio de sobra). */}
      <div className={`fixed inset-x-0 z-30 px-3 ${inShell
        ? 'bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+4.9rem)] md:static md:px-0'
        : 'bottom-[max(env(safe-area-inset-bottom),0.75rem)]'}`}>
        <div className="admin-glass-panel mx-auto max-w-lg p-2">
          <Button onClick={handleSave} disabled={!canSave || create.isPending}
            className="h-14 w-full rounded-[20px] text-base font-bold shadow-[0_12px_30px_-10px_oklch(0.65_0.22_335/0.7)] disabled:bg-white/10 disabled:text-white/45 disabled:opacity-100 disabled:shadow-none">
            <Check className="mr-2 h-5 w-5" />
            {create.isPending ? 'Guardando…' : amount > 0 ? `Guardar ${clp(amount)}` : 'Guardar gasto'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SuccessCard({ saved, undoing, onUndo, onNext }: {
  saved: SavedExpense; undoing: boolean; onUndo: () => void; onNext: () => void;
}) {
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const [paused, setPaused] = useState(false);
  // Se cierra sola para cargar el siguiente; mientras se deshace, espera.
  useEffect(() => {
    if (paused || undoing) return;
    const id = window.setTimeout(() => onNextRef.current(), SUCCESS_MS);
    return () => window.clearTimeout(id);
  }, [paused, undoing]);
  const cat = EXPENSE_CATEGORIES.find((c) => c.value === saved.category);

  return (
    <div className="mx-auto max-w-lg" onPointerDown={() => setPaused(true)}>
      <section className="admin-clay relative overflow-hidden p-6 text-center" role="status" aria-live="polite">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--admin-success-bg)] text-[var(--admin-success-text)] shadow-[0_0_40px_rgba(34,197,94,0.35)]">
          <Check className="h-8 w-8" strokeWidth={3} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Gasto guardado</p>
        <p className="mt-1 text-5xl font-bold tracking-tight tabular-nums">{clp(saved.amount)}</p>
        <p className="mt-3 text-sm">
          <span aria-hidden="true">{cat?.emoji}</span> {cat?.label ?? saved.category}
          <span className="text-muted-foreground"> · {saved.targetLabel}</span>
        </p>
        {saved.description && saved.description !== cat?.label && (
          <p className="mt-1 truncate text-xs text-muted-foreground">{saved.description}{saved.supplier ? ` · ${saved.supplier}` : ''}</p>
        )}
        {saved.receiptUrl && (
          <a href={saved.receiptUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block">
            <img src={saved.receiptUrl} alt="Foto de la boleta" className="mx-auto h-20 w-20 rounded-2xl border border-white/15 object-cover" />
          </a>
        )}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onUndo} disabled={undoing} className="h-12 rounded-2xl">
            <RotateCcw className="mr-2 h-4 w-4" /> {undoing ? 'Deshaciendo…' : 'Deshacer'}
          </Button>
          <Button onClick={onNext} className="h-12 rounded-2xl font-bold">
            <Plus className="mr-2 h-4 w-4" /> Cargar otro
          </Button>
        </div>
        {/* Cuenta regresiva: cuando se vacía vuelve el formulario. */}
        {!paused && !undoing && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/5" aria-hidden="true">
            <div className="admin-countdown-bar h-full bg-gradient-to-r from-[oklch(0.72_0.2_342)] to-[oklch(0.72_0.13_230)]"
              style={{ animationDuration: `${SUCCESS_MS}ms` }} />
          </div>
        )}
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{children}</p>;
}

function Segmented({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={`admin-tab min-h-11 flex-1 rounded-full px-2 py-2.5 text-xs font-semibold leading-tight ${value === o.value ? 'admin-tab-active' : ''}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
