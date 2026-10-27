import { useState } from 'react';
import { toast } from 'sonner';
import { Camera, EyeOff, Eye, MapPin, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { ProtectedPhoto } from '@/components/party/ProtectedPhoto';
import { Chip, PmSheet } from '@/components/party/ui';
import { PartyPhotos } from '@/components/site/PartyPhotos';
import { GENDER_LABELS, ZONE_LABELS, type PartyGender, type PartyZone } from '@shared/party';


/* «Mi Playmatch»: tu tarjeta como la ven los demás (la misma del swipe) y tus fotos (hasta 3). Las
 * fotos son opcionales y solo sirven para el swipe. Borrarlas todas = salir del swipe al instante. */
export function MyPhotoPanel({ ticketCode, profileId, alias, gender, zone, costume, photoCount, swipeEnabled, onChanged, onClose }: {
  ticketCode: string;
  profileId: number;
  alias: string;
  gender: PartyGender;
  zone: PartyZone;
  costume: string | null;
  photoCount: number;
  swipeEnabled: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const hasPhoto = photoCount > 0;

  const toggle = trpc.party.setSwipeEnabled.useMutation();

  const done = () => { setVersion((v) => v + 1); onChanged(); };

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try { await fn(); toast.success(okMsg); done(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'No se pudo completar'); }
    finally { setBusy(false); }
  };

  return (
    <PmSheet title="Mi Playmatch" onClose={onClose}>
      <p className="mb-2 text-center text-footnote font-semibold uppercase tracking-wide text-white/60">Así te ven</p>
      <div className="relative mx-auto mb-4 aspect-[3/4] w-full max-w-[260px] overflow-hidden rounded-[26px] border border-white/15 bg-white/[0.05]">
        {hasPhoto ? (
          <ProtectedPhoto key={`${version}-${photoCount}`} ticketCode={ticketCode} profileId={profileId} viewerAlias={alias} className="absolute inset-0 h-full w-full" />
        ) : (
          <div className="absolute inset-0 grid place-items-center"><Camera className="h-12 w-12 text-white/45" strokeWidth={1.5} /></div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-14">
          <p className="truncate text-title2 font-bold">{alias}</p>
          {costume && <p className="flex items-center gap-1 truncate text-subhead font-semibold text-amber-200"><Sparkles className="h-3.5 w-3.5 shrink-0" /> {costume}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5"><Chip>{GENDER_LABELS[gender] ?? 'Persona'}</Chip><Chip><MapPin className="h-3 w-3" /> En {ZONE_LABELS[zone]}</Chip></div>
        </div>
        {hasPhoto && !swipeEnabled && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-sm"><p className="flex items-center gap-1.5 text-subhead font-semibold"><EyeOff className="h-4 w-4" /> En pausa: nadie te ve</p></div>
        )}
      </div>
      <p className="mb-2 text-footnote font-semibold uppercase tracking-wide text-white/60">Tus fotos</p>
      <PartyPhotos ticketCode={ticketCode} profileId={profileId} alias={alias} photoCount={photoCount} onChanged={done} />
      <p className="mb-4 mt-3 text-footnote text-white/65">
        Hasta 3, de la cámara o de tu galería. Solo las ve gente que también puso la suya, solo durante esta fiesta, y se borran al terminar.
      </p>
      {hasPhoto && (
        <button type="button" disabled={busy} onClick={() => run(() => toggle.mutateAsync({ ticketCode, enabled: !swipeEnabled }), swipeEnabled ? 'En pausa' : 'Visible otra vez')}
          className="lg-pill flex h-12 w-full items-center justify-center gap-1.5 rounded-full text-subhead font-semibold disabled:opacity-50">
          {swipeEnabled ? <><EyeOff className="h-4 w-4" /> Pausar (que no me vean)</> : <><Eye className="h-4 w-4" /> Volver a mostrarme</>}
        </button>
      )}
    </PmSheet>
  );
}
