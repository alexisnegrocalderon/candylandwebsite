/* Variantes del Estudio de contenido, sin IA: el mismo contenido en otras
 * plantillas, formatos (feed 3:4 / historia 9:16) y estilos de foto, para
 * elegir y descargar varias de una vez. Todo se arma con las plantillas de
 * marca en el navegador: no gasta créditos.
 *
 * Acá vive lo puro (qué variantes salen y con qué datos); la galería está en
 * client/src/components/admin/studio/VariantGallery.tsx. */

import { formatChileDate, formatChileTime } from './chileDate';
import {
  emptySlide,
  normalizeStudioDesign,
  STUDIO_PHOTO_STYLES,
  STUDIO_THEMES,
  type StudioDesign,
  type StudioFormat,
  type StudioPhotoStyle,
  type StudioTheme,
} from './contentStudio';

export interface StudioVariant {
  /** Único dentro de una tanda (sirve de `key` y para recordar la selección). */
  key: string;
  label: string;
  design: StudioDesign;
}

export const VARIANT_THEME_LABEL: Record<StudioTheme, string> = { bubble: 'Bubble', azul: 'Desafío azul', pastel: 'Pastel', playcard: 'PlayCard' };
export const VARIANT_FORMAT_LABEL: Record<StudioFormat, string> = { carrusel: 'Carrusel 3:4', post: 'Feed 3:4', historia: 'Historia 9:16' };
export const PHOTO_STYLE_LABEL: Record<StudioPhotoStyle, string> = { sangre: 'A sangre', marco: 'Con marco', circulo: 'Círculo', polaroid: 'Polaroid' };

/** Una sola imagen: se puede pasar entre feed 3:4 e historia 9:16. Un
 * carrusel se queda en 3:4 (Instagram no mezcla tamaños dentro de uno). */
function formatsFor(format: StudioFormat): StudioFormat[] {
  return format === 'carrusel' ? ['carrusel'] : ['post', 'historia'];
}

/** El mismo diseño en cada plantilla y formato que le corresponde. El
 * original va primero, para que se reconozca de dónde salieron las demás. */
export function designVariants(design: StudioDesign, themes: readonly StudioTheme[] = STUDIO_THEMES): StudioVariant[] {
  const variants: StudioVariant[] = [];
  for (const theme of themes) {
    for (const format of formatsFor(design.format)) {
      const next = normalizeStudioDesign({ ...design, theme, format });
      if (!next) continue;
      variants.push({
        key: `${theme}-${format}`,
        label: `${VARIANT_THEME_LABEL[theme]} · ${VARIANT_FORMAT_LABEL[format]}`,
        design: next,
      });
    }
  }
  const isOriginal = (v: StudioVariant) => v.design.theme === design.theme && v.design.format === design.format;
  return [...variants.filter(isOriginal), ...variants.filter((v) => !isOriginal(v))];
}

/** Lo que se pide para armar piezas desde una foto. */
export interface PhotoBrief {
  imageUrl: string;
  title: string;
  body: string;
  cta: string;
  footnote: string;
  eventId: number | null;
  caption: string;
}

export function emptyPhotoBrief(): PhotoBrief {
  return { imageUrl: '', title: '', body: '', cta: '', footnote: '', eventId: null, caption: '' };
}

export interface PhotoVariantOptions {
  themes: readonly StudioTheme[];
  formats: readonly StudioFormat[];
  styles: readonly StudioPhotoStyle[];
}

export const DEFAULT_PHOTO_VARIANT_OPTIONS: PhotoVariantOptions = {
  themes: ['bubble'],
  formats: ['post', 'historia'],
  styles: STUDIO_PHOTO_STYLES,
};

/** Una pieza (lámina «foto») por cada estilo × plantilla × formato elegido.
 * Los carruseles no entran: de una foto sale una imagen suelta. */
export function photoVariants(brief: PhotoBrief, opts: PhotoVariantOptions = DEFAULT_PHOTO_VARIANT_OPTIONS): StudioVariant[] {
  const formats = opts.formats.filter((f) => f !== 'carrusel');
  const name = brief.title.trim().split('\n')[0] || 'Foto';
  const variants: StudioVariant[] = [];
  for (const style of opts.styles) {
    for (const theme of opts.themes) {
      for (const format of formats) {
        const slide = { ...emptySlide('foto'), photoStyle: style, imageUrl: brief.imageUrl, title: brief.title, body: brief.body, cta: brief.cta, footnote: brief.footnote };
        const design = normalizeStudioDesign({
          title: `${name} · ${PHOTO_STYLE_LABEL[style]}`,
          format,
          theme,
          eventId: brief.eventId,
          caption: brief.caption,
          slides: [slide],
        });
        if (!design) continue;
        variants.push({
          key: `${style}-${theme}-${format}`,
          label: `${PHOTO_STYLE_LABEL[style]} · ${VARIANT_THEME_LABEL[theme]} · ${VARIANT_FORMAT_LABEL[format]}`,
          design,
        });
      }
    }
  }
  return variants;
}

/** Lo que hace falta de un evento para anunciarlo. */
export interface EventForBrief {
  id: number;
  title: string;
  eventDate: Date | string;
  doorsOpen?: Date | string | null;
  imageUrl?: string | null;
  shortDescription?: string | null;
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** El anuncio de un evento con sus datos reales: nombre, día y hora (en hora
 * de Chile) y su foto. La dirección nunca va: se entrega solo a quien compró. */
export function eventPhotoBrief(event: EventForBrief): PhotoBrief {
  const when = `${capitalize(formatChileDate(event.eventDate))} · ${formatChileTime(event.doorsOpen ?? event.eventDate)} hrs`;
  return {
    imageUrl: event.imageUrl?.trim() ?? '',
    title: event.title,
    body: when,
    cta: 'Entradas en mansionplayroom.cl',
    footnote: 'Evento +18',
    eventId: event.id,
    caption: [event.shortDescription?.trim(), `📅 ${when}`, '🎟️ Entradas en mansionplayroom.cl', '#MansionPlayroom #FiestaLiberal #VinaDelMar'].filter(Boolean).join('\n\n'),
  };
}
