import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { PartyAvatar } from '@/components/party/Avatar';
import {
  AVATARS_PER_GENDER, MAX_ALIAS_LENGTH, PARTY_GENDERS, PARTY_ZONES,
  ZONE_LABELS, sanitizeAlias, type PartyGender, type PartyZone,
} from '@shared/party';

/* El formulario del perfil de Playmatch. Vive acá (y no en pages/Party.tsx)
 * porque también lo usa la app de «Mi cuenta» para la inscripción
 * anticipada, que carga la hoja pública de estilos; admin.css lo declara
 * con @source para la página /fiesta. */

const LABEL = 'mb-2 block text-footnote font-semibold uppercase tracking-wide text-white/60';
const SELECTED = 'border-pink-400/70 bg-pink-500/20 text-white';
const IDLE = 'border-white/15 bg-white/[0.04] text-white/70';

export const GENDER_LABELS: Record<PartyGender, string> = {
  hombre: 'Hombre',
  mujer: 'Mujer',
  pareja: 'Pareja',
};

/** El perfil de Playmatch. `inside`: recién entró a la fiesta. `pre`: inscripción anticipada desde la
 * app (queda invisible hasta que escaneen su entrada). `edit`: cambiar alias, género o avatar.
 * `embedded`: dentro de una pantalla de la app (sin fondo ni alto propio). */
export function CreateProfile({ ticketCode, onCreated, mode = 'inside', initial, embedded }: {
  ticketCode: string;
  onCreated: () => void;
  mode?: 'inside' | 'pre' | 'edit';
  initial?: { alias: string; gender: PartyGender; avatarId: number };
  embedded?: boolean;
}) {
  const [alias, setAlias] = useState(initial?.alias ?? '');
  const [gender, setGender] = useState<PartyGender>(initial?.gender ?? 'mujer');
  const [avatarId, setAvatarId] = useState(initial?.avatarId ?? 1);
  const [zone, setZone] = useState<PartyZone>('living');
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
  const submit = () => {
    if (!check.ok || !rules) return;
    if (mode === 'edit') update.mutate({ ticketCode, alias: check.alias, gender, avatarId });
    else create.mutate({ ticketCode, alias: check.alias, gender, avatarId, zone, acceptedRules: true });
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

        <p className={LABEL}>Vengo como</p>
        <div className="grid grid-cols-3 gap-2 mb-6">
          {PARTY_GENDERS.map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`h-11 rounded-full border text-subhead font-semibold transition-colors ${gender === g ? SELECTED : IDLE}`}
            >
              {GENDER_LABELS[g]}
            </button>
          ))}
        </div>

        <p className={LABEL}>Tu avatar <span className="normal-case tracking-normal text-white/60">· si no pones foto</span></p>
        <div className="grid grid-cols-4 gap-3 mb-6">
          {Array.from({ length: AVATARS_PER_GENDER }, (_, i) => i + 1).map((id) => (
            <button
              key={id}
              onClick={() => setAvatarId(id)}
              aria-label={`Avatar ${id}`}
              className={`rounded-full transition-transform active:scale-95 ${
                avatarId === id ? 'scale-105 ring-[3px] ring-pink-400 ring-offset-2 ring-offset-[#0b0612]' : 'opacity-60'
              }`}
            >
              <PartyAvatar gender={gender} avatarId={id} className="w-full h-auto rounded-full" />
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
          disabled={!check.ok || !rules || pending}
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
