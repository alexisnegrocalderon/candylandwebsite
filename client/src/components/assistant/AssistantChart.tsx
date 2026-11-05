import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AssistantChart as Chart } from '@shared/assistant';

const fmt = (unidad: Chart['unidad']) => (v: number) => unidad === 'CLP' ? `$${Math.round(v).toLocaleString('es-CL')}` : unidad === '%' ? `${v.toLocaleString('es-CL')}%` : v.toLocaleString('es-CL');
const short = (unidad: Chart['unidad']) => (v: number) => {
  if (unidad !== 'CLP') return fmt(unidad)(v);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
};

/** Un gráfico que pidió el asistente, con los datos que ya consultó. */
export function AssistantChart({ chart }: { chart: Chart }) {
  const data = chart.serie.map((p) => ({ name: p.etiqueta, value: p.valor }));
  const tilt = data.length > 6;
  const axes = [
    <CartesianGrid key="g" strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} vertical={false} />,
    <XAxis key="x" dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} interval={0} angle={tilt ? -30 : 0} textAnchor={tilt ? 'end' : 'middle'} height={tilt ? 56 : 28} />,
    <YAxis key="y" tickFormatter={short(chart.unidad)} tick={{ fontSize: 11, fill: 'currentColor' }} width={56} />,
    <Tooltip key="t" formatter={(v: number) => fmt(chart.unidad)(v)} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, color: 'hsl(var(--popover-foreground))' }} />,
  ];
  return (
    <figure className="rounded-2xl border border-border bg-card/50 p-3 text-muted-foreground">
      <figcaption className="mb-2 text-sm font-semibold text-foreground">{chart.titulo}</figcaption>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart.tipo === 'lineas'
            ? <LineChart data={data}>{axes}<Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart>
            : <BarChart data={data}>{axes}<Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} /></BarChart>}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
