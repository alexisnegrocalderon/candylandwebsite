import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Music2, Sparkles, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { bestSongStart, snapToBar, songBarStarts, type MotionSong } from '@shared/motionSong';
import { SONG_ACCEPT, analyzeSongFile, uploadAndBuildSong } from './songAnalysis';

/* La canción del video: se sube, se analiza en el navegador y se elige qué tramo suena. Con ella, los cortes caen
 * en el pulso, la cámara late con el bombo y la luz se enciende en los golpes fuertes (ver motion/beat.ts). */

const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

function ToggleLine({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/60 px-3.5 py-2 text-sm">
      <span className="min-w-0">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/** El mapa de la canción: una barra por instante (más alta = más intensa) y, resaltado, el tramo que usa el video. */
function EnergyMap({ song, videoSecs, onPick }: { song: MotionSong; videoSecs: number; onPick: (secs: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const bars = useMemo(() => {
    const target = 140;
    const per = Math.max(1, Math.ceil(song.energy.length / target));
    const out: number[] = [];
    for (let i = 0; i < song.energy.length; i += per) {
      let m = 0;
      for (let k = i; k < Math.min(song.energy.length, i + per); k++) m = Math.max(m, song.energy[k]);
      out.push(m / 99);
    }
    return out;
  }, [song.energy]);
  const winFrom = (song.start / song.duration) * 100;
  const winW = (Math.min(videoSecs, song.duration - song.start) / song.duration) * 100;
  return (
    <svg
      ref={ref}
      role="img"
      aria-label="Mapa de intensidad de la canción: toca para elegir dónde parte el video"
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="h-16 w-full cursor-pointer touch-manipulation rounded-xl bg-muted/50"
      onClick={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r || !r.width) return;
        onPick(((e.clientX - r.left) / r.width) * song.duration);
      }}
    >
      <rect x={winFrom} y={0} width={Math.max(1.5, winW)} height={24} className="fill-primary/20" />
      {bars.map((v, i) => (
        <rect key={i} x={(i / bars.length) * 100 + 0.08} y={24 - 1 - v * 21} width={100 / bars.length - 0.16} height={Math.max(0.6, v * 21)} rx={0.3} className="fill-foreground/55" />
      ))}
      <rect x={winFrom} y={0} width={0.6} height={24} className="fill-primary" />
    </svg>
  );
}

export function SongPanel({ song, videoSecs, onChange }: { song: MotionSong | null; videoSecs: number; onChange: (song: MotionSong | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'analizando' | 'subiendo' | null>(null);
  const bars = useMemo(() => (song ? songBarStarts(song) : []), [song]);
  const barIndex = song ? Math.max(0, bars.findIndex((t) => Math.abs(t - song.start) < 0.01)) : 0;

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setBusy('analizando');
      const picked = await analyzeSongFile(file);
      setBusy('subiendo');
      const next = await uploadAndBuildSong(file, picked, videoSecs);
      onChange(next);
      toast.success(`Listo: ${Math.round(next.bpm)} BPM. Todo el video va al ritmo.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo usar la canción.');
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  }

  const input$ = <input ref={input} type="file" accept={SONG_ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />;

  if (!song) {
    return (
      <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
        {input$}
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Music2 className="h-4 w-4" /> Tu canción</p>
        <p className="text-xs text-muted-foreground">
          Sube una canción (MP3, M4A o WAV) y el video entero se mueve a su ritmo: los cortes caen en el pulso, la cámara late con el bombo y la luz se enciende en los golpes fuertes.
        </p>
        <Button type="button" variant="outline" className="h-11 w-full" disabled={!!busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {busy === 'analizando' ? 'Escuchando el ritmo…' : busy === 'subiendo' ? 'Subiendo…' : 'Subir canción'}
        </Button>
      </div>
    );
  }

  const fits = song.start + videoSecs <= song.duration + 0.05;
  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-3">
      {input$}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Music2 className="h-4 w-4 shrink-0" /> <span className="truncate">{song.name}</span></p>
          <p className="text-xs text-muted-foreground">{Math.round(song.bpm)} BPM · dura {mmss(song.duration)} · {song.hits.length} golpes fuertes detectados</p>
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label="Quitar canción" onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>
      </div>

      <EnergyMap song={song} videoSecs={videoSecs} onPick={(secs) => onChange({ ...song, start: snapToBar(song, secs) })} />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Parte en {mmss(song.start)} · el video dura {videoSecs.toFixed(1).replace('.', ',')} s</span>
          <Button type="button" size="sm" variant="outline" className="h-9 [@media(pointer:coarse)]:h-11" onClick={() => onChange({ ...song, start: bestSongStart(song, Math.min(videoSecs, song.duration)) })}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Mejor tramo
          </Button>
        </div>
        <input
          type="range"
          aria-label="Dónde parte la canción"
          className="h-6 w-full accent-primary [@media(pointer:coarse)]:h-9"
          min={0}
          max={Math.max(0, bars.length - 1)}
          step={1}
          value={barIndex}
          onChange={(e) => onChange({ ...song, start: bars[Number(e.target.value)] ?? song.start })}
        />
        {!fits && <p className="text-xs text-amber-700">Desde acá la canción no alcanza para todo el video ({mmss(song.duration - song.start)} restantes): elige un tramo más al inicio.</p>}
        <p className="text-xs text-muted-foreground">Siempre parte en el tiempo 1 de un compás, para que el primer golpe caiga justo con el inicio.</p>
      </div>

      <label className="flex items-center gap-3 text-sm">
        <span className="w-24 shrink-0">Volumen</span>
        <input
          type="range"
          aria-label="Volumen de la canción"
          className="h-6 w-full accent-primary [@media(pointer:coarse)]:h-9"
          min={0}
          max={100}
          value={Math.round(song.volume * 100)}
          onChange={(e) => onChange({ ...song, volume: Number(e.target.value) / 100 })}
        />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{Math.round(song.volume * 100)}%</span>
      </label>

      <ToggleLine
        label="Grabar el MP4 sin la canción"
        hint="Para una canción con derechos: la agregas desde la biblioteca de música de Instagram y el video ya va sincronizado con ella."
        checked={song.muteOnExport}
        onChange={(muteOnExport) => onChange({ ...song, muteOnExport })}
      />

      <Button type="button" variant="ghost" size="sm" className="h-9 w-full [@media(pointer:coarse)]:h-11" disabled={!!busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        {busy === 'analizando' ? 'Escuchando el ritmo…' : busy === 'subiendo' ? 'Subiendo…' : 'Cambiar canción'}
      </Button>
    </div>
  );
}
