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
    inside: { title: 'Estás adentro', body: 'Elige cómo te van a ver esta noche. Sin fotos y sin tu nombre real.', cta: 'Entrar a Playmatch', busy: 'Entrando…' },
    pre: { title: 'Inscríbete en Playmatch', body: 'Deja listo tu perfil. Se activa solo cuando escaneen tu entrada en la puerta, y entras al tiro.', cta: 'Inscribirme', busy: 'Guardando…' },
    edit: { title: 'Tu perfil', body: 'Así te van a ver en la fiesta. Sin fotos y sin tu nombre real.', cta: 'Guardar cambios', busy: 'Guardando…' },
  }[mode];

  return (
    <div className={embedded ? 'text-white' : 'min-h-dvh bg-[#120a11] text-white px-5 py-10'}>
      <div className="max-w-md mx-auto">
        {!embedded && <p className="text-4xl text-center mb-3" aria-hidden>🍬</p>}
        <h1 className={`font-heading font-extrabold tracking-tight text-center mb-2 ${embedded ? 'text-2xl' : 'text-3xl'}`}>{copy.title}</h1>
        <p className="text-white/50 text-sm text-center mb-8">{copy.body}</p>

        <label className="block text-xs uppercase tracking-wide text-white/50 mb-2">Tu alias</label>
        <input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          maxLength={MAX_ALIAS_LENGTH}
          placeholder="Ej: La Reina"
          className="w-full h-13 px-4 rounded-2xl bg-white/[0.06] border border-white/15 text-white text-base placeholder:text-white/25 focus:border-primary/60 focus:outline-none"
        />
        <p className={`text-xs mt-1.5 mb-6 ${aliasError ? 'text-red-400' : 'text-white/30'}`}>
          {aliasError ?? `${alias.length}/${MAX_ALIAS_LENGTH} · sin redes ni teléfonos`}
        </p>

        <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Vengo como</p>
        <div className="grid grid-cols-3 gap-2 mb-6">
          {PARTY_GENDERS.map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`h-11 rounded-2xl text-sm font-semibold border transition-colors ${
                gender === g ? 'bg-primary/20 border-primary/60 text-white' : 'border-white/12 text-white/55'
              }`}
            >
              {GENDER_LABELS[g]}
            </button>
          ))}
        </div>

        <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Tu avatar</p>
        <div className="grid grid-cols-4 gap-3 mb-6">
          {Array.from({ length: AVATARS_PER_GENDER }, (_, i) => i + 1).map((id) => (
            <button
              key={id}
              onClick={() => setAvatarId(id)}
              aria-label={`Avatar ${id}`}
              className={`rounded-full transition-transform active:scale-95 ${
                avatarId === id ? 'ring-3 ring-primary scale-105' : 'opacity-55'
              }`}
            >
              <PartyAvatar gender={gender} avatarId={id} className="w-full h-auto rounded-full" />
            </button>
          ))}
        </div>

        {/* La zona se elige adentro: antes de llegar no hay dónde estar. */}
        {mode === 'inside' && (<>
          <p className="text-xs uppercase tracking-wide text-white/50 mb-2">¿Dónde estás ahora?</p>
          <div className="grid grid-cols-2 gap-2 mb-8">
            {PARTY_ZONES.map((z) => (
              <button
                key={z}
                onClick={() => setZone(z)}
                className={`h-11 rounded-2xl text-sm font-semibold border transition-colors ${
                  zone === z ? 'bg-primary/20 border-primary/60 text-white' : 'border-white/12 text-white/55'
                }`}
              >
                {ZONE_LABELS[z]}
              </button>
            ))}
          </div>
        </>)}

        {mode !== 'edit' && (
          <label className="flex items-start gap-3 mb-5 text-xs text-white/60 leading-relaxed cursor-pointer">
            <input
              type="checkbox"
              checked={rules}
              onChange={(e) => setRules(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
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
          className="w-full h-14 rounded-full bg-primary text-white font-bold text-base disabled:opacity-35 transition-opacity"
        >
          {pending ? copy.busy : copy.cta}
        </button>

        <p className="text-[11px] text-white/30 text-center mt-4 leading-relaxed">
          Nadie puede escribirte sin que aceptes primero. Puedes bloquear y denunciar en cualquier momento.
        </p>
      </div>
    </div>
  );
}
