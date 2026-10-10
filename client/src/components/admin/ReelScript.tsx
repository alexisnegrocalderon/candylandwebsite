import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Clapperboard, Copy, Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { beatSheet, formatSecs, scoreHookEs } from '@shared/reelScript';
import { hookFormulaName } from '@shared/reelHooks';

/* Guion de Reel (server/reelScript.ts): 3 ganchos puntuados, la tabla de
 * tiempos con el texto en pantalla, qué grabar y el texto del post. El último
 * guion de cada idea queda guardado en este navegador. */

type Script = { hooks: Array<{ formula: string; say: string; screen: string }>; beats: Array<{ say: string; screen: string }>; shots: string; caption: string };

const STORAGE_PREFIX = 'admin-reel-script-';
const keyFor = (seed: string) => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `${STORAGE_PREFIX}${h}`;
};
function load(seed: string): Script | null {
  try { const raw = window.localStorage.getItem(keyFor(seed)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function save(seed: string, script: Script) {
  try { window.localStorage.setItem(keyFor(seed), JSON.stringify(script)); } catch { /* sin almacenamiento */ }
}
async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copiado`); } catch { toast.error('No se pudo copiar; selecciónalo a mano.'); }
}

function ScriptView({ script }: { script: Script }) {
  const ranked = useMemo(() => script.hooks.map((h, i) => ({ ...h, i, s: scoreHookEs(h.say) })).sort((a, b) => b.s.score - a.s.score), [script]);
  const [chosen, setChosen] = useState(ranked[0]?.i ?? 0);
  useEffect(() => { setChosen(ranked[0]?.i ?? 0); }, [ranked]);
  const hook = script.hooks[chosen] ?? script.hooks[0];
  const sheet = useMemo(() => beatSheet([{ say: hook.say, screen: hook.screen }, ...script.beats]), [hook, script.beats]);
  const fullScript = sheet.beats.map((b) => `${formatSecs(b.start)}  ${b.say}${b.screen ? `\n        [pantalla] ${b.screen}` : ''}`).join('\n');
  const screenTexts = sheet.beats.filter((b) => b.screen).map((b) => `${formatSecs(b.start)}  ${b.screen}`).join('\n');
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Ganchos (toca uno para usarlo). El puntaje ayuda a descartar ganchos flojos; no predice si se va a viralizar.</p>
        {ranked.map((h) => (
          <button
            key={h.i}
            type="button"
            onClick={() => setChosen(h.i)}
            className={`w-full rounded-xl border p-2.5 text-left ${h.i === chosen ? 'border-primary bg-primary/5' : 'border-border'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{h.say}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${h.s.label === 'fuerte' ? 'bg-emerald-500/15 text-emerald-700' : h.s.label === 'ok' ? 'bg-sky-500/15 text-sky-700' : 'bg-amber-500/15 text-amber-700'}`}>{h.s.score} · {h.s.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">{hookFormulaName(h.formula)}{h.screen ? ` · pantalla: ${h.screen}` : ''}</p>
            {h.s.notes.length > 0 && <p className="text-xs text-amber-700">{h.s.notes.join(' ')}</p>}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Tiempo</th><th className="p-2">Se dice</th><th className="p-2">En pantalla</th></tr></thead>
          <tbody>
            {sheet.beats.map((b, i) => (
              <tr key={i} className="border-b last:border-0 align-top">
                <td className="p-2 tabular-nums text-xs text-muted-foreground whitespace-nowrap">{formatSecs(b.start)} · {b.secs}s</td>
                <td className="p-2">{b.say}</td>
                <td className="p-2 text-muted-foreground">{b.screen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Total aprox.: {sheet.total}s (a ritmo de conversación).</p>
      {sheet.warnings.length > 0 && (
        <ul className="space-y-1">
          {sheet.warnings.map((w, i) => <li key={i} className="flex gap-2 text-amber-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}</li>)}
        </ul>
      )}
      {script.shots && <p className="rounded-xl bg-muted/40 p-3"><span className="font-medium">Qué grabar:</span> {script.shots}</p>}
      {script.caption && <p className="whitespace-pre-wrap"><span className="font-medium">Texto del post:</span> {script.caption}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => copy(fullScript, 'Guion')}><Copy className="mr-2 h-4 w-4" /> Copiar guion</Button>
        {screenTexts && <Button variant="outline" size="sm" onClick={() => copy(screenTexts, 'Textos en pantalla')}><Copy className="mr-2 h-4 w-4" /> Copiar textos en pantalla</Button>}
        {script.caption && <Button variant="outline" size="sm" onClick={() => copy(script.caption, 'Texto del post')}><Copy className="mr-2 h-4 w-4" /> Copiar texto del post</Button>}
      </div>
    </div>
  );
}

/** Botón + guion para una pieza tipo reel del Plan de contenido. */
export function ReelScriptForPiece({ seed, eventId }: { seed: string; eventId: number }) {
  const [script, setScript] = useState<Script | null>(() => load(seed));
  const [open, setOpen] = useState(false);
  const write = trpc.contentPlan.reelScript.useMutation({
    onSuccess: (r) => { setScript(r); save(seed, r); setOpen(true); },
    onError: (e) => toast.error(e.message || 'No se pudo escribir el guion.'),
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {script && <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}><Clapperboard className="mr-2 h-4 w-4" /> {open ? 'Ocultar guion' : 'Ver guion'}</Button>}
        <WriteButton variant="outline" size="sm" disabled={write.isPending} onClick={() => write.mutate({ idea: seed, targetEventId: eventId })}>
          {write.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Escribiendo…</> : <><Clapperboard className="mr-2 h-4 w-4" /> {script ? 'Escribir otro guion' : 'Escribir el guion'}</>}
        </WriteButton>
      </div>
      {script && open && <div className="rounded-xl border p-3"><ScriptView script={script} /></div>}
    </div>
  );
}

/** Tarjeta "Guion de reel desde una idea". */
export function ReelScriptCard({ eventId }: { eventId: number | null }) {
  const [idea, setIdea] = useState('');
  const [script, setScript] = useState<Script | null>(null);
  const write = trpc.contentPlan.reelScript.useMutation({
    onSuccess: (r) => { setScript(r); save(idea, r); },
    onError: (e) => toast.error(e.message || 'No se pudo escribir el guion.'),
  });
  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clapperboard className="h-5 w-5" /> Guion de reel desde una idea</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Escribe la idea y te propone 3 ganchos con puntaje, el guion con tiempos y texto en pantalla, qué grabar y el texto del post. Usa los datos del próximo evento y tu tono.</p>
        <Textarea rows={2} maxLength={1200} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Ej: cómo es entrar por primera vez a Playroom" />
        <WriteButton disabled={write.isPending || idea.trim().length < 3} onClick={() => write.mutate({ idea: idea.trim(), targetEventId: eventId ?? undefined })}>
          {write.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Escribiendo (puede tardar unos segundos)…</> : <><Sparkles className="mr-2 h-4 w-4" /> Escribir el guion</>}
        </WriteButton>
        {script && <ScriptView script={script} />}
      </CardContent>
    </Card>
  );
}
