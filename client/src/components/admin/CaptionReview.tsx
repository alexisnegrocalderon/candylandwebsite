import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, AlertTriangle, Copy, ScanText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { humanizeEs, lintCaption } from '@shared/captionCheck';

/* Revisión de un texto de Instagram (shared/captionCheck.ts): lo que se ve en
 * el feed antes del "más", hashtags, gancho, cuántas cosas pide y muletillas
 * de IA. Se usa en cada pieza del Plan de contenido y suelta en "Revisar un
 * texto". */

export function CaptionReviewBox({ caption, hashtags = [] }: { caption: string; hashtags?: string[] }) {
  const { preview, checks } = useMemo(() => lintCaption(caption, hashtags), [caption, hashtags]);
  const warnings = checks.filter((c) => c.status === 'warn').length;
  return (
    <div className="space-y-2 rounded-xl border p-3 text-sm">
      <p className="text-xs font-medium text-muted-foreground">Lo que se ve en el feed antes del "más"</p>
      <div className="rounded-lg bg-muted/40 p-2.5 whitespace-pre-wrap break-words">
        {preview.visible}{preview.truncated && <span className="text-muted-foreground">… más</span>}
      </div>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.id} className="flex gap-2">
            {c.status === 'ok'
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
            <span><span className="font-medium">{c.label}:</span> <span className="text-muted-foreground">{c.detail}</span></span>
          </li>
        ))}
      </ul>
      {warnings === 0 && <p className="text-xs text-emerald-700">Todo en orden.</p>}
    </div>
  );
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Texto limpio copiado');
  } catch {
    toast.error('No se pudo copiar; selecciónalo a mano.');
  }
}

/** Tarjeta "Revisar un texto": pegas cualquier texto y ves la revisión y la versión limpia. */
export function CaptionReviewCard() {
  const [text, setText] = useState('');
  const cleaned = useMemo(() => humanizeEs(text).cleaned, [text]);
  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><ScanText className="h-5 w-5" /> Revisar un texto</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Pega el texto de un post, historia o correo. Te muestra lo que se ve antes del "más", revisa hashtags y gancho, y marca lo que suena a IA.
          Las rayas largas y los caracteres invisibles se limpian solos en la versión para copiar.
        </p>
        <Textarea rows={5} maxLength={3000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pega aquí tu texto…" />
        {text.trim() && (
          <>
            <CaptionReviewBox caption={text} />
            <Button variant="outline" size="sm" onClick={() => copy(cleaned)}><Copy className="mr-2 h-4 w-4" /> Copiar versión limpia</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
