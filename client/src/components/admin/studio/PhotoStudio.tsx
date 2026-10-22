import { useMemo, useState } from 'react';
import { ArrowLeft, Camera, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { formatChileShortDate } from '@shared/chileDate';
import { STUDIO_PHOTO_STYLES, STUDIO_THEMES, type StudioDesign, type StudioFormat, type StudioPhotoStyle, type StudioTheme } from '@shared/contentStudio';
import {
  DEFAULT_PHOTO_VARIANT_OPTIONS,
  eventPhotoBrief,
  PHOTO_STYLE_LABEL,
  photoVariants,
  VARIANT_FORMAT_LABEL,
  VARIANT_THEME_LABEL,
  type PhotoBrief,
} from '@shared/studioVariants';
import { VariantGallery } from './VariantGallery';

/* «Desde tu foto» del Estudio: subes una foto (o eliges un evento, que trae la
 * suya y sus datos) y salen de una vez las piezas de marca en feed 3:4 e
 * historia 9:16, en los estilos y plantillas que marques. Sin IA. */

function Chips<T extends string>({ all, value, label, onChange }: { all: readonly T[]; value: readonly T[]; label: (v: T) => string; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {all.map((v) => {
        const on = value.includes(v);
        return (
          <Button
            key={v}
            type="button"
            size="sm"
            variant={on ? 'default' : 'outline'}
            aria-pressed={on}
            // Siempre queda al menos una marcada: sin ninguna no sale nada.
            onClick={() => onChange(on ? (value.length > 1 ? value.filter((x) => x !== v) : [...value]) : all.filter((x) => x === v || value.includes(x)))}
          >
            {label(v)}
          </Button>
        );
      })}
    </div>
  );
}

const PHOTO_FORMATS: StudioFormat[] = ['post', 'historia'];

export function PhotoStudio({ initial, onBack, onOpen }: { initial: PhotoBrief; onBack: () => void; onOpen: (design: StudioDesign) => void }) {
  const { data: events } = trpc.events.listAll.useQuery();
  const [brief, setBrief] = useState<PhotoBrief>(initial);
  const [themes, setThemes] = useState<StudioTheme[]>([...DEFAULT_PHOTO_VARIANT_OPTIONS.themes]);
  const [formats, setFormats] = useState<StudioFormat[]>([...DEFAULT_PHOTO_VARIANT_OPTIONS.formats]);
  const [styles, setStyles] = useState<StudioPhotoStyle[]>([...DEFAULT_PHOTO_VARIANT_OPTIONS.styles]);
  const set = (patch: Partial<PhotoBrief>) => setBrief((b) => ({ ...b, ...patch }));

  const variants = useMemo(() => photoVariants(brief, { themes, formats, styles }), [brief, themes, formats, styles]);
  // Los próximos primero: es lo que se anuncia.
  const upcoming = useMemo(
    () => (events ?? []).filter((e) => e.status !== 'cancelled').sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()),
    [events],
  );

  const pickEvent = (id: string) => {
    if (id === 'none') { set({ eventId: null }); return; }
    const event = upcoming.find((e) => String(e.id) === id);
    if (!event) return;
    const fromEvent = eventPhotoBrief(event);
    // La foto que ya subiste se respeta; si no hay, se usa la del evento.
    setBrief((b) => ({ ...fromEvent, imageUrl: b.imageUrl || fromEvent.imageUrl }));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Diseños</Button>
        <h2 className="font-heading text-xl flex items-center gap-2"><Camera className="w-5 h-5" /> Desde tu foto</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Sube una foto y escribe el texto: salen todas las versiones de marca juntas, en feed 3:4 y en historia 9:16. Elige las que
        te gusten y descárgalas, o abre una para ajustarla. No usa IA ni gasta créditos.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5 h-fit">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-1.5">
              <Label>Anunciar un evento (opcional)</Label>
              <Select value={brief.eventId ? String(brief.eventId) : 'none'} onValueChange={pickEvent}>
                <SelectTrigger><SelectValue placeholder="Sin evento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin evento</SelectItem>
                  {upcoming.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.title} · {formatChileShortDate(e.eventDate)}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Trae el nombre, el día, la hora y la foto del evento. La dirección nunca se publica.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Foto</Label>
              <div className="flex items-center gap-2">
                <ImageUploadField value={brief.imageUrl} onChange={(url) => set({ imageUrl: url })} pathPrefix="studio" />
                {brief.imageUrl && <Button size="icon" variant="ghost" onClick={() => set({ imageUrl: '' })} aria-label="Quitar foto"><X className="w-4 h-4" /></Button>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Título (Enter para separar líneas)</Label>
              <Textarea rows={2} maxLength={200} value={brief.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ej: Noche Neón" />
            </div>
            <div className="space-y-1.5">
              <Label>Etiqueta (corta)</Label>
              <Input maxLength={400} value={brief.body} onChange={(e) => set({ body: e.target.value })} placeholder="Ej: Sábado 8 de agosto · 22:00 hrs" />
            </div>
            <div className="space-y-1.5">
              <Label>Botón</Label>
              <Input maxLength={60} value={brief.cta} onChange={(e) => set({ cta: e.target.value })} placeholder="Ej: Comenta PLAYROOM" />
            </div>
            <div className="space-y-1.5">
              <Label>Texto chico de abajo</Label>
              <Input maxLength={200} value={brief.footnote} onChange={(e) => set({ footnote: e.target.value })} placeholder="Ej: Evento +18" />
            </div>

            <div className="space-y-1.5">
              <Label>Estilos de foto</Label>
              <Chips all={STUDIO_PHOTO_STYLES} value={styles} label={(v) => PHOTO_STYLE_LABEL[v]} onChange={setStyles} />
            </div>
            <div className="space-y-1.5">
              <Label>Plantillas</Label>
              <Chips all={STUDIO_THEMES} value={themes} label={(v) => VARIANT_THEME_LABEL[v]} onChange={setThemes} />
            </div>
            <div className="space-y-1.5">
              <Label>Formatos</Label>
              <Chips all={PHOTO_FORMATS} value={formats} label={(v) => VARIANT_FORMAT_LABEL[v]} onChange={setFormats} />
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0">
          <VariantGallery variants={variants} title={brief.title.split('\n')[0] || 'foto'} onOpen={onOpen} />
        </div>
      </div>
    </div>
  );
}
