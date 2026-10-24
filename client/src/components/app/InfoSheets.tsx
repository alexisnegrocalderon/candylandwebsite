import { useState } from 'react';
import { Link } from 'wouter';
import { Car, ChevronDown, Cigarette, FileText, Gamepad2, Martini, Music, ShieldCheck, Shirt } from 'lucide-react';
import { BottomSheet } from '@/components/site/AccountPayments';
import { CANDYLAND } from '@/config/candyland';
import { BRAND, EVENT_BRAND } from '@shared/eventBrand';

/* Lo que antes había que ir a buscar a la portada del sitio, en hojas de la app:
 * la fiesta (pistas, line-up, lo que hay), el dress code, las preguntas
 * frecuentes y las políticas. Mismo texto que el sitio (config/candyland.ts). */

export type InfoKind = 'fiesta' | 'dresscode' | 'faq' | 'legal';

export const INFO_TITLES: Record<InfoKind, string> = {
  fiesta: 'La fiesta',
  dresscode: 'Dress code',
  faq: 'Preguntas frecuentes',
  legal: 'Políticas',
};

const AMENITY_ICON: Record<string, typeof Music> = { Music, Car, Shirt, Gamepad2, Martini, Cigarette, ShieldCheck };

function Fiesta() {
  const byPista = CANDYLAND.pistas.map((p) => ({ ...p, djs: CANDYLAND.lineup.filter((d) => d.pista === p.genero) }));
  return (
    <div className="space-y-5 pb-2">
      <div className="grid grid-cols-2 gap-2.5">
        {byPista.map((p) => (
          <div key={p.nombre} className="account-glass rounded-[22px] p-4">
            <p className="text-caption1 font-semibold uppercase tracking-wide text-pink-300">{p.nombre}</p>
            <p className="mt-1 text-title3 font-bold">{p.genero}</p>
            <p className="mt-1 text-footnote text-white/60">{p.descripcion}</p>
            {p.djs.length > 0 && (
              <p className="mt-2 text-subhead font-semibold leading-snug">
                {p.djs.map((d) => d.nombre).join(p.djs.some((d) => d.formato === 'B2B') ? ' B2B ' : ' · ')}
              </p>
            )}
          </div>
        ))}
      </div>
      <div>
        <p className="mb-2 px-1 text-footnote font-semibold uppercase tracking-wide text-white/55">En la mansión</p>
        <div className="account-glass divide-y divide-white/[0.08] overflow-hidden rounded-[22px]">
          {CANDYLAND.amenities.map((a) => {
            const Icon = AMENITY_ICON[a.icono] ?? ShieldCheck;
            return (
              <div key={a.texto} className="flex items-center gap-3 px-4 py-3">
                <span className="lg-pill grid h-9 w-9 shrink-0 place-items-center rounded-[11px]"><Icon className="h-[18px] w-[18px] text-pink-300" /></span>
                <span className="text-body">{a.texto}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="px-1 text-footnote text-white/55">{BRAND.valores.join(' · ')} · Evento +{BRAND.edadMinima}</p>
    </div>
  );
}

function DressCode() {
  return (
    <div className="space-y-3 pb-2">
      <div className="account-glass rounded-[22px] p-5">
        <p className="text-title2 font-bold">🎃 Disfraz obligatorio</p>
        <p className="mt-2 text-body leading-relaxed text-white/80">{EVENT_BRAND.dressCode}</p>
      </div>
      <p className="px-1 text-footnote text-white/55">Trae tu carnet o pasaporte: lo piden en la puerta junto al QR de tu entrada.</p>
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="account-glass mb-2 divide-y divide-white/[0.08] overflow-hidden rounded-[22px]">
      {CANDYLAND.faqs.map((f, i) => (
        <div key={f.q}>
          <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <span className="flex-1 text-body font-semibold">{f.q}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-white/50 transition-transform ${open === i ? 'rotate-180' : ''}`} />
          </button>
          {open === i && <p className="px-4 pb-4 text-subhead leading-relaxed text-white/75">{f.a}</p>}
        </div>
      ))}
    </div>
  );
}

function Legal({ onNavigate }: { onNavigate: () => void }) {
  const links = [
    { href: '/politica-de-reembolso', label: 'Política de reembolso' },
    { href: '/politica-de-privacidad', label: 'Política de privacidad' },
  ];
  return (
    <div className="account-glass mb-2 divide-y divide-white/[0.08] overflow-hidden rounded-[22px]">
      {links.map((l) => (
        <Link key={l.href} href={l.href} onClick={onNavigate} className="flex items-center gap-3 px-4 py-3.5 text-body">
          <FileText className="h-5 w-5 text-pink-300" /> {l.label}
        </Link>
      ))}
    </div>
  );
}

export function InfoSheet({ kind, onClose }: { kind: InfoKind | null; onClose: () => void }) {
  return (
    <BottomSheet open={!!kind} onClose={onClose} title={kind ? INFO_TITLES[kind] : ''}>
      {kind === 'fiesta' && <Fiesta />}
      {kind === 'dresscode' && <DressCode />}
      {kind === 'faq' && <Faq />}
      {kind === 'legal' && <Legal onNavigate={onClose} />}
    </BottomSheet>
  );
}
