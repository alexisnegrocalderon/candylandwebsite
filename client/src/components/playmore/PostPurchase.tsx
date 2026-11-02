import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Check, Download, Link2, MessageCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { COLAB_HOSTS } from '@shared/colabHosts';
import { groupOf } from '@shared/playmoreTanda';
import {
  LOGO_BOX, TICKET, drawLogoFusion, drawTicketBack, drawTicketBody, drawTicketStub, loadImage, loadTicketFonts, ticketDate,
  type TicketArtData,
} from './ticketArt';
import './playmore.css';

/* Después de comprar una entrada de una colab (PLAYMORE):
 * 1. Su ticket, con su nombre y su acceso, que se puede girar con el dedo.
 * 2. "Para tus historias": la imagen vertical 9:16 lista para Instagram.
 * 3. "Que tu grupo se sume": un link a la landing con su nombre y el acceso
 *    del grupo ya elegido.
 * Solo aparece si el evento es de una co-producción activa. */

const DALMORE_MARK = '/playmore/dalmore-mark.png';
const PLAYROOM_ISO = '/candyland/logo-isotipo-transparent.png';

/** Primer nombre, para el ticket y el link (nunca el apellido). */
const firstName = (full: string) => full.trim().split(/\s+/)[0]?.slice(0, 24) ?? '';

/** El ticket completo (cuerpo + talón + logos fundidos) en un solo canvas. */
async function renderTicket(art: TicketArtData, partnerLogoUrl: string): Promise<HTMLCanvasElement> {
  await loadTicketFonts();
  const [pr, partner] = await Promise.all([loadImage(PLAYROOM_ISO), loadImage(partnerLogoUrl)]);
  const body = document.createElement('canvas');
  const stub = document.createElement('canvas');
  drawTicketBody(body, art);
  drawTicketStub(stub, art);
  const logo = document.createElement('canvas');
  logo.width = LOGO_BOX.size; logo.height = LOGO_BOX.size;
  drawLogoFusion(logo, 0.7, pr, partner, art.partnerName);
  const out = document.createElement('canvas');
  out.width = TICKET.bodyW + TICKET.stubW; out.height = TICKET.h;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(body, 0, 0);
  ctx.drawImage(logo, LOGO_BOX.x, LOGO_BOX.y);
  ctx.drawImage(stub, TICKET.bodyW, 0);
  return out;
}

/** Imagen 1080x1920 para historias: terciopelo, "Yo voy a", el ticket y la dirección. */
function renderStory(ticket: HTMLCanvasElement, art: TicketArtData, url: string): HTMLCanvasElement {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0c0908';
  ctx.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  glow(W * 0.25, H * 0.3, 900, 'rgba(150,21,157,0.45)');
  glow(W * 0.8, H * 0.75, 800, 'rgba(214,178,94,0.22)');
  const gold = ctx.createLinearGradient(0, 0, W, 0);
  [[0, '#7a5a22'], [0.3, '#c9a24c'], [0.5, '#f7e7a8'], [0.7, '#d6b25e'], [1, '#9c7630']].forEach(([o, col]) => gold.addColorStop(o as number, col as string));

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e9d9b0';
  ctx.font = 'italic 500 84px "Cormorant Garamond Variable", Georgia, serif';
  ctx.fillText('Yo voy a', W / 2, 420);
  ctx.fillStyle = gold;
  ctx.font = '800 190px "Montserrat Variable", system-ui, sans-serif';
  let size = 190;
  while (ctx.measureText(art.eventName).width > W - 120 && size > 80) { size -= 6; ctx.font = `800 ${size}px "Montserrat Variable", system-ui, sans-serif`; }
  ctx.fillText(art.eventName, W / 2, 420 + size + 10);
  ctx.font = '600 34px "Montserrat Variable", system-ui, sans-serif';
  ctx.fillStyle = '#E477EA';
  ctx.fillText(`PLAYROOM  ×  ${art.partnerName.toUpperCase()}`, W / 2, 420 + size + 90);

  // Ticket inclinado al centro.
  const tw = 1000, th = (tw * ticket.height) / ticket.width;
  ctx.save();
  ctx.translate(W / 2, 1150);
  ctx.rotate((-7 * Math.PI) / 180);
  ctx.shadowColor = 'rgba(228,119,234,0.45)';
  ctx.shadowBlur = 80;
  ctx.drawImage(ticket, -tw / 2, -th / 2, tw, th);
  ctx.restore();

  ctx.fillStyle = '#f4efe6';
  ctx.font = '600 46px "Montserrat Variable", system-ui, sans-serif';
  ctx.fillText(`${art.dateText} · ${art.timeText}`, W / 2, 1560);
  ctx.fillStyle = 'rgba(233,217,176,0.75)';
  ctx.font = 'italic 500 50px "Cormorant Garamond Variable", Georgia, serif';
  ctx.fillText('No es para todos.', W / 2, 1640);
  ctx.fillStyle = gold;
  ctx.font = '700 38px "Montserrat Variable", system-ui, sans-serif';
  ctx.fillText(url.replace(/^https:\/\//, '').replace(/\/$/, ''), W / 2, 1800);
  return c;
}

/** Ticket girable: arrastrar lo rota en 3D; quieto, flota apenas. */
function Ticket3D({ front, back }: { front: string; back: string }) {
  const rx = useMotionValue(8);
  const ry = useMotionValue(-14);
  const sx = useSpring(rx, { stiffness: 120, damping: 18 });
  const sy = useSpring(ry, { stiffness: 120, damping: 18 });
  const shine = useTransform(sy, [-180, 180], ['0%', '100%']);
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  return (
    <div className="mx-auto w-full max-w-md select-none [perspective:1200px]">
      <motion.div
        className="relative w-full cursor-grab touch-none active:cursor-grabbing [transform-style:preserve-3d]"
        style={{ rotateX: sx, rotateY: sy, aspectRatio: `${TICKET.bodyW + TICKET.stubW} / ${TICKET.h}` }}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, rx: rx.get(), ry: ry.get() }; }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; ry.set(d.ry + (e.clientX - d.x) * 0.6); rx.set(Math.max(-35, Math.min(35, d.rx - (e.clientY - d.y) * 0.4))); }}
        onPointerUp={() => { drag.current = null; ry.set(Math.round(ry.get() / 180) * 180 - 14); rx.set(8); }}
        onPointerCancel={() => { drag.current = null; }}
        role="img" aria-label="Tu ticket PLAYMORE. Arrástralo para girarlo.">
        <img src={front} alt="" draggable={false} className="absolute inset-0 h-full w-full rounded-xl [backface-visibility:hidden] drop-shadow-[0_30px_50px_rgba(150,21,157,0.45)]" />
        <img src={back} alt="" draggable={false} className="absolute inset-0 h-full w-full rounded-xl [backface-visibility:hidden] [transform:rotateY(180deg)]" />
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl mix-blend-overlay [backface-visibility:hidden]"
          style={{ backgroundImage: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.35) 50%, transparent 65%)', backgroundSize: '250% 100%', backgroundPositionX: shine }} />
      </motion.div>
      <p className="mt-3 text-center text-[11px] tracking-[0.25em] text-[#e9d9b0]/60">GÍRALO CON EL DEDO</p>
    </div>
  );
}

export function ColabPostPurchase({ eventSlug, holderName, accesoSlug, accessLabel }: {
  eventSlug: string; holderName: string; accesoSlug?: string | null; accessLabel?: string;
}) {
  const { data: brand } = trpc.coproduction.brandForEvent.useQuery({ eventSlug }, { enabled: !!eventSlug, retry: false, staleTime: 5 * 60_000 });
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [story, setStory] = useState<Blob | null>(null);
  const [copied, setCopied] = useState(false);
  const name = firstName(holderName);
  const host = brand ? Object.entries(COLAB_HOSTS).find(([, s]) => s === brand.slug)?.[0] : undefined;
  const landingUrl = host ? `https://${host}/` : typeof window !== 'undefined' ? `${window.location.origin}/` : '/';
  const group = groupOf(accesoSlug)?.key;
  const inviteUrl = `${landingUrl}?${new URLSearchParams({ ...(name ? { invita: name } : {}), ...(group ? { acceso: group } : {}) }).toString()}`;

  useEffect(() => {
    if (!brand) return;
    let alive = true;
    const art: TicketArtData = {
      eventName: brand.eventName, partnerName: brand.partnerName, dateText: ticketDate(brand.countdownIso),
      timeText: brand.timeText, venueText: brand.venueText, daysLeft: null, holderName: name || undefined, accessLabel: accessLabel || undefined,
    };
    (async () => {
      const ticket = await renderTicket(art, brand.partnerLogoUrl || (brand.slug === 'dalmore' ? DALMORE_MARK : ''));
      const b = document.createElement('canvas');
      drawTicketBack(b, TICKET.bodyW + TICKET.stubW);
      const storyCanvas = renderStory(ticket, art, landingUrl);
      if (!alive) return;
      setFront(ticket.toDataURL('image/png'));
      setBack(b.toDataURL('image/png'));
      storyCanvas.toBlob((blob) => { if (alive && blob) setStory(blob); }, 'image/png');
    })().catch(() => undefined);
    return () => { alive = false; };
  }, [brand, name, accessLabel, landingUrl]);

  if (!brand) return null;

  const shareStory = async () => {
    if (!story) return;
    const file = new File([story], `${brand.eventName.toLowerCase()}-historia.png`, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title: brand.eventName }); return; } catch { /* canceló: cae a descargar */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(story);
    a.download = file.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const inviteText = `Voy a ${brand.eventName} · Playroom × ${brand.partnerName}. ${group ? 'Súmate a mi grupo' : 'Vamos'}: ${inviteUrl}`;
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2200); } catch { /* sin portapapeles */ }
  };

  return (
    <div className="playmore mb-8 rounded-[2rem] border border-[#d6b25e]/35 bg-[radial-gradient(120%_70%_at_50%_0%,rgba(150,21,157,0.35),transparent_60%),#0c0908] px-4 py-7 text-left text-[var(--pm-cream)] sm:px-7">
      <p className="text-center text-[11px] font-semibold tracking-[0.4em] text-[var(--pm-orchid)]">TU TICKET {brand.eventName}</p>
      <div className="mt-5">
        {front && back ? <Ticket3D front={front} back={back} /> : <div className="mx-auto aspect-[3/1] w-full max-w-md animate-pulse rounded-xl bg-white/5" />}
      </div>
      <div className="mt-7 space-y-3">
        <button type="button" onClick={shareStory} disabled={!story}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold tracking-[0.2em] text-[#141210] disabled:opacity-50"
          style={{ background: 'var(--pm-gold)' }}>
          <Download className="h-4 w-4" /> PARA TUS HISTORIAS
        </button>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-bold">Que tu grupo se sume</p>
          <p className="mt-1 text-xs text-[var(--pm-sand)]/70">Les llega la página con tu nombre{group ? ' y el mismo acceso ya elegido' : ''}.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(inviteText)}`} target="_blank" rel="noopener noreferrer"
              className="flex h-11 items-center justify-center gap-2 rounded-full border border-[#d6b25e]/40 text-xs font-semibold tracking-[0.15em] hover:bg-white/5">
              <MessageCircle className="h-4 w-4" /> WHATSAPP
            </a>
            <button type="button" onClick={copyInvite}
              className="flex h-11 items-center justify-center gap-2 rounded-full border border-[#d6b25e]/40 text-xs font-semibold tracking-[0.15em] hover:bg-white/5">
              {copied ? <><Check className="h-4 w-4" /> COPIADO</> : <><Link2 className="h-4 w-4" /> COPIAR LINK</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
