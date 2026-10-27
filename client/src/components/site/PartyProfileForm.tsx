import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { PartyAvatar } from '@/components/party/Avatar';
import {
  AVATARS_PER_GENDER, DEFAULT_LOOKING_FOR, GENDER_LABELS, INTENTS, INTENT_EMOJI, INTENT_LABELS, LOOKING_FOR_KEYS, LOOKING_LABELS,
  MAX_ALIAS_LENGTH, MAX_COSTUME_LENGTH, MAX_INTENTS, ORIENTATIONS, ORIENTATION_LABELS, PAIR_LABELS, PAIR_TYPES, PARTY_GENDERS,
  PARTY_ZONES, RELATION_LABELS, RELATION_STYLES, ZONE_LABELS, parseLookingFor, sanitizeAlias, sanitizeCostume,
  type Intent, type LookingKey, type Orientation, type PairType, type PartyGender, type PartyZone, type RelationStyle,
} from '@shared/party';

/* El formulario del perfil de Playmatch. Vive acá (y no en pages/Party.tsx)
 * porque también lo usa la app de «Mi cuenta» para la inscripción
 * anticipada, que carga la hoja pública de estilos; admin.css lo declara
 * con @source para la página /fiesta. */

const LABEL = 'mb-2 block text-footnote font-semibold uppercase tracking-wide text-white/60';
const SELECTED = 'border-pink-400/70 bg-pink-500/20 text-white';
const IDLE = 'border-white/15 bg-white/[0.04] text-white/70';

const PILL = 'min-h-11 rounded-full border px-3 py-2 text-subhead font-semibold leading-tight transition-colors';
const OPTIONAL = <span className="normal-case tracking-normal text-white/60">· opcional</span>;

export { GENDER_LABELS };

/** El perfil de Playmatch. `inside`: recién entró a la fiesta. `pre`: inscripción anticipada desde la
 * app (queda invisible hasta que escaneen su entrada). `edit`: cambiar alias, género o avatar.
 * `embedded`: dentro de una pantalla de la app (sin fondo ni alto propio). */
export function CreateProfile({ ticketCode, onCreated, mode = 'inside', initial, embedded }: {
  ticketCode: string;
  onCreated: () => void;
  mode?: 'inside' | 'pre' | 'edit';
  initial?: {
    alias: string; gender: PartyGender; avatarId: number; lookingFor?: readonly string[]; costume?: string | null;
    pairType?: string | null; orientation?: string | null; relationStyle?: string | null; intents?: readonly string[];
  };
  embedded?: boolean;
}) {
  const [alias, setAlias] = useState(initial?.alias ?? '');
  const [gender, setGender] = useState<PartyGender>(initial?.gender ?? 'mujer');
  const [avatarId, setAvatarId] = useState(initial?.avatarId ?? 1);
  const [zone, setZone] = useState<PartyZone>('living');
  const [pairType, setPairType] = useState<PairType>((initial?.pairType as PairType) ?? 'mixta');
  const [lookingFor, setLookingFor] = useState<LookingKey[]>(initial?.lookingFor ? parseLookingFor(initial.lookingFor.join(',')) : [...DEFAULT_LOOKING_FOR]);
  const [costume, setCostume] = useState(initial?.costume ?? '');
  const [orientation, setOrientation] = useState<Orientation | null>((initial?.orientation as Orientation) ?? null);
  const [relationStyle, setRelationStyle] = useState<RelationStyle | null>((initial?.relationStyle as RelationStyle) ?? null);
  const [intents, setIntents] = useState<Intent[]>((initial?.intents as Intent[]) ?? []);
  const toggleLooking = (g: LookingKey) => setLookingFor((list) => (list.includes(g) ? (list.length > 1 ? list.filter((x) => x !== g) : list) : [...list, g]));
  const toggleIntent = (i: Intent) => setIntents((list) => (list.includes(i) ? list.filter((x) => x !== i) : list.length < MAX_INTENTS ? [...list, i] : list));
  const [rules, setRules] = useState(mode === 'edit');

  const create = trpc.party.createProfile.useMutation({
    onSuccess: onCreated,
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.party.updateProfile.useMutation({
    onSuccess: () => { toast.success('Perfil guardado'); onCreated(); },
    onError: (e) => toast.error(e.message),
  });
  const pending = create.isPending || update.isPending;

  const check = sanitizeAlias(alias);
  const aliasError = alias.length > 0 && !check.ok ? check.reason : null;
  const costumeCheck = sanitizeCostume(costume);
  const costumeError = !costumeCheck.ok ? costumeCheck.reason : null;
  const submit = () => {
    if (!check.ok || !costumeCheck.ok || !rules) return;
    const extra = {
      lookingFor, costume: costumeCheck.costume ?? '',
      pairType: gender === 'pareja' ? pairType : null, orientation, relationStyle, intents,
    };
    if (mode === 'edit') update.mutate({ ticketCode, alias: check.alias, gender, avatarId, ...extra });
    else create.mutate({ ticketCode, alias: check.alias, gender, avatarId, zone, acceptedRules: true, ...extra });
  };

  const copy = {
    inside: { title: 'Estás adentro', body: 'Elige cómo te van a ver esta noche. Sin tu nombre real; la foto la pones después, si quieres.', cta: 'Entrar a Playmatch', busy: 'Entrando…' },
    pre: { title: 'Inscríbete en Playmatch', body: 'Deja listo tu perfil. Se activa solo cuando escaneen tu entrada en la puerta, y entras al tiro.', cta: 'Inscribirme', busy: 'Guardando…' },
    edit: { title: 'Tu perfil', body: 'Así te van a ver en la fiesta. Sin tu nombre real.', cta: 'Guardar cambios', busy: 'Guardando…' },
  }[mode];

  return (
    <div className={embedded ? 'text-white' : 'account-font account-tokens relative min-h-dvh bg-[#0b0612] px-5 pb-10 pt-[max(40px,env(safe-area-inset-top))] text-white'}>
      {!embedded && <div className="account-backdrop" />}
      <div className="relative z-10 mx-auto max-w-md">
        <h1 className={`mb-2 text-center font-bold tracking-tight ${embedded ? 'text-title2' : 'text-large-title'}`}>{copy.title}</h1>
        <p className="mb-8 text-center text-subhead text-white/70">{copy.body}</p>

        <label className={LABEL}>Tu alias</label>
        <input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          maxLength={MAX_ALIAS_LENGTH}
          placeholder="Ej: La Reina"
          className="h-13 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-body text-white placeholder:text-white/45 focus:border-pink-400/60 focus:outline-none"
        />
        <p className={`mb-6 mt-1.5 text-caption1 ${aliasError ? 'text-rose-300' : 'text-white/60'}`}>
          {aliasError ?? `${alias.length}/${MAX_ALIAS_LENGTH} · sin redes ni teléfonos`}
        </p>

        <p className={LABEL}>Soy</p>
        <div className={`grid grid-cols-2 gap-2 ${gender === 'pareja' ? 'mb-2' : 'mb-6'}`}>
          {PARTY_GENDERS.map((g) => (
            <button key={g} type="button" aria-pressed={gender === g} onClick={() => setGender(g)} className={`${PILL} ${gender === g ? SELECTED : IDLE}`}>
              {GENDER_LABELS[g]}
            </button>
          ))}
        </div>
        {gender === 'pareja' && (
          <div className="mb-6 grid grid-cols-3 gap-2">
            {PAIR_TYPES.map((t) => (
              <button key={t} type="button" aria-pressed={pairType === t} onClick={() => setPairType(t)} className={`${PILL} text-footnote ${pairType === t ? SELECTED : IDLE}`}>
                {PAIR_LABELS[t]}
              </button>
            ))}
          </div>
        )}

        <p className={LABEL}>Quiero conocer</p>
        <div className="mb-1.5 grid grid-cols-2 gap-2">
          {LOOKING_FOR_KEYS.map((g) => (
            <button key={g} type="button" aria-pressed={lookingFor.includes(g)} onClick={() => toggleLooking(g)}
              className={`${PILL} text-footnote ${lookingFor.includes(g) ? SELECTED : IDLE}`}>
              {LOOKING_LABELS[g]}
            </button>
          ))}
        </div>
        <p className="mb-6 text-caption1 text-white/60">En el swipe solo te aparece quien tú buscas y que también busca a alguien como tú.</p>

        <p className={LABEL}>Esta noche busco {OPTIONAL}</p>
        <div className="mb-1.5 flex flex-wrap gap-2">
          {INTENTS.map((i) => (
            <button key={i} type="button" aria-pressed={intents.includes(i)} onClick={() => toggleIntent(i)}
              className={`${PILL} ${intents.includes(i) ? SELECTED : IDLE} ${!intents.includes(i) && intents.length >= MAX_INTENTS ? 'opacity-40' : ''}`}>
              <span aria-hidden>{INTENT_EMOJI[i]}</span> {INTENT_LABELS[i]}
            </button>
          ))}
        </div>
        <p className="mb-6 text-caption1 text-white/60">Hasta {MAX_INTENTS}. Primero te mostramos a quien busca lo mismo.</p>

        <p className={LABEL}>Orientación {OPTIONAL}</p>
        <div className="mb-6 flex flex-wrap gap-2">
          {ORIENTATIONS.map((o) => (
            <button key={o} type="button" aria-pressed={orientation === o} onClick={() => setOrientation(orientation === o ? null : o)} className={`${PILL} ${orientation === o ? SELECTED : IDLE}`}>
              {ORIENTATION_LABELS[o]}
            </button>
          ))}
          <button type="button" aria-pressed={orientation === null} onClick={() => setOrientation(null)} className={`${PILL} ${orientation === null ? SELECTED : IDLE}`}>Prefiero no decir</button>
        </div>

        <p className={LABEL}>Cómo me relaciono {OPTIONAL}</p>
        <div className="mb-1.5 flex flex-wrap gap-2">
          {RELATION_STYLES.map((r) => (
            <button key={r} type="button" aria-pressed={relationStyle === r} onClick={() => setRelationStyle(relationStyle === r ? null : r)} className={`${PILL} ${relationStyle === r ? SELECTED : IDLE}`}>
              {RELATION_LABELS[r]}
            </button>
          ))}
          <button type="button" aria-pressed={relationStyle === null} onClick={() => setRelationStyle(null)} className={`${PILL} ${relationStyle === null ? SELECTED : IDLE}`}>Prefiero no decir</button>
        </div>
        <p className="mb-6 text-caption1 text-white/60">Solo lo ve quien ya entró a la fiesta, y se borra cuando termina.</p>

        <label className={LABEL}>Mi disfraz <span className="normal-case tracking-normal text-white/60">· opcional</span></label>
        <input
          value={costume}
          onChange={(e) => setCostume(e.target.value)}
          maxLength={MAX_COSTUME_LENGTH}
          placeholder="Ej: Vampira, Joker, Los Cazafantasmas"
          className="h-13 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-body text-white placeholder:text-white/45 focus:border-pink-400/60 focus:outline-none"
        />
        <p className={`mb-6 mt-1.5 text-caption1 ${costumeError ? 'text-rose-300' : 'text-white/60'}`}>
          {costumeError ?? 'Sale grande en tu tarjeta: ayuda a que te encuentren en la fiesta.'}
        </p>

        <p className={LABEL}>Tu ficha <span className="normal-case tracking-normal text-white/60">· si no pones foto</span></p>
        <div className="mb-6 grid grid-cols-6 gap-2">
          {Array.from({ length: AVATARS_PER_GENDER }, (_, i) => i + 1).map((id) => (
            <button
              key={id}
              onClick={() => setAvatarId(id)}
              aria-label={`Color ${id}`}
              className={`rounded-full transition-transform active:scale-95 ${
                avatarId === id ? 'scale-105 ring-[3px] ring-pink-400 ring-offset-2 ring-offset-[#0b0612]' : 'opacity-60'
              }`}
            >
              <PartyAvatar gender={gender} pairType={gender === 'pareja' ? pairType : null} avatarId={id} className="w-full h-auto rounded-full" />
            </button>
          ))}
        </div>

        {/* La zona se elige adentro: antes de llegar no hay dónde estar. */}
        {mode === 'inside' && (<>
          <p className={LABEL}>¿Dónde estás ahora?</p>
          <div className="grid grid-cols-2 gap-2 mb-8">
            {PARTY_ZONES.map((z) => (
              <button
                key={z}
                onClick={() => setZone(z)}
                className={`h-11 rounded-full border text-subhead font-semibold transition-colors ${zone === z ? SELECTED : IDLE}`}
              >
                {ZONE_LABELS[z]}
              </button>
            ))}
          </div>
        </>)}

        {mode !== 'edit' && (
          <label className="mb-5 flex cursor-pointer items-start gap-3 text-footnote leading-snug text-white/70">
            <input
              type="checkbox"
              checked={rules}
              onChange={(e) => setRules(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-pink-500"
            />
            <span>
              Acepto las reglas de la casa: no comparto datos personales (redes, teléfono), no saco capturas ni fotos de
              otras personas, y lo que pasa en Playmatch se queda en la fiesta.
            </span>
          </label>
        )}

        <button
          disabled={!check.ok || !costumeCheck.ok || !rules || pending}
          onClick={submit}
          className="h-14 w-full rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-headline font-bold text-white shadow-[0_10px_28px_-8px_rgba(236,72,153,0.7),inset_0_1px_0_rgba(255,255,255,0.4)] transition-opacity disabled:opacity-40"
        >
          {pending ? copy.busy : copy.cta}
        </button>

        <p className="mt-4 text-center text-caption1 leading-snug text-white/60">
          Nadie puede escribirte sin que aceptes primero. Puedes bloquear y denunciar en cualquier momento.
        </p>
      </div>
    </div>
  );
}
