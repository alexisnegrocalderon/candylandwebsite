/* «Tu contenido para compartir» del panel de embajador (/embajador/<CODIGO>).
 *
 * El dueño aprueba lo que ven los embajadores:
 * 1. Con cada evento publicado se generan solos unos BORRADORES (historias
 *    con el link, historia y post con el código), con marcas como {CODIGO}
 *    en vez del código de alguien.
 * 2. El dueño los revisa en el admin, los edita si quiere, y los aprueba.
 *    También puede subir sus propias fotos y videos.
 * 3. Cada embajador ve solo lo aprobado, con SU link, SU código y SU nombre
 *    puestos en lugar de las marcas.
 *
 * Lo principal es el LINK personal (se pega en el sticker «Enlace» de una
 * historia y la venta queda atribuida sola, sin escribir nada). El código
 * queda como segunda forma, para quien no sepa usar el sticker o para el
 * feed, donde Instagram no deja links. Las piezas de plantilla se dibujan en
 * el navegador de cada embajador: no gastan créditos ni almacenamiento. */

import {
  emptySlide,
  normalizeStudioDesign,
  type StudioDesign,
  type StudioFormat,
  type StudioPhotoStyle,
  type StudioSlide,
} from './contentStudio';
import { eventPhotoBrief, type EventForBrief } from './studioVariants';

/** Marcas que se reemplazan por los datos de cada embajador. */
export const TOKEN_CODE = '{CODIGO}';
export const TOKEN_LINK = '{LINK}';
export const TOKEN_NAME = '{NOMBRE}';
export const AMBASSADOR_TOKENS = [TOKEN_CODE, TOKEN_LINK, TOKEN_NAME] as const;

export type AmbassadorItemKind = 'pieza' | 'foto' | 'video';
export type AmbassadorItemStatus = 'borrador' | 'aprobado' | 'descartado';
/** Cómo invita a comprar: con el link (sticker / WhatsApp) o con el código. */
export type AmbassadorItemVia = 'link' | 'codigo';
/** Formato de una foto o video subido (para mostrarlo con su proporción). */
export type AmbassadorMediaFormat = 'historia' | 'post';

export const AMBASSADOR_ITEM_STATUSES: readonly AmbassadorItemStatus[] = ['borrador', 'aprobado', 'descartado'];

export interface AmbassadorItem {
  kind: AmbassadorItemKind;
  status: AmbassadorItemStatus;
  /** null = sirve siempre, no es de un evento. */
  eventId: number | null;
  /** Nombre corto que ve el embajador («Historia con tu link»). */
  label: string;
  /** Una línea que explica cómo usarla. */
  hint: string;
  via: AmbassadorItemVia;
  /** Texto para pegar al publicar (con marcas). */
  caption: string;
  /** Solo `pieza`: la lámina de plantilla (con marcas). */
  design: StudioDesign | null;
  /** Solo `foto` / `video`: el archivo subido. */
  mediaUrl: string;
  mediaFormat: AmbassadorMediaFormat;
  /** Las generadas solas llevan su clave, para no volver a crearlas. */
  autoKey: string;
  sortOrder: number;
}

export interface StoredAmbassadorItem extends AmbassadorItem {
  id: number;
  updatedAt: Date | string;
}

const LIMITS = { label: 80, hint: 240, caption: 3000, mediaUrl: 1000, autoKey: 40 } as const;

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function oneOf<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Solo archivos https: nada de `javascript:` ni `data:` guardados en la base. */
export function cleanMediaUrl(value: unknown): string {
  const url = str(value, LIMITS.mediaUrl);
  return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : '';
}

/** Video por la extensión del archivo (los MOV del iPhone incluidos). */
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

/** Todo lo que entra o sale de la base pasa por acá. `null` si no sirve
 * (una pieza sin lámina, una foto sin archivo). */
export function normalizeAmbassadorItem(raw: unknown): AmbassadorItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = oneOf<AmbassadorItemKind>(r.kind, ['pieza', 'foto', 'video'], 'pieza');
  const design = kind === 'pieza' ? normalizeStudioDesign(r.design) : null;
  const mediaUrl = kind === 'pieza' ? '' : cleanMediaUrl(r.mediaUrl);
  if (kind === 'pieza' && !design) return null;
  if (kind !== 'pieza' && !mediaUrl) return null;
  const eventId = typeof r.eventId === 'number' && Number.isInteger(r.eventId) && r.eventId > 0 ? r.eventId : null;
  const sortOrder = typeof r.sortOrder === 'number' && Number.isFinite(r.sortOrder) ? Math.round(r.sortOrder) : 100;
  return {
    kind,
    status: oneOf(r.status, AMBASSADOR_ITEM_STATUSES, 'borrador'),
    eventId,
    label: str(r.label, LIMITS.label) || (kind === 'video' ? 'Video' : kind === 'foto' ? 'Foto' : 'Imagen'),
    hint: str(r.hint, LIMITS.hint),
    via: oneOf<AmbassadorItemVia>(r.via, ['link', 'codigo'], 'link'),
    caption: str(r.caption, LIMITS.caption),
    design: design ? { ...design, eventId } : null,
    mediaUrl,
    mediaFormat: oneOf<AmbassadorMediaFormat>(r.mediaFormat, ['historia', 'post'], design?.format === 'post' ? 'post' : 'historia'),
    autoKey: str(r.autoKey, LIMITS.autoKey),
    sortOrder,
  };
}

/* --- Personalizar -------------------------------------------------------- */

export interface AmbassadorIdentity {
  code: string;
  name: string;
  /** Su link para el evento de la pieza (o el general si no es de un evento). */
  link: string;
}

/** El primer nombre: «Sofía Pérez» → «Sofía». */
export function firstName(name: string): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

export function fillTokens(text: string, who: AmbassadorIdentity): string {
  return text
    .split(TOKEN_CODE).join(who.code)
    .split(TOKEN_LINK).join(who.link)
    .split(TOKEN_NAME).join(firstName(who.name));
}

function fillSlide(slide: StudioSlide, who: AmbassadorIdentity): StudioSlide {
  const f = (t: string) => fillTokens(t, who);
  return {
    ...slide,
    script: f(slide.script),
    title: f(slide.title),
    body: f(slide.body),
    cta: f(slide.cta),
    footnote: f(slide.footnote),
    options: slide.options.map(f),
    items: slide.items.map((item) => ({ ...item, title: f(item.title), body: f(item.body) })),
  };
}

/** La pieza tal como la ve un embajador: sus datos en lugar de las marcas. */
export function personalizeItem<T extends AmbassadorItem>(item: T, who: AmbassadorIdentity): T {
  return {
    ...item,
    label: fillTokens(item.label, who),
    hint: fillTokens(item.hint, who),
    caption: fillTokens(item.caption, who),
    design: item.design ? { ...item.design, caption: fillTokens(item.design.caption, who), slides: item.design.slides.map((s) => fillSlide(s, who)) } : null,
  };
}

/* --- Borradores automáticos por evento ----------------------------------- */

interface DraftSpec {
  autoKey: string;
  label: string;
  format: StudioFormat;
  style: StudioPhotoStyle;
  via: AmbassadorItemVia;
  hint: string;
}

/** Historias primero (es donde va el sticker del link), después el feed. */
const DRAFTS: DraftSpec[] = [
  { autoKey: 'historia-link', label: 'Historia con tu link', format: 'historia', style: 'sangre', via: 'link', hint: 'Súbela y ponle el sticker «Enlace» con tu link encima del botón.' },
  { autoKey: 'historia-link-marco', label: 'Historia con tu link (marco)', format: 'historia', style: 'marco', via: 'link', hint: 'Otra versión para el sticker «Enlace». Súbelas en días distintos.' },
  { autoKey: 'historia-codigo', label: 'Historia con tu código', format: 'historia', style: 'polaroid', via: 'codigo', hint: 'Si no puedes poner el link: tu código va escrito en la imagen.' },
  { autoKey: 'feed', label: 'Post para el feed', format: 'post', style: 'sangre', via: 'codigo', hint: 'En el feed no se pueden poner links: lleva tu código. Copia el texto antes de publicar.' },
];

export const AUTO_DRAFT_KEYS = DRAFTS.map((d) => d.autoKey);

/** El texto para publicar: en una historia no hace falta (el link va en el
 * sticker); en el feed Instagram no deja links, así que invita a pedirlo
 * por DM o a comprar con el código. */
function draftCaption(event: EventForBrief, via: AmbassadorItemVia, format: StudioFormat): string {
  const brief = eventPhotoBrief(event);
  if (format === 'historia' && via === 'link') return '';
  return [
    event.shortDescription?.trim(),
    `📅 ${brief.body}`,
    `🎟️ Escríbeme por DM y te mando mi link de entradas, o compra en mansionplayroom.cl con mi código ${TOKEN_CODE}.`,
    '#MansionPlayroom #FiestaLiberal #VinaDelMar',
  ].filter(Boolean).join('\n\n');
}

/** Los borradores de un evento, con marcas en lugar del código. Los genera
 * el servidor solo, una vez por evento (por `autoKey`). */
export function eventDrafts(event: EventForBrief): AmbassadorItem[] {
  const brief = eventPhotoBrief(event);
  return DRAFTS.flatMap((spec, i): AmbassadorItem[] => {
    const slide = {
      ...emptySlide('foto'),
      photoStyle: spec.style,
      imageUrl: brief.imageUrl,
      title: brief.title,
      body: brief.body,
      cta: spec.via === 'link' ? 'Entradas en el link' : `Mi código: ${TOKEN_CODE}`,
      footnote: spec.via === 'link' ? 'Evento +18' : 'mansionplayroom.cl · Evento +18',
    };
    const design = normalizeStudioDesign({ title: `${event.title} · ${spec.label}`, format: spec.format, theme: 'bubble', eventId: event.id, slides: [slide] });
    if (!design) return [];
    return [{
      kind: 'pieza',
      status: 'borrador',
      eventId: event.id,
      label: spec.label,
      hint: spec.hint,
      via: spec.via,
      caption: draftCaption(event, spec.via, spec.format),
      design,
      mediaUrl: '',
      mediaFormat: spec.format === 'post' ? 'post' : 'historia',
      autoKey: spec.autoKey,
      sortOrder: (i + 1) * 10,
    }];
  });
}

/** Una foto o video subido por el dueño, como borrador. */
export function uploadedItem(input: { mediaUrl: string; eventId: number | null; mediaFormat?: AmbassadorMediaFormat; label?: string; caption?: string; via?: AmbassadorItemVia }): AmbassadorItem | null {
  const mediaUrl = cleanMediaUrl(input.mediaUrl);
  const video = isVideoUrl(mediaUrl);
  return normalizeAmbassadorItem({
    kind: video ? 'video' : 'foto',
    status: 'borrador',
    eventId: input.eventId,
    label: input.label || (video ? 'Video para compartir' : 'Foto para compartir'),
    hint: input.via === 'codigo'
      ? 'Compártela y acompáñala con tu código.'
      : 'Compártela en tu historia y ponle el sticker «Enlace» con tu link.',
    via: input.via ?? 'link',
    caption: input.caption ?? '',
    mediaUrl,
    mediaFormat: input.mediaFormat ?? 'historia',
    sortOrder: 5,
  });
}

/* --- Para el panel ------------------------------------------------------- */

/** Lo que ve un embajador: aprobado, de un evento vigente o general, en orden. */
export function itemsForPanel<T extends AmbassadorItem & { id: number }>(items: T[], eventIds: readonly number[]): T[] {
  const live = new Set(eventIds);
  return items
    .filter((i) => i.status === 'aprobado' && (i.eventId === null || live.has(i.eventId)))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

/** Lo que hace falta de un evento en el panel: datos y su link personal. */
export interface AmbassadorContentEvent extends EventForBrief {
  slug: string;
  referralUrl: string;
}

/** El mensaje para WhatsApp o un DM: ahí el link sí se puede tocar. */
export function ambassadorDirectMessage(event: AmbassadorContentEvent, code: string): string {
  const brief = eventPhotoBrief(event);
  return [
    `¡Hola! Te invito a ${event.title} 🍬`,
    `📅 ${brief.body}`,
    `Compra tu entrada con mi link: ${event.referralUrl}`,
    code ? `(Si te lo pide, mi código es ${code})` : '',
  ].filter(Boolean).join('\n');
}

/* --- Lo que se hace en el Estudio, hacia los embajadores ------------------ */

/** Dónde se ve una pieza en la biblioteca del embajador: historias, posts o videos. */
export type AmbassadorSection = 'historias' | 'posts' | 'videos';

export function itemSection(item: Pick<AmbassadorItem, 'kind' | 'mediaFormat'>): AmbassadorSection {
  if (item.kind === 'video') return 'videos';
  return item.mediaFormat === 'post' ? 'posts' : 'historias';
}

/** La clave con la que un diseño del Estudio queda en la lista de embajadores: una sola vez por diseño. */
export function studioAutoKey(designId: number): string {
  return `estudio-${designId}`;
}

/** Un diseño de plantilla del Estudio (carrusel, post o historia) como pieza para embajadores, en
 * borrador. Lleva todas sus láminas: cada embajador comparte o guarda el juego completo. */
export function designToAmbassadorItem(design: StudioDesign, designId: number): AmbassadorItem | null {
  return normalizeAmbassadorItem({
    kind: 'pieza',
    status: 'borrador',
    eventId: design.eventId,
    label: design.title,
    hint: design.slides.length > 1
      ? `Son ${design.slides.length} láminas: compártelas juntas o guárdalas todas.`
      : 'Compártela en tu historia y ponle el sticker «Enlace» con tu link.',
    via: 'link',
    caption: design.caption,
    design,
    mediaFormat: design.format === 'post' ? 'post' : 'historia',
    autoKey: studioAutoKey(designId),
    sortOrder: 30,
  });
}
