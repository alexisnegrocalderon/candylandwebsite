import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, ExternalLink, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildAdminUrl } from '@shared/adminDeepLink';
import { ADMIN_SECTION_INDEX } from '@shared/adminSectionsIndex';
import { ADMIN_SHORTCUTS_MAX, DEFAULT_ADMIN_SHORTCUTS, type AdminShortcut } from '@shared/adminShortcuts';

/** Atajos para la app Atajos de iPhone/iPad («Abrir URL») o para guardar como marcador: cada link abre el panel directo en
 * una pantalla (mismo formato `/admin?section=…` de los avisos push). La lista se edita acá: agregar, quitar, renombrar y
 * ordenar, y queda guardada en la cuenta (se ve igual en el iPhone y en el iPad). */

const sectionLabel = (id: string) => ADMIN_SECTION_INDEX.find((s) => s.id === id)?.label ?? id;

export function IphoneShortcutsCard() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.adminAlerts.getShortcuts.useQuery(undefined, { staleTime: 30_000 });
  const [list, setList] = useState<AdminShortcut[]>([]);
  const [dirty, setDirty] = useState(false);
  const [newSection, setNewSection] = useState('');
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => { if (data && !dirty) setList(data.shortcuts); }, [data, dirty]);

  const save = trpc.adminAlerts.saveShortcuts.useMutation({
    onSuccess: () => { setDirty(false); void utils.adminAlerts.getShortcuts.invalidate(); toast.success('Atajos guardados'); },
    onError: (e) => toast.error(e.message),
  });

  const urlFor = (section: string) => `${window.location.origin}${buildAdminUrl({ section })}`;
  const copy = async (section: string) => {
    try { await navigator.clipboard.writeText(urlFor(section)); toast.success('Link copiado'); }
    catch { toast.error('No se pudo copiar. Mantén apretado el link para copiarlo.'); }
  };
  const change = (next: AdminShortcut[]) => { setList(next); setDirty(true); };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    change(next);
  };
  const add = () => {
    if (!newSection) return;
    if (list.length >= ADMIN_SHORTCUTS_MAX) { toast.error(`Máximo ${ADMIN_SHORTCUTS_MAX} atajos.`); return; }
    change([...list, { label: newLabel.trim() || sectionLabel(newSection), section: newSection }]);
    setNewSection(''); setNewLabel('');
  };
  const sections = useMemo(() => [...ADMIN_SECTION_INDEX].sort((a, b) => a.label.localeCompare(b.label, 'es')), []);

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardContent className="space-y-4 pt-6">
        <div>
          <h3 className="font-heading text-lg">📱 Atajos para iPhone y iPad</h3>
          <p className="text-sm text-muted-foreground">
            En la app Atajos crea uno nuevo con la acción «Abrir URL», pega el link y agrégalo a la pantalla de inicio (o dile a Siri que lo abra).
            Cada link lleva directo a esa pantalla del panel. Acá puedes agregar, quitar, renombrar y ordenar tus atajos.
          </p>
        </div>

        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <ul className="space-y-2">
            {list.length === 0 && <li className="text-sm text-muted-foreground">No tienes atajos. Agrega uno abajo.</li>}
            {list.map((s, i) => (
              <li key={`${s.section}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                <div className="min-w-[10rem] flex-1">
                  <Input value={s.label} maxLength={60} aria-label="Nombre del atajo" className="h-10"
                    onChange={(e) => change(list.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                  <p className="mt-1 text-xs text-muted-foreground">Abre: {sectionLabel(s.section)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir" className="admin-search-btn flex h-11 w-11 items-center justify-center rounded-xl disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Bajar" className="admin-search-btn flex h-11 w-11 items-center justify-center rounded-xl disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => copy(s.section)} aria-label={`Copiar el link de ${s.label}`} className="admin-search-btn flex h-11 w-11 items-center justify-center rounded-xl"><Copy className="h-4 w-4" /></button>
                  <a href={urlFor(s.section)} aria-label={`Abrir ${s.label}`} className="admin-search-btn flex h-11 w-11 items-center justify-center rounded-xl"><ExternalLink className="h-4 w-4" /></a>
                  <button type="button" onClick={() => change(list.filter((_, k) => k !== i))} aria-label={`Quitar ${s.label}`} className="admin-search-btn flex h-11 w-11 items-center justify-center rounded-xl text-red-300"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 rounded-xl border border-white/10 p-3">
          <p className="text-sm font-medium">Agregar un atajo</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Select value={newSection} onValueChange={setNewSection}>
              <SelectTrigger className="h-11"><SelectValue placeholder="¿A qué pantalla?" /></SelectTrigger>
              <SelectContent className="max-h-72">{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="h-11" value={newLabel} maxLength={60} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nombre (opcional)" />
            <Button type="button" className="h-11" disabled={!newSection} onClick={add}><Plus className="mr-1 h-4 w-4" /> Agregar</Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate({ shortcuts: list })}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Guardar atajos
          </Button>
          <Button variant="outline" disabled={save.isPending} onClick={() => { change(DEFAULT_ADMIN_SHORTCUTS); }}>
            <RotateCcw className="mr-1.5 h-4 w-4" /> Volver a la lista original
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
