import { useState } from 'react';
import { FileText, Download, Mail, Loader2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Version = 'completa' | 'resumen' | 'externa';

const VERSIONS: { value: Version; label: string; hint: string; compare: boolean }[] = [
  { value: 'completa', label: 'Completa', hint: 'Todo el detalle, para uso interno', compare: true },
  { value: 'resumen', label: 'Resumen ejecutivo', hint: '1–2 páginas con lo clave', compare: true },
  { value: 'externa', label: 'Sin márgenes ni costos', hint: 'Para el local o patrocinadores', compare: false },
];

/** Descarga con fetch (la cookie de admin viaja sola) para poder mostrar "Generando…". */
async function download(url: string, fallbackName: string) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('No se pudo generar el informe');
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Menú "Informe": PDF (3 versiones), CSV y envío por correo.
 *  `ids` con 1 simulación = informe individual; 2 o más = comparación. */
export function BudgetReportActions({ ids, size = 'sm', disabledReason }: { ids: number[]; size?: 'sm' | 'default'; disabledReason?: string }) {
  const compare = ids.length > 1;
  const [busy, setBusy] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const versions = VERSIONS.filter((v) => !compare || v.compare);
  const [version, setVersion] = useState<Version>('completa');
  const [recipients, setRecipients] = useState('');
  const [message, setMessage] = useState('');
  const email = trpc.budgetSimulations.emailReport.useMutation();

  const q = compare ? `ids=${ids.join(',')}` : `id=${ids[0]}`;
  const base = compare ? '/api/admin/simulaciones/comparar' : '/api/admin/simulaciones';

  const run = async (kind: 'pdf' | 'csv', v?: Version) => {
    setBusy(true);
    const t = toast.loading('Generando informe…');
    try {
      const url = kind === 'pdf' ? `${base}${compare ? '' : '/informe'}.pdf?${q}&version=${v}` : `${base}${compare ? '' : '/datos'}.csv?${q}`;
      await download(url, kind === 'pdf' ? 'informe.pdf' : 'simulacion.csv');
      toast.success('Informe listo', { id: t });
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo generar el informe', { id: t });
    } finally {
      setBusy(false);
    }
  };

  const parsed = recipients.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const invalid = parsed.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const canSend = parsed.length > 0 && parsed.length <= 10 && invalid.length === 0 && !email.isPending;

  const send = async () => {
    try {
      const r = await email.mutateAsync({ ids, version, recipients: parsed, message: message.trim() || undefined });
      if (r.emailSent) { toast.success(`Informe enviado a ${r.sentTo} dirección(es)`); setMailOpen(false); setRecipients(''); setMessage(''); }
      else toast.error('No se pudo enviar a todos los destinatarios. Revisa los correos.');
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo enviar el informe');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={size} variant="outline" disabled={busy || !!disabledReason} title={disabledReason}>
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
            Informe
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>{compare ? `Comparación de ${ids.length} simulaciones` : 'Descargar PDF'}</DropdownMenuLabel>
          {versions.map((v) => (
            <DropdownMenuItem key={v.value} onClick={() => run('pdf', v.value)} className="flex-col items-start gap-0">
              <span className="flex items-center gap-2 font-medium"><Download className="h-3.5 w-3.5" />PDF {v.label.toLowerCase()}</span>
              <span className="text-xs text-muted-foreground pl-5">{v.hint}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => run('csv')}><FileSpreadsheet className="h-4 w-4 mr-2" />Descargar CSV (detalle completo)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => { if (!versions.some((v) => v.value === version)) setVersion('completa'); setMailOpen(true); }}>
            <Mail className="h-4 w-4 mr-2" />Enviar por correo…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mailOpen} onOpenChange={setMailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar informe por correo</DialogTitle>
            <DialogDescription>Se adjunta el PDF. Recibirás una copia en contacto@mansionplayroom.cl.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Versión</Label>
              <div className="grid gap-2">
                {versions.map((v) => (
                  <button key={v.value} type="button" onClick={() => setVersion(v.value)}
                    className={`text-left rounded-lg border px-3 py-2 transition ${version === v.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}>
                    <p className="text-sm font-medium">{v.label}</p>
                    <p className="text-xs text-muted-foreground">{v.hint}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-to">Destinatarios</Label>
              <Input id="rep-to" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="correo@ejemplo.cl, otro@ejemplo.cl" inputMode="email" />
              {invalid.length > 0 && <p className="text-xs text-destructive">Revisa: {invalid.join(', ')}</p>}
              {parsed.length > 10 && <p className="text-xs text-destructive">Máximo 10 destinatarios.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-msg">Mensaje (opcional)</Label>
              <Textarea id="rep-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} placeholder="Te comparto la proyección del evento…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMailOpen(false)}>Cancelar</Button>
            <Button onClick={send} disabled={!canSend}>
              {email.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Enviando…</> : <><Mail className="h-4 w-4 mr-1.5" />Enviar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
