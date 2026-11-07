import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Thumbnail } from '@remotion/player';
import { toast } from 'sonner';
import { Download, Loader2, Package, Share2 } from 'lucide-react';
import { MotionVideo } from '@motion/MotionVideo';
import type { MotionSlideInfo } from '@motion/context';
import { Button } from '@/components/ui/button';
import {
  MOTION_FPS, PACK_KIND_LABEL, PACK_KINDS, PACK_SIZES, motionTimeline, packFileNames, packSlides,
  type MotionSpec, type PackKind,
} from '@shared/motionSpec';
import { downloadBlob, downloadZipOf, shareItems, type ExportItem } from '../studio/exportSlides';
import { sleep } from '../studio/fitText';
import { captureStage } from './exportPack';

/* El pack de una idea: las mismas escenas del video, dibujadas como láminas
 * quietas de carrusel (4:5), post (4:5) e historia (9:16). Se editan en el
 * video (el texto es uno solo) y acá se ve cómo queda cada salida y se
 * descargan los PNG a 1080 de ancho. Sin servidor y sin IA. */

const slideInfo = (kind: PackKind, index: number, total: number): MotionSlideInfo => ({ index, total, swipe: kind === 'carrusel' && index < total - 1, thread: kind === 'carrusel' });

/** Una lámina chica de vista previa (se escala sola al ancho de su caja). */
const SlideThumb: React.FC<{ spec: MotionSpec; kind: PackKind; index: number; frame: number; total: number; label: string }> = ({ spec, kind, index, frame, total, label }) => {
  const size = PACK_SIZES[kind];
  const inputProps = useMemo(() => ({ spec: { ...spec, format: kind === 'historia' ? ('reel' as const) : ('feed' as const) }, slide: slideInfo(kind, index, total) }), [spec, kind, index, total]);
  return (
    <figure className="space-y-1.5">
      <div className="overflow-hidden rounded-xl bg-black shadow-md shadow-black/20" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
        <Thumbnail
          component={MotionVideo}
          inputProps={inputProps}
          frameToDisplay={frame}
          durationInFrames={Math.max(1, motionTimeline(spec).total)}
          fps={MOTION_FPS}
          compositionWidth={size.width}
          compositionHeight={size.height}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <figcaption className="text-center text-[11px] text-muted-foreground">{String(index + 1).padStart(2, '0')} · {label}</figcaption>
    </figure>
  );
};

type StageJob = { kind: PackKind; index: number; total: number; frame: number };

export function PackPanel({ spec }: { spec: MotionSpec }) {
  const [kind, setKind] = useState<PackKind>('carrusel');
  const [stage, setStage] = useState<StageJob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const slides = useMemo(() => packSlides(spec, kind), [spec, kind]);
  const total = useMemo(() => Math.max(1, motionTimeline(spec).total), [spec]);

  /** Dibuja cada lámina a tamaño real en la caja oculta y la captura, una tras otra (en paralelo saturaría la memoria de un iPad). */
  async function render(kinds: PackKind[]): Promise<ExportItem[]> {
    const items: ExportItem[] = [];
    for (const k of kinds) {
      const list = packSlides(spec, k);
      const names = packFileNames(spec, k);
      for (let i = 0; i < list.length; i++) {
        setBusy(`${PACK_KIND_LABEL[k]}: lámina ${i + 1} de ${list.length}…`);
        flushSync(() => setStage({ kind: k, index: i, total: list.length, frame: list[i].frame }));
        await sleep(60); // la caja ya existe en el DOM: que pinte
        const node = stageRef.current;
        if (!node) throw new Error('No se pudo preparar la imagen.');
        // El póster dibuja en 3D: se le da más respiro antes de capturar.
        items.push({ name: names[i], blob: await captureStage(node, spec.style === 'poster' ? 900 : 450) });
      }
    }
    return items;
  }

  async function run(label: string, kinds: PackKind[], then: (items: ExportItem[]) => Promise<void> | void) {
    if (busy) return;
    try {
      const items = await render(kinds);
      await then(items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `No se pudo generar ${label}.`);
    } finally {
      setStage(null);
      setBusy(null);
    }
  }

  const flat = (items: ExportItem[]): ExportItem[] => items.map((i) => ({ ...i, name: i.name.split('/').pop() ?? i.name }));
  const downloadKind = () => run(PACK_KIND_LABEL[kind], [kind], async (items) => {
    if (items.length === 1) downloadBlob(flat(items)[0]);
    else await downloadZipOf(flat(items), `${spec.title}-${kind}`);
  });
  const downloadAll = () => run('el pack', [...PACK_KINDS], (items) => downloadZipOf(items, `${spec.title}-pack`));
  const share = () => run(PACK_KIND_LABEL[kind], [kind], async (items) => {
    const shared = await shareItems(flat(items), spec.title).catch((err) => {
      if (err instanceof DOMException && err.name === 'NotAllowedError') { toast.error('Toca «Compartir» otra vez: el navegador pide un toque nuevo.'); return true; }
      throw err;
    });
    if (!shared) { toast.message('Este navegador no comparte archivos: se descargan.'); await downloadZipOf(flat(items), `${spec.title}-${kind}`); }
  });

  const stageSize = stage ? PACK_SIZES[stage.kind] : null;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {PACK_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${kind === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}
          >
            {PACK_KIND_LABEL[k]} · {packSlides(spec, k).length}
          </button>
        ))}
      </div>

      <div className={`grid gap-3 ${kind === 'historia' ? 'grid-cols-2' : 'grid-cols-2'}`}>
        {slides.map((s, i) => (
          <SlideThumb key={`${kind}-${i}-${s.frame}`} spec={spec} kind={kind} index={i} frame={s.frame} total={slides.length} label={s.label} />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={downloadKind} disabled={!!busy}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
          {slides.length > 1 ? `Descargar ${slides.length} PNG (ZIP)` : 'Descargar PNG'}
        </Button>
        {canShare && (
          <Button size="sm" variant="outline" onClick={share} disabled={!!busy}><Share2 className="mr-1 h-4 w-4" /> Compartir</Button>
        )}
        <Button size="sm" variant="outline" onClick={downloadAll} disabled={!!busy}><Package className="mr-1 h-4 w-4" /> Pack completo (ZIP)</Button>
      </div>
      {busy && <p className="text-xs text-muted-foreground">{busy}</p>}
      <p className="text-[11px] text-muted-foreground">
        Mismas escenas del video, sin gastar IA. Si cambias un texto, las láminas se rehacen solas. Los PNG salen a 1080 px de ancho.
      </p>

      {/* Caja oculta a tamaño real: de acá salen los PNG. */}
      {stage && stageSize && (
        <div aria-hidden="true" style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
          <div ref={stageRef} style={{ width: stageSize.width, height: stageSize.height, overflow: 'hidden' }}>
            <Thumbnail
              component={MotionVideo}
              inputProps={{ spec: { ...spec, format: stage.kind === 'historia' ? ('reel' as const) : ('feed' as const) }, slide: slideInfo(stage.kind, stage.index, stage.total) }}
              frameToDisplay={stage.frame}
              durationInFrames={total}
              fps={MOTION_FPS}
              compositionWidth={stageSize.width}
              compositionHeight={stageSize.height}
              style={{ width: stageSize.width, height: stageSize.height }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
