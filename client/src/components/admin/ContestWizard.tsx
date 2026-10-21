import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CONTEST_TEMPLATES, getContestTemplate, type ContestTemplateKey } from '@shared/contestTemplates';

/* Asistente para crear un concurso desde una plantilla: ① mecánica ② evento,
 * reel, premio y palabras ③ fechas. Crea el concurso en borrador con todo
 * configurado; después se afina (y se lanza) en la pantalla de edición. */

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const durationLabel = (h: number) => (h % 24 === 0 ? `${h / 24} ${h === 24 ? 'día' : 'días'}` : `${h} h`);

export function ContestWizard({ open, onOpenChange, events, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: { id: number; title: string }[];
  onCreated: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState(1);
  const [template, setTemplate] = useState<ContestTemplateKey>('ranking');
  const [eventId, setEventId] = useState('');
  const [title, setTitle] = useState('');
  const [prizeId, setPrizeId] = useState('');
  const [media, setMedia] = useState<{ id: string; permalink: string | null; image: string | null } | null>(null);
  const [keyword, setKeyword] = useState('quiero, entrada');
  const [phrase, setPhrase] = useState('quiero mi entrada doble');
  const [hours, setHours] = useState(getContestTemplate('ranking').typicalHours);
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState('');

  const tpl = getContestTemplate(template);
  useEffect(() => {
    if (!eventId && events[0]) setEventId(String(events[0].id));
  }, [events, eventId]);
  useEffect(() => {
    setHours(tpl.typicalHours);
  }, [tpl.typicalHours]);
  // El cierre sigue al inicio + duración mientras no se edite a mano.
  useEffect(() => {
    const start = new Date(startsAt);
    if (Number.isFinite(start.getTime())) setEndsAt(toLocalInput(new Date(start.getTime() + hours * 60 * 60 * 1000)));
  }, [startsAt, hours]);

  const types = trpc.contests.ticketTypes.useQuery({ eventId: Number(eventId) || 0 }, { enabled: open && !!eventId });
  const accesos = useMemo(() => (types.data ?? []).filter((t) => t.category === 'acceso'), [types.data]);
  const mediaList = trpc.contests.media.useQuery(undefined, { enabled: open && step === 2, retry: false });

  const create = trpc.contests.create.useMutation({
    onSuccess: (r) => {
      utils.contests.list.invalidate();
      onCreated(r.id);
      onOpenChange(false);
      setStep(1);
      toast.success('Concurso creado en borrador con la plantilla. Revísalo y lánzalo.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo crear el concurso.'),
  });

  const endOk = new Date(endsAt).getTime() > new Date(startsAt).getTime();
  const submit = () => create.mutate({
    eventId: Number(eventId), template, title: title.trim() || undefined,
    prizeTicketTypeId: prizeId ? Number(prizeId) : null,
    mediaId: media?.id ?? null, mediaPermalink: media?.permalink ?? null, mediaImage: media?.image ?? null,
    startsAt: new Date(startsAt).toISOString(), drawAt: new Date(endsAt).toISOString(),
    ...(template === 'quiz' || template === 'flash' ? {} : { keyword: keyword.trim(), keywordPhrase: phrase.trim() }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo concurso · paso {step} de 3</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="grid sm:grid-cols-2 gap-3">
            {CONTEST_TEMPLATES.map((t) => (
              <button key={t.key} type="button" onClick={() => setTemplate(t.key)}
                className={`text-left rounded-xl border-2 p-4 space-y-1 transition ${template === t.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                <div className="flex items-center gap-2 font-semibold"><span className="text-xl">{t.emoji}</span>{t.name}{template === t.key && <Check className="w-4 h-4 text-primary ml-auto" />}</div>
                <p className="text-sm font-medium">{t.tagline}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
                <p className="text-xs text-muted-foreground">Duración típica: {durationLabel(t.typicalHours)}</p>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Evento</Label>
                <Select value={eventId} onValueChange={(v) => { setEventId(v); setPrizeId(''); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Elige la fiesta" /></SelectTrigger>
                  <SelectContent>{events.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {template !== 'milestones' && template !== 'flash' && <div>
                <Label>Premio (entrada que se regala)</Label>
                <Select value={prizeId} onValueChange={setPrizeId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder={types.isLoading ? 'Cargando…' : 'Elegir entrada'} /></SelectTrigger>
                  <SelectContent>{accesos.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>}
            </div>
            <div>
              <Label>Nombre del concurso (opcional)</Label>
              <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${tpl.name} · ${events.find((e) => String(e.id) === eventId)?.title ?? 'evento'}`} />
            </div>
            {template !== 'quiz' && template !== 'flash' && <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Palabras clave (todas, separadas por coma)</Label>
                <Input className="mt-1" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
              </div>
              <div>
                <Label>Frase que verá la gente</Label>
                <Input className="mt-1" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
              </div>
            </div>}
            <div>
              <Label>Reel o publicación del concurso (puedes elegirla después)</Label>
              {mediaList.isLoading && <Loader2 className="w-5 h-5 animate-spin mt-2" />}
              {mediaList.error && <p className="text-sm text-destructive mt-1">{mediaList.error.message}</p>}
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2">
                {(mediaList.data ?? []).map((m) => (
                  <button key={m.id} type="button" onClick={() => setMedia(media?.id === m.id ? null : { id: m.id, permalink: m.permalink, image: m.image })}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 ${media?.id === m.id ? 'border-primary' : 'border-transparent'}`}>
                    <img src={m.image} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Cada concurso activo necesita su propio reel.</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label>Duración</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {tpl.durationPresets.map((h) => (
                  <Button key={h} type="button" size="sm" variant={hours === h ? 'default' : 'outline'} onClick={() => setHours(h)}>{durationLabel(h)}</Button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Empieza</Label>
                <Input type="datetime-local" className="mt-1" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div>
                <Label>Cierre y sorteo</Label>
                <Input type="datetime-local" className="mt-1" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
            {!endOk && <p className="text-sm text-destructive">El cierre tiene que ser después del inicio.</p>}
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <p className="font-medium">{tpl.emoji} {tpl.name}</p>
              <p className="text-muted-foreground">
                Se crea en borrador con los puntos, premios, avisos y textos de la plantilla (todo editable) y la verificación del ganador encendida.
                Para lanzarlo hace falta tener elegido el reel y el premio.
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => s - 1)}><ArrowLeft className="w-4 h-4" /> Atrás</Button>
          {step < 3 ? (
            <Button disabled={step === 2 && !eventId} onClick={() => setStep((s) => s + 1)}>Siguiente <ArrowRight className="w-4 h-4" /></Button>
          ) : (
            <WriteButton disabled={!eventId || !endOk || create.isPending} onClick={submit}>
              {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Crear concurso
            </WriteButton>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
