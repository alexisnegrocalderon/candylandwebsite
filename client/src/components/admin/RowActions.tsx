import type { LucideIcon } from 'lucide-react';

/** Botones de ícono con color propio por tipo (mail/whatsapp/ver
 * tickets/reenviar) -- reemplazan los links de texto subrayado de antes.
 * Pedido explícito del dueño: "podrían ser de colores distintos" en vez de
 * monocromos. `RowActionLink` para acciones que navegan (mailto/wa),
 * `RowActionButton` para acciones que disparan una mutación en la página. */
const TONE_CLASSES: Record<string, string> = {
  mail: 'bg-[var(--admin-mail-bg)] text-[var(--admin-mail-text)]',
  wa: 'bg-[var(--admin-wa-bg)] text-[var(--admin-wa-text)]',
  ticket: 'bg-[var(--admin-ticket-bg)] text-[var(--admin-ticket-text)]',
  send: 'bg-[var(--admin-send-bg)] text-[var(--admin-send-text)]',
  success: 'bg-[var(--admin-success-bg)] text-[var(--admin-success-text)]',
};

type Tone = keyof typeof TONE_CLASSES;

const iconButtonClass = (tone: Tone, disabled?: boolean) =>
  `inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0 transition-transform ${TONE_CLASSES[tone]} ${
    disabled ? 'opacity-40 pointer-events-none' : 'hover:scale-110 active:scale-95'
  }`;

export function RowActionLink({ icon: Icon, label, tone, href, target, rel }: {
  icon: LucideIcon;
  label: string;
  tone: Tone;
  href: string;
  target?: string;
  rel?: string;
}) {
  return (
    <a href={href} target={target} rel={rel} title={label} aria-label={label} className={iconButtonClass(tone)}>
      <Icon className="w-4 h-4" />
    </a>
  );
}

export function RowActionButton({ icon: Icon, label, tone, onClick, disabled }: {
  icon: LucideIcon;
  label: string;
  tone: Tone;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className={iconButtonClass(tone, disabled)}>
      <Icon className="w-4 h-4" />
    </button>
  );
}

export function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 flex-wrap">{children}</div>;
}
