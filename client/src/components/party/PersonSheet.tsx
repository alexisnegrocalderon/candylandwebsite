import { useState } from 'react';
import { toast } from 'sonner';
import { Ban, Flag, MapPin, MessageCircle, Star, Wine } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Chip, PersonPhoto, PmSheet, PM_CTA, tap } from '@/components/party/ui';
import { SWIPE_REPORT_REASONS, ZONE_LABELS, type PartyGender, type PartyZone } from '@shared/party';

const GENDER_LABELS: Record<PartyGender, string> = { hombre: 'Hombre', mujer: 'Mujer', pareja: 'Pareja' };

export type SheetPerson = {
  id: number;
  alias: string;
  gender: PartyGender;
  avatarId: number;
  zone: PartyZone;
  connectionId: number | null;
  connectionStatus: string | null;
  pendingForMe: boolean;
};

/** El perfil de una persona (desde la Fiesta, Matches o la «i» de la tarjeta): su foto grande y
 * lo que se puede hacer: aceptar su Caramelo, mandarle uno, abrir el chat, invitarle un trago,
 * bloquear o denunciar. */
export function PersonSheet({ ticketCode, viewerAlias, canPhoto, person, caramelosLeft, onClose, onOpenChat, onGift, onMatch }: {
  ticketCode: string;
  viewerAlias: string;
  canPhoto: boolean;
  person: SheetPerson;
  caramelosLeft: number;
  onClose: () => void;
  onOpenChat: (connectionId: number, alias: string, otherId: number) => void;
  onGift: (profileId: number, alias: string) => void;
  onMatch: (m: { connectionId: number; alias: string; otherId: number }) => void;
}) {
  const utils = trpc.useUtils();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const refresh = () => { utils.party.listMansion.invalidate(); utils.party.swipeDeck.invalidate(); };

  const touch = trpc.party.touch.useMutation({
    onSuccess: (res) => {
      refresh();
      if (res.status === 'accepted') onMatch({ connectionId: res.connectionId, alias: person.alias, otherId: person.id });
      else { toast.success(`Le mandaste un Caramelo a ${person.alias} ★`); onClose(); }
    },
    onError: (e) => toast.error(e.message),
  });
  const respond = trpc.party.respondTouch.useMutation({
    onSuccess: (res) => {
      refresh();
      if (res.status === 'accepted' && person.connectionId) onMatch({ connectionId: person.connectionId, alias: person.alias, otherId: person.id });
      else onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const block = trpc.party.block.useMutation({
    onSuccess: () => { refresh(); toast.success('Listo, no se van a ver más'); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const report = trpc.party.report.useMutation({
    onSuccess: () => { refresh(); toast.success('Denuncia enviada al equipo del local'); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const busy = touch.isPending || respond.isPending || block.isPending || report.isPending;
  const sendReport = (r: string) => report.mutate({ ticketCode, targetProfileId: person.id, reason: r });

  return (
    <PmSheet onClose={onClose}>
      <div className="relative mx-auto mb-4 aspect-[4/5] w-full max-w-[300px] overflow-hidden rounded-[26px] border border-white/15">
        <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto} person={person} className="absolute inset-0 h-full w-full" quiet={false} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-16">
          <p className="truncate text-title1 font-bold tracking-tight">{person.alias}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Chip>{GENDER_LABELS[person.gender]}</Chip>
            <Chip><MapPin className="h-3 w-3" /> En {ZONE_LABELS[person.zone]}</Chip>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        {person.pendingForMe && person.connectionId ? (
          <>
            <p className="flex items-center justify-center gap-1.5 text-subhead font-semibold text-sky-300"><Star className="h-4 w-4 fill-sky-300" /> Te mandó un Caramelo</p>
            <button type="button" disabled={busy} onClick={() => { tap(); respond.mutate({ ticketCode, connectionId: person.connectionId!, accept: true }); }}
              className={`h-14 w-full rounded-full text-headline ${PM_CTA} disabled:opacity-50`}>Aceptar y hablar</button>
            <button type="button" disabled={busy} onClick={() => respond.mutate({ ticketCode, connectionId: person.connectionId!, accept: false })}
              className="h-12 w-full rounded-full text-subhead font-semibold text-white/65 disabled:opacity-50">Ahora no</button>
          </>
        ) : person.connectionStatus === 'accepted' && person.connectionId ? (
          <button type="button" onClick={() => { tap(); onOpenChat(person.connectionId!, person.alias, person.id); }}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-full text-headline ${PM_CTA}`}><MessageCircle className="h-5 w-5" /> Abrir chat</button>
        ) : person.connectionStatus === 'pending' ? (
          <p className="rounded-2xl bg-white/[0.06] py-4 text-center text-subhead text-white/70">Ya le mandaste un Caramelo. Queda esperar 🤞</p>
        ) : (
          <button type="button" disabled={busy || caramelosLeft <= 0} onClick={() => { tap(); touch.mutate({ ticketCode, targetProfileId: person.id }); }}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-full text-headline ${PM_CTA} disabled:opacity-50`}>
            <Star className="h-5 w-5 fill-white" /> {caramelosLeft > 0 ? `Mandarle un Caramelo · te quedan ${caramelosLeft}` : 'Ya usaste tus Caramelos'}
          </button>
        )}
        {/* Invitar un trago no exige match: es la forma clásica de acercarse. Si lo rechaza, no se cobra. */}
        <button type="button" onClick={() => { tap(); onGift(person.id, person.alias); }} className="lg-pill flex h-12 w-full items-center justify-center gap-2 rounded-full text-subhead font-semibold">
          <Wine className="h-4 w-4 text-amber-300" /> Invitarle un trago
        </button>
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        {!reporting ? (
          <div className="flex gap-2.5">
            <button type="button" disabled={busy} onClick={() => block.mutate({ ticketCode, targetProfileId: person.id })}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-white/[0.06] text-footnote font-semibold text-white/70"><Ban className="h-4 w-4" /> Bloquear</button>
            <button type="button" onClick={() => setReporting(true)}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-rose-500/10 text-footnote font-semibold text-rose-300"><Flag className="h-4 w-4" /> Denunciar</button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-footnote text-white/65">¿Qué pasó? Al denunciar, también dejan de verse.</p>
            {SWIPE_REPORT_REASONS.map((r) => (
              <button key={r} type="button" disabled={busy} onClick={() => sendReport(r)} className="w-full rounded-2xl bg-white/[0.06] px-4 py-3 text-left text-subhead">{r}</button>
            ))}
            <div className="flex gap-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Otra cosa…"
                className="h-12 min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-body text-white placeholder:text-white/45 focus:border-rose-400/60 focus:outline-none" />
              <button type="button" disabled={reason.trim().length < 3 || busy} onClick={() => sendReport(reason.trim())}
                className="h-12 shrink-0 rounded-2xl bg-rose-500/85 px-4 text-subhead font-bold disabled:opacity-40">Enviar</button>
            </div>
            <button type="button" onClick={() => setReporting(false)} className="h-10 w-full text-footnote font-semibold text-white/60">Cancelar</button>
          </div>
        )}
      </div>
    </PmSheet>
  );
}
