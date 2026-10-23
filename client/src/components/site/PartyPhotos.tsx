import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Loader2, Repeat, Star, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { compressSelfie } from '@/lib/partyPhoto';
import { ProtectedPhoto, forgetPhotos } from '@/components/party/ProtectedPhoto';
import { MAX_PARTY_PHOTOS } from '@shared/party';

const tap = () => { try { navigator.vibrate?.(8); } catch { /* sin vibración */ } };

/* Las fotos de Playmatch (hasta 3, la primera es la principal). Vive en site/ (y no en party/)
 * porque también lo usa la inscripción anticipada de la App, que carga la hoja pública de estilos.
 * Se eligen de la cámara o de la galería (sin `capture`, el teléfono ofrece las dos): así se puede
 * llegar a la fiesta con las fotos del disfraz listas. Nadie más las ve hasta que escanean tu
 * entrada, y se borran al terminar la fiesta. */
export function PartyPhotos({ ticketCode, profileId, alias, photoCount, onChanged }: {
  ticketCode: string;
  profileId: number;
  alias: string;
  photoCount: number;
  onChanged: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const upload = trpc.party.uploadPhoto.useMutation();
  const remove = trpc.party.deletePhoto.useMutation();
  const main = trpc.party.makeMainPhoto.useMutation();

  const refresh = () => { forgetPhotos(ticketCode, profileId); setVersion((v) => v + 1); onChanged(); };
  const pick = (position: number) => { tap(); setMenu(null); setTarget(position); input.current?.click(); };

  const onFile = async (file: File | undefined) => {
    const position = target;
    if (!file || position === null) return;
    setBusy(position);
    try {
      await upload.mutateAsync({ ticketCode, photoBase64: await compressSelfie(file), position });
      toast.success('Foto lista');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la foto');
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  const run = async (position: number, fn: () => Promise<unknown>, ok: string) => {
    setMenu(null);
    setBusy(position);
    try { await fn(); toast.success(ok); refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'No se pudo completar'); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5">
        {Array.from({ length: MAX_PARTY_PHOTOS }, (_, i) => {
          const filled = i < photoCount;
          const next = i === photoCount;
          return (
            <button key={i} type="button" disabled={(!filled && !next) || busy !== null}
              onClick={() => (filled ? (tap(), setMenu(menu === i ? null : i)) : pick(i))}
              aria-label={filled ? `Foto ${i + 1}: opciones` : 'Agregar una foto'}
              className={`relative aspect-[3/4] overflow-hidden rounded-[18px] ${filled ? `border-2 ${menu === i ? 'border-pink-400' : 'border-white/15'}` : `border-2 border-dashed ${next ? 'border-pink-400/60 bg-pink-500/10' : 'border-white/15 bg-white/[0.03] opacity-50'}`}`}>
              {filled && <ProtectedPhoto key={`${i}-${version}`} ticketCode={ticketCode} profileId={profileId} position={i} viewerAlias={alias} className="absolute inset-0 h-full w-full" quiet />}
              {!filled && <span className="absolute inset-0 grid place-items-center"><ImagePlus className={`h-7 w-7 ${next ? 'text-pink-300' : 'text-white/45'}`} /></span>}
              {filled && i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-caption2 font-bold backdrop-blur">Principal</span>}
              {busy === i && <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="h-6 w-6 animate-spin" /></span>}
            </button>
          );
        })}
      </div>
      {menu !== null && menu < photoCount && (
        <div className="mt-2.5 flex gap-2">
          {menu > 0 && (
            <button type="button" onClick={() => run(menu, () => main.mutateAsync({ ticketCode, position: menu }), 'Ahora es tu foto principal')}
              className="lg-pill flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-footnote font-semibold"><Star className="h-4 w-4 text-amber-300" /> Principal</button>
          )}
          <button type="button" onClick={() => pick(menu)} className="lg-pill flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-footnote font-semibold"><Repeat className="h-4 w-4" /> Cambiar</button>
          <button type="button" onClick={() => run(menu, () => remove.mutateAsync({ ticketCode, position: menu }), 'Foto borrada')}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-rose-500/10 text-footnote font-semibold text-rose-300"><Trash2 className="h-4 w-4" /> Borrar</button>
        </div>
      )}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); }} />
    </div>
  );
}
