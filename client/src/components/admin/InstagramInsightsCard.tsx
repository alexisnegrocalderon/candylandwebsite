import { useState } from 'react';
import { BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { averagesByType, INSIGHT_TYPE_LABEL, topBy, type PostInsight } from '@shared/instagramInsights';
import { formatChileDateTime } from '@shared/chileDate';

/* "Lo que mejor funcionó": alcance, guardados y compartidos reales de las
 * últimas publicaciones (server/instagramInsights.ts). Gratis, sin IA. */

const fmt = (n: number | null) => (n == null ? '–' : n.toLocaleString('es-CL'));

function PostRow({ p }: { p: PostInsight }) {
  return (
    <a href={p.permalink} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted/60">
      {p.thumbnail
        ? <img src={p.thumbnail} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />
        : <div className="h-14 w-14 shrink-0 rounded-lg bg-muted" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{p.caption || '(sin texto)'}</p>
        <p className="text-xs text-muted-foreground">
          {INSIGHT_TYPE_LABEL[p.type]} · alcance {fmt(p.reach)} · guardados {fmt(p.saved)} · compartidos {fmt(p.shares)} · ❤️ {fmt(p.likes)} · 💬 {fmt(p.comments)}
        </p>
      </div>
    </a>
  );
}

export function InstagramInsightsCard() {
  const [force, setForce] = useState(false);
  const { data, isFetching, refetch } = trpc.profileAudit.insights.useQuery({ force }, { staleTime: 5 * 60 * 1000 });
  const refresh = () => { if (force) void refetch(); else setForce(true); };
  const hasStats = !!data && data.posts.some((p) => p.reach != null);

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Lo que mejor funcionó</CardTitle>
        <Button size="sm" variant="outline" disabled={isFetching} onClick={refresh}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1.5">Actualizar</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data ? <p className="text-sm text-muted-foreground">Cargando estadísticas…</p>
          : data.error ? <p className="text-sm text-destructive">{data.error}</p>
          : data.missingPermission || !hasStats ? (
            <p className="text-sm text-muted-foreground">
              Meta todavía no entrega estadísticas. En developers.facebook.com → agenteplayroom → Permisos y funciones, agrega
              {' '}<strong>instagram_business_manage_insights</strong>, genera el token de nuevo y actualiza <code>IG_ACCESS_TOKEN</code> en Vercel.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Últimas {data.posts.length} publicaciones · actualizado {formatChileDateTime(new Date(data.generatedAt))}. La IA de «Revisar mi perfil» y del Plan de contenido también usa estos números.
              </p>
              <div className="flex flex-wrap gap-2">
                {averagesByType(data.posts).map((a) => (
                  <span key={a.type} className="rounded-full bg-muted px-3 py-1 text-xs">
                    {INSIGHT_TYPE_LABEL[a.type]}: alcance promedio {a.reach.toLocaleString('es-CL')} ({a.count})
                  </span>
                ))}
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Más guardadas y compartidas</p>
                {topBy(data.posts, 'interest').map((p) => <PostRow key={p.id} p={p} />)}
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Más alcance</p>
                {topBy(data.posts, 'reach').map((p) => <PostRow key={p.id} p={p} />)}
              </div>
            </>
          )}
      </CardContent>
    </Card>
  );
}
