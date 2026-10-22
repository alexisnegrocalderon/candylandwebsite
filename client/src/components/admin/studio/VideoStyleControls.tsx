import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, FoldVertical, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { normalizeVideoStyle, VIDEO_FONTS, VIDEO_TEXT_SCALE, type VideoFont, type VideoScene, type VideoStyle } from '@shared/studioVideo';

/* Controles de diseño de los videos del Estudio: letra, tamaño, colores y
 * posición del texto (para todo el video o para una escena), y el fondo de
 * cada escena. Lo que se deja en «Auto» lo pone la plantilla (o el video). */

/** Colores de la marca y de las plantillas, a un toque. */
const SWATCHES = ['#FFFFFF', '#111111', '#F0287A', '#FF0A9C', '#E866C2', '#CF71DB', '#A020F0', '#07A2FC', '#0366E7', '#00A3FF', '#F0C674', '#FDDBAE', '#EEFFA9', '#FFD6F5', '#BFEBFB', '#3B2236'];

function ColorField({ label, value, onChange }: { label: string; value?: string; onChange: (c: string | undefined) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {value && <button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => onChange(undefined)}>Auto</button>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            onClick={() => onChange(c)}
            className={`h-7 w-7 rounded-full border shadow-sm transition-transform ${value === c ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background' : 'border-border/60'}`}
            style={{ background: c }}
          />
        ))}
        <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-dashed border-border" title="Otro color" style={{ background: value && !SWATCHES.includes(value) ? value : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
          <input type="color" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={value ?? '#ffffff'} onChange={(e) => onChange(e.target.value)} aria-label={`${label}: otro color`} />
        </label>
      </div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value?: T; options: { v: T; label: string; icon: React.ReactNode }[]; onChange: (v: T | undefined) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-border/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          title={o.label}
          aria-label={o.label}
          aria-pressed={value === o.v}
          onClick={() => onChange(value === o.v ? undefined : o.v)}
          className={`flex h-8 w-9 items-center justify-center rounded-lg ${value === o.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

function Range({ label, value, fallback, min, max, step, format, onChange }: { label: string; value?: number; fallback: number; min: number; max: number; step: number; format: (n: number) => string; onChange: (n: number | undefined) => void }) {
  const shown = value ?? fallback;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label} <span className="font-normal text-muted-foreground">· {format(shown)}{value === undefined ? ' (auto)' : ''}</span></Label>
        {value !== undefined && <button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => onChange(undefined)}>Auto</button>}
      </div>
      <input type="range" min={min} max={max} step={step} value={shown} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" aria-label={label} />
    </div>
  );
}

/** Letra, tamaño, colores y posición. `scope` cambia el texto de «Auto». */
export function TextStyleControls({ value, onChange, scope }: { value?: VideoStyle; onChange: (s: VideoStyle | undefined) => void; scope: 'video' | 'scene' }) {
  const set = (patch: Partial<VideoStyle>) => onChange(normalizeVideoStyle({ ...value, ...patch }));
  const auto = scope === 'scene' ? 'Como el video' : 'De la plantilla';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Letra</Label>
          <Select value={value?.font ?? 'auto'} onValueChange={(v) => set({ font: v === 'auto' ? undefined : (v as VideoFont) })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{auto}</SelectItem>
              {(Object.keys(VIDEO_FONTS) as VideoFont[]).map((f) => (
                <SelectItem key={f} value={f}><span style={{ fontFamily: VIDEO_FONTS[f].css, fontWeight: VIDEO_FONTS[f].weight }}>{VIDEO_FONTS[f].label}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Posición</Label>
          <div className="flex flex-wrap gap-1.5">
            <Segmented value={value?.vpos} onChange={(v) => set({ vpos: v })} options={[
              { v: 'top', label: 'Arriba', icon: <ArrowUpToLine className="h-4 w-4" /> },
              { v: 'center', label: 'Al medio', icon: <FoldVertical className="h-4 w-4" /> },
              { v: 'bottom', label: 'Abajo', icon: <ArrowDownToLine className="h-4 w-4" /> },
            ]} />
            <Segmented value={value?.align} onChange={(v) => set({ align: v })} options={[
              { v: 'left', label: 'A la izquierda', icon: <AlignLeft className="h-4 w-4" /> },
              { v: 'center', label: 'Al centro', icon: <AlignCenter className="h-4 w-4" /> },
              { v: 'right', label: 'A la derecha', icon: <AlignRight className="h-4 w-4" /> },
            ]} />
          </div>
        </div>
      </div>
      <Range label="Tamaño del texto" value={value?.textScale} fallback={1} min={VIDEO_TEXT_SCALE.min} max={VIDEO_TEXT_SCALE.max} step={0.05} format={(n) => `${Math.round(n * 100)} %`} onChange={(n) => set({ textScale: n })} />
      <ColorField label="Color del texto" value={value?.titleColor} onChange={(c) => set({ titleColor: c })} />
      <ColorField label="Color de acento (etiqueta, número, botón)" value={value?.accentColor} onChange={(c) => set({ accentColor: c })} />
      {value && (
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(undefined)}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Volver a {scope === 'scene' ? 'como el video' : 'la plantilla'}</Button>
      )}
    </div>
  );
}

function isVideo(url: string) {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

/** Fondo de una escena: foto o video, color o degradado, oscurecido y desenfoque. */
export function SceneBackgroundControls({ scene, media, onMedia, onBg, style, onStyle }: {
  scene: VideoScene;
  media: string;
  onMedia: (url: string) => void;
  onBg: (bg: string | undefined) => void;
  style?: VideoStyle;
  onStyle: (s: VideoStyle | undefined) => void;
}) {
  const [c1, c2] = (scene.bg ?? '').split(',');
  const setStyle = (patch: Partial<VideoStyle>) => onStyle(normalizeVideoStyle({ ...style, ...patch }));
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">Foto o video de fondo</Label>
        <div className="flex items-center gap-2">
          <ImageUploadField value={media} onChange={onMedia} pathPrefix="studio" accept="image/*,video/mp4,video/webm" label="Subir foto o video" hint="" />
          {media && <Button size="icon" variant="ghost" onClick={() => onMedia('')} aria-label="Quitar fondo"><X className="h-4 w-4" /></Button>}
        </div>
        <Input value={media} maxLength={1000} placeholder="o pega un link: https://… o /candyland/hero-video-mobile.mp4" onChange={(e) => onMedia(e.target.value)} />
        <p className="text-[11px] text-muted-foreground">{isVideo(media) ? 'El video va siempre mudo.' : 'Foto o video .mp4 de hasta 50 MB.'}</p>
      </div>
      {media ? (
        <>
          <Range label="Oscurecer la foto" value={style?.overlay} fallback={0} min={0} max={80} step={5} format={(n) => `${n} %`} onChange={(n) => setStyle({ overlay: n })} />
          <Range label="Desenfocar la foto" value={style?.blur} fallback={0} min={0} max={20} step={1} format={(n) => `${n} px`} onChange={(n) => setStyle({ blur: n })} />
        </>
      ) : (
        <div className="space-y-3">
          <ColorField label="Color de fondo" value={c1 || undefined} onChange={(c) => onBg(c ? [c, c2].filter(Boolean).join(',') : undefined)} />
          {c1 && <ColorField label="Segundo color (degradado)" value={c2 || undefined} onChange={(c) => onBg([c1, c].filter(Boolean).join(','))} />}
        </div>
      )}
    </div>
  );
}
