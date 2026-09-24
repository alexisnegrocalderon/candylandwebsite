import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, Sparkles } from 'lucide-react';
import { useDemoProps } from '@/lib/demoMode';

/** Igual patrón de subida que ImageUploadField.tsx (upload() de
 * @vercel/blob/client contra /api/admin/blob/upload, sin pasar el archivo
 * por el server), pero pensado para "sacar una foto y que la IA la lea" en
 * vez de "subir una imagen para guardarla":
 * - `capture="environment"` abre directo la cámara trasera en celular (en
 *   desktop, sin cámara, cae solo al selector de archivos de siempre).
 * - Además de subir, dispara `onScanned(url)` para que quien lo use encadene
 *   ahí su propia llamada de análisis (ej. `expenses.scanReceipt`) -- este
 *   componente no sabe nada de boletas/stock/etc, solo sube la foto.
 * - Expone `analyzing` (controlado por quien lo usa) para mostrar el paso
 *   "leyendo la foto…" después de que terminó de subir. */
export function CameraCaptureField({
  label, pathPrefix, onScanned, analyzing, buttonClassName,
}: { label: string; pathPrefix: string; onScanned: (url: string) => void; analyzing?: boolean; buttonClassName?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const demoProps = useDemoProps();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir/sacar la misma foto después de un error
    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const blob = await upload(`${pathPrefix}/${Date.now()}-${safeName}`, file, {
        access: 'public',
        handleUploadUrl: '/api/admin/blob/upload',
      });
      onScanned(blob.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la foto.');
      setPreviewUrl(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localUrl);
    }
  };

  const busy = uploading || !!analyzing;

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy || demoProps.disabled}
        title={demoProps.title}
        onClick={() => inputRef.current?.click()}
        className={buttonClassName}
      >
        {uploading ? (
          <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Subiendo foto…</>
        ) : analyzing ? (
          <><Sparkles className="w-3.5 h-3.5 mr-2 animate-pulse" /> Leyendo con IA…</>
        ) : (
          <><Camera className="w-3.5 h-3.5 mr-2" /> {label}</>
        )}
      </Button>
      {previewUrl && (
        <img src={previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-border/50" />
      )}
    </div>
  );
}
