import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Check, Eye, Link2, Loader2, Pencil, Ticket, Trash2, Undo2, Upload, Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { formatChileShortDate } from '@shared/chileDate';
import { STUDIO_PHOTO_STYLES, type StudioPhotoStyle } from '@shared/contentStudio';
import { PHOTO_STYLE_LABEL } from '@shared/studioVariants';
import {
  AMBASSADOR_TOKENS,
  isVideoUrl,
  normalizeAmbassadorItem,
  personalizeItem,
  uploadedItem,
  type AmbassadorIdentity,
  type AmbassadorItem,
  type AmbassadorItemVia,
  type AmbassadorMediaFormat,
  type StoredAmbassadorItem,
} from '@shared/ambassadorContent';
import { ScaledSlide } from './ScaledSlide';

/* «Contenido para embajadores» del Estudio: con cada evento publicado se
 * generan solos unos borradores; acá se revisan, se editan y se aprueban.
 * También se suben fotos y videos propios. Cada embajador ve en su panel
 * solo lo aprobado, con su link, su código y su nombre en lugar de
 * {LINK}, {CODIGO} y {NOMBRE} (shared/ambassadorContent.ts). */

const TOKEN_HELP: Record<string, string> = { '{CODIGO}': 'su código', '{LINK}': 'su link', '{NOMBRE}': 'su nombre' };
const MEDIA_ACCEPT = 'image/*,video/mp4,video/quicktime,video/webm';

type Item = StoredAmbassadorItem;

export function AmbassadorContentAdmin({ onBack }: { onBack: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.ambassadorContent.list.useQuery();
  const { data: allEvents } = trpc.events.listAll.useQuery();
  const { data: ambassadors } = trpc.ambassadors.listAll.useQuery();
  const invalidate = () => utils.ambassadorContent.list.invalidate();

  // Al abrir: se crean los borradores que falten (también lo hace el cron y al publicar un evento).
  const generate = trpc.ambassadorContent.generateDrafts.useMutation({
    onSuccess: ({ created }) => { if (created > 0) { invalidate(); toast.success(`${created} borradores nuevos para revisar.`); } },
    // Con el acceso de solo lectura no se crean: se muestra lo que ya hay.
    onError: () => {},
  });
  useEffect(() => { generate.mutate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const setStatus = trpc.ambassadorContent.setStatus.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const remove = trpc.ambassadorContent.delete.useMutation({ onSuccess: () => { invalidate(); toast.success('Quitado.'); }, onError: (e) => toast.error(e.message) });

  // «Ver como»: la vista previa sale personalizada para el embajador elegido.
  const activeAmbassadors = (ambassadors ?? []).filter((a: { active: number }) => a.active === 1);
  const [asCode, setAsCode] = useState<string>('');
  const as = activeAmbassadors.find((a: { code: string }) => a.code === asCode) ?? activeAmbassadors[0];
  const eventTitle = (id: number | null) => (id == null ? 'Para compartir siempre' : allEvents?.find((e) => e.id === id)?.title ?? `Evento #${id}`);
  const upcoming = data?.events ?? [];
  const identityFor = (eventId: number | null): AmbassadorIdentity => {
    const code = as?.code ?? 'TUCODIGO';
    const slug = upcoming.find((e) => e.id === eventId)?.slug ?? upcoming[0]?.slug;
    return { code, name: as?.name ?? 'Embajadora', link: slug ? `https://mansionplayroom.cl/eventos/${slug}?embajador=${code}` : `https://mansionplayroom.cl/?embajador=${code}` };
  };

  const [editing, setEditing] = useState<{ id?: number; item: AmbassadorItem } | null>(null);
  const items = data?.items ?? [];
  const drafts = items.filter((i) => i.status === 'borrador');
  const approved = items.filter((i) => i.status === 'aprobado');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Diseños</Button>
        <h2 className="font-heading text-xl flex items-center gap-2"><Users className="w-5 h-5" /> Contenido para embajadores</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Cada vez que publicas un evento se preparan solos unos borradores (historias con el link, historia y post con el código). Revísalos,
        edítalos si quieres y apruébalos: recién ahí aparecen en el panel de cada embajador, con su link, su código y su nombre. También puedes
        subir tus fotos y videos. No usa IA ni gasta créditos.
      </p>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-60">
            <p className="font-medium flex items-center gap-2"><Eye className="w-4 h-4" /> Ver como</p>
            <p className="text-sm text-muted-foreground">Las vistas previas salen como las verá este embajador.</p>
          </div>
          <Select value={as?.code ?? ''} onValueChange={setAsCode} disabled={activeAmbassadors.length === 0}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Sin embajadores activos" /></SelectTrigger>
            <SelectContent>{activeAmbassadors.map((a: { code: string; name: string }) => <SelectItem key={a.code} value={a.code}>{a.name} · {a.code}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      <UploadCard events={upcoming} onSaved={invalidate} />

      {isLoading || generate.isPending ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</p>
      ) : (
        <>
          <Section
            title={`Por aprobar (${drafts.length})`}
            empty="No hay nada pendiente. Cuando publiques un evento, aparecen acá sus borradores."
            items={drafts}
            eventTitle={eventTitle}
            identityFor={identityFor}
            groupAction={(ids) => (
              <Button size="sm" onClick={() => setStatus.mutate({ ids, status: 'aprobado' }, { onSuccess: () => toast.success('Aprobado: ya lo ven los embajadores.') })} disabled={setStatus.isPending}>
                <Check className="w-4 h-4 mr-2" /> Aprobar todo
              </Button>
            )}
            actions={(item) => (
              <>
                <Button size="sm" className="flex-1" onClick={() => setStatus.mutate({ ids: [item.id], status: 'aprobado' }, { onSuccess: () => toast.success('Aprobado.') })} disabled={setStatus.isPending}><Check className="w-4 h-4 mr-1" /> Aprobar</Button>
                <Button size="icon" variant="outline" onClick={() => setEditing({ id: item.id, item })} aria-label="Editar"><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => { if (confirm('¿Quitar esto? No lo verán los embajadores.')) remove.mutate({ id: item.id }); }} aria-label="Quitar"><Trash2 className="w-4 h-4" /></Button>
              </>
            )}
          />
          <Section
            title={`Publicado para los embajadores (${approved.length})`}
            empty="Todavía no apruebas nada."
            items={approved}
            eventTitle={eventTitle}
            identityFor={identityFor}
            actions={(item) => (
              <>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing({ id: item.id, item })}><Pencil className="w-4 h-4 mr-1" /> Editar</Button>
                <Button size="icon" variant="ghost" onClick={() => setStatus.mutate({ ids: [item.id], status: 'borrador' }, { onSuccess: () => toast.success('Vuelve a borrador: ya no lo ven.') })} aria-label="Despublicar" title="Despublicar"><Undo2 className="w-4 h-4" /></Button>
              </>
            )}
          />
        </>
      )}

      {editing && (
        <ItemEditor
          key={editing.id ?? 'nuevo'}
          initial={editing}
          events={upcoming}
          identityFor={identityFor}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); invalidate(); }}
        />
      )}
    </div>
  );
}

function Section({ title, empty, items, eventTitle, identityFor, actions, groupAction }: {
  title: string; empty: string; items: Item[];
  eventTitle: (id: number | null) => string;
  identityFor: (eventId: number | null) => AmbassadorIdentity;
  actions: (item: Item) => ReactNode;
  groupAction?: (ids: number[]) => ReactNode;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { eventId: number | null; items: Item[] }>();
    for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)) {
      const key = String(item.eventId ?? 'general');
      const g = map.get(key) ?? { eventId: item.eventId, items: [] };
      g.items.push(item);
      map.set(key, g);
    }
    return Array.from(map.values());
  }, [items]);

  return (
    <div className="space-y-3">
      <h3 className="font-heading text-lg">{title}</h3>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
      {groups.map((g) => (
        <Card key={String(g.eventId)} className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium flex-1">{eventTitle(g.eventId)}</p>
              {groupAction?.(g.items.map((i) => i.id))}
            </div>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {g.items.map((item) => (
                <div key={item.id} className="space-y-2">
                  <ItemPreview item={personalizeItem(item, identityFor(item.eventId))} width={170} />
                  <p className="text-sm font-medium leading-tight flex items-center gap-1.5">
                    {item.via === 'link' ? <Link2 className="w-3.5 h-3.5 shrink-0" /> : <Ticket className="w-3.5 h-3.5 shrink-0" />}
                    {item.label}
                  </p>
                  <div className="flex gap-1">{actions(item)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ItemPreview({ item, width }: { item: AmbassadorItem; width: number }) {
  const slide = item.design?.slides[0];
  const ratio = item.mediaFormat === 'post' ? 'aspect-[3/4]' : 'aspect-[9/16]';
  if (item.kind === 'pieza' && item.design && slide) return <ScaledSlide design={item.design} slide={slide} index={0} width={width} />;
  if (item.kind === 'video') return <video src={`${item.mediaUrl}#t=0.5`} controls playsInline muted preload="metadata" style={{ width }} className={`${ratio} object-cover rounded-lg bg-black`} />;
  return <img src={item.mediaUrl} alt={item.label} style={{ width }} className={`${ratio} object-cover rounded-lg`} />;
}

type UpcomingEvent = { id: number; title: string; eventDate: Date | string };

function EventSelect({ value, onChange, events }: { value: number | null; onChange: (id: number | null) => void; events: UpcomingEvent[] }) {
  return (
    <Select value={value == null ? 'general' : String(value)} onValueChange={(v) => onChange(v === 'general' ? null : Number(v))}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="general">Para compartir siempre (sin evento)</SelectItem>
        {events.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.title} · {formatChileShortDate(e.eventDate)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ViaSelect({ value, onChange }: { value: AmbassadorItemVia; onChange: (v: AmbassadorItemVia) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AmbassadorItemVia)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="link">Con su link (sticker «Enlace» / WhatsApp)</SelectItem>
        <SelectItem value="codigo">Con su código</SelectItem>
      </SelectContent>
    </Select>
  );
}

function FormatSelect({ value, onChange }: { value: AmbassadorMediaFormat; onChange: (v: AmbassadorMediaFormat) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AmbassadorMediaFormat)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="historia">Historia / reel 9:16</SelectItem>
        <SelectItem value="post">Feed 3:4</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** Botones para meter {CODIGO}, {LINK} y {NOMBRE} al final del texto. */
function TokenButtons({ onAdd }: { onAdd: (token: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Insertar:</span>
      {AMBASSADOR_TOKENS.map((t) => (
        <Button key={t} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onAdd(t)} title={`Se cambia por ${TOKEN_HELP[t]}`}>{t}</Button>
      ))}
    </div>
  );
}

function UploadCard({ events, onSaved }: { events: UpcomingEvent[]; onSaved: () => void }) {
  const [mediaUrl, setMediaUrl] = useState('');
  const [eventId, setEventId] = useState<number | null>(null);
  const [mediaFormat, setMediaFormat] = useState<AmbassadorMediaFormat>('historia');
  const [via, setVia] = useState<AmbassadorItemVia>('link');
  const [label, setLabel] = useState('');
  const [caption, setCaption] = useState('');
  const save = trpc.ambassadorContent.save.useMutation({ onError: (e) => toast.error(e.message) });
  const setStatus = trpc.ambassadorContent.setStatus.useMutation();

  const submit = async (approve: boolean) => {
    const item = uploadedItem({ mediaUrl, eventId, mediaFormat, via, label: label.trim(), caption });
    if (!item) { toast.error('Sube primero la foto o el video.'); return; }
    const { id } = await save.mutateAsync({ item: item as unknown as Record<string, unknown> });
    if (approve) await setStatus.mutateAsync({ ids: [id], status: 'aprobado' });
    toast.success(approve ? 'Publicado: ya lo ven los embajadores.' : 'Quedó en «Por aprobar».');
    setMediaUrl(''); setLabel(''); setCaption('');
    onSaved();
  };

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5 bg-gradient-to-br from-pink-500/5 to-sky-500/5">
      <CardContent className="pt-6 space-y-4">
        <div>
          <p className="font-medium flex items-center gap-2"><Upload className="w-4 h-4" /> Subir una foto o video tuyo</p>
          <p className="text-sm text-muted-foreground">Fotos de la fiesta, un reel que hiciste, un MP4 del Estudio… Les aparece con un botón para compartirlo directo a Instagram o WhatsApp.</p>
        </div>
        <ImageUploadField value={mediaUrl} onChange={setMediaUrl} pathPrefix="embajadores" accept={MEDIA_ACCEPT} label="Subir foto o video" hint="hasta 50 MB" />
        {mediaUrl && (
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <ItemPreview item={{ ...uploadedItem({ mediaUrl, eventId, mediaFormat })!, mediaFormat }} width={140} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Evento</Label><EventSelect value={eventId} onChange={setEventId} events={events} /></div>
              <div className="space-y-1.5"><Label>Formato</Label><FormatSelect value={mediaFormat} onChange={setMediaFormat} /></div>
              <div className="space-y-1.5"><Label>Cómo vende</Label><ViaSelect value={via} onChange={setVia} /></div>
              <div className="space-y-1.5"><Label>Nombre (lo ven ellos)</Label><Input maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={isVideoUrl(mediaUrl) ? 'Video para compartir' : 'Foto para compartir'} /></div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Texto para publicar (opcional)</Label>
                <Textarea rows={3} maxLength={3000} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Ej: ¡Nos vemos el sábado! Entradas con mi código {CODIGO}" />
                <TokenButtons onAdd={(t) => setCaption((c) => `${c}${c && !c.endsWith(' ') ? ' ' : ''}${t}`)} />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button onClick={() => submit(true)} disabled={save.isPending}><Check className="w-4 h-4 mr-2" /> Publicar para los embajadores</Button>
                <Button variant="outline" onClick={() => submit(false)} disabled={save.isPending}>Guardar en «Por aprobar»</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Editar un item antes (o después) de aprobarlo. */
function ItemEditor({ initial, events, identityFor, onClose, onSaved }: {
  initial: { id?: number; item: AmbassadorItem };
  events: UpcomingEvent[];
  identityFor: (eventId: number | null) => AmbassadorIdentity;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [item, setItem] = useState<AmbassadorItem>(initial.item);
  const set = (patch: Partial<AmbassadorItem>) => setItem((i) => ({ ...i, ...patch }));
  const slide = item.design?.slides[0];
  const setSlide = (patch: Partial<NonNullable<typeof slide>>) => setItem((i) => (i.design ? { ...i, design: { ...i.design, slides: [{ ...i.design.slides[0], ...patch }, ...i.design.slides.slice(1)] } } : i));
  const save = trpc.ambassadorContent.save.useMutation({ onError: (e) => toast.error(e.message) });
  const setStatus = trpc.ambassadorContent.setStatus.useMutation();

  const submit = async (approve: boolean) => {
    const clean = normalizeAmbassadorItem(item);
    if (!clean) { toast.error('Falta la imagen o el archivo.'); return; }
    const { id } = await save.mutateAsync({ id: initial.id, item: clean as unknown as Record<string, unknown> });
    if (approve) await setStatus.mutateAsync({ ids: [id], status: 'aprobado' });
    toast.success(approve ? 'Guardado y publicado.' : 'Guardado.');
    onSaved();
  };

  const preview = personalizeItem(item, identityFor(item.eventId));
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar contenido</DialogTitle></DialogHeader>
        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nombre (lo ven ellos)</Label><Input maxLength={80} value={item.label} onChange={(e) => set({ label: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Cómo usarla (una línea)</Label><Input maxLength={240} value={item.hint} onChange={(e) => set({ hint: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Evento</Label><EventSelect value={item.eventId} onChange={(eventId) => set({ eventId })} events={events} /></div>
              <div className="space-y-1.5"><Label>Cómo vende</Label><ViaSelect value={item.via} onChange={(via) => set({ via })} /></div>
            </div>

            {item.kind === 'pieza' && slide ? (
              <>
                <div className="space-y-1.5"><Label>Título</Label><Textarea rows={2} maxLength={200} value={slide.title} onChange={(e) => setSlide({ title: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Etiqueta (día y hora)</Label><Input maxLength={400} value={slide.body} onChange={(e) => setSlide({ body: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>Botón</Label>
                  <Input maxLength={60} value={slide.cta} onChange={(e) => setSlide({ cta: e.target.value })} />
                  <TokenButtons onAdd={(t) => setSlide({ cta: `${slide.cta}${slide.cta && !slide.cta.endsWith(' ') ? ' ' : ''}${t}` })} />
                </div>
                <div className="space-y-1.5"><Label>Texto chico de abajo</Label><Input maxLength={200} value={slide.footnote} onChange={(e) => setSlide({ footnote: e.target.value })} /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Estilo de foto</Label>
                    <Select value={slide.photoStyle} onValueChange={(v) => setSlide({ photoStyle: v as StudioPhotoStyle })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{STUDIO_PHOTO_STYLES.map((s) => <SelectItem key={s} value={s}>{PHOTO_STYLE_LABEL[s]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Formato</Label>
                    <FormatSelect value={item.design!.format === 'post' ? 'post' : 'historia'} onChange={(f) => setItem((i) => (i.design ? { ...i, mediaFormat: f, design: { ...i.design, format: f } } : i))} />
                  </div>
                </div>
                <div className="space-y-1.5"><Label>Foto</Label><ImageUploadField value={slide.imageUrl} onChange={(url) => setSlide({ imageUrl: url })} pathPrefix="embajadores" /></div>
              </>
            ) : (
              <>
                <div className="space-y-1.5"><Label>Archivo</Label><ImageUploadField value={item.mediaUrl} onChange={(url) => set({ mediaUrl: url, kind: isVideoUrl(url) ? 'video' : 'foto' })} pathPrefix="embajadores" accept={MEDIA_ACCEPT} label="Cambiar foto o video" hint="hasta 50 MB" /></div>
                <div className="space-y-1.5"><Label>Formato</Label><FormatSelect value={item.mediaFormat} onChange={(mediaFormat) => set({ mediaFormat })} /></div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Texto para publicar</Label>
              <Textarea rows={4} maxLength={3000} value={item.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Para el feed: con {CODIGO}. En historias con link no hace falta." />
              <TokenButtons onAdd={(t) => set({ caption: `${item.caption}${item.caption && !item.caption.endsWith(' ') ? ' ' : ''}${t}` })} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Así lo ve {identityFor(item.eventId).name.split(' ')[0]}:</p>
            <ItemPreview item={preview} width={200} />
            {preview.caption && <p className="text-xs text-muted-foreground whitespace-pre-line border rounded-lg p-2">{preview.caption}</p>}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="outline" onClick={() => submit(false)} disabled={save.isPending}>Guardar</Button>
          <Button onClick={() => submit(true)} disabled={save.isPending}><Check className="w-4 h-4 mr-2" /> Guardar y publicar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
