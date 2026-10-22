import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Loader2, Upload } from 'lucide-react';
import { useDemoProps } from '@/lib/demoMode';

/** Subida directa a Vercel Blob (pedido explícito del dueño, 02-03/09), sin
 * pasar el archivo por nuestra función serverless -- el navegador sube
 * directo al storage vía `upload()`, que primero pide un token autorizado a
 * `/api/admin/blob/upload` (server/blobUpload.ts, gateado por
 * `requireAdmin`). Al terminar, llama `onChange(url)` con la URL final --
 * el mismo campo `imageUrl`/`ogImageUrl` que ya existía como `<Input>` de
 * texto plano, así el flujo de "Guardar" no cambia en nada.
 *
 * Se coloca ARRIBA del `<Input>` manual existente, no lo reemplaza: pegar
 * una URL de otro lado sigue funcionando para quien ya tenga la imagen
 * alojada en otro sitio. */
export function ImageUploadField({
  value, onChange, pathPrefix, uploadUrl = '/api/admin/blob/upload', accept = 'image/*', label = 'Subir imagen', hint = 'o pegá una URL manualmente abajo',
}: {
  value: string; onChange: (url: string) => void; pathPrefix: string;
  /** El panel del socio de una co-producción sube por su propia ruta. */
  uploadUrl?: string;
  /** Los fondos del Estudio aceptan también video («image/*,video/mp4»). */
  accept?: string;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const demoProps = useDemoProps();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo después de un error
    if (!file) return;

    // Preview local instantáneo mientras sube -- se ve algo de inmediato en
    // vez de un spinner en blanco.
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const blob = await upload(`${pathPrefix}/${Date.now()}-${safeName}`, file, {
        access: 'public',
        handleUploadUrl: uploadUrl,
      });
      onChange(blob.url);
      toast.success(file.type.startsWith('video/') ? 'Video subido' : 'Imagen subida');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localUrl);
      setPreviewUrl(null);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <input ref={inputRef} type="file" accept={accept} onChange={handleFileChange} className="hidden" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading || demoProps.disabled}
        title={demoProps.title}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Subiendo…</> : <><Upload className="w-3.5 h-3.5 mr-2" /> {label}</>}
      </Button>
      {(previewUrl || value) && (/\.(mp4|webm|mov)(\?|#|$)/i.test(value) && !previewUrl
        ? <video src={`${value}#t=0.5`} muted playsInline preload="metadata" className="w-10 h-10 rounded-lg object-cover border border-border/50" />
        : <img src={previewUrl ?? value} alt="" className="w-10 h-10 rounded-lg object-cover border border-border/50" />
      )}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
