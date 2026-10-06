import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { compressSelfie } from '@/lib/partyPhoto';
import { ProtectedPhoto } from '@/components/party/ProtectedPhoto';

/* "Mi foto": la foto es opcional y solo sirve para el swipe. Se toma con la
 * cámara frontal en el momento (capture="user"). Sacarla = salir del swipe al
 * instante. */
export function MyPhotoPanel({ ticketCode, profileId, alias, hasPhoto, swipeEnabled, onChanged, onClose }: {
  ticketCode: string;
  profileId: number;
  alias: string;
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
      toast.success('Foto lista 📸');
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
    <motion.div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center sm:justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full sm:max-w-sm bg-[#1a0f18] rounded-t-3xl sm:rounded-3xl p-5 border border-white/10"
        initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-extrabold text-lg">📸 Mi foto</h2>
          <button onClick={onClose} aria-label="Cerrar"><X className="w-5 h-5 text-white/50" /></button>
        </div>
        <p className="text-sm text-white/50 mb-4">
          Opcional. Solo la ve gente que también puso la suya, solo durante esta fiesta, y se borra al terminar.
          Se toma ahora con la cámara.
        </p>

        {hasPhoto && (
          <ProtectedPhoto
            key={version}
            ticketCode={ticketCode}
            profileId={profileId}
            viewerAlias={alias}
            className="w-44 h-44 mx-auto rounded-3xl mb-4"
          />
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <div className="space-y-2">
          <button
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="w-full h-12 rounded-full bg-primary font-bold disabled:opacity-40"
          >
            {busy ? 'Un momento…' : hasPhoto ? 'Tomar otra foto' : 'Tomar mi foto'}
          </button>
          {hasPhoto && (
            <>
              <button
                disabled={busy}
                onClick={() => run(() => toggle.mutateAsync({ ticketCode, enabled: !swipeEnabled }), swipeEnabled ? 'Pausado' : 'Visible otra vez')}
                className="w-full h-11 rounded-full border border-white/15 text-sm font-semibold disabled:opacity-40"
              >
                {swipeEnabled ? 'Pausar (que no me vean)' : 'Volver a ser visible'}
              </button>
              <button
                disabled={busy}
                onClick={() => run(() => remove.mutateAsync({ ticketCode }), 'Foto borrada')}
                className="w-full h-11 rounded-full text-sm font-semibold text-red-300 disabled:opacity-40"
              >
                Borrar mi foto
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
