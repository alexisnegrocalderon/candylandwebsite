import { useSearch } from 'wouter';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { trpc } from '@/lib/trpc';
import { PrintLayout, PrintAuthGuard, PrintTable } from './PrintLayout';

const COLUMNS = [
  { key: 'email', label: 'Email' },
  { key: 'fullName', label: 'Nombre' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'rut', label: 'RUT' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'accessTypes', label: 'Tipos de acceso' },
  { key: 'tags', label: 'Etiquetas' },
  { key: 'totalOrders', label: 'Compras' },
  { key: 'totalSpent', label: 'Total gastado' },
  { key: 'playcoins', label: 'Playcoins' },
];

export default function PrintCustomers() {
  return (
    <PrintAuthGuard>
      <PrintCustomersContent />
    </PrintAuthGuard>
  );
}

function PrintCustomersContent() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const filters = {
    search: params.get('search') || undefined,
    accessType: params.get('accessType') || undefined,
    tag: params.get('tag') || undefined,
  };

  const { data } = trpc.customers.listAll.useQuery(filters);
  const rows = data ?? [];

  // Cuántos clientes compraron cada tipo de acceso -- comparable de un
  // vistazo, mismo criterio que el resto de los gráficos de este PR.
  const byAccessType = new Map<string, number>();
  for (const c of rows as any[]) {
    if (!Array.isArray(c.accessTypes)) continue;
    for (const type of c.accessTypes as string[]) {
      byAccessType.set(type, (byAccessType.get(type) ?? 0) + 1);
    }
  }
  const chartData = Array.from(byAccessType, ([accessType, count]) => ({ accessType, count }));

  const totalSpent = rows.reduce((sum: number, c: any) => sum + Number(c.totalSpent ?? 0), 0);

  const tableRows = rows.map((c: any) => ({
    ...c,
    accessTypes: Array.isArray(c.accessTypes) ? c.accessTypes.join(', ') : '',
    tags: Array.isArray(c.tags) ? c.tags.join(', ') : '',
    totalSpent: `$${Number(c.totalSpent ?? 0).toLocaleString('es-CL')}`,
  }));

  const filterParts: string[] = [];
  if (filters.search) filterParts.push(`búsqueda "${filters.search}"`);
  if (filters.accessType) filterParts.push(`tipo de acceso: ${filters.accessType}`);
  if (filters.tag) filterParts.push(`etiqueta: ${filters.tag}`);

  return (
    <PrintLayout
      title="Clientes"
      subtitle={`${rows.length} cliente(s) · $${totalSpent.toLocaleString('es-CL')} gastados en total${filterParts.length ? ` · ${filterParts.join(', ')}` : ''}`}
    >
      {chartData.length > 1 && (
        <div className="mb-8" style={{ height: 260 }}>
          <p className="text-sm font-semibold mb-2">Clientes por tipo de acceso</p>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="#e5e5e5" />
              <XAxis dataKey="accessType" tick={{ fill: '#000', fontSize: 11 }} />
              <YAxis tick={{ fill: '#000', fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#111827" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <PrintTable columns={COLUMNS} rows={tableRows} />
    </PrintLayout>
  );
}
