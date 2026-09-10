import { Toaster as Sonner, type ToasterProps } from "sonner";

/* `theme="system"` a propósito: antes esto leía `useTheme()` de next-themes,
 * pero nunca hubo un ThemeProvider de next-themes montado en el árbol (el tema
 * real del sitio vive en contexts/ThemeContext.tsx), así que ese hook devolvía
 * siempre su valor por defecto -- "system". Dejarlo escrito es exactamente el
 * mismo comportamiento que ya estaba en producción, sin arrastrar la
 * dependencia. Si algún día se quiere que el toast siga al tema real del
 * sitio, hay que conectarlo a `useTheme` de @/contexts/ThemeContext, que es un
 * cambio visible y va aparte. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
