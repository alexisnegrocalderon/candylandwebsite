import type { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { TRPCError, type inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../server/routers';
import { trpc } from '@/lib/trpc';
import { CANDYLAND, EVENTO } from '@/config/candyland';
import { getArticle, articlePath } from '@/content';
import { articleSchema, breadcrumbSchema, eventSchema, faqSchema } from '@shared/structuredData';

export type HeadMeta = {
  title: string;
  description: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  ogImageWidth?: number;
  ogImageHeight?: number;
  ogImageAlt?: string;
  publishedTime?: string;
  modifiedTime?: string;
  canonicalPath?: string;
  locale?: string;
  noindex?: boolean;
  notFound?: boolean;
  jsonLd?: object[];
};

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type SsrPrefetch = {
  listForHome: () => Promise<RouterOutputs['events']['listForHome']>;
  listPublished: () => Promise<RouterOutputs['events']['listPublished']>;
  eventBySlug: (input: { slug: string }) => Promise<RouterOutputs['events']['getBySlug']>;
  ticketTypes: (input: { slug: string }) => Promise<RouterOutputs['events']['getTicketTypes']>;
  pendingMission: (input: { slug: string }) => Promise<RouterOutputs['mission300']['pendingPersonas']>;
  settingsGet: () => Promise<RouterOutputs['settings']['get']>;
};

const SITE = 'Mansion Playroom';
const DEFAULT_DESCRIPTION = 'Fiestas liberales +18 en Viña del Mar y Valparaíso. Comunidad, consentimiento, libertad y una noche para vivir a tu manera.';
const HOME_TITLE = 'Mansion Playroom — Fiesta Liberal en Viña del Mar | +18';
const HOME_DESCRIPTION = 'La fiesta liberal de la V Región: comunidad, consentimiento y una noche para salir a bailar en Viña del Mar y Valparaíso. Evento +18.';
const OG_IMAGE = '/candyland/og-candyland.jpg';

async function seed(queryClient: QueryClient, key: unknown, data: unknown) {
  queryClient.setQueryData(key as any, data);
}

function cleanPath(url: string) {
  let path = url.split('?')[0] || '/';
  try { path = decodeURI(path); } catch { /* keep malformed path for the 404 branch */ }
  return path.replace(/\/+$/, '') || '/';
}

function eventPriceFrom(ticketTypes: any[] | undefined) {
  const access = (ticketTypes ?? []).filter((ticket) => ticket.category === 'acceso');
  if (!access.length) return null;
  return Math.min(...access.map((ticket) => Number(ticket.price)));
}

function eventJsonLd(event: any, ticketTypes: any[] | undefined) {
  return [
    eventSchema({
      name: event.title,
      description: event.shortDescription,
      startDate: new Date(event.eventDate).toISOString(),
      endDate: event.eventEnd ? new Date(event.eventEnd).toISOString() : null,
      slug: event.slug,
      imageUrl: event.imageUrl,
      priceFrom: eventPriceFrom(ticketTypes),
      venueName: event.venue ?? undefined,
    }),
    breadcrumbSchema([
      { name: 'Inicio', path: '/' },
      { name: 'Eventos', path: '/eventos' },
      { name: event.title, path: `/eventos/${event.slug}` },
    ]),
  ];
}

export async function prefetchForPath(url: string, queryClient: QueryClient, p: SsrPrefetch): Promise<HeadMeta> {
  const clean = cleanPath(url);
  const lower = clean.toLowerCase();

  if (clean === '/') {
    const [homeEvents, settings, event, liveTickets, pendingMission] = await Promise.all([
      p.listForHome(),
      p.settingsGet(),
      p.eventBySlug({ slug: CANDYLAND.slug }),
      p.ticketTypes({ slug: CANDYLAND.slug }),
      p.pendingMission({ slug: CANDYLAND.slug }),
    ]);
    await seed(queryClient, getQueryKey(trpc.events.listForHome, undefined, 'query'), homeEvents);
    await seed(queryClient, getQueryKey(trpc.settings.get, undefined, 'query'), settings);
    await seed(queryClient, getQueryKey(trpc.events.getBySlug, { slug: CANDYLAND.slug }, 'query'), event);
    await seed(queryClient, getQueryKey(trpc.events.getTicketTypes, { slug: CANDYLAND.slug }, 'query'), liveTickets);
    await seed(queryClient, getQueryKey(trpc.mission300.pendingPersonas, { slug: CANDYLAND.slug }, 'query'), pendingMission);

    const jsonLd = [faqSchema(CANDYLAND.faqs)];
    if (EVENTO.fechaConfirmada && event) {
      jsonLd.push(eventSchema({
        name: event.title ?? EVENTO.nombre,
        description: event.shortDescription ?? EVENTO.heroTitulo,
        startDate: new Date(event.eventDate).toISOString(),
        endDate: event.eventEnd ? new Date(event.eventEnd).toISOString() : null,
        slug: event.slug ?? EVENTO.slug,
        imageUrl: event.imageUrl,
        priceFrom: eventPriceFrom(liveTickets),
        venueName: event.venue ?? undefined,
      }));
    }
    return {
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      ogType: 'website',
      ogImage: OG_IMAGE,
      ogImageWidth: 1200,
      ogImageHeight: 630,
      ogImageAlt: 'Mansion Playroom en la Región de Valparaíso',
      canonicalPath: '/',
      jsonLd,
    };
  }

  if (lower === '/eventos') {
    const events = await p.listPublished();
    await seed(queryClient, getQueryKey(trpc.events.listPublished, undefined, 'query'), events);
    return {
      title: 'Eventos y Fiestas en Valparaíso — Calendario | Mansion Playroom',
      description: 'Calendario de próximos eventos de Mansion Playroom en la Región de Valparaíso. Fechas, horarios y entradas para tu próxima salida nocturna.',
      canonicalPath: '/eventos',
      jsonLd: [breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Eventos', path: '/eventos' }])],
    };
  }

  const eventMatch = clean.match(/^\/eventos\/([^/]+)$/);
  if (eventMatch) {
    const slug = eventMatch[1];
    let event: RouterOutputs['events']['getBySlug'];
    try {
      event = await p.eventBySlug({ slug });
    } catch (error) {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') event = null;
      else throw error;
    }
    if (!event) return { title: SITE, description: DEFAULT_DESCRIPTION, notFound: true, noindex: true };
    const ticketTypes = await p.ticketTypes({ slug });
    await seed(queryClient, getQueryKey(trpc.events.getBySlug, { slug }, 'query'), event);
    await seed(queryClient, getQueryKey(trpc.events.getTicketTypes, { slug }, 'query'), ticketTypes);
    return {
      title: `${event.title} — Fiesta Liberal en Viña del Mar | +18`,
      description: event.shortDescription || DEFAULT_DESCRIPTION,
      ogType: 'article',
      ogImage: event.imageUrl || OG_IMAGE,
      ogImageWidth: 1200,
      ogImageHeight: 630,
      ogImageAlt: event.title,
      canonicalPath: `/eventos/${event.slug}`,
      jsonLd: eventJsonLd(event, ticketTypes),
    };
  }

  if (lower === '/entradas') {
    const [event, liveTickets] = await Promise.all([
      p.eventBySlug({ slug: CANDYLAND.slug }),
      p.ticketTypes({ slug: CANDYLAND.slug }),
    ]);
    await seed(queryClient, getQueryKey(trpc.events.getBySlug, { slug: CANDYLAND.slug }, 'query'), event);
    await seed(queryClient, getQueryKey(trpc.events.getTicketTypes, { slug: CANDYLAND.slug }, 'query'), liveTickets);
    return {
      title: 'Entradas y Precios — Mansion Playroom | Fiesta +18',
      description: 'Conoce los tipos de acceso y precios para las fiestas +18 de Mansion Playroom en la Región de Valparaíso.',
      canonicalPath: '/entradas',
      jsonLd: [breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Entradas', path: '/entradas' }])],
    };
  }

  if (lower === '/nosotros') {
    return {
      title: 'Quiénes Somos — Mansion Playroom | Comunidad, Respeto y Libertad',
      description: 'Conoce la comunidad, los valores y las reglas de respeto y consentimiento de Mansion Playroom.',
      canonicalPath: '/nosotros',
      jsonLd: [breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Quiénes somos', path: '/nosotros' }])],
    };
  }

  if (lower === '/blog' || lower.startsWith('/blog/')) {
    if (lower === '/blog') {
      return {
        title: 'Blog — Guías para tu primera noche | Mansion Playroom',
        description: 'Guías de dress code, qué llevar, cómo llegar y qué esperar antes de tu primera noche en Mansion Playroom.',
        canonicalPath: '/blog',
        jsonLd: [breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Blog', path: '/blog' }])],
      };
    }
    const slug = clean.slice('/blog/'.length);
    const article = getArticle('blog', slug);
    if (!article) return { title: SITE, description: DEFAULT_DESCRIPTION, notFound: true, noindex: true };
    const path = articlePath(article);
    return {
      title: article.title,
      description: article.description,
      ogType: 'article',
      ogImage: OG_IMAGE,
      ogImageWidth: 1200,
      ogImageHeight: 630,
      ogImageAlt: article.heading,
      publishedTime: new Date(`${article.publishedAt}T12:00:00Z`).toISOString(),
      modifiedTime: article.updatedAt ? new Date(`${article.updatedAt}T12:00:00Z`).toISOString() : undefined,
      canonicalPath: path,
      jsonLd: [
        articleSchema({ headline: article.heading, description: article.description, url: path, datePublished: article.publishedAt, dateModified: article.updatedAt }),
        breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Blog', path: '/blog' }, { name: article.heading, path }]),
      ],
    };
  }

  if (lower === '/panoramas' || lower.startsWith('/panoramas/')) {
    if (lower === '/panoramas') {
      return {
        title: 'Panoramas Nocturnos en la Región de Valparaíso | Mansion Playroom',
        description: 'Ideas y guías para salir de noche en Viña del Mar, Valparaíso y la Región de Valparaíso.',
        canonicalPath: '/panoramas',
        jsonLd: [breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Panoramas', path: '/panoramas' }])],
      };
    }
    const slug = clean.slice('/panoramas/'.length);
    const article = getArticle('guia', slug);
    if (!article) return { title: SITE, description: DEFAULT_DESCRIPTION, notFound: true, noindex: true };
    const path = articlePath(article);
    return {
      title: article.title,
      description: article.description,
      ogType: 'article',
      ogImage: OG_IMAGE,
      ogImageWidth: 1200,
      ogImageHeight: 630,
      ogImageAlt: article.heading,
      publishedTime: new Date(`${article.publishedAt}T12:00:00Z`).toISOString(),
      modifiedTime: article.updatedAt ? new Date(`${article.updatedAt}T12:00:00Z`).toISOString() : undefined,
      canonicalPath: path,
      jsonLd: [
        articleSchema({ headline: article.heading, description: article.description, url: path, datePublished: article.publishedAt, dateModified: article.updatedAt }),
        breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Panoramas', path: '/panoramas' }, { name: article.heading, path }]),
      ],
    };
  }

  if (lower === '/embajadores') {
    return {
      title: 'Embajadores VIP — Mansion Playroom',
      description: 'Postula al programa de embajadores VIP de Mansion Playroom y recibe beneficios por compartir la experiencia.',
      canonicalPath: '/embajadores',
      jsonLd: [breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Embajadores', path: '/embajadores' }])],
    };
  }

  if (lower === '/politica-de-reembolso') {
    return {
      title: 'Política de Reembolso — Mansion Playroom',
      description: 'Conoce la política de cambios, reembolsos y condiciones de compra de entradas de Mansion Playroom.',
      canonicalPath: '/politica-de-reembolso',
      jsonLd: [breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Política de reembolso', path: '/politica-de-reembolso' }])],
    };
  }

  if (lower === '/politica-de-privacidad') {
    return {
      title: 'Política de Privacidad — Mansion Playroom',
      description: 'Conoce cómo Mansion Playroom recopila, utiliza, protege y conserva tus datos personales.',
      canonicalPath: '/politica-de-privacidad',
      jsonLd: [breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Política de privacidad', path: '/politica-de-privacidad' }])],
    };
  }

  // These routes intentionally remain client-rendered and non-indexable. They
  // contain private, token-bearing, transactional or operational information.
  const gatedPrefixes = [
    '/checkout', '/pago', '/mis-referidos', '/mis-puntos', '/verificar', '/fiesta',
    '/playmatch', '/embajador', '/admin', '/caja', '/gastos', '/puerta', '/cocina', '/guardarropia',
  ];
  if (gatedPrefixes.some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`))) {
    return { title: SITE, description: DEFAULT_DESCRIPTION, noindex: true };
  }

  if (lower === '/404') return { title: SITE, description: DEFAULT_DESCRIPTION, notFound: true, noindex: true };
  return { title: SITE, description: DEFAULT_DESCRIPTION, notFound: true, noindex: true };
}
