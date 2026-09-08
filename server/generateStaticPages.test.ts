import { describe, it, expect } from 'vitest';
import { getRouteList } from '../scripts/generate-static-pages';
import { ALL_ARTICLES, articlePath } from '../client/src/content';

/* El pre-renderizado (Fase 3 de docs/SEO-ESTRATEGIA.md) depende de que
 * `getRouteList()` no se desalinee de lo que realmente existe -- una ruta
 * de más apunta a un archivo `.html` que nunca se generó (404 real en
 * producción), una de menos deja un artículo nuevo sin pre-renderizar en
 * silencio. `client/src/entry-server.tsx` ya falla fuerte si un `path` no
 * tiene componente registrado (ver su mapa `PAGES`), así que esto cubre el
 * resto: que la lista cubra TODOS los artículos de verdad, sin duplicados
 * ni rutas/archivos repetidos. */

describe('generate-static-pages: getRouteList()', () => {
  it('incluye exactamente un route por cada artículo de client/src/content', () => {
    const routes = getRouteList();
    for (const article of ALL_ARTICLES) {
      const path = articlePath(article);
      const matches = routes.filter((r) => r.path === path);
      expect(matches.length, `"${path}" no está en getRouteList() (o está repetido)`).toBe(1);
    }
  });

  it('no tiene paths repetidos', () => {
    const routes = getRouteList();
    const paths = routes.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('no tiene archivos de salida repetidos', () => {
    const routes = getRouteList();
    const files = routes.map((r) => r.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it('cada route trae título, descripción y canonical', () => {
    // Sin esto un route se pre-renderiza con metadata a medio llenar --
    // el propio injectMeta() simplemente no toca lo que falte, así que un
    // dato vacío no revienta el build, queda silenciosamente incompleto.
    for (const route of getRouteList()) {
      expect(route.meta.title, `sin título: ${route.path}`).toBeTruthy();
      expect(route.meta.description, `sin descripción: ${route.path}`).toBeTruthy();
      expect(route.meta.canonical, `sin canonical: ${route.path}`).toBe(`https://mansionplayroom.cl${route.path}`);
    }
  });

  it('los archivos de salida son relativos y sin ../', () => {
    for (const route of getRouteList()) {
      expect(route.file.startsWith('/')).toBe(false);
      expect(route.file).not.toContain('..');
    }
  });
});
