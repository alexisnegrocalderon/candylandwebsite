import { Dices, Lock, Palette, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MOTION_ACCENTS, MOTION_BASES, type MotionAccent, type MotionBase, type MotionSpec } from '@shared/motionSpec';
import {
  LOOK_ALL_AUTO, LOOK_AUTO_VALUE, LOOK_OPTION_LABEL, LOOK_OPTIONS, LOOK_PART_LABEL, LOOK_PARTS, freshSeed, lookHasAuto, lookSignature, lookSummary, resolveLook,
  styleHasEntry, type LookPart, type MotionLook,
} from '@shared/motionVariety';
import { recentLooks } from './lookMemory';

/* «Look del video»: lo que cambia entre dos videos del mismo estilo. Cada fila es una parte (transición, entrada del
 * texto, trama, adornos, cámara, etiqueta) con sus opciones como botones. «Auto» deja que la elija la semilla, y
 * «Sorpréndeme» cambia la semilla por una cuyo look no se parezca al actual ni a los últimos videos. Nada de esto
 * gasta IA: la vista previa se rehace sola. */

const PART_HINT: Record<LookPart, string> = {
  cut: 'Cómo se pasa de una escena a la siguiente.',
  entry: 'Cómo aparece cada palabra del titular.',
  texture: 'Dibujo suave sobre el fondo.',
  deco: 'Detalles Playroom alrededor del texto.',
  camera: 'El movimiento de todo el cuadro.',
  kicker: 'La forma de la etiqueta chica de arriba.',
};

/** Otro fondo y otro acento de marca. PLAYMORE (noche, arcade) no sale de su paleta. */
function shuffleColors(spec: MotionSpec): { base: MotionBase; accent: MotionAccent } {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
  if (spec.base === 'arcade' || spec.style === 'arcade') return { base: 'arcade', accent: pick((['magenta', 'celeste', 'oro'] as const).filter((a) => a !== spec.accent)) };
  if (spec.base === 'noche') return { base: 'noche', accent: pick((['rosa', 'oro', 'magenta', 'celeste'] as const).filter((a) => a !== spec.accent)) };
  // Liquid y glitch pintan el titular en claro con brillo: solo se leen bien sobre los fondos de color.
  const vivid = spec.style === 'liquid' || spec.style === 'glitch';
  const base = pick(MOTION_BASES.filter((b) => b !== 'noche' && b !== 'arcade' && b !== spec.base && !(vivid && (b === 'perla' || b === 'niebla'))));
  // El acento no puede ser el color del fondo ni el oro (solo PLAYMORE).
  const same: Partial<Record<MotionBase, MotionAccent>> = { azul: 'celeste', rosa: 'rosa', tinta: 'tinta' };
  return { base, accent: pick(MOTION_ACCENTS.filter((a) => a !== 'oro' && a !== same[base])) };
}

function Chip({ active, hinted, onClick, children }: { active: boolean; hinted?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-10 shrink-0 snap-start whitespace-nowrap rounded-full border px-3.5 text-xs font-medium transition-colors ${
        active ? 'border-primary bg-primary text-primary-foreground' : hinted ? 'border-dashed border-primary/70 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}

export function LookPanel({ clean, onChange }: {
  /** El video ya limpio (normalizeMotionSpec): de acá sale lo que eligió la semilla. */
  clean: MotionSpec;
  onChange: (patch: Partial<MotionSpec>) => void;
}) {
  const look = clean.look;
  const resolved = resolveLook(clean);
  const parts = LOOK_PARTS.filter((p) => p !== 'entry' || styleHasEntry(clean.style));
  const setPart = (part: LookPart, value: string) => onChange({ look: { ...look, [part]: value } as MotionLook });

  const surprise = () => {
    // Un video sin nada en automático (los de antes) pasa a automático: si no, la semilla no tendría qué cambiar.
    const next = lookHasAuto(look) ? look : LOOK_ALL_AUTO;
    const seed = freshSeed({ style: clean.style, look: next }, [lookSignature(clean), ...recentLooks()]);
    onChange({ look: next, seed });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4" /> Look del video</p>
        <Button type="button" size="sm" className="h-10" onClick={surprise}><Dices className="mr-1.5 h-4 w-4" /> Sorpréndeme</Button>
        <Button type="button" size="sm" variant="outline" className="h-10" onClick={() => onChange(shuffleColors(clean))}><Palette className="mr-1.5 h-4 w-4" /> Otros colores</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Ahora:</span> {lookSummary(clean)}. «Sorpréndeme» arma otra combinación (y otras composiciones) sin repetir las de tus últimos videos. Gratis, sin IA.
      </p>
      <div className="space-y-2.5">
        {parts.map((part) => {
          const value = look[part];
          const options = LOOK_OPTIONS[part] as readonly string[];
          const labels = LOOK_OPTION_LABEL[part] as Record<string, string>;
          return (
            <div key={part} className="space-y-1">
              <p className="text-xs"><span className="font-medium">{LOOK_PART_LABEL[part]}</span> <span className="text-muted-foreground">· {PART_HINT[part]}</span></p>
              <div className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
                <Chip active={value === LOOK_AUTO_VALUE} onClick={() => setPart(part, LOOK_AUTO_VALUE)}>Auto</Chip>
                {options.map((o) => (
                  <Chip key={o} active={value === o} hinted={value === LOOK_AUTO_VALUE && resolved[part] === o} onClick={() => setPart(part, o)}>{labels[o]}</Chip>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" className="h-10" disabled={!lookHasAuto(look)} onClick={() => onChange({ look: resolved })}>
          <Lock className="mr-1.5 h-4 w-4" /> Fijar este look
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-10" disabled={LOOK_PARTS.every((p) => look[p] === LOOK_AUTO_VALUE)} onClick={() => onChange({ look: LOOK_ALL_AUTO })}>
          Todo en automático
        </Button>
        <span className="text-[11px] text-muted-foreground">El borde punteado marca lo que eligió «Auto».</span>
      </div>
    </div>
  );
}
