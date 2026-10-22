import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Clapperboard, Download, Loader2, Package } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatChileShortDate } from '@shared/chileDate';
import type { StudioDesign } from '@shared/contentStudio';
import { cleanAmbassadorCode, type StudioVideo } from '@shared/studioVideo';
import { packImages, packVideos, shareCardText, SHARE_CARD_SIZE } from '@shared/studioPack';
import { VariantGallery } from './VariantGallery';
import { ShareCard } from './ShareCard';
import { downloadSlide, slideFileName } from './exportSlides';

/* Paquete de un evento: las imágenes (feed 3:4 e historia 9:16), la imagen
 * para compartir el link y los videos del anuncio, todo con los datos reales
 * del evento. Con el código de un embajador sale personalizado para él.
 * Sin IA: no gasta créditos. */

export function EventPack({ initialEventId, onBack, onOpen, onOpenVideo }: {
  initialEventId: number | null;
  onBack: () => void;
  onOpen: (design: StudioDesign) => void;
  onOpenVideo: (video: StudioVideo) => void;
}) {
  const { data: events, isLoading } = trpc.events.listAll.useQuery();
  const [eventId, setEventId] = useState<string>(initialEventId ? String(initialEventId) : '');
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const list = useMemo(
    () => (events ?? []).filter((e) => e.status !== 'cancelled').sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()),
    [events],
  );
  const event = list.find((e) => String(e.id) === eventId) ?? null;
  const code = cleanAmbassadorCode(codeInput);
  const badCode = codeInput.trim() !== '' && code === '';

  const images = useMemo(() => (event ? packImages(event, code) : []), [event, code]);
  const videos = useMemo(() => (event ? packVideos(event, code) : []), [event, code]);
  const card = useMemo(() => (event ? shareCardText(event, code) : null), [event, code]);

  const downloadCard = async () => {
    if (!cardRef.current || !event) return;
    setBusy(true);
    try {
      await downloadSlide(cardRef.current, slideFileName(`${event.title} compartir`, 0, 1));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar la imagen.');
    } finally {
      setBusy(false);
    }
  };

  const previewScale = 360 / SHARE_CARD_SIZE.width;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Diseños</Button>
        <h2 className="font-heading text-xl flex items-center gap-2"><Package className="w-5 h-5" /> Paquete de un evento</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Elige el evento y salen juntas las imágenes (feed 3:4 e historia 9:16), la imagen para compartir el link y los videos del
        anuncio, con su nombre, día, hora y foto. La dirección nunca se incluye. No usa IA ni gasta créditos.
      </p>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label>Evento</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="w-72"><SelectValue placeholder={isLoading ? 'Cargando…' : 'Elige un evento'} /></SelectTrigger>
              <SelectContent>{list.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.title} · {formatChileShortDate(e.eventDate)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Código de embajador (opcional)</Label>
            <Input className="w-56" value={codeInput} maxLength={32} placeholder="Ej: SOFIA" onChange={(e) => setCodeInput(e.target.value)} aria-invalid={badCode} />
            <p className={`text-xs ${badCode ? 'text-destructive' : 'text-muted-foreground'}`}>
              {badCode ? 'Solo letras, números, guion y guion bajo (2 a 32).' : 'Sale en el botón y en el texto: «Mi código: SOFIA».'}
            </p>
          </div>
        </CardContent>
      </Card>

      {!event ? (
        <p className="text-sm text-muted-foreground">{isLoading ? <Loader2 className="inline w-4 h-4 animate-spin" /> : 'Elige un evento para armar su paquete.'}</p>
      ) : (
        <>
          {!event.imageUrl && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">
              Este evento no tiene foto: las imágenes salen con el fondo de la plantilla. Súbela en el evento y vuelve a abrir el paquete.
            </p>
          )}

          <section className="space-y-3">
            <h3 className="font-medium">Imágenes · feed 3:4 e historia 9:16</h3>
            <VariantGallery variants={images} title={`${event.title}${code ? ` ${code}` : ''}`} onOpen={onOpen} />
          </section>

          <section className="space-y-3">
            <h3 className="font-medium">Imagen para compartir el link · 1200×630</h3>
            <p className="text-sm text-muted-foreground">Es la que aparece al pegar un link en WhatsApp o Facebook. Descárgala y súbela donde la necesites (por ejemplo, en Configuración → imagen al compartir).</p>
            <div className="flex flex-wrap items-start gap-4">
              <div style={{ width: 360, height: SHARE_CARD_SIZE.height * previewScale, overflow: 'hidden', position: 'relative' }} className="rounded-lg shadow-sm">
                <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
                  {card && <ShareCard ref={cardRef} {...card} />}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={downloadCard} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} Descargar PNG
              </Button>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-medium">Videos</h3>
            <p className="text-sm text-muted-foreground">Ábrelos en el editor para ajustar los textos, guardarlos y exportarlos a MP4.</p>
            <div className="flex flex-wrap gap-2">
              {videos.map((v) => (
                <Button key={v.key} variant="outline" size="sm" onClick={() => onOpenVideo(v.video)}>
                  <Clapperboard className="w-4 h-4 mr-2" /> {v.label}
                </Button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
