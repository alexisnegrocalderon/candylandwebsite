import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Copy, Link2, Plus, QrCode, X, BarChart3 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { igMeLink } from '@shared/igReferral';
import { LINK_KIT_CHANNELS, normalizeLinkCode } from '@shared/igFunnel';
import { CANDYLAND_INSTAGRAM_HANDLE } from '@shared/instagramShowcaseConfig';

/* Kit de links por canal (cada uno abre un chat con su código de origen) y
 * el embudo por origen: chats → clics en los botones → compras. */

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(() => toast.success('Link copiado'), () => toast.error('No se pudo copiar'));
}

async function downloadQr(link: string, code: string) {
  try {
    const dataUrl = await QRCode.toDataURL(link, { width: 1024, margin: 2 });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-playroom-${code}.png`;
    a.click();
  } catch {
    toast.error('No se pudo crear el QR');
  }
}

function LinkRow({ code, label, hint, onRemove }: { code: string; label: string; hint?: string; onRemove?: () => void }) {
  const link = igMeLink(CANDYLAND_INSTAGRAM_HANDLE, code);
  return (
    <div className="rounded-2xl border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm">{label}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {onRemove && (
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Quitar" onClick={onRemove}><X className="h-4 w-4" /></Button>
        )}
      </div>
      <p className="break-all text-xs text-muted-foreground">{link}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => copy(link)}><Copy className="mr-1.5 h-4 w-4" /> Copiar</Button>
        <Button size="sm" variant="outline" onClick={() => void downloadQr(link, code)}><QrCode className="mr-1.5 h-4 w-4" /> QR</Button>
      </div>
    </div>
  );
}

function FunnelCard() {
  const [days, setDays] = useState(7);
  const { data, isLoading } = trpc.instagram.funnel.useQuery({ days });
  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-5 w-5" /> Embudo por origen</CardTitle>
        <div className="flex gap-1">
          {[7, 30].map((d) => (
            <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)}>{d} días</Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p>
          : !data || data.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay chats, clics ni compras con origen en este período. Comparte los links de abajo para empezar a medir.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Origen</th>
                    <th className="py-1 px-2 text-right font-medium">Chats</th>
                    <th className="py-1 px-2 text-right font-medium">Clics</th>
                    <th className="py-1 px-2 text-right font-medium">Compras</th>
                    <th className="py-1 pl-2 text-right font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.origin} className="border-t">
                      <td className="py-1.5 pr-2">{r.label}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{r.chats}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{r.clicks}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{r.orders}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{clp(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <p className="mt-3 text-xs text-muted-foreground">
          Chats: quienes escribieron desde un link o anuncio, o recibieron un DM desde un comentario. Clics: toques en los botones que manda Instagram. Compras: pagadas que entraron por esos botones.
        </p>
      </CardContent>
    </Card>
  );
}

export function InstagramLinkKit() {
  const utils = trpc.useUtils();
  const { data: config } = trpc.instagram.getConfig.useQuery();
  const [codes, setCodes] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  useEffect(() => { if (config) setCodes(config.customLinkCodes); }, [config]);
  const save = trpc.instagram.setLinkCodes.useMutation({
    onSuccess: (r) => { setCodes(r.codes); void utils.instagram.getConfig.invalidate(); },
    onError: (e) => toast.error(e.message || 'No se pudo guardar'),
  });
  const add = () => {
    const code = normalizeLinkCode(draft);
    if (!code) return;
    if (codes.includes(code) || LINK_KIT_CHANNELS.some((c) => c.code === code)) { toast.info('Ese código ya existe'); return; }
    save.mutate({ codes: [...codes, code] });
    setDraft('');
  };

  return (
    <div className="space-y-6">
      <FunnelCard />
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-5 w-5" /> Kit de links</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Cada link abre un chat contigo y deja marcado de dónde llegó la persona. Úsalos en cada canal para saber qué funciona.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {LINK_KIT_CHANNELS.map((c) => <LinkRow key={c.code} code={c.code} label={c.label} hint={c.hint} />)}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Tus campañas</p>
            <div className="flex gap-2">
              <Input value={draft} maxLength={40} placeholder="ej: halloween, sorteo-octubre" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
              <Button onClick={add} disabled={!normalizeLinkCode(draft) || save.isPending}><Plus className="mr-1 h-4 w-4" /> Crear</Button>
            </div>
            {codes.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {codes.map((code) => (
                  <LinkRow key={code} code={code} label={code} onRemove={() => save.mutate({ codes: codes.filter((c) => c !== code) })} />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
