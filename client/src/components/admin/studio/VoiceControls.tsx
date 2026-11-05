import { ArrowDown, ArrowUp, Loader2, Mic, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { trpc } from '@/lib/trpc';
import {
  estimateSecs, TTS_VOICES, TTS_VOICE_KEYS, VOICE_KINDS, VOICE_KIND_LABEL, VOICE_MAX_BEATS, VOICE_MAX_CHARS, VOICE_MAX_SAY,
  VOICE_PITCH_RANGE, VOICE_RATE_RANGE, voiceCharCount, voiceIsFresh, voiceScriptOf, voiceTotalSecs,
  type TtsVoice, type VideoVoice, type VoiceBeat, type VoiceKind,
} from '@shared/studioVoice';

/* Editor del reel con voz: el guion escena por escena (lo que dice la voz y lo
 * que se ve), los ajustes de la voz chilena y el botón que la genera en el
 * servidor (Azure es-CL). Si se cambia una frase, la voz hay que generarla
 * de nuevo: el aviso lo dice. */

const isVideoUrl = (url: string) => /\.(mp4|webm|mov)(\?|#|$)/i.test(url);

export function VoiceControls({ value, onChange }: { value: VideoVoice; onChange: (v: VideoVoice) => void }) {
  const { data: cfg } = trpc.contentStudio.voiceConfig.useQuery(undefined, { staleTime: 60_000 });
  const generate = trpc.contentStudio.generateVoice.useMutation({
    onSuccess: (r) => {
      onChange({ ...value, voiceUrl: r.voiceUrl, voiceHash: r.voiceHash, beats: value.beats.map((b, i) => ({ ...b, secs: r.secs[i] ?? b.secs })) });
      toast.success('Voz generada. Dale play a la vista previa.');
    },
    onError: (e) => toast.error(e.message),
  });
  const missing = cfg?.missing ?? [];
  const fresh = voiceIsFresh(value);
  const chars = voiceCharCount(value);
  const setBeat = (i: number, patch: Partial<VoiceBeat>) => onChange({ ...value, beats: value.beats.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const setSay = (i: number, say: string) => setBeat(i, { say, secs: estimateSecs(say) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.beats.length) return;
    const beats = [...value.beats];
    [beats[i], beats[j]] = [beats[j], beats[i]];
    onChange({ ...value, beats });
  };
  const add = () => {
    if (value.beats.length >= VOICE_MAX_BEATS) return;
    const say = 'Nueva frase.';
    // La tarjeta final siempre queda al último.
    const beat: VoiceBeat = { kind: 'big', say, big: 'PALABRA', secs: estimateSecs(say) };
    const last = value.beats[value.beats.length - 1];
    onChange({ ...value, beats: last?.kind === 'end' ? [...value.beats.slice(0, -1), beat, last] : [...value.beats, beat] });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/60 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Mic className="w-4 h-4" />
          <p className="text-sm font-medium">Voz</p>
          <span className={`text-xs ${fresh ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
            {fresh ? `Lista · ${voiceTotalSecs(value)} s` : value.voiceUrl ? 'Cambiaste el guion o la voz: genérala de nuevo.' : 'Aún sin voz: la vista previa va muda.'}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Quién habla</Label>
            <Select value={value.voice} onValueChange={(v) => onChange({ ...value, voice: v as TtsVoice })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{TTS_VOICE_KEYS.map((k) => <SelectItem key={k} value={k}>{TTS_VOICES[k].label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Velocidad ({value.rate > 0 ? '+' : ''}{value.rate}%)</Label>
            <input type="range" className="w-full" min={VOICE_RATE_RANGE.min} max={VOICE_RATE_RANGE.max} step={1} value={value.rate} onChange={(e) => onChange({ ...value, rate: Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tono ({value.pitch > 0 ? '+' : ''}{value.pitch}%)</Label>
            <input type="range" className="w-full" min={VOICE_PITCH_RANGE.min} max={VOICE_PITCH_RANGE.max} step={1} value={value.pitch} onChange={(e) => onChange({ ...value, pitch: Number(e.target.value) })} />
          </div>
        </div>
        {missing.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Falta configurar la voz en Vercel: {missing.join(', ')}. Crea un recurso «Speech» en Azure (plan gratis F0) y copia su clave y su región (por ejemplo «brazilsouth»).
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={generate.isPending || missing.length > 0 || chars === 0 || chars > VOICE_MAX_CHARS || value.beats.some((b) => !b.say.trim())}
            onClick={() => generate.mutate({ says: voiceScriptOf(value).says.map((s) => s.trim()), voice: value.voice, rate: value.rate, pitch: value.pitch })}>
            {generate.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mic className="w-4 h-4 mr-2" />}
            {fresh ? 'Regenerar voz' : 'Generar voz'}
          </Button>
          <span className="text-[11px] text-muted-foreground">{chars} de {VOICE_MAX_CHARS} letras. Plan gratis de Azure: 500.000 letras al mes. «Playroom» se dice «Pleirrum».</span>
        </div>
      </div>

      <div className="space-y-3">
        {value.beats.map((b, i) => (
          <div key={i} className="rounded-xl border border-border/60 p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Escena {i + 1} · {b.secs.toFixed(1)} s</span>
              <Select value={b.kind} onValueChange={(v) => setBeat(i, { kind: v as VoiceKind })}>
                <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                <SelectContent>{VOICE_KINDS.map((k) => <SelectItem key={k} value={k}>{VOICE_KIND_LABEL[k]}</SelectItem>)}</SelectContent>
              </Select>
              <div className="ml-auto flex gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir escena"><ArrowUp className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(i, 1)} disabled={i === value.beats.length - 1} aria-label="Bajar escena"><ArrowDown className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onChange({ ...value, beats: value.beats.filter((_, j) => j !== i) })} disabled={value.beats.length <= 1} aria-label="Quitar escena"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Lo que dice la voz</Label>
              <Input className="h-9" value={b.say} maxLength={VOICE_MAX_SAY} onChange={(e) => setSay(i, e.target.value)} />
            </div>
            {(b.kind === 'big' || b.kind === 'stamp') && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Palabra grande</Label>
                  <Input className="h-9" value={b.big ?? ''} maxLength={24} onChange={(e) => setBeat(i, { big: e.target.value.toUpperCase() })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Etiqueta de arriba (opcional)</Label>
                  <Input className="h-9" value={b.tag ?? ''} maxLength={20} placeholder="1 DE 3" onChange={(e) => setBeat(i, { tag: e.target.value.toUpperCase() })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Frase en cursiva (opcional)</Label>
                  <Input className="h-9" value={b.sub ?? ''} maxLength={40} onChange={(e) => setBeat(i, { sub: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Palabra del subtítulo a resaltar</Label>
                  <Input className="h-9" value={b.key ?? ''} maxLength={30} onChange={(e) => setBeat(i, { key: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Píldoras (separadas por «|»; con «~» al inicio va tachada)</Label>
                  <Input className="h-9" value={(b.chips ?? []).join(' | ')} placeholder="SÍ claro ✓ | ~NO pasa nada"
                    onChange={(e) => setBeat(i, { chips: e.target.value.split('|').map((c) => c.trim()).filter(Boolean).slice(0, 3) })} />
                </div>
              </div>
            )}
            {b.kind === 'end' && <p className="text-[11px] text-muted-foreground">Muestra el logo, la ciudad y el @usuario de abajo.</p>}
            {b.kind !== 'end' && (
              <div className="space-y-1.5 border-t border-border/60 pt-3">
                <Label className="text-xs">Foto o clip de fondo (opcional)</Label>
                <div className="flex items-center gap-2">
                  <ImageUploadField value={b.bg ?? ''} onChange={(url) => setBeat(i, { bg: url || undefined })} pathPrefix="studio" accept="image/*,video/mp4,video/webm" label="Subir foto o video" hint="" />
                  {b.bg && <Button size="icon" variant="ghost" onClick={() => setBeat(i, { bg: undefined })} aria-label="Quitar fondo"><X className="h-4 w-4" /></Button>}
                </div>
                {b.bg && <p className="text-[11px] text-muted-foreground">{isVideoUrl(b.bg) ? 'Clip' : 'Foto'} con un velo celeste para que el texto se lea.</p>}
              </div>
            )}
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={add} disabled={value.beats.length >= VOICE_MAX_BEATS}><Plus className="w-4 h-4 mr-2" /> Agregar escena</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">@usuario de la tarjeta final</Label>
          <Input className="h-9" value={value.handle} maxLength={40} onChange={(e) => onChange({ ...value, handle: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Ciudad (nunca la dirección)</Label>
          <Input className="h-9" value={value.city} maxLength={30} onChange={(e) => onChange({ ...value, city: e.target.value.toUpperCase() })} />
        </div>
      </div>
    </div>
  );
}
