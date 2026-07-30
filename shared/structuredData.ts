/* Datos estructurados (JSON-LD) para Google.
 *
 * Vive en `shared/` y no en `client/` por el mismo motivo que el resto de la
 * lógica pura del proyecto: se testea sin navegador ni base de datos, y el
 * paso de pre-renderizado (fase 3) va a necesitar generar estos mismos objetos
 * desde Node, no desde React.
 *
 * ⚠️ La dirección exacta del recinto NO va acá a propósito. El modelo de la
 * marca es "dirección exacta al comprar" (client/src/config/candyland.ts) para
 * cuidar la privacidad del espacio, así que el schema declara solo comuna y
 * región. Agregar `streetAddress` o `geo` daría mejor señal de SEO local pero
 * publicaría lo que el negocio decidió no publicar -- no se hace. */

const SITE_URL = 'https://mansionplayroom.cl';

/** Un objeto JSON-LD cualquiera. Se mantiene laxo a propósito: schema.org es
 * enorme y tiparlo entero no aporta nada acá. */
export type JsonLd = Record<string, unknown>;

export type SchemaFaq = { q: string; a: string };

export type SchemaEvent = {
  name: string;
  description?: string | null;
  /** ISO. Inicio del evento. */
  startDate: string;
  /** ISO. Google pide `endDate` para no marcar el evento como vencido apenas
   * empieza; si no se sabe, el llamador puede derivarlo del horario. */
  endDate?: string | null;
  slug: string;
  imageUrl?: string | null;
  /** Precio más bajo disponible, en CLP. */
  priceFrom?: number | null;
  locality?: string;
  region?: string;
  venueName?: string;
};

/** El negocio en sí. Base global del sitio: se emite en todas las páginas. */
export function nightClubSchema(data: {
  description: string;
  telephone?: string;
  priceFrom?: number;
  priceTo?: number;
  sameAs?: string[];
  image?: string;
}): JsonLd {
  const schema: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NightClub',
    name: 'Mansion Playroom',
    description: data.description,
    url: `${SITE_URL}/`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Valparaíso',
      addressRegion: 'Región de Valparaíso',
      addressCountry: 'CL',
    },
    areaServed: ['Valparaíso', 'Viña del Mar', 'Región de Valparaíso'],
  };

  if (data.image) schema.image = data.image;
  if (data.telephone) schema.telephone = data.telephone;
  if (data.sameAs?.length) schema.sameAs = data.sameAs;
  // `priceRange` es de las señales que Google usa para el paquete local.
  if (data.priceFrom != null && data.priceTo != null) {
    schema.priceRange = `$${data.priceFrom.toLocaleString('es-CL')} - $${data.priceTo.toLocaleString('es-CL')} CLP`;
  }

  return schema;
}

/** Un evento concreto. Solo se emite en el home y en la página del evento --
 * antes vivía fijo en index.html y se declaraba hasta en la política de
 * privacidad, con la fecha quemada en el HTML. */
export function eventSchema(event: SchemaEvent): JsonLd {
  const schema: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.name,
    startDate: event.startDate,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      name: event.venueName ?? 'La Mansión',
      address: {
        '@type': 'PostalAddress',
        addressLocality: event.locality ?? 'Valparaíso',
        addressRegion: event.region ?? 'Región de Valparaíso',
        addressCountry: 'CL',
      },
    },
    organizer: {
      '@type': 'Organization',
      name: 'Mansion Playroom',
      url: `${SITE_URL}/`,
    },
  };

  if (event.description) schema.description = event.description;
  if (event.endDate) schema.endDate = event.endDate;
  if (event.imageUrl) schema.image = event.imageUrl;

  // Sin `price` + `priceCurrency` Google descarta el resultado enriquecido,
  // que es justamente lo que se busca con este schema.
  const offer: JsonLd = {
    '@type': 'Offer',
    url: `${SITE_URL}/eventos/${event.slug}`,
    availability: 'https://schema.org/InStock',
  };
  if (event.priceFrom != null) {
    offer.price = String(event.priceFrom);
    offer.priceCurrency = 'CLP';
  }
  schema.offers = offer;

  return schema;
}

/** Las preguntas frecuentes que ya están escritas en el config. */
export function faqSchema(faqs: readonly SchemaFaq[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** Migas de pan. `position` arranca en 1 -- Google descarta la lista si
 * empieza en 0. */
export function breadcrumbSchema(items: { name: string; path: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/* Nota: acá vivía un `websiteSchema()` con `SearchAction`, que es lo que
 * habilita el cuadro de búsqueda de sitio en Google. Se sacó a propósito: el
 * sitio NO tiene buscador (`/eventos?q=` no filtra nada), y declarar una
 * acción que no existe es prometerle a Google algo que no se cumple. El
 * `WebSite` sin `SearchAction` se emite estático desde client/index.html.
 * Si algún día se agrega un buscador real, este es el lugar. */
