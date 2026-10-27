import { useMemo } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { InsumoDialog, type InsumoFormValue } from './InsumoDialog';

const BLANK: InsumoFormValue = {
  name: '', unit: 'ml', containerSize: 750, containerLabel: 'botella', sizes: [750], costPerContainer: null, alertDrinks: 15, initialBySize: {}, initialLoose: 0,
};

/** Crear un insumo nuevo desde donde estés (al armar un trago, en el stock…): licor, jugo, jarabe, botella o lata,
 * con las botellas que hay ahora. Al terminar avisa cuál se creó para usarlo enseguida. */
export function NuevoInsumo({ open, defaultName = '', defaultUnit = 'ml', onClose, onCreated }: {
  open: boolean;
  defaultName?: string;
  defaultUnit?: 'ml' | 'un';
  onClose: () => void;
  /** `form` trae el nombre, la unidad y el envase con que se creó (el listado todavía no lo tiene). */
  onCreated: (created: { id: number; form: InsumoFormValue }) => void;
}) {
  const utils = trpc.useUtils();
  const value = useMemo<InsumoFormValue | null>(() => (open
    ? { ...BLANK, name: defaultName, ...(defaultUnit === 'un' ? { unit: 'un' as const, containerSize: 1, sizes: [], alertDrinks: 10 } : {}) }
    : null), [open, defaultName, defaultUnit]);

  const save = trpc.insumos.save.useMutation({
    onSuccess: (r, vars) => {
      utils.insumos.estado.invalidate();
      toast.success(`«${vars.name}» creado`);
      onCreated({ id: r.id, form: { ...BLANK, name: vars.name, unit: vars.unit, containerSize: vars.containerSize, containerLabel: vars.containerLabel, sizes: vars.sizes ?? [], alertDrinks: vars.alertDrinks } });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <InsumoDialog
      value={value}
      saving={save.isPending}
      onClose={onClose}
      onSave={({ initialBySize, ...v }) => save.mutate({
        ...v, costPerContainer: v.costPerContainer ?? null,
        initialBySize: Object.entries(initialBySize).map(([size, count]) => ({ size: Number(size), count })),
      })}
    />
  );
}
