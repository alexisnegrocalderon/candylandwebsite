import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Download, Loader2, Pencil, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StudioDesign } from '@shared/contentStudio';
import type { StudioVariant } from '@shared/studioVariants';
import { ScaledSlide } from './ScaledSlide';
import { StudioSlideView } from './StudioSlideView';
import { captureSlide, downloadZipOf, shareItems, slideFileName, type ExportItem } from './exportSlides';

/* Galería de variantes del Estudio: muestra cada variante (de un diseño o de
 * una foto), deja marcar las que sirven y las descarga juntas en un ZIP o las
 * comparte al celular. Todo en el navegador, sin IA: no gasta créditos. */

export function VariantGallery({ variants, title, onOpen }: { variants: StudioVariant[]; title: string; onOpen: (design: StudioDesign) => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(variants.map((v) => v.key)));
  const [busy, setBusy] = useState<null | 'zip' | 'share'>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());

  // Si cambian las variantes (otro estilo, otra plantilla), las nuevas parten marcadas.
  const keys = variants.map((v) => v.key).join('|');
  useEffect(() => {
    setSelected(new Set(variants.map((v) => v.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  const toggle = (key: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const chosen = variants.filter((v) => selected.has(v.key));

  const render = async (): Promise<ExportItem[]> => {
    const items: ExportItem[] = [];
    for (const v of chosen) {
      const total = v.design.slides.length;
      for (let i = 0; i < total; i++) {
        const node = nodes.current.get(`${v.key}#${i}`);
        if (!node) continue;
        items.push({ name: slideFileName(`${title} ${v.label}`, i, total), blob: await captureSlide(node) });
      }
    }
    return items;
  };

  const run = async (kind: 'zip' | 'share') => {
    if (chosen.length === 0) return;
    setBusy(kind);
    try {
      const items = await render();
      if (kind === 'zip') await downloadZipOf(items, title);
      else if (!(await shareItems(items, title))) toast.info('Este navegador no permite compartir imágenes. Usa «Descargar».');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo exportar.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{chosen.length} de {variants.length} elegidas</span>
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(variants.map((v) => v.key)))}>Todas</Button>
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Ninguna</Button>
        <div className="flex-1" />
        <Button size="sm" onClick={() => run('zip')} disabled={busy != null || chosen.length === 0}>
          {busy === 'zip' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} Descargar (ZIP)
        </Button>
        <Button size="sm" variant="outline" onClick={() => run('share')} disabled={busy != null || chosen.length === 0}>
          {busy === 'share' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2" />} Compartir
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {variants.map((v) => {
          const on = selected.has(v.key);
          return (
            <div key={v.key} className="space-y-2">
              <button
                type="button"
                onClick={() => toggle(v.key)}
                className={`relative block rounded-lg ring-offset-2 ${on ? 'ring-2 ring-primary' : 'opacity-60 hover:opacity-100'}`}
                aria-pressed={on}
                aria-label={`${on ? 'Quitar' : 'Elegir'} ${v.label}`}
              >
                <ScaledSlide design={v.design} slide={v.design.slides[0]} index={0} width={180} />
                {on && <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground"><Check className="w-3 h-3" /></span>}
              </button>
              <div className="flex items-start justify-between gap-1">
                <p className="text-xs text-muted-foreground">
                  {v.label}
                  {v.design.slides.length > 1 && ` · ${v.design.slides.length} lám.`}
                </p>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => onOpen(v.design)} aria-label={`Editar ${v.label}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* A tamaño real, fuera de la pantalla: de acá salen los PNG. Solo las elegidas. */}
      <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
        {chosen.flatMap((v) => v.design.slides.map((s, i) => (
          <StudioSlideView
            key={`${v.key}#${i}`}
            ref={(el) => { if (el) nodes.current.set(`${v.key}#${i}`, el); else nodes.current.delete(`${v.key}#${i}`); }}
            theme={v.design.theme}
            format={v.design.format}
            slide={s}
            index={i}
            total={v.design.slides.length}
            showBrand={v.design.showBrand}
          />
        )))}
      </div>
    </div>
  );
}
