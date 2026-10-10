import { useState } from 'react';
import { toast } from 'sonner';
import { UserCheck, Loader2, Download, Copy, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { formatChileDateTime } from '@shared/chileDate';
import { PROFILE_RUBRIC_MAX, type AuditItemScore, type AuditLevel } from '@shared/profileRubric';

/* "Revisar mi perfil" de Instagram (server/profileAudit.ts): puntaje de 100 con
 * la rúbrica de Playroom, 3 bios nuevas y arreglos en orden de impacto. No
 * cambia nada en Instagram. El último resultado queda en este navegador para
 * comparar antes y después. */

const STORAGE_KEY = 'admin-profile-audit';
const DEFAULT_HIGHLIGHTS = 'Cómo funciona, Accesos y precios, Reglas y consentimiento, Preguntas, Fiestas pasadas';

type Audit = {
  generatedAt: string; items: AuditItemScore[]; total: number; level: AuditLevel; summary: string; bios: string[]; fixes: string[];
};

function loadSaved(): { form?: Record<string, string>; audit?: Audit; previous?: { total: number; generatedAt: string } } {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}
function saveAll(data: unknown) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* sin almacenamiento */ }
}

const LEVEL_STYLE: Record<AuditLevel, string> = {
  excelente: 'bg-emerald-500/15 text-emerald-700',
  bueno: 'bg-sky-500/15 text-sky-700',
  'a mejorar': 'bg-amber-500/15 text-amber-700',
  urgente: 'bg-red-500/15 text-red-700',
};

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast.success('Copiado'); } catch { toast.error('No se pudo copiar; selecciónalo a mano.'); }
}

export function ProfileAuditView() {
  const saved = loadSaved();
  const [form, setForm] = useState({
    username: saved.form?.username ?? 'mansionplayroom.cl',
    name: saved.form?.name ?? '',
    bio: saved.form?.bio ?? '',
    link: saved.form?.link ?? '',
    followers: saved.form?.followers ?? '',
    posts: saved.form?.posts ?? '',
    highlights: saved.form?.highlights ?? DEFAULT_HIGHLIGHTS,
  });
  const [screenshot, setScreenshot] = useState('');
  const [audit, setAudit] = useState<Audit | null>(saved.audit ?? null);
  const [previous, setPrevious] = useState(saved.previous ?? null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const fetchProfile = trpc.profileAudit.fetchProfile.useMutation({
    onSuccess: (p) => {
      setForm((f) => ({
        ...f,
        username: p.username ?? f.username,
        name: p.name ?? f.name,
        bio: p.bio ?? f.bio,
        link: p.link ?? f.link,
        followers: p.followers != null ? String(p.followers) : f.followers,
        posts: p.posts != null ? String(p.posts) : f.posts,
      }));
      toast.success(p.missing.length > 0 ? `Traído. Meta no entregó: ${p.missing.join(', ')}; complétalo a mano.` : 'Perfil traído desde Instagram.');
    },
    onError: (e) => toast.error(e.message || 'No se pudo traer el perfil.'),
  });
  const run = trpc.profileAudit.run.useMutation({
    onSuccess: (r) => {
      const prev = audit ? { total: audit.total, generatedAt: audit.generatedAt } : previous;
      setAudit(r);
      setPrevious(prev ?? null);
      saveAll({ form, audit: r, previous: prev ?? undefined });
    },
    onError: (e) => toast.error(e.message || 'No se pudo revisar el perfil.'),
  });

  const submit = () => {
    saveAll({ form, audit: audit ?? undefined, previous: previous ?? undefined });
    run.mutate({
      username: form.username.trim(),
      name: form.name.trim(),
      bio: form.bio.trim(),
      link: form.link.trim(),
      followers: form.followers.trim() ? Math.max(0, Math.round(Number(form.followers))) || undefined : undefined,
      posts: form.posts.trim() ? Math.max(0, Math.round(Number(form.posts))) || undefined : undefined,
      highlights: form.highlights.split(',').map((h) => h.trim()).filter(Boolean).slice(0, 20),
      screenshotUrl: screenshot || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl flex items-center gap-2"><UserCheck className="w-6 h-6" /> Revisar mi perfil</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Puntaje de {PROFILE_RUBRIC_MAX} para el perfil de Instagram de Playroom: nombre, bio, link, reglas visibles, destacadas y más. Te dice qué arreglar primero y propone 3 bios nuevas.
          No cambia nada en Instagram: tú copias lo que te sirva.
        </p>
      </div>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle className="text-base">Tu perfil hoy</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <WriteButton variant="outline" size="sm" disabled={fetchProfile.isPending} onClick={() => fetchProfile.mutate()}>
            {fetchProfile.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Trayendo…</> : <><Download className="mr-2 h-4 w-4" /> Traer mi perfil de Instagram</>}
          </WriteButton>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Usuario</Label><Input value={form.username} onChange={(e) => set('username')(e.target.value)} className="mt-1" /></div>
            <div><Label>Nombre del perfil</Label><Input value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Mansion Playroom · Fiesta liberal" className="mt-1" /></div>
            <div><Label>Seguidores (opcional)</Label><Input inputMode="numeric" value={form.followers} onChange={(e) => set('followers')(e.target.value)} className="mt-1" /></div>
            <div><Label>Publicaciones (opcional)</Label><Input inputMode="numeric" value={form.posts} onChange={(e) => set('posts')(e.target.value)} className="mt-1" /></div>
          </div>
          <div><Label>Bio</Label><Textarea rows={4} maxLength={400} value={form.bio} onChange={(e) => set('bio')(e.target.value)} placeholder="Pega aquí tu bio actual" className="mt-1" /></div>
          <div><Label>Link de la bio</Label><Input value={form.link} onChange={(e) => set('link')(e.target.value)} placeholder="https://…" className="mt-1" /></div>
          <div><Label>Historias destacadas (separadas por coma)</Label><Input value={form.highlights} onChange={(e) => set('highlights')(e.target.value)} className="mt-1" /></div>
          <div className="space-y-1.5">
            <Label>Captura de tu perfil (opcional)</Label>
            <p className="text-xs text-muted-foreground">Con una captura la IA también ve la foto, los fijados y la grilla; sin ella solo revisa lo que escribiste arriba.</p>
            <ImageUploadField value={screenshot} onChange={setScreenshot} pathPrefix="profile-audit" />
            {screenshot && <p className="text-xs text-emerald-700">Captura subida.</p>}
          </div>
          <WriteButton onClick={submit} disabled={run.isPending || (!form.bio.trim() && !screenshot)}>
            {run.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Revisando (unos segundos)…</> : <><Sparkles className="mr-2 h-4 w-4" /> {audit ? 'Revisar de nuevo' : 'Revisar mi perfil'}</>}
          </WriteButton>
        </CardContent>
      </Card>

      {audit && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3 text-base">
              <span className="text-3xl font-bold tabular-nums">{audit.total}<span className="text-base font-normal text-muted-foreground"> / {PROFILE_RUBRIC_MAX}</span></span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEVEL_STYLE[audit.level]}`}>{audit.level}</span>
              {previous && (
                <span className="text-xs font-normal text-muted-foreground">
                  Antes: {previous.total} ({formatChileDateTime(previous.generatedAt)}) · {audit.total - previous.total >= 0 ? '+' : ''}{audit.total - previous.total}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {audit.summary && <p>{audit.summary}</p>}
            {audit.fixes.length > 0 && (
              <div>
                <p className="mb-1 font-medium">Qué arreglar, en orden</p>
                <ol className="list-decimal space-y-1 pl-5">{audit.fixes.map((f, i) => <li key={i}>{f}</li>)}</ol>
              </div>
            )}
            {audit.bios.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium">Bios alternativas</p>
                {audit.bios.map((b, i) => (
                  <div key={i} className="rounded-xl border p-3">
                    <p className="whitespace-pre-wrap">{b}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={() => copy(b)}><Copy className="mr-2 h-4 w-4" /> Copiar</Button>
                      <span className="text-xs text-muted-foreground">{Array.from(b).length} caracteres</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div>
              <p className="mb-1 font-medium">Detalle por criterio</p>
              <ul className="space-y-1.5">
                {audit.items.map((i) => (
                  <li key={i.id} className="flex gap-3">
                    <span className="w-14 shrink-0 text-right font-semibold tabular-nums">{i.score}/{i.max}</span>
                    <span><span className="font-medium">{i.label}.</span> <span className="text-muted-foreground">{i.note}</span></span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">Revisado el {formatChileDateTime(audit.generatedAt)} · queda guardado en este navegador.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
