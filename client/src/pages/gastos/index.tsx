import '@/admin.css';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronDown, Trash2 } from 'lucide-react';
import { canOpenAdmin } from '@/lib/demoMode';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { useInstallableApp } from '@/hooks/useInstallableApp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import {
  EXPENSE_CATEGORIES, EXPENSE_DOCUMENT_TYPES, EXPENSE_PAYMENT_METHODS,
  deriveAmounts, categoryLabel,
  type ExpenseCategory, type ExpenseDocumentType, type ExpensePaymentMethod,
} from '@shared/expenses';
import { getRecentCategories, pushRecentCategory } from './recent';

/* Carga rápida de gastos desde el celular. Es la misma sesión de admin que
 * /admin (misma cookie, mismo TOTP una sola vez), pero con una pantalla
 * pensada para cargar una compra en cinco toques mientras se está de pie en
 * una ferretería, no para analizar números -- eso vive en /admin → Gastos.
 *
 * Instalable en la pantalla de inicio (ver useInstallableApp). Va
 * online-only a propósito: no lleva la cola offline de /caja porque los
 * gastos se cargan con señal, no a oscuras en la pista.
 *
 * Todo en un archivo, mismo criterio que client/src/pages/caja/index.tsx. */

export default function GastosApp() {
  useSeo({ title: 'Gastos — Mansion Playroom', description: '', path: '/gastos', noindex: true });
  // El SW es network-only (no cachea nada): existe únicamente porque Chrome
  // no ofrece "instalar" sin uno. iOS instala solo con el manifest.
  useInstallableApp('/gastos.webmanifest', '/gastos/sw.js', '/gastos/', 'Gastos');

  const { data: user, isLoading } = trpc.auth.me.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#150d13] via-[#0d0810] to-[#150d13] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <AdminLoginForm />;
  if (!canOpenAdmin(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <p className="text-muted-foreground">Esta pantalla es solo para el administrador.</p>
      </div>
    );
  }

  return <ExpenseCapture />;
}

/** Formatea mientras se escribe: 45000 -> "45.000". */
function formatAmount(value: number): string {
  return value > 0 ? value.toLocaleString('es-CL') : '';
}

function ExpenseCapture() {
  const utils = trpc.useUtils();
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = eventsData ?? [];

  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<ExpenseCategory>('produccion');
  const [documentType, setDocumentType] = useState<ExpenseDocumentType>('boleta');
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>('transferencia');
  const [target, setTarget] = useState<string>('');       // id del evento, o 'general'
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [showAllTargets, setShowAllTargets] = useState(false);

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

  const todayKey = new Date().toISOString().slice(0, 10);
  const { data: todayExpenses, refetch } = trpc.expenses.listAll.useQuery({});
  const today = (todayExpenses ?? []).filter((e: any) => String(e.expenseDate).slice(0, 10) === todayKey);
  const todayTotal = today.reduce((s: number, e: any) => s + e.amountTotal, 0);

  const create = trpc.expenses.create.useMutation({
    onSuccess: () => {
      toast.success(`Gasto de $${amount.toLocaleString('es-CL')} guardado`);
      pushRecentCategory(category);
      setAmount(0); setDescription(''); setSupplier(''); setShowOptional(false);
      refetch();
      utils.cajaReports.eventPnl.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = trpc.expenses.delete.useMutation({
    onSuccess: () => { refetch(); toast.success('Gasto eliminado'); },
    onError: (e) => toast.error(e.message),
  });

  const preview = deriveAmounts({ amountTotal: amount, documentType });
  const canSave = amount > 0 && !!target;

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
    });
  };

  const targetLabel = target === 'general'
    ? 'Productora (gasto general)'
    : events.find((e: any) => String(e.id) === target)?.title ?? 'Elegir destino';

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#150d13] via-[#0d0810] to-[#150d13] text-white pb-32">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
        <h1 className="font-heading text-xl text-center opacity-90">Nuevo gasto</h1>

        {/* 1. Monto -- lo primero porque es lo único que siempre cambia. */}
        <div className="text-center">
          <Input
            value={formatAmount(amount)}
            onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)}
            inputMode="numeric"
            placeholder="0"
            aria-label="Monto total pagado"
            className="h-20 text-center text-4xl font-heading font-black bg-white/5 border-white/15 rounded-2xl"
          />
          {documentType === 'factura' && amount > 0 && (
            <p className="text-xs text-white/60 mt-2">
              Neto ${preview.netAmount.toLocaleString('es-CL')} · IVA ${preview.ivaAmount.toLocaleString('es-CL')} (crédito fiscal)
            </p>
          )}
        </div>

        {/* 2. Categoría */}
        <div>
          <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Categoría</p>
          <div className="grid grid-cols-3 gap-2">
            {orderedCategories.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`rounded-xl py-3 px-1 text-xs font-semibold transition-colors ${
                  category === c.value ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-white/75 hover:bg-white/10'
                }`}
              >
                <span className="block text-lg leading-none mb-1">{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Documento */}
        <Segmented
          label="Documento"
          options={EXPENSE_DOCUMENT_TYPES.map((d) => ({ value: d.value, label: d.short }))}
          value={documentType}
          onChange={(v) => setDocumentType(v as ExpenseDocumentType)}
        />

        {/* 4. Forma de pago */}
        <Segmented
          label="Pago"
          options={EXPENSE_PAYMENT_METHODS.map((p) => ({ value: p.value, label: p.label }))}
          value={paymentMethod}
          onChange={(v) => setPaymentMethod(v as ExpensePaymentMethod)}
        />

        {/* 5. Destino: preseleccionado, un toque para cambiarlo. */}
        <div>
          <p className="text-xs uppercase tracking-wide text-white/50 mb-2">¿A qué va?</p>
          <button
            type="button"
            onClick={() => setShowAllTargets(!showAllTargets)}
            className="w-full flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-sm"
          >
            <span className="truncate">{targetLabel}</span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showAllTargets ? 'rotate-180' : ''}`} />
          </button>
          {showAllTargets && (
            <div className="mt-2 space-y-1.5">
              {events.map((e: any) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => { setTarget(String(e.id)); setShowAllTargets(false); }}
                  className={`w-full text-left rounded-lg px-4 py-2.5 text-sm ${target === String(e.id) ? 'bg-primary/25' : 'bg-white/5'}`}
                >
                  {e.title}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setTarget('general'); setShowAllTargets(false); }}
                className={`w-full text-left rounded-lg px-4 py-2.5 text-sm ${target === 'general' ? 'bg-primary/25' : 'bg-white/5'}`}
              >
                Productora (se reparte entre los eventos del mes)
              </button>
            </div>
          )}
        </div>

        {/* Opcionales, colapsados: casi nunca hacen falta en el momento. */}
        <button
          type="button"
          onClick={() => setShowOptional(!showOptional)}
          className="text-xs text-white/50 underline"
        >
          {showOptional ? 'Ocultar detalles' : 'Agregar detalle o proveedor'}
        </button>
        {showOptional && (
          <div className="space-y-3">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="¿Qué compraste?"
              className="bg-white/5 border-white/15 h-12"
            />
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Proveedor"
              className="bg-white/5 border-white/15 h-12"
            />
          </div>
        )}

        {/* Lo cargado hoy, para saber que quedó guardado. */}
        {today.length > 0 && (
          <div className="pt-2">
            <p className="text-xs uppercase tracking-wide text-white/50 mb-2">
              Hoy · ${todayTotal.toLocaleString('es-CL')}
            </p>
            <div className="space-y-1.5">
              {today.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <span className="truncate">{e.description}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="tabular-nums">${e.amountTotal.toLocaleString('es-CL')}</span>
                    <button
                      type="button"
                      onClick={() => remove.mutate({ id: e.id })}
                      aria-label={`Eliminar ${e.description}`}
                      className="text-white/40 hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Guardar siempre a mano, sobre el borde inferior. */}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-[#0d0810] via-[#0d0810]/95 to-transparent">
        <div className="max-w-lg mx-auto">
          <Button
            onClick={handleSave}
            disabled={!canSave || create.isPending}
            className="w-full h-14 text-base font-bold rounded-2xl"
          >
            <Check className="w-5 h-5 mr-2" />
            {create.isPending ? 'Guardando…' : 'Guardar gasto'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Segmented({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-white/50 mb-2">{label}</p>
      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-xl py-3 text-xs font-semibold transition-colors ${
              value === o.value ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-white/75 hover:bg-white/10'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
