import { useDialogComposition } from "@/components/ui/dialog";
import { useComposition } from "@/hooks/useComposition";
import { cn } from "@/lib/utils";
import * as React from "react";

/** En un campo numérico el 0 es «sin valor»: se muestra vacío (con su placeholder) para no tener que borrarlo
 * antes de escribir. Mientras escribes se respeta lo tecleado (así se puede escribir 0,5) y al salir vuelve a vaciarse si es 0. */
const isZeroValue = (v: unknown) => v === 0 || v === "0";

function Input({
  className,
  type,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onChange,
  onBlur,
  value,
  ...props
}: React.ComponentProps<"input">) {
  const isNumber = type === "number" && value !== undefined;
  // Lo que la persona está tecleando ahora mismo (null = nada: se muestra el valor que llega).
  const [typed, setTyped] = React.useState<string | null>(null);
  React.useEffect(() => {
    // Si el valor cambió desde afuera (botones + / −, otro cálculo), lo tecleado deja de valer.
    if (typed !== null && typed !== "" && Number(typed) !== Number(value)) setTyped(null);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = !isNumber ? value : typed !== null ? typed : isZeroValue(value) ? "" : value;

  // Get dialog composition context if available (will be no-op if not inside Dialog)
  const dialogComposition = useDialogComposition();

  // Add composition event handlers to support input method editor (IME) for CJK languages.
  const {
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
    onKeyDown: handleKeyDown,
  } = useComposition<HTMLInputElement>({
    onKeyDown: (e) => {
      // Check if this is an Enter key that should be blocked
      const isComposing = (e.nativeEvent as any).isComposing || dialogComposition.justEndedComposing();

      // If Enter key is pressed while composing or just after composition ended,
      // don't call the user's onKeyDown (this blocks the business logic)
      if (e.key === "Enter" && isComposing) {
        return;
      }

      // Otherwise, call the user's onKeyDown
      onKeyDown?.(e);
    },
    onCompositionStart: e => {
      dialogComposition.setComposing(true);
      onCompositionStart?.(e);
    },
    onCompositionEnd: e => {
      // Mark that composition just ended - this helps handle the Enter key that confirms input
      dialogComposition.markCompositionEnd();
      // Delay setting composing to false to handle Safari's event order
      // In Safari, compositionEnd fires before the ESC keydown event
      setTimeout(() => {
        dialogComposition.setComposing(false);
      }, 100);
      onCompositionEnd?.(e);
    },
  });

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
      {...props}
      {...(value !== undefined ? { value: shown } : {})}
      onChange={(e) => {
        if (isNumber) setTyped(e.target.value);
        onChange?.(e);
      }}
      onBlur={(e) => {
        if (isNumber) setTyped(null);
        onBlur?.(e);
      }}
    />
  );
}

export { Input };
