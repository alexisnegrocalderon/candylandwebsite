import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, EyeOff, Eye, MapPin, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { compressSelfie } from '@/lib/partyPhoto';
import { ProtectedPhoto } from '@/components/party/ProtectedPhoto';
import { Chip, PmSheet, PM_CTA, tap } from '@/components/party/ui';
import { ZONE_LABELS, type PartyGender, type PartyZone } from '@shared/party';

const GENDER_LABELS: Record<PartyGender, string> = { hombre: 'Hombre', mujer: 'Mujer', pareja: 'Pareja' };

/* «Mi Playmatch»: tu foto como la ven los demás (la misma tarjeta del swipe). La foto es opcional
 * y solo sirve para el swipe; se toma con la cámara en el momento. Sacarla = salir del swipe al
 * instante. */
export function MyPhotoPanel({ ticketCode, profileId, alias, gender, zone, hasPhoto, swipeEnabled, onChanged, onClose }: {
  ticketCode: string;
  profileId: number;
  alias: string;
  gender: PartyGender;
  zone: PartyZone;
  hasPhoto: boolean;
  swipeEnabled: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const upload = trpc.party.uploadPhoto.useMutation();
  const remove = trpc.party.deletePhoto.useMutation();
  const toggle = trpc.party.setSwipeEnabled.useMutation();

  const done = () => { setVersion((v) => v + 1); onChanged(); };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const photoBase64 = await compressSelfie(file);
      await upload.mutateAsync({ ticketCode, photoBase64 });
      toast.success('Foto lista');
      done();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la foto');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

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
          <ProtectedPhoto key={version} ticketCode={ticketCode} profileId={profileId} viewerAlias={alias} className="absolute inset-0 h-full w-full" />
        ) : (
          <div className="absolute inset-0 grid place-items-center"><Camera className="h-12 w-12 text-white/45" strokeWidth={1.5} /></div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-14">
          <p className="truncate text-title2 font-bold">{alias}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5"><Chip>{GENDER_LABELS[gender]}</Chip><Chip><MapPin className="h-3 w-3" /> En {ZONE_LABELS[zone]}</Chip></div>
        </div>
        {hasPhoto && !swipeEnabled && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-sm"><p className="flex items-center gap-1.5 text-subhead font-semibold"><EyeOff className="h-4 w-4" /> En pausa: nadie te ve</p></div>
        )}
      </div>
      <p className="mb-4 text-center text-footnote text-white/65">
        Opcional. Solo la ve gente que también puso la suya, solo durante esta fiesta, y se borra al terminar.
      </p>

      <input ref={inputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="space-y-2.5">
        <button type="button" disabled={busy} onClick={() => { tap(); inputRef.current?.click(); }}
          className={`flex h-14 w-full items-center justify-center gap-2 rounded-full text-headline ${PM_CTA} disabled:opacity-50`}>
          <Camera className="h-5 w-5" /> {busy ? 'Un momento…' : hasPhoto ? 'Tomar otra foto' : 'Tomar mi foto'}
        </button>
        {hasPhoto && (
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" disabled={busy} onClick={() => run(() => toggle.mutateAsync({ ticketCode, enabled: !swipeEnabled }), swipeEnabled ? 'En pausa' : 'Visible otra vez')}
              className="lg-pill flex h-12 items-center justify-center gap-1.5 rounded-full text-subhead font-semibold disabled:opacity-50">
              {swipeEnabled ? <><EyeOff className="h-4 w-4" /> Pausar</> : <><Eye className="h-4 w-4" /> Mostrarme</>}
            </button>
            <button type="button" disabled={busy} onClick={() => run(() => remove.mutateAsync({ ticketCode }), 'Foto borrada')}
              className="flex h-12 items-center justify-center gap-1.5 rounded-full bg-rose-500/10 text-subhead font-semibold text-rose-300 disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> Borrar
            </button>
          </div>
        )}
      </div>
    </PmSheet>
  );
}
