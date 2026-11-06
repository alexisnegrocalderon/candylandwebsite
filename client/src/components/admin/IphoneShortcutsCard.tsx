import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { buildAdminUrl } from '@shared/adminDeepLink';

/** Links que abren el panel directo en una pantalla, para la app Atajos de iPhone/iPad («Abrir URL») o para guardar
 * como marcador. Usan el mismo formato de los avisos push (`/admin?section=…`). */
const SHORTCUTS: { label: string; section: string }[] = [
  { label: 'Cargar gasto', section: 'cargar-gasto' },
  { label: 'Resumen de la noche', section: 'overview' },
  { label: 'Promo Flash', section: 'flash-promo' },
  { label: 'Ventas web', section: 'orders-web' },
  { label: 'Acceso manual (regalar entrada)', section: 'manual-access' },
  { label: 'Mensajes de Instagram', section: 'instagram' },
  { label: 'Nuevo mailing', section: 'mailing' },
  { label: 'Playmatch en vivo', section: 'playmatch-control' },
];

export function IphoneShortcutsCard() {
  const urlFor = (section: string) => `${window.location.origin}${buildAdminUrl({ section })}`;
  const copy = async (section: string) => {
    try { await navigator.clipboard.writeText(urlFor(section)); toast.success('Link copiado'); }
    catch { toast.error('No se pudo copiar. Mantén apretado el link para copiarlo.'); }
  };
  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardContent className="space-y-3 pt-6">
        <div>
          <h3 className="font-heading text-lg">📱 Atajos para iPhone y iPad</h3>
          <p className="text-sm text-muted-foreground">
            En la app Atajos crea uno nuevo con la acción «Abrir URL», pega el link y agrégalo a la pantalla de inicio (o dile a Siri que lo abra).
            Cada link lleva directo a esa pantalla del panel.
          </p>
        </div>
        <ul className="space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.section} className="flex min-h-12 items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
              <span className="flex-1 text-sm font-medium">{s.label}</span>
              <button type="button" onClick={() => copy(s.section)} aria-label={`Copiar el link de ${s.label}`} className="admin-search-btn flex h-11 w-11 items-center justify-center rounded-xl">
                <Copy className="h-4 w-4" />
              </button>
              <a href={urlFor(s.section)} aria-label={`Abrir ${s.label}`} className="admin-search-btn flex h-11 w-11 items-center justify-center rounded-xl">
                <ExternalLink className="h-4 w-4" />
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
