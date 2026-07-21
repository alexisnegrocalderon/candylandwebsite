import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Loader2, Sparkles, Plus, X, Send, RotateCcw, AlertTriangle } from 'lucide-react';

/** Cuánto trocea el cliente la selección antes de mandarla al server -- cada
 * request de mailing.sendBatch procesa este número de emails secuencialmente
 * con throttle, así que hay que dejar margen bajo el maxDuration:30 de la
 * función serverless de Vercel. El server igual acepta hasta MAILING_BATCH_MAX
 * (50) por si se llama desde otro lado, pero acá usamos menos con margen. */
const CLIENT_BATCH_SIZE = 25;

/** Límite diario del plan free de Resend -- solo informativo, no bloquea el
 * envío (no hay forma de consultar la cuota real usada desde acá). */
const RESEND_FREE_DAILY_LIMIT = 100;

type MailingContent = {
  subject: string;
  preheader?: string;
  headline: string;
  paragraphs: string[];
  ctaText?: string;
  highlightLabel?: string;
  highlightValue?: string;
};

type SendResult = { customerId: number; email: string; success: boolean; reason?: string };

type Step = 'objective' | 'generating' | 'review' | 'sending' | 'done';

/** Flujo completo de composición y envío de una campaña -- embebido directo
 * en la sección "Mailing" del admin (ya no es un Dialog: pasó a ser su
 * propia página, pedido explícito del usuario). `campaignTag` se usa para
 * marcar automáticamente a cada destinatario exitoso al terminar de enviar,
 * así se puede armar "los que faltan" al día siguiente con excludeTag. */
export function MailingComposer({
  audience,
  ctaUrl,
  campaignTag,
  onDone,
}: {
  audience: { ids: number[]; count: number; description: string };
  ctaUrl: string;
  campaignTag: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>('objective');
  const [objective, setObjective] = useState('');
  const [content, setContent] = useState<MailingContent | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [progress, setProgress] = useState({ sent: 0, total: 0 });
  const [results, setResults] = useState<SendResult[]>([]);

  const generateTemplate = trpc.mailing.generateTemplate.useMutation();
  const renderPreview = trpc.mailing.renderPreview.useMutation();
  const sendBatch = trpc.mailing.sendBatch.useMutation();

  const resetComposer = () => {
    setStep('objective');
    setObjective('');
    setContent(null);
    setPreviewHtml(null);
    setProgress({ sent: 0, total: 0 });
    setResults([]);
  };

  const handleGenerate = async () => {
    if (objective.trim().length < 5) {
      toast.error('Contanos un poco más sobre el objetivo del mail.');
      return;
    }
    setStep('generating');
    try {
      const generated = await generateTemplate.mutateAsync({ objective: objective.trim(), audienceDescription: audience.description });
      setContent(generated);
      setStep('review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar la plantilla.');
      setStep('objective');
    }
  };

  const handlePreview = async () => {
    if (!content) return;
    try {
      const { html } = await renderPreview.mutateAsync({ content, ctaUrl });
      setPreviewHtml(html);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar la vista previa.');
    }
  };

  const runSend = async (ids: number[]) => {
    if (!content || ids.length === 0) return;
    const batches: number[][] = [];
    for (let i = 0; i < ids.length; i += CLIENT_BATCH_SIZE) batches.push(ids.slice(i, i + CLIENT_BATCH_SIZE));

    setStep('sending');
    setProgress({ sent: 0, total: ids.length });
    const newResults: SendResult[] = [];

    for (const batch of batches) {
      try {
        const { results: batchResults } = await sendBatch.mutateAsync({ customerIds: batch, content, ctaUrl, campaignTag: campaignTag || undefined });
        newResults.push(...batchResults);
      } catch (err) {
        // Todo el lote falló (ej. error de red) -- se marca cada id como fallido y se sigue con el resto.
        newResults.push(...batch.map((id) => ({ customerId: id, email: '', success: false, reason: err instanceof Error ? err.message : 'Error de red' })));
      }
      setProgress((prev) => ({ ...prev, sent: prev.sent + batch.length }));
    }

    setResults((prev) => {
      const byId = new Map(prev.filter((r) => !ids.includes(r.customerId)).map((r) => [r.customerId, r]));
      for (const r of newResults) byId.set(r.customerId, r);
      return Array.from(byId.values());
    });
    setStep('done');
  };

  const failed = results.filter((r) => !r.success);
  const succeeded = results.filter((r) => r.success);

  const updateParagraph = (index: number, value: string) => {
    if (!content) return;
    const paragraphs = [...content.paragraphs];
    paragraphs[index] = value;
    setContent({ ...content, paragraphs });
  };

  const canSend = !!content && content.subject.trim().length >= 4 && content.headline.trim().length >= 4 && content.paragraphs.some((p) => p.trim().length > 0) && campaignTag.trim().length > 0 && audience.count > 0;

  return (
    <div className="space-y-4">
      {(step === 'objective' || step === 'generating') && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>¿Cuál es el objetivo de este mail?</Label>
            <Textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Ej: avisar que faltan 41 entradas para la Misión 300 y que hoy sorteamos $50.000 en consumos si se completa antes de medianoche."
              className="min-h-28"
              disabled={step === 'generating'}
            />
            <p className="text-xs text-muted-foreground">Contá qué querés lograr, en tus palabras -- la IA arma el asunto y el cuerpo del mail con el estilo de marca del sitio.</p>
          </div>
          <Button onClick={handleGenerate} disabled={step === 'generating'} className="w-full interactive">
            {step === 'generating' ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando…</> : <><Sparkles className="w-4 h-4 mr-2" /> Generar con IA</>}
          </Button>
        </div>
      )}

      {step === 'review' && content && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Asunto</Label>
            <Input value={content.subject} onChange={(e) => setContent({ ...content, subject: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Preheader (preview en la bandeja de entrada, opcional)</Label>
            <Input value={content.preheader ?? ''} onChange={(e) => setContent({ ...content, preheader: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Título dentro del mail</Label>
            <Input value={content.headline} onChange={(e) => setContent({ ...content, headline: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Párrafos</Label>
            {content.paragraphs.map((p, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Textarea value={p} onChange={(e) => updateParagraph(i, e.target.value)} className="min-h-16" />
                <Button
                  type="button" variant="outline" size="sm" className="mt-1 shrink-0"
                  disabled={content.paragraphs.length <= 1}
                  onClick={() => setContent({ ...content, paragraphs: content.paragraphs.filter((_, idx) => idx !== i) })}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
            <Button
              type="button" variant="outline" size="sm"
              disabled={content.paragraphs.length >= 4}
              onClick={() => setContent({ ...content, paragraphs: [...content.paragraphs, ''] })}
            >
              <Plus className="w-3 h-3 mr-1" /> Agregar párrafo
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Texto del botón</Label>
            <Input value={content.ctaText ?? ''} onChange={(e) => setContent({ ...content, ctaText: e.target.value })} placeholder="Comprar mi entrada" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Dato destacado -- etiqueta (opcional)</Label>
              <Input value={content.highlightLabel ?? ''} onChange={(e) => setContent({ ...content, highlightLabel: e.target.value })} placeholder="Solo por hoy" />
            </div>
            <div className="space-y-2">
              <Label>Dato destacado -- valor (opcional)</Label>
              <Input value={content.highlightValue ?? ''} onChange={(e) => setContent({ ...content, highlightValue: e.target.value })} placeholder="41 entradas" />
            </div>
          </div>

          {!campaignTag.trim() && (
            <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Falta ponerle un nombre a esta campaña arriba antes de poder enviar.</p>
          )}
          {audience.count === 0 && (
            <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> No hay ningún cliente seleccionado todavía.</p>
          )}
          {audience.count > RESEND_FREE_DAILY_LIMIT && (
            <p className="text-xs text-amber-600 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Resend free permite ~{RESEND_FREE_DAILY_LIMIT} emails/día y estás por mandar a {audience.count}. Si se corta a mitad de camino, lo ya enviado queda tageado con "{campaignTag || '(sin nombre)'}" -- mañana podés retomar excluyendo esa etiqueta.
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handlePreview} disabled={renderPreview.isPending}>
              {renderPreview.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Vista previa
            </Button>
            <Button type="button" variant="outline" onClick={() => setStep('objective')}>Volver a escribir objetivo</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" disabled={!canSend} className="ml-auto interactive">
                  <Send className="w-4 h-4 mr-2" /> Enviar a {audience.count} cliente{audience.count !== 1 ? 's' : ''}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Enviar esta campaña?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se va a mandar a {audience.count} cliente{audience.count !== 1 ? 's' : ''} ({audience.description}), y quedan tageados como "{campaignTag}". Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => runSend(audience.ids)}>Sí, enviar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {previewHtml && (
            <div className="space-y-2">
              <Label>Vista previa</Label>
              <iframe srcDoc={previewHtml} className="w-full h-96 border rounded-xl bg-white" title="Vista previa del mail" />
            </div>
          )}
        </div>
      )}

      {step === 'sending' && (
        <div className="space-y-4 py-6 text-center">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Enviando… {progress.sent}/{progress.total}</p>
          <div className="w-full h-2 bg-secondary/20 rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.sent / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <p className="text-sm">
            <span className="font-semibold text-primary">{succeeded.length} enviado{succeeded.length !== 1 ? 's' : ''}</span>
            {failed.length > 0 && <span className="text-destructive"> · {failed.length} fallido{failed.length !== 1 ? 's' : ''}</span>}
          </p>
          {failed.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 divide-y">
              {failed.map((r) => (
                <div key={r.customerId} className="px-3 py-2 text-xs flex justify-between gap-2">
                  <span>{r.email || `Cliente #${r.customerId}`}</span>
                  <span className="text-destructive text-right">{r.reason || 'Error desconocido'}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            {failed.length > 0 && (
              <Button type="button" variant="outline" onClick={() => runSend(failed.map((r) => r.customerId))}>
                <RotateCcw className="w-4 h-4 mr-2" /> Reintentar fallidos
              </Button>
            )}
            <Button
              type="button" className="ml-auto"
              onClick={() => { toast.success(`Campaña enviada: ${succeeded.length}/${results.length}`); resetComposer(); onDone(); }}
            >
              Nueva campaña
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
