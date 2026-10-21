import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PushComposer, draftFromCampaign, emptyDraft, type ComposerDraft } from './PushComposer';
import { PushHistory } from './PushHistory';
import { PushAutoSettings } from './PushAutoSettings';
import { AppInstallsView } from './AppInstallsView';

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="admin-clay rounded-2xl px-4 py-3">
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Admin → Mensajes → Notificaciones push: avisos al teléfono de los clientes
 * que instalaron el sitio o activaron avisos (server/customerPush.ts). */
export function CustomerPushView() {
  const { data: stats } = trpc.customerPush.stats.useQuery();
  const [tab, setTab] = useState('enviar');
  const [draft, setDraft] = useState<ComposerDraft>(emptyDraft);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-heading text-2xl"><BellRing className="h-6 w-6 text-primary" /> Notificaciones push</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Avisos directo al teléfono de quienes activaron las notificaciones del sitio (desde su entrada, después de pagar, la home, concursos o Mis puntos). En iPhone solo llegan si agregaron el sitio a su inicio. Máximo un aviso de promoción al día por persona y nunca entre las 23:00 y las 09:00.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value={stats?.active ?? '—'} label="dispositivos con avisos" />
        <Stat value={stats ? `${stats.ios} / ${stats.android} / ${stats.desktop}` : '—'} label="iPhone / Android / PC" />
        <Stat value={stats?.linked ?? '—'} label="ligados a una compra" />
        <Stat value={stats ? `+${stats.last7d}` : '—'} label="nuevos esta semana" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="enviar">{draft.id ? 'Editar' : 'Enviar'}</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
          <TabsTrigger value="auto">Automáticos</TabsTrigger>
          <TabsTrigger value="app">Quién tiene la app</TabsTrigger>
        </TabsList>
        <TabsContent value="enviar" className="pt-3">
          <PushComposer initial={draft} onDone={() => { setDraft(emptyDraft()); setTab('historial'); }} />
        </TabsContent>
        <TabsContent value="historial" className="pt-3">
          <PushHistory onEdit={(c) => { setDraft(draftFromCampaign(c)); setTab('enviar'); }} />
        </TabsContent>
        <TabsContent value="auto" className="pt-3">
          <PushAutoSettings />
        </TabsContent>
        <TabsContent value="app" className="pt-3">
          <AppInstallsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
