import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { COUNTDOWN_LOOKS, COUNTDOWN_LOOK_KEYS, COUNTDOWN_MAX_DAYS, countdownTexts, type CountdownLook, type VideoCountdown } from '@shared/studioCountdown';

type TextField = 'lead' | 'number' | 'unit' | 'connector' | 'eventName' | 'dateLabel' | 'question' | 'keyword' | 'location';

const FIELDS: Array<{ key: TextField; label: string; hint?: string; max: number }> = [
  { key: 'lead', label: 'Etiqueta de arriba', hint: 'FALTAN SÓLO...', max: 30 },
  { key: 'number', label: 'Número grande', hint: '8 (o HOY)', max: 4 },
  { key: 'unit', label: 'Sello del número', hint: 'DÍAS (vacío = sin sello)', max: 10 },
  { key: 'connector', label: 'Antes del nombre', hint: 'PARA..', max: 30 },
  { key: 'eventName', label: 'Nombre del evento', hint: 'REDROOM', max: 30 },
  { key: 'dateLabel', label: 'Día y hora', hint: 'SÁB|06 21HRS', max: 24 },
  { key: 'question', label: 'Pregunta', hint: 'YA TIENES TU ENTRADA?', max: 34 },
  { key: 'keyword', label: 'Palabra que comentan', hint: 'REDROOM (vacía = sin esa línea)', max: 24 },
  { key: 'location', label: 'Ciudad', hint: 'VALPARAÍSO (nunca la dirección)', max: 30 },
];

/** Los datos de la cuenta regresiva: colores del evento, días y cada texto en pantalla. */
export function CountdownControls({ value, onChange, media, onMedia }: {
  value: VideoCountdown;
  onChange: (c: VideoCountdown) => void;
  media: string;
  onMedia: (url: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Colores del evento</Label>
          <Select value={value.look} onValueChange={(v) => onChange({ ...value, look: v as CountdownLook })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{COUNTDOWN_LOOK_KEYS.map((k) => <SelectItem key={k} value={k}>{COUNTDOWN_LOOKS[k].label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Días que faltan</Label>
          <Input
            type="number" className="h-9" min={0} max={COUNTDOWN_MAX_DAYS} step={1} value={value.days}
            // Cambiar los días rehace el número, el sello y la etiqueta («FALTA SÓLO... 1 DÍA», «ES... HOY»).
            onChange={(e) => { const days = Math.min(COUNTDOWN_MAX_DAYS, Math.max(0, Math.round(Number(e.target.value) || 0))); onChange({ ...value, days, ...countdownTexts(days) }); }}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label className="text-xs">{f.label}</Label>
            <Input className="h-9" value={value[f.key]} maxLength={f.max} placeholder={f.hint} onChange={(e) => onChange({ ...value, [f.key]: e.target.value.toUpperCase() })} />
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t border-border/60 pt-3">
        <Label className="text-xs">Foto o video de fondo (opcional)</Label>
        <p className="text-[11px] text-muted-foreground">Una foto o un clip del evento, por ejemplo uno que armaste con Nano Banana o Flow. Sin fondo queda el degradado del evento.</p>
        <div className="flex items-center gap-2">
          <ImageUploadField value={media} onChange={onMedia} pathPrefix="studio" accept="image/*,video/mp4,video/webm" label="Subir foto o video" hint="" />
          {media && <Button size="icon" variant="ghost" onClick={() => onMedia('')} aria-label="Quitar fondo"><X className="h-4 w-4" /></Button>}
        </div>
        <Input value={media} maxLength={1000} placeholder="o pega un link: https://…" onChange={(e) => onMedia(e.target.value)} />
      </div>
    </div>
  );
}
