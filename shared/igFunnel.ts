/* Embudo de Instagram por origen y kit de links por canal: lo puro. */

/** Canales fijos del kit: cada uno abre un chat con su código (`?ref=`). */
export const LINK_KIT_CHANNELS: { code: string; label: string; hint: string }[] = [
  { code: 'bio', label: 'Bio de Instagram', hint: 'El link de tu perfil.' },
  { code: 'historias', label: 'Historias', hint: 'Sticker de link en historias.' },
  { code: 'reels', label: 'Reels', hint: 'En el pie de foto o comentario fijado.' },
  { code: 'flyer', label: 'Flyer impreso', hint: 'Como QR en el flyer.' },
  { code: 'anuncio', label: 'Anuncios', hint: 'Destino de un anuncio pagado.' },
  { code: 'qr-local', label: 'QR del local', hint: 'Impreso en la entrada o la barra.' },
  { code: 'whatsapp', label: 'Estado de WhatsApp', hint: 'Para compartir en estados o grupos.' },
  { code: 'correo', label: 'Correos', hint: 'En los mailings.' },
];

/** Código propio de campaña: minúsculas, sin tildes ni espacios. */
export function normalizeLinkCode(raw: string): string {
  return raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/** Origen de un DM que salió desde un comentario: la publicación. */
export function postOrigin(mediaId: string | null | undefined): string | undefined {
  return mediaId ? `post-${mediaId}` : undefined;
}

const CAMPAIGN_LABEL: Record<string, string> = {
  agente: 'Agente de DM (sin origen)',
  'agente-recordatorio': 'Recordatorio del agente',
  'agente-comentario': 'DM desde comentario',
  automatizacion: 'Automatizaciones por palabra',
};

/** Nombre legible de un origen. `posts` resuelve el pie de foto de una publicación. */
export function funnelOriginLabel(origin: string, posts: Map<string, string> = new Map()): string {
  if (origin.startsWith('ref-')) return `Link «${origin.slice(4)}»`;
  if (origin.startsWith('ad-')) return `Anuncio ${origin.slice(3)}`;
  if (origin.startsWith('post-')) {
    const caption = posts.get(origin.slice(5));
    return caption ? `Post: «${caption.replace(/\s+/g, ' ').slice(0, 50)}»` : 'Post de Instagram';
  }
  return CAMPAIGN_LABEL[origin] ?? origin;
}

export interface FunnelRow { origin: string; label: string; chats: number; clicks: number; orders: number; revenue: number }

/** Junta chats, clics y compras por origen, ordenado por compras y luego chats. */
export function buildFunnel(input: {
  chats: { origin: string; count: number }[];
  clicks: { origin: string; count: number }[];
  orders: { origin: string; count: number; revenue: number }[];
  posts?: Map<string, string>;
  labels?: Map<string, string>;
}): FunnelRow[] {
  const rows = new Map<string, FunnelRow>();
  const row = (origin: string) => {
    let r = rows.get(origin);
    if (!r) {
      r = { origin, label: input.labels?.get(origin) ?? funnelOriginLabel(origin, input.posts), chats: 0, clicks: 0, orders: 0, revenue: 0 };
      rows.set(origin, r);
    }
    return r;
  };
  for (const c of input.chats) row(c.origin).chats += c.count;
  for (const c of input.clicks) row(c.origin).clicks += c.count;
  for (const o of input.orders) { const r = row(o.origin); r.orders += o.count; r.revenue += o.revenue; }
  return Array.from(rows.values()).sort((a, b) => b.orders - a.orders || b.chats - a.chats || b.clicks - a.clicks);
}
