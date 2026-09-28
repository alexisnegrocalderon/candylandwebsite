import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { ArrowLeft, RefreshCw, Share2, Ticket } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { breadcrumbSchema } from '@shared/structuredData';
import { CANDYLAND, EVENTO } from '@/config/candyland';
import { EVENT_BRAND } from '@shared/eventBrand';
import {
  ORACLE_EXTRA_MAX, ORACLE_LABELS,
  type CostumeCard, type OracleAnswers, type OracleCompany, type OracleItem,
  type OracleLevel, type OracleResult, type OracleSkin, type OracleVibe,
} from '@shared/costumeOracle';

/* Oráculo de Disfraces: la gente le pedía al dueño ideas de disfraz para el
 * 2º Aniversario (disfraz obligatorio). 5 preguntas visuales + un campo
 * libre -> la IA (server/costumeOracle.ts) revela 3 cartas: una armable con
 * lo que ya tienes, una con accesorios y una full producción para arrendar
 * o confeccionar. Vive dentro de `.halloween` (paleta en index.css) para
 * verse coherente con el modo Halloween del sitio. */

type Stage = 'intro' | 'questions' | 'thinking' | 'result';

type Option<T extends string> = { value: T; emoji: string; label: string };

const VIBES: Option<OracleVibe>[] = [
  { value: 'sexy', emoji: '🔥', label: ORACLE_LABELS.vibe.sexy },
  { value: 'terror', emoji: '💀', label: ORACLE_LABELS.vibe.terror },
  { value: 'divertido', emoji: '😂', label: ORACLE_LABELS.vibe.divertido },
  { value: 'elegante', emoji: '👑', label: ORACLE_LABELS.vibe.elegante },
];
const COMPANY: Option<OracleCompany>[] = [
  { value: 'solo', emoji: '🕯️', label: ORACLE_LABELS.company.solo },
  { value: 'pareja', emoji: '💞', label: ORACLE_LABELS.company.pareja },
  { value: 'grupo', emoji: '🦇', label: ORACLE_LABELS.company.grupo },
];
const LEVELS: Option<OracleLevel>[] = [
  { value: 'casa', emoji: '🧺', label: ORACLE_LABELS.level.casa },
  { value: 'accesorios', emoji: '🛍️', label: ORACLE_LABELS.level.accesorios },
  { value: 'produccion', emoji: '🎬', label: ORACLE_LABELS.level.produccion },
];
const SKIN: Option<OracleSkin>[] = [
  { value: 'poca', emoji: '🧥', label: ORACLE_LABELS.skin.poca },
  { value: 'algo', emoji: '✨', label: ORACLE_LABELS.skin.algo },
  { value: 'mucha', emoji: '🔥', label: ORACLE_LABELS.skin.mucha },
];
const ITEMS: Option<OracleItem>[] = [
  { value: 'negro', emoji: '🖤', label: ORACLE_LABELS.items.negro },
  { value: 'lenceria', emoji: '🩱', label: ORACLE_LABELS.items.lenceria },
  { value: 'cuero', emoji: '⛓️', label: ORACLE_LABELS.items.cuero },
  { value: 'blanco', emoji: '🤍', label: ORACLE_LABELS.items.blanco },
  { value: 'rojo', emoji: '❤️', label: ORACLE_LABELS.items.rojo },
  { value: 'disfraz_viejo', emoji: '📦', label: ORACLE_LABELS.items.disfraz_viejo },
  { value: 'maquillaje', emoji: '💄', label: ORACLE_LABELS.items.maquillaje },
  { value: 'nada', emoji: '🤷', label: ORACLE_LABELS.items.nada },
];

const TOTAL_STEPS = 6;
const MIN_THINKING_MS = 2600;
const TIER_LABEL: Record<CostumeCard['tier'], string> = {
  basico: 'Con lo que tienes',
  intermedio: 'Con accesorios',
  produccion: 'Full producción',
};

const FOG = ['🦇', '🕸️', '🎃', '👻', '🌙', '✨'];

export default function CostumeOracle() {
  useSeo({
    title: 'El Oráculo de Disfraces — Ideas de disfraz para el 2º Aniversario | Mansion Playroom',
    description: 'Contesta 5 preguntas y el oráculo te revela 3 ideas de disfraz para la noche antes de Halloween: con lo que tienes en casa, con accesorios o full producción.',
    path: '/disfraces',
    jsonLd: [breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Oráculo de Disfraces', path: '/disfraces' }])],
  });

  const [stage, setStage] = useState<Stage>('intro');
  const [step, setStep] = useState(0);
  const [vibe, setVibe] = useState<OracleVibe | null>(null);
  const [company, setCompany] = useState<OracleCompany | null>(null);
  const [level, setLevel] = useState<OracleLevel | null>(null);
  const [skin, setSkin] = useState<OracleSkin | null>(null);
  const [items, setItems] = useState<OracleItem[]>([]);
  const [extra, setExtra] = useState('');
  const [result, setResult] = useState<OracleResult | null>(null);

  const generate = trpc.costumeOracle.generate.useMutation();

  useEffect(() => { window.scrollTo({ top: 0 }); }, [stage]);

  const consult = async () => {
    if (!vibe || !company || !level || !skin) return;
    const answers: OracleAnswers = { vibe, company, level, skin, items, extra: extra.trim() || undefined };
    setStage('thinking');
    const started = Date.now();
    try {
      const res = await generate.mutateAsync(answers);
      const wait = MIN_THINKING_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setResult(res);
      setStage('result');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'El oráculo no pudo responder. Intenta de nuevo.');
      setStage('questions');
    }
  };

  const next = () => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  const pick = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setTimeout(next, 220); };
  const toggleItem = (v: OracleItem) => setItems((prev) => {
    if (v === 'nada') return prev.includes('nada') ? [] : ['nada'];
    const base = prev.filter((x) => x !== 'nada');
    return base.includes(v) ? base.filter((x) => x !== v) : [...base, v];
  });

  const restart = () => {
    setStage('intro'); setStep(0); setVibe(null); setCompany(null); setLevel(null);
    setSkin(null); setItems([]); setExtra(''); setResult(null);
  };

  const share = async () => {
    const url = `${window.location.origin}/disfraces`;
    const text = result
      ? `El Oráculo de Disfraces me reveló: ${result.cards.map((c) => `${c.emoji} ${c.name}`).join(' · ')}. ¿Y a ti?`
      : 'Descubre tu disfraz para el 2º Aniversario de Mansion Playroom';
    try {
      if (navigator.share) await navigator.share({ title: 'El Oráculo de Disfraces', text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); toast.success('Link copiado'); }
    } catch { /* la persona cerró el menú de compartir */ }
  };

  return (
    <div className="halloween relative min-h-screen overflow-hidden pt-24 pb-20">
      {/* Fondo: niebla morada + dorado, con emoji flotando (se apagan con reduced-motion) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(186,140,255,0.28)_0%,transparent_65%),radial-gradient(ellipse_60%_50%_at_80%_100%,rgba(196,255,77,0.12)_0%,transparent_60%)] opacity-80" />
      {FOG.map((e, i) => (
        <motion.span
          key={e}
          aria-hidden
          className="pointer-events-none absolute text-3xl opacity-25 motion-reduce:hidden select-none"
          style={{ left: `${8 + i * 16}%`, top: `${15 + (i % 3) * 25}%` }}
          animate={{ y: [0, -18, 0], rotate: [0, i % 2 ? 8 : -8, 0] }}
          transition={{ duration: 6 + i, repeat: Infinity, ease: 'easeInOut' }}
        >
          {e}
        </motion.span>
      ))}

      <div className="relative container max-w-2xl">
        <AnimatePresence mode="wait">
          {stage === 'intro' && (
            <motion.section
              key="intro"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
              className="text-center pt-10"
            >
              <CrystalBall />
              <p className="text-xs uppercase tracking-[0.35em] text-primary mt-8 mb-3">{EVENT_BRAND.fechaTexto} · Disfraz obligatorio</p>
              <h1 className="font-heading font-extrabold text-4xl md:text-6xl leading-[1.05] tracking-tight mb-5">
                El <span className="text-gradient-candy">Oráculo</span> de Disfraces
              </h1>
              <p className="text-muted-foreground text-lg leading-relaxed max-w-lg mx-auto mb-10">
                ¿No sabes de qué disfrazarte? Contéstale 5 preguntas y el oráculo te revela tres visiones:
                una con lo que ya tienes en casa, una con accesorios y una full producción.
              </p>
              <button
                type="button"
                onClick={() => setStage('questions')}
                className="btn-jelly inline-flex items-center gap-3 px-10 py-5 bg-primary text-primary-foreground rounded-full text-lg font-bold uppercase tracking-wide interactive"
              >
                🔮 Consultar al oráculo
              </button>
              <p className="text-xs text-muted-foreground mt-6">Toma menos de un minuto. Gratis y sin registrarte.</p>
            </motion.section>
          )}

          {stage === 'questions' && (
            <motion.section key="questions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex items-center gap-3 mb-8">
                <button
                  type="button"
                  onClick={() => (step === 0 ? setStage('intro') : setStep(step - 1))}
                  aria-label="Volver"
                  className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:text-primary interactive"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <motion.div className="h-full bg-primary" animate={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }} />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{step + 1}/{TOTAL_STEPS}</span>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
                  transition={{ duration: 0.25 }}
                >
                  {step === 0 && <Question title="¿Qué vibra quieres transmitir esa noche?" options={VIBES} value={vibe} onPick={pick(setVibe)} />}
                  {step === 1 && <Question title="¿Con quién vas?" options={COMPANY} value={company} onPick={pick(setCompany)} />}
                  {step === 2 && <Question title="¿Cuánto quieres producirte?" options={LEVELS} value={level} onPick={pick(setLevel)} />}
                  {step === 3 && <Question title="¿Cuánta piel te tinca mostrar?" options={SKIN} value={skin} onPick={pick(setSkin)} />}
                  {step === 4 && (
                    <div>
                      <h2 className="font-heading font-bold text-2xl md:text-3xl text-center mb-2">¿Qué tienes a mano?</h2>
                      <p className="text-muted-foreground text-center text-sm mb-6">Elige todas las que quieras.</p>
                      <div className="grid grid-cols-2 gap-3">
                        {ITEMS.map((o) => (
                          <OptionCard key={o.value} option={o} selected={items.includes(o.value)} onClick={() => toggleItem(o.value)} compact />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={next}
                        disabled={items.length === 0}
                        className="btn-jelly mt-8 w-full py-4 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-wide disabled:opacity-40 interactive"
                      >
                        Seguir
                      </button>
                    </div>
                  )}
                  {step === 5 && (
                    <div>
                      <h2 className="font-heading font-bold text-2xl md:text-3xl text-center mb-2">¿Algo más que quieras contarle al oráculo?</h2>
                      <p className="text-muted-foreground text-center text-sm mb-6">Opcional: un personaje que te encante, un color, una idea a medias…</p>
                      <textarea
                        value={extra}
                        onChange={(e) => setExtra(e.target.value.slice(0, ORACLE_EXTRA_MAX))}
                        rows={3}
                        placeholder="Ej: tengo un vestido rojo y me encantan las vampiras"
                        className="w-full rounded-2xl bg-card border border-border p-4 text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <p className="text-right text-xs text-muted-foreground mt-1 tabular-nums">{extra.length}/{ORACLE_EXTRA_MAX}</p>
                      <button
                        type="button"
                        onClick={consult}
                        className="btn-jelly mt-6 w-full py-5 rounded-full bg-primary text-primary-foreground text-lg font-bold uppercase tracking-wide interactive"
                      >
                        🔮 Revelar mi disfraz
                      </button>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.section>
          )}

          {stage === 'thinking' && (
            <motion.section key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center pt-16">
              <CrystalBall pulsing />
              <ThinkingText />
            </motion.section>
          )}

          {stage === 'result' && result && (
            <motion.section key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="text-xs uppercase tracking-[0.35em] text-primary text-center mb-3">Tus tres visiones</p>
              <h2 className="font-heading font-extrabold text-3xl md:text-4xl text-center mb-3">
                El oráculo <span className="text-gradient-candy">ha hablado</span>
              </h2>
              {result.intro && <p className="text-muted-foreground text-center mb-10 italic">“{result.intro}”</p>}

              <div className="space-y-6">
                {result.cards.map((card, i) => (
                  <TarotCard key={card.tier} card={card} index={i} showGroupTip={company !== 'solo'} />
                ))}
              </div>

              <div className="mt-12 flex flex-col gap-3">
                {EVENTO.fechaConfirmada && (
                  <Link
                    href={`/checkout/${CANDYLAND.slug}`}
                    className="btn-jelly flex items-center justify-center gap-2 py-5 px-6 rounded-full bg-primary text-primary-foreground text-base md:text-lg font-bold uppercase tracking-wide interactive"
                  >
                    <Ticket className="w-5 h-5 shrink-0" /> Ya tengo idea, quiero mi entrada
                  </Link>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={consult} className="flex items-center justify-center gap-2 py-3.5 rounded-full border border-border text-sm font-semibold hover:border-primary interactive">
                    <RefreshCw className="w-4 h-4" /> Otras ideas
                  </button>
                  <button type="button" onClick={share} className="flex items-center justify-center gap-2 py-3.5 rounded-full border border-border text-sm font-semibold hover:border-primary interactive">
                    <Share2 className="w-4 h-4" /> Compartir
                  </button>
                </div>
                <button type="button" onClick={restart} className="text-xs text-muted-foreground underline mt-2">
                  Volver a empezar
                </button>
              </div>

              <p className="text-center text-xs text-muted-foreground mt-10">
                ¿Todavía con dudas? Revisa los tips en{' '}
                <Link href="/blog/dress-code-explicado" className="text-primary underline">Disfraz Obligatorio</Link>.
              </p>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Question<T extends string>({ title, options, value, onPick }: {
  title: string; options: Option<T>[]; value: T | null; onPick: (v: T) => void;
}) {
  return (
    <div>
      <h2 className="font-heading font-bold text-2xl md:text-3xl text-center mb-8">{title}</h2>
      <div className={`grid gap-3 ${options.length === 4 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
        {options.map((o) => (
          <OptionCard key={o.value} option={o} selected={value === o.value} onClick={() => onPick(o.value)} />
        ))}
      </div>
    </div>
  );
}

function OptionCard<T extends string>({ option, selected, onClick, compact }: {
  option: Option<T>; selected: boolean; onClick: () => void; compact?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      aria-pressed={selected}
      className={`glass-candy rounded-2xl flex flex-col items-center justify-center text-center gap-2 border-2 transition-colors interactive ${
        compact ? 'py-4 px-3' : 'py-7 px-4'
      } ${selected ? '!border-primary shadow-[0_0_24px_rgba(196,255,77,0.35)]' : 'border-transparent hover:!border-primary/50'}`}
    >
      <span className={compact ? 'text-2xl' : 'text-4xl'} aria-hidden>{option.emoji}</span>
      <span className={`font-semibold ${compact ? 'text-sm' : 'text-base'}`}>{option.label}</span>
    </motion.button>
  );
}

function CrystalBall({ pulsing }: { pulsing?: boolean }) {
  return (
    <motion.div
      aria-hidden
      className="relative mx-auto w-36 h-36 md:w-44 md:h-44"
      animate={pulsing ? { scale: [1, 1.06, 1] } : { y: [0, -8, 0] }}
      transition={{ duration: pulsing ? 1.4 : 4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#eaffb8_0%,#ba8cff_38%,#4d4d4d_75%,#1a1a1a_100%)] shadow-[0_0_60px_rgba(186,140,255,0.55),0_0_120px_rgba(196,255,77,0.25)]" />
      <motion.div
        className="absolute inset-3 rounded-full bg-[conic-gradient(from_0deg,transparent,rgba(196,255,77,0.35),transparent,rgba(186,140,255,0.4),transparent)] blur-md"
        animate={{ rotate: 360 }}
        transition={{ duration: pulsing ? 2.5 : 10, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute top-5 left-8 w-8 h-5 rounded-full bg-white/40 blur-sm" />
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-24 h-6 rounded-[50%] bg-[#4d4d4d] shadow-[0_6px_20px_rgba(0,0,0,0.6)]" />
    </motion.div>
  );
}

const THINKING_LINES = ['Leyendo las cartas…', 'Consultando a los espíritus de la mansión…', 'Mezclando telas y sombras…', 'Casi listo…'];

function ThinkingText() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % THINKING_LINES.length), 900);
    return () => clearInterval(id);
  }, []);
  return (
    <AnimatePresence mode="wait">
      <motion.p
        key={i}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
        className="mt-12 font-heading text-xl text-primary"
      >
        {THINKING_LINES[i]}
      </motion.p>
    </AnimatePresence>
  );
}

function TarotCard({ card, index, showGroupTip }: { card: CostumeCard; index: number; showGroupTip: boolean }) {
  return (
    <motion.article
      initial={{ opacity: 0, rotateY: 90 }}
      animate={{ opacity: 1, rotateY: 0 }}
      transition={{ duration: 0.7, delay: 0.25 + index * 0.45, ease: [0.23, 1, 0.32, 1] }}
      style={{ transformPerspective: 1000 }}
      className="relative rounded-3xl p-[1.5px] bg-gradient-to-br from-[#c4ff4d] via-[#ba8cff]/70 to-[#4d4d4d]"
    >
      <div className="rounded-[calc(1.5rem-1.5px)] bg-card p-6 md:p-7">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-primary mb-1">Carta {['I', 'II', 'III'][index]} · {TIER_LABEL[card.tier]}</p>
            <h3 className="font-heading font-extrabold text-2xl leading-tight">{card.name}</h3>
          </div>
          <span className="text-5xl leading-none shrink-0" aria-hidden>{card.emoji}</span>
        </div>
        <p className="text-muted-foreground leading-relaxed mb-5">{card.pitch}</p>

        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Qué necesitas</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mb-5">
          {card.pieces.map((p) => (
            <li key={p} className="flex gap-2 text-sm"><span className="text-primary" aria-hidden>✦</span>{p}</li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="px-3 py-1 rounded-full bg-muted text-xs font-semibold">💰 {card.costRange}</span>
          <span className="px-3 py-1 rounded-full bg-muted text-xs font-semibold" aria-label={`Dificultad ${card.difficulty} de 3`}>
            {'🎃'.repeat(card.difficulty)}<span className="opacity-30">{'🎃'.repeat(3 - card.difficulty)}</span>
          </span>
        </div>

        {card.beautyTip && <p className="text-sm"><span className="text-primary font-semibold">💄 Tip:</span> {card.beautyTip}</p>}
        {showGroupTip && card.groupTip && <p className="text-sm mt-2"><span className="text-primary font-semibold">💞 En compañía:</span> {card.groupTip}</p>}
      </div>
    </motion.article>
  );
}
