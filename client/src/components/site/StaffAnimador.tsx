import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Check, ChevronLeft, ChevronRight, Clock, Loader2, Shield, Shuffle, Timer, Users, WifiOff } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import {
  CATEGORIAS, CATEGORIA_LABEL, INTENSIDAD_LABEL, INTENSIDADES,
  type Categoria, type Dinamica, type Intensidad, type PautaAnimador,
} from '@shared/animadorPauta';

/* La pantalla de los animadores (cargo «Animador / MC» en el Staff): el guion de la noche por bloques, el mazo de
 * dinámicas una a una, y la coordinación con el creador de contenido (micrófonos y gimbal DJI). El contenido viene de
 * `member.animadorPauta` y se guarda en el teléfono: si el wifi del local se cae, la pauta sigue ahí. */

type Pauta = PautaAnimador & { animadorName: string };

const CACHE_KEY = 'animador.pauta.v1';
const CHECK_KEY = 'animador.checks.v1';

function readJson<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function writeJson(key: string, value: unknown) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento: no pasa nada */ }
}

/** Trae la pauta; si no hay red, usa la última copia guardada. `null` = no es animador. */
export function useStaffAnimador(): Pauta | null {
  const { data, isError } = trpc.member.animadorPauta.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const cached = useMemo(() => readJson<Pauta>(CACHE_KEY), []);
  useEffect(() => {
    if (data) writeJson(CACHE_KEY, data);
    else if (data === null) writeJson(CACHE_KEY, null);
  }, [data]);
  if (data) return data;
  if (data === null) return null;
  // Todavía cargando o sin red: la copia guardada (solo existe si alguna vez tuvo el cargo).
  return isError || data === undefined ? cached : null;
}

const INTENSIDAD_TONE: Record<Intensidad, string> = {
  coqueto: 'bg-sky-400/20 text-sky-200',
  picante: 'bg-pink-400/20 text-pink-200',
  atrevido: 'bg-red-500/25 text-red-200',
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`shrink-0 rounded-full px-3.5 py-2 text-footnote font-semibold interactive ${active ? 'bg-white text-black' : 'bg-white/10 text-white/80'}`}>
      {children}
    </button>
  );
}

function Block({ title, children, tone }: { title: string; children: React.ReactNode; tone?: string }) {
  return (
    <div className={`rounded-2xl p-3.5 ${tone ?? 'bg-white/[0.06]'}`}>
      <p className="mb-1 text-caption2 font-semibold uppercase tracking-wider text-white/55">{title}</p>
      <div className="text-subhead leading-snug text-white/90">{children}</div>
    </div>
  );
}

function Limites({ pauta }: { pauta: Pauta }) {
  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3">
      <p className="mb-1 flex items-center gap-1.5 text-footnote font-bold text-amber-200"><Shield className="h-4 w-4" /> Reglas de la noche</p>
      <ul className="space-y-0.5 text-footnote text-white/80">
        {pauta.consentimiento.limites.map((l) => <li key={l}>• {l}</li>)}
      </ul>
    </div>
  );
}

function Temporizador({ segundos }: { segundos: number }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (left === null || left <= 0) return;
    const t = window.setTimeout(() => setLeft((v) => (v === null ? null : v - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  // Al cambiar de tarjeta se reinicia solo (el padre usa key).
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return (
    <button type="button" onClick={() => setLeft(left === null || left <= 0 ? segundos : null)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-callout font-bold interactive">
      <Timer className="h-5 w-5" />
      {left === null ? `Iniciar ${fmt(segundos)}` : left > 0 ? fmt(left) : '¡Tiempo!'}
    </button>
  );
}

function Tarjeta({ d, pauta }: { d: Dinamica; pauta: Pauta }) {
  const [dijo, setDijo] = useState(false);
  return (
    <div className="space-y-2.5">
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-caption2 font-semibold">{CATEGORIA_LABEL[d.categoria]}</span>
          <span className={`rounded-full px-2.5 py-1 text-caption2 font-semibold ${INTENSIDAD_TONE[d.intensidad]}`}>{INTENSIDAD_LABEL[d.intensidad]}</span>
          <span className="flex items-center gap-1 text-caption2 text-white/60"><Clock className="h-3.5 w-3.5" />{d.duracionSeg < 60 ? `${d.duracionSeg} s` : `${Math.round(d.duracionSeg / 60)} min`}</span>
        </div>
        <h3 className="text-title2 font-bold leading-tight">{d.titulo}</h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-footnote text-white/60"><Users className="h-3.5 w-3.5" />{d.jugadores}{d.props.length ? ` · ${d.props.join(', ')}` : ''}</p>
      </div>

      <button
        type="button"
        onClick={() => setDijo((v) => !v)}
        className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left interactive ${dijo ? 'border-emerald-300/50 bg-emerald-400/15' : 'border-amber-300/40 bg-amber-300/10'}`}
      >
        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${dijo ? 'bg-emerald-400 text-black' : 'bg-white/15'}`}>{dijo && <Check className="h-4 w-4" />}</span>
        <span>
          <span className="block text-footnote font-bold uppercase tracking-wider text-white/60">Paso 0 · consentimiento a cámara</span>
          <span className="block text-subhead font-semibold">«{pauta.consentimiento.frase}»</span>
          <span className="mt-1 block text-footnote text-white/65">Cada persona la dice. Sin la frase no se graba. Toca cuando todos ya la dijeron.</span>
        </span>
      </button>

      {d.optIn && <p className="rounded-2xl bg-red-500/15 p-3 text-footnote font-semibold text-red-100">Solo si todas las personas lo piden y dicen que sí, en voz alta. Si hay una duda, pasa a la salida suave.</p>}

      <Block title="Dilo así">{d.decirlo}</Block>
      <Block title="Reglas"><ul className="space-y-0.5">{d.reglas.map((r) => <li key={r}>• {r}</li>)}</ul></Block>
      <Block title="Salida suave" tone="bg-emerald-400/10">{d.salidaSuave}</Block>

      <div className="rounded-2xl bg-sky-400/10 p-3.5">
        <p className="mb-1.5 flex items-center gap-1.5 text-caption2 font-semibold uppercase tracking-wider text-sky-200"><Camera className="h-3.5 w-3.5" /> Cámara · creador</p>
        <dl className="space-y-1 text-subhead">
          <div><dt className="inline font-semibold">Posición: </dt><dd className="inline text-white/85">{d.camara.posicion}</dd></div>
          <div><dt className="inline font-semibold">Plano: </dt><dd className="inline text-white/85">{d.camara.plano}</dd></div>
          <div><dt className="inline font-semibold">Micrófono: </dt><dd className="inline text-white/85">{d.camara.microfono}</dd></div>
          <div><dt className="inline font-semibold">Reacción: </dt><dd className="inline text-white/85">{d.camara.reaccion}</dd></div>
        </dl>
      </div>

      <Block title="Gancho del reel">{d.gancho}</Block>
      <Block title="Cierra el clip con">«{d.cierre}»</Block>
      <Temporizador key={d.id} segundos={d.duracionSeg} />
    </div>
  );
}

function Mazo({ pauta, openId, onOpenHandled }: { pauta: Pauta; openId: string | null; onOpenHandled: () => void }) {
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [intensidad, setIntensidad] = useState<Intensidad | null>(null);
  // Las atrevidas no aparecen hasta que el animador confirma que hay opt-in.
  const [optIn, setOptIn] = useState(false);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<string[]>([]);

  const lista = useMemo(
    () => pauta.dinamicas.filter((d) => (optIn || d.intensidad !== 'atrevido') && (!categoria || d.categoria === categoria) && (!intensidad || d.intensidad === intensidad)),
    [pauta.dinamicas, categoria, intensidad, optIn],
  );
  const actual = lista[Math.min(index, Math.max(lista.length - 1, 0))];
  const scroller = useRef<HTMLDivElement>(null);

  // Una dinámica del guion de la noche abre directo su tarjeta.
  useEffect(() => {
    if (!openId) return;
    const d = pauta.dinamicas.find((x) => x.id === openId);
    if (d) {
      if (d.intensidad === 'atrevido') setOptIn(true);
      setCategoria(null);
      setIntensidad(null);
      const pos = pauta.dinamicas.filter((x) => d.intensidad === 'atrevido' || x.intensidad !== 'atrevido').findIndex((x) => x.id === openId);
      setIndex(Math.max(pos, 0));
    }
    onOpenHandled();
  }, [openId, pauta.dinamicas, onOpenHandled]);

  const ir = useCallback((delta: number) => {
    if (!lista.length) return;
    setIndex((i) => (Math.min(i, lista.length - 1) + delta + lista.length) % lista.length);
    scroller.current?.scrollTo({ top: 0 });
  }, [lista.length]);

  const alAzar = () => {
    if (lista.length < 2) return;
    // Evita repetir las últimas que ya salieron.
    const candidatas = lista.map((d, i) => ({ d, i })).filter(({ d }) => !history.slice(-4).includes(d.id) && d.id !== actual?.id);
    const pool = candidatas.length ? candidatas : lista.map((d, i) => ({ d, i })).filter(({ d }) => d.id !== actual?.id);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setIndex(pick.i);
    setHistory((h) => [...h, pick.d.id]);
    scroller.current?.scrollTo({ top: 0 });
  };

  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={!categoria} onClick={() => { setCategoria(null); setIndex(0); }}>Todas</Chip>
        {CATEGORIAS.map((c) => <Chip key={c} active={categoria === c} onClick={() => { setCategoria(c); setIndex(0); }}>{CATEGORIA_LABEL[c]}</Chip>)}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={!intensidad} onClick={() => { setIntensidad(null); setIndex(0); }}>Toda intensidad</Chip>
        {INTENSIDADES.filter((i) => optIn || i !== 'atrevido').map((i) => <Chip key={i} active={intensidad === i} onClick={() => { setIntensidad(i); setIndex(0); }}>{INTENSIDAD_LABEL[i].split(' · ')[0]}</Chip>)}
      </div>
      <button
        type="button"
        onClick={() => { setOptIn((v) => !v); setIntensidad((v) => (v === 'atrevido' ? null : v)); setIndex(0); }}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl p-3 text-left interactive ${optIn ? 'bg-red-500/20' : 'bg-white/[0.06]'}`}
      >
        <span>
          <span className="block text-subhead font-semibold">Hay opt-in para dinámicas atrevidas</span>
          <span className="block text-footnote text-white/60">Actívalo solo si todas las personas lo pidieron.</span>
        </span>
        <span className={`h-7 w-12 shrink-0 rounded-full p-1 transition ${optIn ? 'bg-red-400' : 'bg-white/20'}`}><span className={`block h-5 w-5 rounded-full bg-white transition ${optIn ? 'translate-x-5' : ''}`} /></span>
      </button>

      {!actual ? (
        <p className="rounded-2xl bg-white/5 p-4 text-subhead text-white/65">No hay dinámicas con estos filtros.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => ir(-1)} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 interactive" aria-label="Anterior"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={alAzar} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white text-callout font-bold text-black interactive"><Shuffle className="h-5 w-5" /> Al azar</button>
            <button type="button" onClick={() => ir(1)} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 interactive" aria-label="Siguiente"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <p className="text-center text-caption2 text-white/50">{Math.min(index, lista.length - 1) + 1} de {lista.length} · desliza para cambiar</p>
          <motion.div
            ref={scroller}
            key={actual.id}
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.35}
            onDragEnd={(_, info) => { if (info.offset.x < -80) ir(1); else if (info.offset.x > 80) ir(-1); }}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            className="account-glass rounded-[24px] p-4"
          >
            <Tarjeta d={actual} pauta={pauta} />
          </motion.div>
        </>
      )}
    </div>
  );
}

function Noche({ pauta, onOpen }: { pauta: Pauta; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-3">
      {pauta.guion.map((b, i) => (
        <section key={b.id} className="account-glass rounded-[24px] p-4">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h3 className="text-title3 font-bold">{i + 1}. {b.titulo}</h3>
            <span className="text-footnote tabular-nums text-white/55">{b.desdeMin}–{b.hastaMin} min</span>
          </div>
          <p className="mb-3 text-subhead text-white/75">{b.meta}</p>
          <div className="space-y-1.5">
            {b.dinamicas.map((id) => {
              const d = pauta.dinamicas.find((x) => x.id === id);
              if (!d) return null;
              return (
                <button key={id} type="button" onClick={() => onOpen(id)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white/[0.07] px-3.5 py-3 text-left interactive">
                  <span className="min-w-0">
                    <span className="block truncate text-subhead font-semibold">{d.titulo}</span>
                    <span className="block text-caption2 text-white/55">{CATEGORIA_LABEL[d.categoria]} · {INTENSIDAD_LABEL[d.intensidad].split(' · ')[0]}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/50" />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function CamaraTab({ pauta }: { pauta: Pauta }) {
  const [checks, setChecks] = useState<Record<string, boolean>>(() => readJson<Record<string, boolean>>(CHECK_KEY) ?? {});
  const toggle = (id: string) => setChecks((c) => { const next = { ...c, [id]: !c[id] }; writeJson(CHECK_KEY, next); return next; });
  const grupos = useMemo(() => {
    const map = new Map<string, typeof pauta.checklist>();
    for (const item of pauta.checklist) map.set(item.grupo, [...(map.get(item.grupo) ?? []), item]);
    return Array.from(map.entries());
  }, [pauta]);
  const hechos = pauta.checklist.filter((i) => checks[i.id]).length;

  return (
    <div className="space-y-3">
      <section className="account-glass rounded-[24px] p-4">
        <h3 className="mb-2 text-footnote font-semibold uppercase tracking-wider text-white/55">Consentimiento a cámara</h3>
        <p className="mb-2 text-callout font-semibold">«{pauta.consentimiento.frase}»</p>
        <ol className="list-decimal space-y-1 pl-5 text-subhead text-white/80">
          {pauta.consentimiento.pasos.map((p) => <li key={p}>{p}</li>)}
        </ol>
      </section>

      <section className="account-glass rounded-[24px] p-4">
        <h3 className="mb-2 text-footnote font-semibold uppercase tracking-wider text-white/55">Señales con el creador</h3>
        <div className="space-y-1.5">
          {pauta.senales.map((s) => (
            <div key={s.id} className="rounded-2xl bg-white/[0.07] px-3.5 py-2.5">
              <p className="text-subhead font-semibold">{s.accion}</p>
              <p className="text-footnote text-white/65">{s.quien === 'animador' ? 'La hace el animador' : 'La hace el creador'} · {s.gesto}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="account-glass rounded-[24px] p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-footnote font-semibold uppercase tracking-wider text-white/55">Checklist del creador</h3>
          <span className="text-footnote tabular-nums text-white/60">{hechos}/{pauta.checklist.length}</span>
        </div>
        <div className="space-y-3">
          {grupos.map(([grupo, items]) => (
            <div key={grupo}>
              <p className="mb-1 text-footnote font-semibold text-white/70">{grupo}</p>
              <div className="space-y-1.5">
                {items.map((i) => (
                  <button key={i.id} type="button" onClick={() => toggle(i.id)} className="flex w-full items-start gap-3 rounded-2xl bg-white/[0.07] px-3.5 py-2.5 text-left interactive">
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${checks[i.id] ? 'bg-emerald-400 text-black' : 'bg-white/15'}`}>{checks[i.id] && <Check className="h-3.5 w-3.5" />}</span>
                    <span className={`text-subhead ${checks[i.id] ? 'text-white/50 line-through' : ''}`}>{i.texto}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {hechos > 0 && <button type="button" onClick={() => { setChecks({}); writeJson(CHECK_KEY, {}); }} className="mt-3 w-full rounded-2xl bg-white/10 py-2.5 text-footnote font-semibold interactive">Reiniciar checklist</button>}
      </section>
    </div>
  );
}

type Tab = 'noche' | 'mazo' | 'camara';
const TABS: { key: Tab; label: string }[] = [
  { key: 'noche', label: 'Noche' },
  { key: 'mazo', label: 'Mazo' },
  { key: 'camara', label: 'Cámara' },
];

export function StaffAnimador() {
  const pauta = useStaffAnimador();
  const { isLoading } = trpc.member.animadorPauta.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const [tab, setTab] = useState<Tab>('noche');
  const [openId, setOpenId] = useState<string | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const handled = useCallback(() => setOpenId(null), []);

  if (!pauta && isLoading) return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>;
  if (!pauta) return <p className="rounded-2xl bg-white/5 p-4 text-subhead text-white/65">Esta pantalla es solo para animadores. Si te toca animar, pídele a producción que te asigne el cargo.</p>;

  return (
    <div className="space-y-3 pb-4">
      <div>
        <p className="text-title3 font-bold leading-tight">🎤 Pauta del animador</p>
        <p className="text-footnote text-white/60">{pauta.animadorName ? `Hola, ${pauta.animadorName.split(' ')[0]} · ` : ''}{pauta.dinamicas.length} dinámicas, sin presión y con consentimiento.</p>
      </div>
      {!online && <p className="flex items-center gap-2 rounded-2xl bg-amber-300/15 p-3 text-footnote text-amber-100"><WifiOff className="h-4 w-4 shrink-0" /> Sin conexión: usando la última pauta guardada en tu teléfono.</p>}
      <Limites pauta={pauta} />
      <div className="flex gap-1.5 rounded-full bg-white/10 p-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`h-10 flex-1 rounded-full text-subhead font-semibold interactive ${tab === t.key ? 'bg-white text-black' : 'text-white/75'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'noche' && <Noche pauta={pauta} onOpen={(id) => { setOpenId(id); setTab('mazo'); }} />}
      {tab === 'mazo' && <Mazo pauta={pauta} openId={openId} onOpenHandled={handled} />}
      {tab === 'camara' && <CamaraTab pauta={pauta} />}
    </div>
  );
}
