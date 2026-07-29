import { useSearch } from 'wouter';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { trpc } from '@/lib/trpc';
import { PrintLayout, PrintAuthGuard, PrintTable } from './PrintLayout';

const COLUMNS = [
  { key: 'orderNumber', label: 'N° Orden' },
  { key: 'createdAt', label: 'Fecha' },
  { key: 'eventTitle', label: 'Evento' },
  { key: 'buyerName', label: 'Comprador' },
  { key: 'buyerEmail', label: 'Email' },
  { key: 'buyerPhone', label: 'WhatsApp' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'discount', label: 'Descuento' },
  { key: 'total', label: 'Total' },
  { key: 'paymentStatus', label: 'Estado de pago' },
  { key: 'paymentMethod', label: 'Método de pago' },
  { key: 'ambassadorCode', label: 'Código embajador' },
];

/** Mismos filtros que /api/admin/orders/export.csv, tomados de la URL --
 * el botón "Descargar PDF" del admin arma este link con el filtro que
 * estaba aplicado en pantalla. */
function useOrdersFilters() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  return {
    status: params.get('status') || undefined,
    channel: (params.get('channel') as 'web' | 'caja' | null) || undefined,
    dateFrom: params.get('dateFrom') || undefined,
    dateTo: params.get('dateTo') || undefined,
  };
}

export default function PrintOrders() {
  return (
    <PrintAuthGuard>
      <PrintOrdersContent />
    </PrintAuthGuard>
  );
}

function PrintOrdersContent() {
  const filters = useOrdersFilters();
  const { data } = trpc.orders.forPrint.useQuery(filters);
  const rows = data ?? [];

  const approvedRows = rows.filter((r: any) => r.paymentStatus === 'approved');
  const totalRevenue = approvedRows.reduce((sum: number, r: any) => sum + Number(r.total), 0);

  // Ingresos por evento -- solo tiene sentido comparar si hay más de un
  // evento en el filtro actual.
  const byEvent = new Map<string, number>();
  for (const r of approvedRows) {
    const key = r.eventTitle ?? 'Sin evento';
    byEvent.set(key, (byEvent.get(key) ?? 0) + Number(r.total));
  }
  const chartData = Array.from(byEvent, ([eventTitle, total]) => ({ eventTitle, total }));

  const tableRows = rows.map((r: any) => ({
    ...r,
    createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString('es-CL') : '',
    subtotal: `$${Number(r.subtotal).toLocaleString('es-CL')}`,
    discount: `$${Number(r.discount).toLocaleString('es-CL')}`,
    total: `$${Number(r.total).toLocaleString('es-CL')}`,
  }));

  const filterParts: string[] = [];
  if (filters.status) filterParts.push(`estado: ${filters.status}`);
  if (filters.channel) filterParts.push(`canal: ${filters.channel === 'web' ? 'web' : 'caja'}`);
  if (filters.dateFrom) filterParts.push(`desde ${filters.dateFrom}`);
  if (filters.dateTo) filterParts.push(`hasta ${filters.dateTo}`);

  return (
    <PrintLayout
      title="Ventas"
      subtitle={`${rows.length} orden(es) · $${totalRevenue.toLocaleString('es-CL')} en pagos aprobados${filterParts.length ? ` · ${filterParts.join(', ')}` : ''}`}
    >
      {chartData.length > 1 && (
        <div className="mb-8" style={{ height: 260 }}>
          <p className="text-sm font-semibold mb-2">Ingresos aprobados por evento</p>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="#e5e5e5" />
              <XAxis dataKey="eventTitle" tick={{ fill: '#000', fontSize: 11 }} />
              <YAxis tick={{ fill: '#000', fontSize: 11 }} tickFormatter={(v) => `$${Number(v).toLocaleString('es-CL')}`} />
              <Tooltip formatter={(v: number) => `$${v.toLocaleString('es-CL')}`} />
              <Bar dataKey="total" fill="#111827" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <PrintTable columns={COLUMNS} rows={tableRows} />
    </PrintLayout>
  );
}
