import { useEffect } from 'react';

const SITE_URL = 'https://mansionplayroom.cl';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(path: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', `${SITE_URL}${path}`);
}

/** Actualiza title/description/OG/canonical por ruta -- SPA sin SSR, así que
 * esto corre en cliente. Google indexa igual (ejecuta JS), y sirve además
 * para que cada pestaña del navegador y cada share de WhatsApp/redes muestre
 * el título correcto en vez del genérico de client/index.html.
 *
 * `noindex` es para páginas transaccionales/de resultado (checkout, pago,
 * verificación de ticket, 404, etc.) que no tiene sentido que aparezcan en
 * Google -- se setea siempre un valor explícito (nunca se omite el tag) para
 * que al navegar de una página noindex a una indexable no quede pegado el
 * noindex de la página anterior en el <head> compartido de la SPA. */
export function useSeo(opts: { title: string; description: string; path: string; image?: string; noindex?: boolean }) {
  useEffect(() => {
    const { title, description, path, image, noindex } = opts;
    document.title = title;
    setMeta('name', 'description', description);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', `${SITE_URL}${path}`);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    if (image) {
      setMeta('property', 'og:image', image);
      setMeta('name', 'twitter:image', image);
    }
    setCanonical(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.title, opts.description, opts.path, opts.image, opts.noindex]);
}
