import { useEffect, useMemo, useState } from 'react';
import { Pencil, Search } from 'lucide-react';
import { bordeDeFicha, capasDeFicha, colorDe, hieloDeFicha, type DosierFicha, type DosierFichas } from '@shared/dosierFicha';
import { VasoSvg } from './VasoSvg';

const SEEN_KEY = 'dosier-visto-v1';
const readSeen = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } };
const writeSeen = (m: Record<string, string>) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)); } catch { /* sin almacenamiento: solo no se recuerda */ } };

/** El dosier de barra en pantalla: buscador, secciones y una ficha por trago (vaso con capas, ingredientes, pasos y foto).
 * Lo usan la barra (/caja, también sin señal) y el admin (con el botón de editar). `claro` = fondo claro del admin. */
export function DosierVista({ data, claro = false, onEdit, seenScope }: {
  data: DosierFichas;
  claro?: boolean;
  /** Admin: abre la receta del trago. */
  onEdit?: (ficha: DosierFicha) => void;
  /** Para recordar qué fichas ya vio esta persona en este aparato (la barra ve «actualizado» si cambian). */
  seenScope?: string;
}) {
  const [q, setQ] = useState('');
  const [seccion, setSeccion] = useState('todas');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<string, string>>(() => (seenScope ? readSeen() : {}));
  const key = (f: DosierFicha) => `${seenScope}:${f.id}`;

  const secciones = useMemo(() => Array.from(new Set(data.fichas.map((f) => f.section))), [data.fichas]);
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.fichas.filter((f) => (seccion === 'todas' || f.section === seccion)
      && (!t || f.name.toLowerCase().includes(t) || f.lineas.some((l) => l.name.toLowerCase().includes(t))));
  }, [data.fichas, q, seccion]);

  const cambiadas = seenScope ? data.fichas.filter((f) => seen[key(f)] !== undefined && seen[key(f)] !== f.hash) : [];
  // La primera vez que se abre el dosier en este aparato todo cuenta como visto (no es una «actualización»).
  useEffect(() => {
    if (!seenScope) return;
    const cur = readSeen();
    let changed = false;
    for (const f of data.fichas) if (cur[key(f)] === undefined) { cur[key(f)] = f.hash; changed = true; }
    if (changed) { writeSeen(cur); setSeen(cur); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.fichas, seenScope]);

  const abrir = (f: DosierFicha) => {
    setAbierta((a) => (a === String(f.id) ? null : String(f.id)));
    if (seenScope && seen[key(f)] !== f.hash) { const n = { ...readSeen(), [key(f)]: f.hash }; writeSeen(n); setSeen(n); }
  };

  const chip = (on: boolean) => `shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${on ? 'bg-primary text-primary-foreground' : claro ? 'bg-muted text-muted-foreground' : 'bg-white/10 text-white/70'}`;
  const suave = claro ? 'text-muted-foreground' : 'text-white/60';

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${suave}`} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar un trago o un ingrediente…" aria-label="Buscar en el dosier"
          className={`h-11 w-full rounded-2xl border pl-9 pr-3 text-base outline-none focus:ring-2 focus:ring-primary ${claro ? 'border-border bg-background' : 'border-white/15 bg-white/5 text-white placeholder:text-white/40'}`} />
      </div>
      {secciones.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {['todas', ...secciones].map((s) => <button key={s} type="button" onClick={() => setSeccion(s)} className={chip(seccion === s)}>{s === 'todas' ? 'Todos' : s}</button>)}
        </div>
      )}
      {cambiadas.length > 0 && (
        <p className="rounded-2xl bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-300">
          🔔 {cambiadas.length === 1 ? 'Una receta cambió' : `${cambiadas.length} recetas cambiaron`}: {cambiadas.map((f) => f.name).slice(0, 4).join(', ')}{cambiadas.length > 4 ? '…' : ''}. Mira las marcadas «Actualizado».
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {lista.map((f) => {
          const open = abierta === String(f.id);
          const nueva = !!seenScope && seen[key(f)] !== undefined && seen[key(f)] !== f.hash;
          const capas = capasDeFicha(f);
          const total = Math.round(capas.reduce((s, c) => s + c.ml, 0));
          return (
            <li key={f.id} className={`overflow-hidden rounded-3xl bg-white text-slate-900 shadow-sm ${nueva ? 'ring-2 ring-amber-400' : ''}`}>
              <button type="button" onClick={() => abrir(f)} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left">
                <div className="w-20 shrink-0 rounded-2xl bg-slate-50 p-1"><VasoSvg kind={f.glass} capacity={f.glassMl || 500} capas={capas} hielo={hieloDeFicha(f)} borde={bordeDeFicha(f)} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sky-600">{f.section}</p>
                  <p className="text-lg font-extrabold leading-tight">{f.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded-full bg-pink-500 px-2 py-0.5 font-bold text-white">{f.glassLabel} {f.glassMl ? `${f.glassMl} ml` : ''}</span>
                    {total > 0 && f.glass !== 'shot' && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700">{total} ml</span>}
                    {nueva && <span className="rounded-full bg-amber-400 px-2 py-0.5 font-bold text-black">Actualizado</span>}
                  </p>
                  {!open && <p className="mt-1 line-clamp-1 text-xs text-slate-500">{f.lineas.map((l) => l.name).join(' · ')}</p>}
                </div>
              </button>

              {open && (
                <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
                  {f.foto && <img src={f.foto} alt={`Foto de ${f.name}`} loading="lazy" className="h-40 w-full rounded-2xl object-cover" />}
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Ingredientes</p>
                    <ul className="space-y-1">
                      {f.lineas.map((l, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <span className="h-3 w-3 shrink-0 rounded-full border border-slate-300" style={{ background: l.unit === 'ml' ? colorDe(l.name, i) : '#CFC3D6' }} />
                          <span className="min-w-0 flex-1">{l.name}</span>
                          <strong className="shrink-0">{l.texto}</strong>
                        </li>
                      ))}
                      {f.opciones.map((o, i) => (
                        <li key={`o${i}`} className="flex items-center gap-2 text-sm">
                          <span className="h-3 w-3 shrink-0 rounded-full border border-slate-300" style={{ background: colorDe(o.choices[0] ?? o.label, i) }} />
                          <span className="min-w-0 flex-1">{o.label}: {o.choices.join(' / ')}</span>
                          {o.ml > 0 && <strong className="shrink-0">{o.ml} ml</strong>}
                        </li>
                      ))}
                    </ul>
                    {f.extras.length > 0 && <p className="mt-2 flex flex-wrap gap-1.5">{f.extras.map((e) => <span key={e} className="rounded-full bg-pink-100 px-2.5 py-0.5 text-xs font-bold text-pink-600">{e}</span>)}</p>}
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Preparación</p>
                    <ol className="space-y-1.5">
                      {f.pasos.map((p, i) => (
                        <li key={i} className="flex gap-2 text-sm"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">{i + 1}</span><span>{p}</span></li>
                      ))}
                    </ol>
                  </div>
                  {onEdit && (
                    <button type="button" onClick={() => onEdit(f)} className="flex h-10 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white"><Pencil className="h-4 w-4" /> Editar receta</button>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {lista.length === 0 && <li className={`col-span-full text-sm ${suave}`}>Ningún trago con eso.</li>}
      </ul>

      {data.talCual.length > 0 && !q && seccion === 'todas' && (
        <div className={`rounded-2xl p-3 text-sm ${claro ? 'bg-muted/50' : 'bg-white/5 text-white/80'}`}>
          <p className="mb-1 font-semibold">Se sirven tal cual (botella o lata)</p>
          <p className={suave}>{data.talCual.map((t) => t.name).join(' · ')}</p>
        </div>
      )}
    </div>
  );
}
