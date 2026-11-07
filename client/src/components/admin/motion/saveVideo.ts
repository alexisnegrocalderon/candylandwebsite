import { toast } from 'sonner';

/** Baja un MP4 y lo entrega como archivo. En iPhone/iPad abre el menú de compartir con «Guardar video» y «Guardar en
 * Archivos» (un link directo solo reproduce el video en el navegador, sin forma de guardarlo). En computador baja el
 * archivo. Si algo falla, abre el link como antes. */
export async function saveVideoFile(url: string, title: string): Promise<void> {
  const name = `${title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'video'}.mp4`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = new Blob([await res.blob()], { type: 'video/mp4' });
    const file = new File([blob], name, { type: 'video/mp4' });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return; // cerró el menú
        // si el navegador no deja compartir, se baja directo
      }
    }
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    toast.error('No se pudo bajar directo. Se abre el video: toca compartir → Guardar en Archivos.');
    window.open(url, '_blank', 'noreferrer');
  }
}
