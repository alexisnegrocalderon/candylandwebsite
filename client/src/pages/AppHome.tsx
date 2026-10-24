import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { CalendarDays, CircleHelp, CircleUser, FileText, PartyPopper, Shirt } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useMemberSession } from '@/lib/member';
import { useSeo } from '@/hooks/useSeo';
import { useHalloweenMode } from '@/lib/halloween';
import { fromPrice } from '@/lib/fromPrice';
import { AppEventCard, splitEvents, type AppEvent } from '@/components/app/AppEventCard';
import { InfoSheet, type InfoKind } from '@/components/app/InfoSheets';

/* La portada en «modo app» (lib/appMode.ts): lo primero que ve quien abre la
 * app o entra al sitio desde el celular sin sesión. En vez de la portada web,
 * una pantalla de app: el próximo evento con su botón de compra, entrar a «Mi
 * cuenta» y lo demás en hojas (la fiesta, dress code, preguntas, políticas).
 * Con sesión pasa directo a «Mi cuenta». */

const TILES: { kind: InfoKind | 'eventos'; label: string; icon: typeof PartyPopper }[] = [
  { kind: 'fiesta', label: 'La fiesta', icon: PartyPopper },
  { kind: 'dresscode', label: 'Dress code', icon: Shirt },
  { kind: 'eventos', label: 'Eventos', icon: CalendarDays },
  { kind: 'faq', label: 'Preguntas', icon: CircleHelp },
];

export default function AppHome() {
  useSeo({ title: 'Mansion Playroom', description: 'Entradas, eventos y tu cuenta de Mansion Playroom.', path: '/' });
  const { data: session } = useMemberSession();
  const [, navigate] = useLocation();
  useEffect(() => { if (session?.loggedIn) navigate('/cuenta', { replace: true }); }, [session?.loggedIn, navigate]);

  const { data: events, isLoading } = trpc.events.listPublished.useQuery();
  const { upcoming } = splitEvents((events ?? []) as AppEvent[]);
  const next = upcoming[0];
  const { data: nextTickets } = trpc.events.getTicketTypes.useQuery({ slug: next?.slug ?? '' }, { enabled: !!next, retry: false });
  const from = next && nextTickets ? fromPrice(nextTickets as any[], next as any) : null;
  const [sheet, setSheet] = useState<InfoKind | null>(null);
  const halloween = useHalloweenMode();

  return (
    <div className={`account-font account-tokens relative min-h-dvh bg-[#0b0612] text-white ${halloween ? 'pm-halloween' : ''}`}>
      <div className="account-backdrop" />
      <div className="relative z-10 mx-auto max-w-lg px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(14px,env(safe-area-inset-top))]">
        <header className="flex h-12 items-center justify-between">
          <span className="flex items-center gap-2">
            <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-9 w-9" />
            <span className="text-headline font-semibold">Mansion PlayRoom</span>
          </span>
          <Link href="/cuenta" aria-label="Mi cuenta" className="lg-pill grid h-10 w-10 place-items-center rounded-full interactive"><CircleUser className="h-5 w-5" /></Link>
        </header>

        <h1 className="mt-5 text-large-title font-bold leading-tight tracking-tight">{next ? 'Tu próxima fiesta' : 'Pronto, la próxima'}</h1>

        <div className="mt-4">
          {isLoading ? (
            <div className="account-glass aspect-[4/5] rounded-[28px] lg-skeleton" />
          ) : next ? (
            <AppEventCard event={next} big from={from} onInfo={() => setSheet('fiesta')} />
          ) : (
            <div className="account-glass rounded-[28px] p-6 text-center">
              <p className="text-title3 font-bold">Estamos preparando la próxima</p>
              <p className="mt-1 text-subhead text-white/60">Entra a tu cuenta y te avisamos apenas salgan las entradas.</p>
            </div>
          )}
        </div>

        <Link href="/cuenta" className="account-glass mt-3 flex h-14 items-center justify-center gap-2 rounded-full text-headline font-semibold interactive">
          <CircleUser className="h-5 w-5 text-pink-300" /> Entrar a mi cuenta
        </Link>
        <p className="mt-2 px-4 text-center text-footnote text-white/50">Tus entradas con QR, Playcoins, beneficios y Playmatch.</p>

        <div className="mt-6 grid grid-cols-4 gap-2.5">
          {TILES.map(({ kind, label, icon: Icon }) => {
            const cls = 'account-glass flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-[22px] text-caption1 font-semibold interactive';
            const inner = <><Icon className="h-5 w-5 text-pink-300" />{label}</>;
            return kind === 'eventos'
              ? <Link key={kind} href="/eventos" className={cls}>{inner}</Link>
              : <button key={kind} type="button" onClick={() => setSheet(kind)} className={cls}>{inner}</button>;
          })}
        </div>

        <button type="button" onClick={() => setSheet('legal')} className="mx-auto mt-6 flex items-center gap-1.5 text-footnote text-white/45">
          <FileText className="h-3.5 w-3.5" /> Políticas · Evento +18
        </button>
      </div>
      <InfoSheet kind={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}
