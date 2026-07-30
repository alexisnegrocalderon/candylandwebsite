import { useSearch } from 'wouter';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { trpc } from '@/lib/trpc';
import { PrintLayout, PrintAuthGuard, PrintTable } from './PrintLayout';
import { formatChileDateTime } from '@shared/chileDate';

const COLUMNS = [
  { key: 'eventTitle', label: 'Evento' },
  { key: 'registerName', label: 'Caja' },
  { key: 'operatorName', label: 'Abrió' },
  { key: 'closedByName', label: 'Cerró' },
  { key: 'openedAt', label: 'Apertura' },
  { key: 'closedAt', label: 'Cierre' },
  { key: 'openingCash', label: 'Efectivo inicial' },
  { key: 'countedCash', label: 'Efectivo contado' },
  { key: 'expectedCash', label: 'Efectivo esperado' },
  { key: 'cashDiff', label: 'Diferencia efectivo' },
  { key: 'salesCount', label: 'N° ventas' },
  { key: 'redeemsCount', label: 'N° canjes' },
];

export default function PrintShifts() {
  return (
    <PrintAuthGuard>
      <PrintShiftsContent />
    </PrintAuthGuard>
  );
}

function PrintShiftsContent() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const eventIdParam = params.get('eventId');
  const eventId = eventIdParam ? Number(eventIdParam) : undefined;

  const { data } = trpc.cajaReports.shiftClosings.useQuery({ eventId });
  const rows = data ?? [];

  // Efectivo esperado vs contado por turno -- el ejemplo que pidió el dueño
  // para poder comparar de un vistazo. "Esperado" incluye el fondo inicial,
  // mismo criterio que ya usa la tarjeta de cada turno en el admin.
  const chartData = rows.map((r: any, i: number) => ({
    label: `#${i + 1} ${r.registerName}`,
    esperado: r.expectedCash + r.openingCash,
    contado: r.countedCash,
  }));

  const tableRows = rows.map((r: any) => ({
    ...r,
    openedAt: r.openedAt ? formatChileDateTime(r.openedAt) : '',
    closedAt: r.closedAt ? formatChileDateTime(r.closedAt) : '',
    openingCash: `$${Number(r.openingCash).toLocaleString('es-CL')}`,
    countedCash: `$${Number(r.countedCash).toLocaleString('es-CL')}`,
    expectedCash: `$${(Number(r.expectedCash) + Number(r.openingCash)).toLocaleString('es-CL')}`,
    cashDiff: `${Number(r.cashDiff) >= 0 ? '+' : ''}$${Number(r.cashDiff).toLocaleString('es-CL')}`,
  }));

  return (
    <PrintLayout
      title="Cierres de turno"
      subtitle={`${rows.length} cierre(s)${eventId ? ` · evento #${eventId}` : ' · todos los eventos'}`}
    >
      {chartData.length > 1 && (
        <div className="mb-8" style={{ height: 280 }}>
          <p className="text-sm font-semibold mb-2">Efectivo esperado vs. contado por turno</p>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="#e5e5e5" />
              <XAxis dataKey="label" tick={{ fill: '#000', fontSize: 11 }} />
              <YAxis tick={{ fill: '#000', fontSize: 11 }} tickFormatter={(v) => `$${Number(v).toLocaleString('es-CL')}`} />
              <Tooltip formatter={(v: number) => `$${v.toLocaleString('es-CL')}`} />
              <Legend />
              <Bar dataKey="esperado" name="Esperado" fill="#9ca3af" radius={[4, 4, 0, 0]} />
              <Bar dataKey="contado" name="Contado" fill="#111827" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <PrintTable columns={COLUMNS} rows={tableRows} />
    </PrintLayout>
  );
}
