import { useEffect } from "react";

export type ClientHeadMeta = {
  title: string;
  description: string;
  canonicalPath?: string;
  image?: string;
  noindex?: boolean;
  jsonLd?: object[];
};

/**
 * Client-side counterpart of the server-composed head. Dynamic page components
 * keep using useSeo; this helper is intentionally small and only exists to
 * make SSR-owned tags deterministic during client navigation.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export default function Head({ meta }: { meta: ClientHeadMeta }) {
  useEffect(() => {
    document.title = meta.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = meta.description;
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (robots) robots.content = meta.noindex ? 'noindex, nofollow' : 'index, follow';
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical && meta.canonicalPath) canonical.href = `${window.location.origin}${meta.canonicalPath}`;
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = meta.title;
    const ogDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    if (ogDescription) ogDescription.content = meta.description;
    if (meta.image) {
      const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
      if (ogImage) ogImage.content = meta.image;
    }
  }, [meta]);

  return null;
}
