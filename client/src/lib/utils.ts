import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// La escala de letras de la app (theme.css: `text-title1`, `text-subhead`…) son TAMAÑOS: sin esto
// tailwind-merge los toma por colores y, en `cn("text-primary-foreground", "text-subhead")`, borra el color.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["large-title", "title1", "title2", "title3", "headline", "body", "callout", "subhead", "footnote", "caption1", "caption2"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
