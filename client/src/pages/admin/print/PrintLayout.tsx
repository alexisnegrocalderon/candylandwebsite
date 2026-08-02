import '@/admin.css';
import { Link } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { formatChileDateTime } from '@shared/chileDate';

/** Layout compartido por los reportes imprimibles (/admin/print/...) --
 * fondo blanco/texto negro fijos (no sigue el tema oscuro del resto del
 * sitio) para que la hoja impresa/PDF salga limpia. El botón de imprimir y
 * el link de volver se ocultan solos al imprimir (.print-hide, ver admin.css). */
export function PrintLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-black">
      <div className="max-w-5xl mx-auto p-8">
        <div className="print-hide flex items-center justify-between mb-6">
          <Link href="/admin" className="text-sm text-blue-600 underline">← Volver al admin</Link>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-full bg-black text-white text-sm font-semibold"
          >
            Imprimir / Guardar como PDF
          </button>
        </div>
        <div className="mb-6 border-b border-black/20 pb-4">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-black/60 mt-1">{subtitle}</p>}
          <p className="text-xs text-black/40 mt-1">Generado el {formatChileDateTime(new Date())}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Mismo chequeo de acceso que AdminDashboard -- estas rutas se abren en una
 * pestaña nueva desde el admin (ya autenticado), pero como son rutas propias
 * necesitan su propio guard, no lo heredan del sidebar. */
export function PrintAuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-black">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Sin permisos</h2>
          <p className="text-black/60">Iniciá sesión como admin en <Link href="/admin" className="text-blue-600 underline">/admin</Link> y volvé a abrir este reporte.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function PrintTable({ columns, rows }: { columns: { key: string; label: string }[]; rows: Record<string, any>[] }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b-2 border-black/70">
          {columns.map((c) => (
            <th key={c.key} className="text-left py-2 pr-3 font-semibold">{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-black/15">
            {columns.map((c) => (
              <td key={c.key} className="py-1.5 pr-3">{row[c.key] ?? ''}</td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={columns.length} className="py-8 text-center text-black/40">Sin datos para este filtro.</td></tr>
        )}
      </tbody>
    </table>
  );
}
