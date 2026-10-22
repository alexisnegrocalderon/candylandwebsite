import { STUDIO_SIZES, type StudioDesign, type StudioSlide } from '@shared/contentStudio';
import { StudioSlideView } from './StudioSlideView';

/** La lámina achicada para que quepa en `width` px (la real mide 1080). */
export function ScaledSlide({ design, slide, index, width }: { design: StudioDesign; slide: StudioSlide; index: number; width: number }) {
  const size = STUDIO_SIZES[design.format];
  const scale = width / size.width;
  return (
    <div style={{ width, height: size.height * scale, overflow: 'hidden', position: 'relative' }} className="rounded-lg shadow-sm">
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
        <StudioSlideView theme={design.theme} format={design.format} slide={slide} index={index} total={design.slides.length} showBrand={design.showBrand} />
      </div>
    </div>
  );
}
