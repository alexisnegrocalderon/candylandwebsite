import { useRoute } from 'wouter';
import ArticleLayout from '@/components/ArticleLayout';
import ArticleIndex from '@/components/ArticleIndex';
import NotFound from '@/pages/NotFound';
import { getArticle, getGuides } from '@/content';

/* /panoramas (hub) y /panoramas/:slug (guía). Una sola página resuelve las dos
 * rutas para no duplicar el andamiaje. */

export default function Panoramas() {
  const [esDetalle, params] = useRoute('/panoramas/:slug');

  if (esDetalle) {
    const guia = getArticle('guia', params?.slug ?? '');
    // Sin la guía no hay nada que mostrar: 404 de verdad en vez de una página
    // vacía que Google indexaría como contenido delgado.
    if (!guia) return <NotFound />;
    return <ArticleLayout article={guia} />;
  }

  return (
    <ArticleIndex
      eyebrow="Panoramas"
      heading="Panoramas nocturnos en la Región de Valparaíso"
      description="Guías sobre cómo se vive la noche en Viña del Mar y Valparaíso: horarios reales, qué esperar y cómo elegir tu panorama. Escritas por quienes producen las noches."
      seoTitle="Panoramas Nocturnos en la Región de Valparaíso — Guía"
      seoDescription="Qué hacer de noche en Viña del Mar y Valparaíso: guías de panoramas, vida nocturna y planes de fin de semana en la Región de Valparaíso."
      path="/panoramas"
      breadcrumbLabel="Panoramas"
      articles={getGuides()}
      emptyText="Todavía no hay guías publicadas."
    />
  );
}
