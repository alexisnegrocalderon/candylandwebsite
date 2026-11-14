import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Film, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BACKDROP_ADAPTS, BACKDROP_ADAPT_LABEL, BACKDROP_HZ, BACKDROP_LOOPS, BACKDROP_LOOP_LABEL, BACKDROP_ZONES, backdropSamples, backdropSpan,
  type BackdropAdapt, type BackdropLoop, type MotionBackdrop,
} from '@shared/motionBackdrop';
import { AnalysisCancelled, BACKDROP_ACCEPT, analyzeVideoFile, uploadAndBuildBackdrop } from './videoAnalysis';

/* El video de fondo del reel: se sube UN video, corre continuo detrás de todo y el texto de cada escena se adapta a lo que
 * hay detrás (shared/motionBackdrop.ts). Acá se sube, se ve dónde es claro y oscuro, y se elige el tramo y cómo se adapta. */

const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
const fmt = (n: number) => n.toFixed(1).replace('.', ',');

/** El «mapa de luz» del video: una fila por franja (arriba, centro, abajo), más claro = más luz; las marcas son los cortes de plano y el
 * recuadro el tramo que usa el reel. Tocar el mapa elige dónde parte. */
function LightMap({ b, reelSecs, onPick }: { b: MotionBackdrop; reelSecs: number; onPick: (secs: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const samples = backdropSamples(b.duration);
  const cells = useMemo(() => {
    const out: React.ReactElement[] = [];
    for (let i = 0; i < samples; i++) {
      for (let z = 0; z < BACKDROP_ZONES; z++) {
        const g = Math.round((b.luma[i * BACKDROP_ZONES + z] / 99) * 255);
        out.push(<rect key={`${i}-${z}`} x={i} y={z * 8} width={1.02} height={8.02} fill={`rgb(${g} ${g} ${g})`} />);
      }
    }
    return out;
  }, [b.luma, samples]);
  const winFrom = b.start * BACKDROP_HZ;
  const winW = Math.min(reelSecs, backdropSpan(b)) * BACKDROP_HZ;
  return (
    <svg
      ref={ref}
      role="img"
      aria-label="Mapa de luz del video: toca para elegir dónde parte el reel"
      viewBox={`0 0 ${samples} 24`}
      preserveAspectRatio="none"
      className="h-[72px] w-full cursor-pointer touch-manipulation rounded-xl bg-black"
      onClick={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r || !r.width) return;
        onPick(Math.round(((e.clientX - r.left) / r.width) * b.duration * 2) / 2);
      }}
    >
      {cells}
      {b.cuts.map((c) => <rect key={c} x={c * BACKDROP_HZ} y={0} width={0.5} height={24} fill="#EF8DFF" />)}
      <rect x={winFrom} y={0} width={Math.max(2, winW)} height={24} fill="none" stroke="#FF008E" strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
      <rect x={winFrom} y={0} width={Math.max(2, winW)} height={24} fill="#FF008E" opacity={0.14} />
    </svg>
  );
}

function PickLine<T extends string>({ label, value, options, labels, onChange }: { label: string; value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="h-11 w-full min-w-0"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{labels[o]}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export function BackdropPanel({ backdrop, reelSecs, planText, onChange }: {
  backdrop: MotionBackdrop | null;
  /** Lo que dura el reel (s). */
  reelSecs: number;
  /** Lo que decidió la adaptación, en una frase («2 con texto claro y 1 con texto oscuro»). */
  planText: string | null;
  onChange: (next: MotionBackdrop | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState<{ phase: 'analizando' | 'subiendo'; pct: number } | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      setBusy({ phase: 'analizando', pct: 0 });
      const analysis = await analyzeVideoFile(file, (f) => setBusy({ phase: 'analizando', pct: Math.round(f * 100) }), ctl.signal);
      setBusy({ phase: 'subiendo', pct: 0 });
      const next = await uploadAndBuildBackdrop(file, analysis, (f) => setBusy({ phase: 'subiendo', pct: Math.round(f * 100) }));
      onChange(next);
      toast.success(`Listo: video de ${fmt(next.duration)} s${next.cuts.length ? ` con ${next.cuts.length} cambio${next.cuts.length === 1 ? '' : 's'} de plano` : ''}. El texto se adapta solo.`);
    } catch (err) {
      if (!(err instanceof AnalysisCancelled)) toast.error(err instanceof Error ? err.message : 'No se pudo usar ese video.');
    } finally {
      abort.current = null;
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  }

  const picker = (
    <input ref={input} type="file" accept={BACKDROP_ACCEPT} className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
  );

  if (busy) {
    return (
      <div className="space-y-3 rounded-xl border border-border/60 p-3.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-4 w-4 animate-spin" />
          {busy.phase === 'analizando' ? 'Analizando el video…' : 'Subiendo el video…'} {busy.pct} %
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${busy.pct}%` }} /></div>
        <p className="text-xs text-muted-foreground">
          {busy.phase === 'analizando' ? 'Mide la luz y el detalle de arriba, el centro y abajo cada medio segundo, y los cambios de plano. Todo pasa en tu aparato, sin costo.' : 'Va directo al almacenamiento; no cierres esta pantalla.'}
        </p>
        {busy.phase === 'analizando' && <Button type="button" variant="outline" size="sm" className="h-11" onClick={() => abort.current?.abort()}>Cancelar</Button>}
      </div>
    );
  }

  if (!backdrop) {
    return (
      <div className="space-y-3">
        {picker}
        <Button type="button" variant="outline" className="h-12 w-full justify-start" onClick={() => input.current?.click()}>
          <Upload className="mr-2 h-4 w-4" /> Subir un video de fondo
        </Button>
        <p className="text-xs text-muted-foreground">MP4, MOV o WebM, hasta 150 MB y 3 minutos. Corre continuo detrás de todo el reel y el texto se adapta a lo que se ve para que siempre se lea. Si es un video del iPhone en HEVC y no se deja leer, expórtalo como MP4 (H.264).</p>
      </div>
    );
  }

  const b = backdrop;
  const span = backdropSpan(b);
  const set = (patch: Partial<MotionBackdrop>) => onChange({ ...b, ...patch });
  return (
    <div className="space-y-4">
      {picker}
      <div className="flex items-center gap-3 rounded-xl border border-border/60 px-3.5 py-2.5">
        <Film className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{b.name}</p>
          <p className="text-xs text-muted-foreground">{mmss(b.duration)} · {b.cuts.length} cambio{b.cuts.length === 1 ? '' : 's'} de plano</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-11" onClick={() => input.current?.click()}>Cambiar</Button>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="Quitar el video de fondo" onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Tramo del video · parte en {mmss(b.start)}</Label>
        <LightMap b={b} reelSecs={reelSecs} onPick={(start) => set({ start: Math.min(start, Math.max(0, b.duration - 1)) })} />
        <p className="text-[11px] text-muted-foreground">Las filas son arriba, centro y abajo; más claro = más luz. Las rayas rosadas son cambios de plano. El recuadro es lo que usa tu reel de {fmt(reelSecs)} s: toca para moverlo.</p>
      </div>

      {span < reelSecs - 0.2 && (
        <div className="space-y-1.5">
          <p className="text-xs text-amber-600 dark:text-amber-400">Este tramo dura {fmt(span)} s y tu reel {fmt(reelSecs)} s: elige qué pasa cuando se acaba.</p>
          <PickLine label="Cuando se acaba el video" value={b.loop} options={BACKDROP_LOOPS} labels={BACKDROP_LOOP_LABEL} onChange={(loop: BackdropLoop) => set({ loop })} />
        </div>
      )}

      <PickLine label="Cómo se adapta el texto" value={b.adapt} options={BACKDROP_ADAPTS} labels={BACKDROP_ADAPT_LABEL} onChange={(adapt: BackdropAdapt) => set({ adapt })} />
      {b.adapt === 'auto' && planText && <p className="-mt-2 text-xs text-muted-foreground">Ahora: {planText}, con más o menos degradado según lo que haya detrás.</p>}

      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor="backdrop-mix">Color del estilo sobre el video · {b.mix} %</Label>
        <input id="backdrop-mix" type="range" min={0} max={100} step={5} value={b.mix} onChange={(e) => set({ mix: Number(e.target.value) })} className="h-11 w-full touch-manipulation accent-[#FF008E]" />
        <p className="text-[11px] text-muted-foreground">0 % = solo tu video. Subirlo deja ver el fondo, los círculos y los adornos del estilo por encima.</p>
      </div>
    </div>
  );
}
