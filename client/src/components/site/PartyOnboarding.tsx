import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { Camera, ChevronLeft, EyeOff, Lock, MessageCircleHeart, ShieldCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useHalloweenMode } from '@/lib/halloween';
import { PartyPhotos } from '@/components/site/PartyPhotos';
import {
  AVATARS_PER_GENDER, DEFAULT_LOOKING_FOR, GENDER_LABELS, INTENTS, INTENT_EMOJI, INTENT_LABELS, LOOKING_FOR_KEYS, LOOKING_LABELS,
  MAX_ALIAS_LENGTH, MAX_COSTUME_LENGTH, MAX_INTENTS, ORIENTATIONS, ORIENTATION_LABELS, PAIR_LABELS, PAIR_TYPES, PARTY_GENDERS,
  PARTY_ZONES, RELATION_LABELS, RELATION_STYLES, ZONE_LABELS, sanitizeAlias, sanitizeCostume,
  type Intent, type LookingKey, type Orientation, type PairType, type PartyGender, type PartyZone, type RelationStyle,
} from '@shared/party';

/* El perfil de Playmatch paso a paso, como en una app de citas: una pregunta por pantalla, barra de avance, lo opcional se
 * salta y la foto va dentro del flujo. Reemplaza al formulario largo al crear el perfil (`PartyProfileForm` queda para
 * editarlo). Vive en site/ porque también lo usa la inscripción anticipada de la App.
 *
 * El perfil se crea al aceptar las reglas; la foto viene después (subirla exige tener el perfil). Por eso quien lo monta
 * lo mantiene en pantalla hasta `onDone`, aunque `onCreated` ya haya refrescado la sesión. */

type StepId = 'alias' | 'soy' | 'busco' | 'noche' | 'mas' | 'zona' | 'reglas' | 'foto';

const OPTION = 'flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-body font-semibold transition-colors';
const PILL = 'min-h-11 rounded-full border px-4 py-2 text-subhead font-semibold leading-tight transition-colors';
const SELECTED = 'border-pink-400/80 bg-pink-500/20 text-white shadow-[0_0_0_1px_rgba(236,72,153,0.25)]';
const IDLE = 'border-white/15 bg-white/[0.05] text-white/75';
const INPUT = 'h-14 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-title3 font-semibold text-white placeholder:font-normal placeholder:text-white/40 focus:border-pink-400/70 focus:outline-none';
const CTA = 'flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-headline font-bold text-[color:var(--pm-on-accent,#fff)] shadow-[0_10px_28px_-8px_var(--pm-glow,rgba(236,72,153,0.7)),inset_0_1px_0_rgba(255,255,255,0.4)] transition-opacity disabled:opacity-35';

const tap = () => { try { navigator.vibrate?.(8); } catch { /* sin vibración */ } };

export function PartyOnboarding({ ticketCode, mode, zones = false, embedded = false, themeClass = '', onCreated, onDone }: {
  ticketCode: string;
  /** `inside`: ya entró a la fiesta. `pre`: inscripción anticipada (se activa al escanear la entrada). */
  mode: 'inside' | 'pre';
  /** La fiesta usa zonas (Living, Piscina…): se pregunta dónde está. */
  zones?: boolean;
  embedded?: boolean;
  themeClass?: string;
  /** El perfil ya existe (falta la foto): quien lo monta refresca la sesión sin sacar esta pantalla. */
  onCreated: () => void;
  onDone: () => void;
}) {
  const halloween = useHalloweenMode();
  const [alias, setAlias] = useState('');
  const [gender, setGender] = useState<PartyGender | null>(null);
  const [pairType, setPairType] = useState<PairType | null>(null);
  const [lookingFor, setLookingFor] = useState<LookingKey[]>([...DEFAULT_LOOKING_FOR]);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [orientation, setOrientation] = useState<Orientation | null>(null);
  const [relationStyle, setRelationStyle] = useState<RelationStyle | null>(null);
  const [look, setLook] = useState('');
  const [zone, setZone] = useState<PartyZone>('living');
  // La ficha (el avatar de quien no pone foto) se elige sola; se cambia después en «Tu perfil».
  const [avatarId] = useState(() => 1 + Math.floor(Math.random() * AVATARS_PER_GENDER));

  const steps: StepId[] = ['alias', 'soy', 'busco', 'noche', 'mas', ...(zones && mode === 'inside' ? ['zona' as const] : []), 'reglas', 'foto'];
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const step = steps[Math.min(index, steps.length - 1)];
  const go = (delta: number) => { tap(); setDir(delta); setIndex((i) => Math.min(steps.length - 1, Math.max(0, i + delta))); };

  // La sesión (la misma consulta de quien lo monta): de acá sale el perfil recién creado y cuántas fotos lleva.
  const session = trpc.party.getSession.useQuery({ ticketCode }, { enabled: !!ticketCode, retry: false });
  const profile = session.data?.profile ?? null;

  const create = trpc.party.createProfile.useMutation({
    onSuccess: async () => { await session.refetch(); onCreated(); setDir(1); setIndex(steps.indexOf('foto')); },
    onError: (e) => toast.error(e.message),
  });

  const aliasCheck = sanitizeAlias(alias);
  const aliasError = alias.length > 0 && !aliasCheck.ok ? aliasCheck.reason : null;
  const lookCheck = sanitizeCostume(look);
  const lookError = !lookCheck.ok ? lookCheck.reason.replace('en el disfraz', 'acá') : null;

  const toggleLooking = (g: LookingKey) => { tap(); setLookingFor((list) => (list.includes(g) ? (list.length > 1 ? list.filter((x) => x !== g) : list) : [...list, g])); };
  const toggleIntent = (i: Intent) => { tap(); setIntents((list) => (list.includes(i) ? list.filter((x) => x !== i) : list.length < MAX_INTENTS ? [...list, i] : list)); };

  const submit = () => {
    if (!aliasCheck.ok || !lookCheck.ok || !gender || create.isPending) return;
    tap();
    create.mutate({
      ticketCode, alias: aliasCheck.alias, gender, avatarId, zone, acceptedRules: true,
      lookingFor, costume: lookCheck.costume ?? '', pairType: gender === 'pareja' ? pairType : null, orientation, relationStyle, intents,
    });
  };

  const canNext: Record<StepId, boolean> = {
    alias: aliasCheck.ok,
    soy: !!gender && (gender !== 'pareja' || !!pairType),
    busco: lookingFor.length > 0,
    noche: true,
    mas: lookCheck.ok,
    zona: true,
    reglas: true,
    foto: true,
  };
  const photoCount = profile?.photoCount ?? 0;

  let body: ReactNode;
  let title = '';
  let hint = '';
  if (step === 'alias') {
    title = mode === 'inside' ? 'Estás adentro. ¿Cómo te decimos?' : '¿Cómo te decimos esa noche?';
    hint = 'Un alias, no tu nombre real. Es lo que verán en tu tarjeta.';
    body = (
      <>
        <input autoFocus value={alias} onChange={(e) => setAlias(e.target.value)} maxLength={MAX_ALIAS_LENGTH} placeholder="Ej: La Reina"
          enterKeyHint="next" onKeyDown={(e) => { if (e.key === 'Enter' && canNext.alias) go(1); }} className={INPUT} aria-label="Tu alias" />
        <p className={`mt-2 text-footnote ${aliasError ? 'text-rose-300' : 'text-white/55'}`}>{aliasError ?? `${alias.length}/${MAX_ALIAS_LENGTH} · sin redes ni teléfonos`}</p>
      </>
    );
  } else if (step === 'soy') {
    title = 'Soy…';
    hint = 'Así te encuentra quien busca a alguien como tú.';
    body = (
      <div className="space-y-2.5">
        {PARTY_GENDERS.map((g) => (
          <button key={g} type="button" aria-pressed={gender === g} onClick={() => { tap(); setGender(g); }} className={`${OPTION} ${gender === g ? SELECTED : IDLE}`}>
            {GENDER_LABELS[g]}
          </button>
        ))}
        {gender === 'pareja' && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="pt-2">
            <p className="mb-2 text-footnote font-semibold text-white/60">¿De quiénes es la pareja?</p>
            <div className="flex flex-wrap gap-2">
              {PAIR_TYPES.map((t) => (
                <button key={t} type="button" aria-pressed={pairType === t} onClick={() => { tap(); setPairType(t); }} className={`${PILL} ${pairType === t ? SELECTED : IDLE}`}>{PAIR_LABELS[t]}</button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    );
  } else if (step === 'busco') {
    title = 'Quiero conocer…';
    hint = 'Elige todo lo que quieras. Solo te aparece quien tú buscas y que también busca a alguien como tú.';
    body = (
      <div className="grid grid-cols-2 gap-2.5">
        {LOOKING_FOR_KEYS.map((g) => (
          <button key={g} type="button" aria-pressed={lookingFor.includes(g)} onClick={() => toggleLooking(g)}
            className={`${PILL} min-h-14 rounded-2xl ${lookingFor.includes(g) ? SELECTED : IDLE}`}>{LOOKING_LABELS[g]}</button>
        ))}
      </div>
    );
  } else if (step === 'noche') {
    title = 'Esta noche busco…';
    hint = `Hasta ${MAX_INTENTS}. Primero te mostramos a quien busca lo mismo.`;
    body = (
      <div className="flex flex-wrap gap-2.5">
        {INTENTS.map((i) => (
          <button key={i} type="button" aria-pressed={intents.includes(i)} onClick={() => toggleIntent(i)}
            className={`${PILL} ${intents.includes(i) ? SELECTED : IDLE} ${!intents.includes(i) && intents.length >= MAX_INTENTS ? 'opacity-40' : ''}`}>
            <span aria-hidden>{INTENT_EMOJI[i]}</span> {INTENT_LABELS[i]}
          </button>
        ))}
      </div>
    );
  } else if (step === 'mas') {
    title = 'Un poco más de ti';
    hint = 'Todo opcional. Mejora tu afinidad con los demás y se borra cuando termina la fiesta.';
    body = (
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-footnote font-semibold uppercase tracking-wide text-white/55">Orientación</p>
          <div className="flex flex-wrap gap-2">
            {ORIENTATIONS.map((o) => (
              <button key={o} type="button" aria-pressed={orientation === o} onClick={() => { tap(); setOrientation(orientation === o ? null : o); }} className={`${PILL} ${orientation === o ? SELECTED : IDLE}`}>{ORIENTATION_LABELS[o]}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-footnote font-semibold uppercase tracking-wide text-white/55">Cómo me relaciono</p>
          <div className="flex flex-wrap gap-2">
            {RELATION_STYLES.map((r) => (
              <button key={r} type="button" aria-pressed={relationStyle === r} onClick={() => { tap(); setRelationStyle(relationStyle === r ? null : r); }} className={`${PILL} ${relationStyle === r ? SELECTED : IDLE}`}>{RELATION_LABELS[r]}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-footnote font-semibold uppercase tracking-wide text-white/55">{halloween ? 'Mi disfraz' : 'Cómo encontrarme en la fiesta'}</p>
          <input value={look} onChange={(e) => setLook(e.target.value)} maxLength={MAX_COSTUME_LENGTH}
            placeholder={halloween ? 'Ej: Vampira, Joker' : 'Ej: vestido rojo, camisa blanca'}
            className="h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-body text-white placeholder:text-white/40 focus:border-pink-400/70 focus:outline-none" />
          <p className={`mt-1.5 text-caption1 ${lookError ? 'text-rose-300' : 'text-white/55'}`}>{lookError ?? 'Sale en tu tarjeta: ayuda a que te reconozcan.'}</p>
        </div>
      </div>
    );
  } else if (step === 'zona') {
    title = '¿Dónde estás ahora?';
    hint = 'Lo cambias cuando te muevas.';
    body = (
      <div className="grid grid-cols-2 gap-2.5">
        {PARTY_ZONES.map((z) => (
          <button key={z} type="button" aria-pressed={zone === z} onClick={() => { tap(); setZone(z); }} className={`${PILL} min-h-14 rounded-2xl ${zone === z ? SELECTED : IDLE}`}>{ZONE_LABELS[z]}</button>
        ))}
      </div>
    );
  } else if (step === 'reglas') {
    title = 'Las reglas de la casa';
    hint = 'Para que todos lo pasen bien.';
    const rules: [typeof Lock, string, string][] = [
      [Lock, 'Lo que pasa acá, se queda acá', 'Nada de capturas ni fotos de otras personas.'],
      [EyeOff, 'Sin datos personales', 'No compartas redes ni teléfonos por el chat.'],
      [MessageCircleHeart, 'Solo con consentimiento', 'Nadie te escribe sin match. Un no es un no.'],
      [ShieldCheck, 'Tú mandas', 'Puedes bloquear y denunciar en cualquier momento.'],
    ];
    body = (
      <ul className="space-y-2.5">
        {rules.map(([Icon, head, text]) => (
          <li key={head} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pink-500/15"><Icon className="h-[18px] w-[18px] text-pink-300" /></span>
            <span><span className="block text-subhead font-bold">{head}</span><span className="block text-footnote text-white/65">{text}</span></span>
          </li>
        ))}
      </ul>
    );
  } else {
    title = photoCount > 0 ? '¡Te ves increíble!' : 'Pon tu mejor foto';
    hint = mode === 'pre'
      ? 'Nadie la ve hasta que escaneen tu entrada. Solo la ve gente que también puso la suya, y se borra al terminar la fiesta.'
      : 'Con foto entras al swipe. Solo la ve gente que también puso la suya, y se borra al terminar la fiesta.';
    body = profile ? (
      <PartyPhotos ticketCode={ticketCode} profileId={profile.id} alias={profile.alias} photoCount={photoCount} onChanged={() => { void session.refetch(); }} />
    ) : (
      <div className="grid h-40 place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-400 border-t-transparent" /></div>
    );
  }

  const optional = step === 'noche' || step === 'mas';
  const empty = (step === 'noche' && intents.length === 0) || (step === 'mas' && !orientation && !relationStyle && !look.trim());
  const footer = step === 'reglas' ? (
    <>
      <button type="button" onClick={submit} disabled={create.isPending} className={CTA}>{create.isPending ? 'Creando tu perfil…' : 'Acepto y sigo'}</button>
      <p className="mt-3 text-center text-caption1 text-white/55">Al seguir aceptas las reglas de la casa.</p>
    </>
  ) : step === 'foto' ? (
    <>
      <button type="button" onClick={() => { tap(); onDone(); }} disabled={!profile} className={photoCount > 0 ? CTA : 'flex h-14 w-full items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-headline font-semibold text-white/80 disabled:opacity-40'}>
        {photoCount > 0 ? (mode === 'inside' ? 'Entrar a Playmatch' : 'Listo') : 'Ahora no'}
      </button>
      {photoCount === 0 && <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-caption1 text-white/55"><Camera className="h-3.5 w-3.5" /> Sin foto no puedes deslizar. La puedes poner después.</p>}
    </>
  ) : (
    <button type="button" onClick={() => go(1)} disabled={!canNext[step]} className={CTA}>{optional && empty ? 'Saltar' : 'Continuar'}</button>
  );

  // Hasta crear el perfil se puede volver atrás; después (la foto) ya no hay nada que deshacer.
  const canBack = index > 0 && step !== 'foto';
  const progress = (index + 1) / steps.length;

  return (
    <div className={embedded ? `text-white ${themeClass}` : `account-font account-tokens relative flex min-h-dvh flex-col bg-[color:var(--pm-bg,#0b0612)] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(14px,env(safe-area-inset-top))] text-white ${themeClass}`}>
      {!embedded && <div className="account-backdrop" />}
      <div className={`relative z-10 mx-auto flex w-full max-w-md flex-col ${embedded ? '' : 'min-h-0 flex-1'}`}>
        <div className="flex h-11 items-center gap-3">
          <button type="button" onClick={() => go(-1)} disabled={!canBack} aria-label="Paso anterior" className={`-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-pink-300 transition-opacity ${canBack ? '' : 'pointer-events-none opacity-0'}`}><ChevronLeft className="h-7 w-7" /></button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1} aria-label={`Paso ${index + 1} de ${steps.length}`}>
            <motion.div className="h-full rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500" initial={false} animate={{ width: `${progress * 100}%` }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} />
          </div>
          <span className="w-9 shrink-0 text-right text-caption1 font-semibold tabular-nums text-white/55">{index + 1}/{steps.length}</span>
        </div>

        <div className={`relative ${embedded ? 'min-h-[320px] py-5' : 'flex-1 overflow-y-auto overscroll-contain py-6'}`}>
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div key={step} custom={dir}
              variants={{ enter: (d: number) => ({ opacity: 0, x: d * 36 }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: d * -36 }) }}
              initial="enter" animate="center" exit="exit" transition={{ duration: 0.2, ease: 'easeOut' }}>
              <h1 className={`font-bold tracking-tight ${embedded ? 'text-title2' : 'text-title1'}`}>{title}</h1>
              <p className="mb-6 mt-1.5 text-subhead leading-snug text-white/65">{hint}</p>
              {body}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="shrink-0 pt-2">{footer}</div>
      </div>
    </div>
  );
}
