/* Mailing del 2º aniversario: dos looks para la misma campaña (se elige en la vista previa).
 *
 *  - `oro`:  negro + dorado, elegante, con el precio de hoy en grande.
 *  - `neon`: noche violeta con rosa y cian, como la web y la app.
 *
 * Reglas del layout compartido (server/emailLayout.ts): el correo nace OSCURO y no usa `linear-gradient` (Gmail invierte
 * el texto pero no los degradés). Todo con estilos en línea y `<table>` donde importa el ancho (Outlook).
 * El contenido (títulos, párrafos, precio destacado) lo escribe la campaña; el precio de cada acceso sale de la base
 * (`priceList`), nunca de un texto fijo, para que el correo no diga un precio que ya cambió. */
import { BRAND, EVENT_BRAND } from '../shared/eventBrand';
import { LOGO_URL, emailShell } from './emailLayout';

export type AnniversaryTheme = 'oro' | 'neon' | 'playmore';

interface Palette {
  bg: string; card: string; border: string; ink: string; muted: string;
  accent: string; accentText: string; ctaBg: string; ctaText: string; band: string; bandText: string; chipBg: string;
}

const PALETTES: Record<AnniversaryTheme, Palette> = {
  oro: {
    bg: '#0A0A0C', card: '#16120A', border: '#3A2E12', ink: '#F7F0DC', muted: '#B8AA84',
    accent: '#D4A537', accentText: '#E8C766', ctaBg: '#D4A537', ctaText: '#1A1305', band: '#D4A537', bandText: '#1A1305', chipBg: '#2A200B',
  },
  neon: {
    bg: '#0B0614', card: '#1A0F2B', border: '#4B2A7A', ink: '#F6EEFF', muted: '#B9A5D6',
    accent: '#FF4FB1', accentText: '#FF8AD0', ctaBg: '#FF4FB1', ctaText: '#12061F', band: '#7DF9FF', bandText: '#06121A', chipBg: '#2B1646',
  },
  // PLAYMORE (Playroom × Dalmore): negro, dorado y magenta, como la landing.
  playmore: {
    bg: '#0C0908', card: '#170D1A', border: '#4A2A4E', ink: '#F3E9D2', muted: '#C4B3A6',
    accent: '#D6B25E', accentText: '#F7E7A8', ctaBg: '#D6B25E', ctaText: '#141210', band: '#E477EA', bandText: '#16060F', chipBg: '#25102B',
  },
};

const PM_SITE = 'https://mansionplayroom.cl';

export type AnniversaryPriceRow = { label: string; price: number; originalPrice?: number | null };

export interface AnniversaryEmailData {
  theme: AnniversaryTheme;
  buyerName: string;
  preheader?: string;
  headline: string;
  paragraphs: string[];
  ctaText?: string;
  ctaUrl: string;
  /** Segundo botón con borde (ej. el reel de Instagram). */
  secondaryCtaText?: string;
  secondaryCtaUrl?: string;
  /** Dato urgente en grande, ej. «Cierra hoy» / «23:59 hrs». */
  highlightLabel?: string;
  highlightValue?: string;
  /** Precio de hoy de cada acceso (con el precio general tachado). */
  priceList?: AnniversaryPriceRow[];
  remaining?: number | null;
  eventInfo?: { title: string; imageUrl?: string; dateText: string; venue: string; address?: string; mapsUrl?: string } | null;
  eventSections?: { banner?: boolean; details?: boolean };
  /** Nombre de la tanda en la tarjeta de precios del look PLAYMORE; sin valor = «Primera tanda». */
  tandaLabel?: string;
  /** Pie de marketing (Instagram, web, dirección de la empresa). Por defecto sí; un correo personal lo apaga. */
  footer?: boolean;
  /** HTML al final del cuerpo, después de los datos del evento (ej. la firma). */
  closing?: string;
}

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

function priceCard(p: Palette, rows: AnniversaryPriceRow[], remaining?: number | null, playmore = false, tandaLabel?: string): string {
  const hasStrike = rows.some((r) => r.originalPrice && r.originalPrice > r.price);
  const line = (r: AnniversaryPriceRow) => `
    <tr>
      <td style="padding:12px 0;border-top:1px solid ${p.border};color:${p.ink};font-size:15px;font-weight:700;">${r.label}</td>
      <td align="right" style="padding:12px 0;border-top:1px solid ${p.border};white-space:nowrap;">
        ${r.originalPrice && r.originalPrice > r.price ? `<span style="color:${p.muted};font-size:13px;text-decoration:line-through;margin-right:8px;">${clp(r.originalPrice)}</span>` : ''}
        <span style="color:${p.accentText};font-size:20px;font-weight:800;">${clp(r.price)}</span>
      </td>
    </tr>`;
  return `
    <div style="background-color:${p.card};border:1px solid ${p.border};border-radius:24px;padding:26px 22px 14px;margin-bottom:22px;">
      <p style="color:${p.accentText};font-size:11px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;text-align:center;margin:0 0 6px;">${playmore ? (tandaLabel || 'Primera tanda') : 'Precio de hoy'}</p>
      <h3 style="color:${p.ink};font-size:22px;font-weight:800;text-align:center;margin:0 0 ${(remaining != null && !playmore) || hasStrike ? '6px' : '16px'};">${playmore ? 'Accesos' : 'Último día a este valor'}</h3>
      ${hasStrike ? `<p style="color:${p.muted};font-size:12px;text-align:center;margin:0 0 ${remaining != null && !playmore ? '6px' : '16px'};">${playmore ? 'Tachado: precio de la tanda siguiente.' : 'Tachado: precio general desde mañana.'}</p>` : ''}
      ${remaining != null && !playmore ? `<p style="color:${p.accentText};font-size:13px;font-weight:800;text-align:center;margin:0 0 16px;">Quedan ${remaining} cupos a este precio</p>` : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows.map(line).join('')}</table>
    </div>`;
}

export function buildAnniversaryBlastEmail(data: AnniversaryEmailData): string {
  const p = PALETTES[data.theme];
  const greeting = data.buyerName ? `¡Hola, ${data.buyerName}!` : '¡Hola!';
  const showBanner = data.eventSections?.banner ?? true;
  const showDetails = data.eventSections?.details ?? true;
  const ev = data.eventInfo;
  const hasHighlight = !!(data.highlightLabel && data.highlightValue);
  const isPm = data.theme === 'playmore';

  return emailShell({
    preheader: data.preheader,
    pageBg: p.bg,
    footer: data.footer ?? true,
    beforeContainer: !isPm && ev?.imageUrl && showBanner
      ? `<img src="${ev.imageUrl}" alt="${ev.title}" style="display:block;width:100%;height:auto;" />`
      : undefined,
    hero: isPm ? `
      <div style="background-color:${p.band};padding:11px 20px;text-align:center;">
        <p style="color:${p.bandText};font-size:11px;font-weight:800;letter-spacing:3px;margin:0;">PLAYROOM × DALMORE</p>
      </div>
      <div style="background-color:#1B0B1E;background-image:url(${PM_SITE}/playmore/email-hero-bg.jpg);background-size:cover;background-position:center top;padding:30px 24px 30px;text-align:center;border-radius:0 0 32px 32px;border-bottom:1px solid ${p.border};">
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr>
          <td style="padding:0 14px;vertical-align:middle;"><img src="${PM_SITE}/playmore/playroom-logo.png" alt="Mansion Playroom" width="128" style="display:block;width:128px;height:auto;" /></td>
          <td style="color:${p.accentText};font-size:20px;vertical-align:middle;">×</td>
          <td style="padding:0 14px;vertical-align:middle;"><img src="${PM_SITE}/playmore/dalmore-logo.png" alt="Dalmore" width="138" style="display:block;width:138px;height:auto;" /></td>
        </tr></table>
        <p style="color:${p.accent};font-size:46px;font-weight:800;letter-spacing:1px;line-height:50px;margin:0 0 8px;font-family:'Montserrat','Helvetica Neue',Arial,sans-serif;">PLAYMORE</p>
        <p style="color:${p.muted};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 22px;">Una noche. Dos mundos. Ninguna igual.</p>
        <p style="color:${p.muted};font-size:14px;margin:0 0 6px;">${greeting}</p>
        <h1 style="color:${p.ink};font-size:27px;font-weight:800;line-height:1.2;margin:0;">${data.headline}</h1>
      </div>` : `
      <div style="background-color:${p.band};padding:11px 20px;text-align:center;">
        <p style="color:${p.bandText};font-size:11px;font-weight:800;letter-spacing:3px;margin:0;">${EVENT_BRAND.kicker}</p>
      </div>
      <div style="background-color:${p.card};padding:40px 24px 36px;text-align:center;border-radius:0 0 32px 32px;border-bottom:1px solid ${p.border};">
        <img src="${LOGO_URL}" alt="${BRAND.nombre}" style="height:56px;width:auto;margin-bottom:20px;" />
        <p style="color:${p.accent};font-size:84px;font-weight:800;line-height:84px;margin:0 0 4px;font-family:'Syne','Helvetica Neue',Arial,sans-serif;">2</p>
        <p style="color:${p.accentText};font-size:15px;font-weight:800;letter-spacing:6px;text-transform:uppercase;margin:0 0 22px;">años</p>
        <p style="color:${p.muted};font-size:14px;margin:0 0 6px;">${greeting}</p>
        <h1 style="color:${p.ink};font-size:27px;font-weight:800;line-height:1.2;margin:0;">${data.headline}</h1>
      </div>`,
    body: `
      ${hasHighlight ? `
      <div style="background-color:${p.chipBg};border:1px solid ${p.accent};border-radius:20px;padding:18px 16px;text-align:center;margin-bottom:22px;">
        <p style="color:${p.muted};font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin:0 0 6px;">${data.highlightLabel}</p>
        <p style="color:${p.accentText};font-size:34px;font-weight:800;line-height:38px;margin:0;">${data.highlightValue}</p>
      </div>` : ''}

      ${data.paragraphs.map((t) => `<p style="color:${p.muted};font-size:15px;line-height:1.65;margin:0 0 18px;">${t}</p>`).join('')}

      ${data.priceList && data.priceList.length > 0 ? priceCard(p, data.priceList, data.remaining, isPm, data.tandaLabel) : ''}

      <div style="text-align:center;padding:6px 0 ${data.secondaryCtaUrl ? '14px' : '26px'};">
        <a href="${data.ctaUrl}" style="display:inline-block;background-color:${p.ctaBg};color:${p.ctaText};text-decoration:none;padding:17px 40px;border-radius:999px;font-weight:800;font-size:16px;letter-spacing:0.3px;">${data.ctaText || 'Comprar mi entrada'}</a>
      </div>
      ${data.secondaryCtaUrl ? `<div style="text-align:center;padding:0 0 26px;">
        <a href="${data.secondaryCtaUrl}" style="display:inline-block;color:${p.accentText};text-decoration:none;padding:14px 32px;border-radius:999px;border:1.5px solid ${p.accent};font-weight:800;font-size:14px;letter-spacing:0.3px;">${data.secondaryCtaText || 'Míralo en Instagram'}</a>
      </div>` : ''}

      ${ev && showDetails ? `
      <div style="background-color:${p.card};border:1px solid ${p.border};border-radius:20px;padding:20px;margin-bottom:20px;">
        <p style="color:${p.accentText};font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">${ev.title}</p>
        <p style="color:${p.ink};font-size:15px;margin:6px 0;">📅 ${ev.dateText}</p>
        <p style="color:${p.ink};font-size:15px;margin:6px 0;">📍 ${ev.venue}${ev.address ? ` — ${ev.address}` : ''}</p>
        ${ev.mapsUrl ? `<a href="${ev.mapsUrl}" style="display:inline-block;color:${p.accentText};font-size:13px;font-weight:700;text-decoration:none;margin-top:4px;">Ver en Google Maps →</a>` : ''}
      </div>` : ''}

      ${data.closing ?? ''}
    `,
  });
}

