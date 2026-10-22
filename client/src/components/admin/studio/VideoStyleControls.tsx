import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, FoldVertical, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import {
  normalizeVideoStyle,
  VIDEO_FONTS,
  VIDEO_KEN_BURNS,
  VIDEO_KEN_BURNS_LABEL,
  VIDEO_MAX_STICKERS,
  VIDEO_STICKER_SIZE,
  VIDEO_TEXT_ANIM_LABEL,
  VIDEO_TEXT_ANIMS,
  VIDEO_TEXT_SCALE,
  VIDEO_TRANSITION_LABEL,
  VIDEO_TRANSITIONS,
  type VideoFont,
  type VideoScene,
  type VideoSticker,
  type VideoStyle,
  type VideoMusic,
  type VideoWatermark,
} from '@shared/studioVideo';

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

function PickSelect<T extends string>({ label, value, options, labels, auto, onChange }: { label: string; value?: T; options: readonly T[]; labels: Record<T, string>; auto: string; onChange: (v: T | undefined) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? 'auto'} onValueChange={(v) => onChange(v === 'auto' ? undefined : (v as T))}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{auto}</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{labels[o]}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Cómo entra la escena, cómo entra el texto y cómo se mueve la foto. */
export function MotionControls({ value, onChange, scope, first }: { value?: VideoStyle; onChange: (s: VideoStyle | undefined) => void; scope: 'video' | 'scene'; first?: boolean }) {
  const set = (patch: Partial<VideoStyle>) => onChange(normalizeVideoStyle({ ...value, ...patch }));
  const auto = scope === 'scene' ? 'Como el video' : 'El de siempre';
  return (
    <div className="grid grid-cols-2 gap-3">
      {first ? (
        <p className="col-span-2 text-xs text-muted-foreground">La escena 1 aparece directo y con su texto ya puesto: es la miniatura del video en Instagram.</p>
      ) : (
        <>
          <PickSelect label={scope === 'scene' ? 'Cómo entra la escena' : 'Transición entre escenas'} value={value?.transition} options={VIDEO_TRANSITIONS} labels={VIDEO_TRANSITION_LABEL} auto={scope === 'scene' ? auto : 'Corte'} onChange={(v) => set({ transition: v })} />
          <PickSelect label="Cómo entra el texto" value={value?.textAnim} options={VIDEO_TEXT_ANIMS} labels={VIDEO_TEXT_ANIM_LABEL} auto={auto} onChange={(v) => set({ textAnim: v })} />
        </>
      )}
      <PickSelect label="Movimiento de la foto" value={value?.kenBurns} options={VIDEO_KEN_BURNS} labels={VIDEO_KEN_BURNS_LABEL} auto={auto} onChange={(v) => set({ kenBurns: v })} />
    </div>
  );
}

const EMOJIS = ['🔥', '✨', '💋', '❤️', '💜', '😈', '🍭', '🍬', '🍒', '🍑', '💦', '👀', '🎉', '🥂', '🍾', '🎟️', '⭐', '💎', '👑', '🌈'];

/** Stickers de la escena: emojis o imágenes. Se mueven arrastrándolos sobre la vista previa. */
export function StickerControls({ stickers, onChange }: { stickers?: VideoSticker[]; onChange: (list: VideoSticker[] | undefined) => void }) {
  const list = stickers ?? [];
  const add = (value: string) => {
    if (list.length >= VIDEO_MAX_STICKERS) return;
    // Cada nuevo aparece un poco corrido, para que no queden uno encima del otro.
    const n = list.length;
    onChange([...list, { value, x: 30 + (n % 3) * 20, y: 22 + Math.floor(n / 3) * 14, size: 220, rot: n % 2 ? 8 : -8 }]);
  };
  const set = (j: number, patch: Partial<VideoSticker>) => onChange(list.map((k, i) => (i === j ? { ...k, ...patch } : k)));
  const remove = (j: number) => { const next = list.filter((_, i) => i !== j); onChange(next.length ? next : undefined); };
  const full = list.length >= VIDEO_MAX_STICKERS;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Agregar emoji {full && <span className="font-normal text-muted-foreground">· máximo {VIDEO_MAX_STICKERS}</span>}</Label>
        <div className="flex flex-wrap gap-1">
          {EMOJIS.map((e) => (
            <button key={e} type="button" disabled={full} onClick={() => add(e)} className="grid h-9 w-9 place-items-center rounded-lg text-xl hover:bg-muted disabled:opacity-40" aria-label={`Agregar ${e}`}>{e}</button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">O una imagen (PNG con fondo transparente queda mejor)</Label>
        {!full && <ImageUploadField value="" onChange={(url) => url && add(url)} pathPrefix="studio/stickers" label="Subir imagen" hint="" />}
      </div>
      {list.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">Arrástralos sobre la vista previa para ubicarlos.</p>
          {list.map((k, j) => (
            <div key={j} className="space-y-2 rounded-xl border border-border/60 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm">
                  {/^(https?:|\/)/.test(k.value) ? <img src={k.value} alt="" className="h-7 w-7 rounded object-contain" /> : <span className="text-xl">{k.value}</span>}
                  Sticker {j + 1}
                </span>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(j)} aria-label={`Quitar sticker ${j + 1}`}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <Range label="Tamaño" value={k.size} fallback={220} min={VIDEO_STICKER_SIZE.min} max={VIDEO_STICKER_SIZE.max} step={10} format={(n) => `${n} px`} onChange={(n) => set(j, { size: n ?? 220 })} />
              <Range label="Giro" value={k.rot} fallback={0} min={-45} max={45} step={1} format={(n) => `${n}°`} onChange={(n) => set(j, { rot: n ?? 0 })} />
            </div>
          ))}
        </div>
      )}
      {list.length === 0 && <p className="text-[11px] text-muted-foreground"><Plus className="inline h-3 w-3" /> Elige un emoji o sube una imagen.</p>}
    </div>
  );
}

const CORNERS: { v: VideoWatermark['pos']; label: string }[] = [
  { v: 'tl', label: 'Arriba izquierda' }, { v: 'tr', label: 'Arriba derecha' }, { v: 'bl', label: 'Abajo izquierda' }, { v: 'br', label: 'Abajo derecha' },
];

/** Logo de la marca en una esquina, todo el video. */
export function WatermarkControls({ value, onChange }: { value?: VideoWatermark; onChange: (w: VideoWatermark | undefined) => void }) {
  const w = value ?? { pos: 'br' as const, opacity: 80, tone: 'blanco' as const };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Logo en una esquina (todo el video)</Label>
        <Button type="button" size="sm" variant={value ? 'default' : 'outline'} className="h-8" onClick={() => onChange(value ? undefined : w)}>{value ? 'Puesto' : 'Poner logo'}</Button>
      </div>
      {value && (
        <>
          <div className="grid w-28 grid-cols-2 gap-1 rounded-xl border border-border/60 p-1">
            {CORNERS.map((c) => (
              <button key={c.v} type="button" title={c.label} aria-label={c.label} aria-pressed={w.pos === c.v} onClick={() => onChange({ ...w, pos: c.v })} className={`h-9 rounded-lg ${w.pos === c.v ? 'bg-primary' : 'bg-muted hover:bg-muted/70'}`} />
            ))}
          </div>
          <div className="inline-flex rounded-xl border border-border/60 p-0.5">
            {(['blanco', 'color'] as const).map((t) => (
              <button key={t} type="button" onClick={() => onChange({ ...w, tone: t })} className={`h-8 rounded-lg px-3 text-sm ${w.tone === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                {t === 'blanco' ? 'Blanco (fondos oscuros)' : 'De color (fondos claros)'}
              </button>
            ))}
          </div>
          <Range label="Opacidad" value={w.opacity} fallback={80} min={10} max={100} step={5} format={(n) => `${n} %`} onChange={(n) => onChange({ ...w, opacity: n ?? 80 })} />
        </>
      )}
    </div>
  );
}

/** Música de fondo: una canción (mp3 o m4a), su volumen, desde qué segundo parte y el fundido final. */
export function MusicControls({ value, onChange }: { value?: VideoMusic; onChange: (m: VideoMusic | undefined) => void }) {
  const set = (patch: Partial<VideoMusic>) => value && onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Música de fondo</Label>
        {value && <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => onChange(undefined)}><X className="mr-1 h-3.5 w-3.5" /> Quitar</Button>}
      </div>
      <ImageUploadField value="" onChange={(url) => url && onChange({ url, volume: value?.volume ?? 80, start: 0, fadeOut: value?.fadeOut ?? 1.5 })} pathPrefix="studio/musica" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,.mp3,.m4a,.wav" label={value ? 'Cambiar canción' : 'Subir canción'} hint="mp3 o m4a, hasta 50 MB" />
      {value && (
        <>
          <audio src={value.url} controls preload="metadata" className="h-9 w-full" />
          <Range label="Volumen" value={value.volume} fallback={80} min={0} max={100} step={5} format={(n) => `${n} %`} onChange={(n) => set({ volume: n ?? 80 })} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Parte en el segundo</Label>
              <Input type="number" min={0} max={600} step={0.5} value={value.start} onChange={(e) => set({ start: Math.max(0, Number(e.target.value) || 0) })} className="h-9" />
            </div>
            <Range label="Fundido al final" value={value.fadeOut} fallback={1.5} min={0} max={5} step={0.5} format={(n) => (n ? `${n} s` : 'sin fundido')} onChange={(n) => set({ fadeOut: n ?? 1.5 })} />
          </div>
          <p className="text-[11px] text-muted-foreground">La vista previa parte en silencio: toca el parlante del reproductor para escucharla. Usa música con permiso para Instagram (o agrégala allá desde su biblioteca).</p>
        </>
      )}
    </div>
  );
}
