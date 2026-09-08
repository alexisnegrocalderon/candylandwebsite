/** Cuadrícula asimétrica para pantallas de resumen/números (Resumen de la
 * noche, Gastos y P&L, la fila de KPI arriba de una tabla) — NO se usa en
 * pantallas de tabla larga, esas siguen siendo tablas. `BentoTile` con
 * `span={2}` ocupa el doble de ancho que una tesela normal (para el número
 * más importante de la pantalla, ej. Ingresos Totales). */
export function BentoGrid({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 ${className}`}>{children}</div>;
}

export function BentoTile({ span = 1, children, className = '' }: { span?: 1 | 2; children: React.ReactNode; className?: string }) {
  return <div className={`${span === 2 ? 'md:col-span-2' : 'md:col-span-1'} ${className}`}>{children}</div>;
}
