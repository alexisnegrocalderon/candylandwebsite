/* «Mi contenido» del panel de embajador (/embajador/<CODIGO>): las piezas de
 * cada evento próximo, ya personalizadas, para que siempre tenga algo listo
 * para compartir sin pedirlo.
 *
 * Lo principal es el LINK personal (se pega en el sticker «Enlace» de una
 * historia y la venta queda atribuida sola, sin escribir nada). El código
 * queda como segunda forma, para quien no sepa usar el sticker o para el
 * feed, donde Instagram no deja links. Las imágenes salen de las plantillas
 * del Estudio en el navegador de cada embajador: no gasta créditos ni
 * almacenamiento. */

import { emptySlide, normalizeStudioDesign, type StudioFormat, type StudioPhotoStyle } from './contentStudio';
import { cleanAmbassadorCode } from './studioVideo';
import { eventPhotoBrief, type EventForBrief, type StudioVariant } from './studioVariants';

export interface AmbassadorContentEvent extends EventForBrief {
  slug: string;
  /** Su link personal a ESTE evento (`?embajador=CODIGO`). */
  referralUrl: string;
}

/** Cómo invita a comprar la pieza. */
export type AmbassadorPieceVia = 'link' | 'codigo';

export interface AmbassadorPiece extends StudioVariant {
  via: AmbassadorPieceVia;
  /** Una línea que explica cómo usarla. */
  hint: string;
}

interface PieceSpec {
  key: string;
  label: string;
  format: StudioFormat;
  style: StudioPhotoStyle;
  via: AmbassadorPieceVia;
  hint: string;
}

/** Historias primero (es donde va el sticker del link), después el feed. */
const PIECES: PieceSpec[] = [
  { key: 'historia-link', label: 'Historia con tu link', format: 'historia', style: 'sangre', via: 'link', hint: 'Súbela y ponle el sticker «Enlace» con tu link encima del botón.' },
  { key: 'historia-link-marco', label: 'Historia con tu link (marco)', format: 'historia', style: 'marco', via: 'link', hint: 'Otra versión para el sticker «Enlace». Súbelas en días distintos.' },
  { key: 'historia-codigo', label: 'Historia con tu código', format: 'historia', style: 'polaroid', via: 'codigo', hint: 'Si no puedes poner el link: tu código va escrito en la imagen.' },
  { key: 'feed', label: 'Post para el feed', format: 'post', style: 'sangre', via: 'codigo', hint: 'En el feed no se pueden poner links: lleva tu código. Copia el texto de abajo.' },
];

/** Lo que dice el botón de la pieza. En la historia con link se deja corto:
 * encima va el sticker con el link, que es lo que se toca. */
function ctaFor(spec: PieceSpec, code: string): string {
  if (spec.via === 'link') return 'Entradas en el link';
  return code ? `Mi código: ${code}` : 'Entradas en mansionplayroom.cl';
}

/** Las piezas de un evento para un embajador. Sin código válido igual salen
 * (con el sitio en el botón): el link sirve igual. */
export function ambassadorPieces(event: AmbassadorContentEvent, rawCode: string): AmbassadorPiece[] {
  const code = cleanAmbassadorCode(rawCode);
  const brief = eventPhotoBrief(event, { code });
  const pieces: AmbassadorPiece[] = [];
  for (const spec of PIECES) {
    const slide = {
      ...emptySlide('foto'),
      photoStyle: spec.style,
      imageUrl: brief.imageUrl,
      title: brief.title,
      body: brief.body,
      cta: ctaFor(spec, code),
      footnote: spec.via === 'link' ? 'Evento +18' : brief.footnote,
    };
    const design = normalizeStudioDesign({
      title: `${event.title} · ${spec.label}`,
      format: spec.format,
      theme: 'bubble',
      eventId: event.id,
      slides: [slide],
    });
    if (!design) continue;
    pieces.push({ key: `${event.id}-${spec.key}`, label: spec.label, design, via: spec.via, hint: spec.hint });
  }
  return pieces;
}

/** El texto para el post del feed: Instagram no deja links ahí, así que
 * manda a pedir el link por DM o a comprar con el código. */
export function ambassadorFeedCaption(event: AmbassadorContentEvent, rawCode: string): string {
  const code = cleanAmbassadorCode(rawCode);
  const brief = eventPhotoBrief(event, { code });
  const description = event.shortDescription?.trim();
  return [
    description,
    `📅 ${brief.body}`,
    code
      ? `🎟️ Escríbeme por DM y te mando mi link de entradas, o compra en mansionplayroom.cl con mi código ${code}.`
      : '🎟️ Escríbeme por DM y te mando mi link de entradas.',
    '#MansionPlayroom #FiestaLiberal #VinaDelMar',
  ].filter(Boolean).join('\n\n');
}

/** El mensaje para WhatsApp o un DM: ahí el link sí se puede tocar. */
export function ambassadorDirectMessage(event: AmbassadorContentEvent, rawCode: string): string {
  const code = cleanAmbassadorCode(rawCode);
  const brief = eventPhotoBrief(event, { code });
  return [
    `¡Hola! Te invito a ${event.title} 🍬`,
    `📅 ${brief.body}`,
    `Compra tu entrada con mi link: ${event.referralUrl}`,
    code ? `(Si te lo pide, mi código es ${code})` : '',
  ].filter(Boolean).join('\n');
}
