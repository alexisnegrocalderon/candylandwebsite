import { Input } from '@/components/ui/input';
import { formatSize, type InsumoUnit } from '@shared/insumos';

/** Cuántas botellas hay de cada tamaño (750 ml, 1 L, 1,5 L…): una casilla por tamaño. */
export function SizeCounts({ sizes, unit, value, onChange, idPrefix }: {
  sizes: number[];
  unit: InsumoUnit;
  value: Record<number, number>;
  onChange: (next: Record<number, number>) => void;
  idPrefix: string;
}) {
  return (
    <div className={`grid gap-3 ${sizes.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {sizes.map((s) => (
        <div key={s}>
          <label htmlFor={`${idPrefix}-${s}`} className="mb-1 block text-xs font-medium text-muted-foreground">{formatSize(s, unit)}</label>
          <Input
            id={`${idPrefix}-${s}`} type="number" inputMode="numeric" min={0} placeholder="0"
            value={value[s] ? value[s] : ''}
            onChange={(e) => onChange({ ...value, [s]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          />
        </div>
      ))}
    </div>
  );
}
