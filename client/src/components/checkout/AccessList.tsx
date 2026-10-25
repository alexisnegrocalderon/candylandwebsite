import { ChevronRight, Lock, User } from 'lucide-react';

/* «¿Con quién vienes?» de la compra dentro de la app: una lista agrupada estilo
 * Ajustes de iPhone. Cada fila lleva un ícono de vidrio con las personas que
 * entran (rosa = mujer, celeste = hombre, violeta = cualquiera), el nombre, quiénes
 * son y el precio a la derecha. Las que piden código de comunidad van aparte, en
 * su propia sección con candado. */

export type Person = 'f' | 'm' | 'x';

export interface AccessRow {
  key: string;
  label: string;
  sub: string;
  people: Person[];
  /** Lo que se paga hoy por este acceso (null = sin precio a la vista). */
  price: number | null;
  /** Precio general tachado (preventa / Misión 300). */
  original?: number | null;
  soldOut?: boolean;
  needsCode?: boolean;
  active?: boolean;
}

const PERSON_COLOR: Record<Person, string> = {
  f: 'text-pink-300',
  m: 'text-sky-300',
  x: 'text-violet-300',
};

const TINT: Record<string, string> = {
  f: 'from-pink-500/35 to-pink-400/10',
  m: 'from-sky-500/35 to-sky-400/10',
  fm: 'from-pink-500/30 via-violet-500/20 to-sky-500/30',
};

function tintFor(people: Person[]): string {
  const set = new Set(people);
  if (set.size === 1 && set.has('f')) return TINT.f;
  if (set.size === 1 && set.has('m')) return TINT.m;
  return TINT.fm;
}

/** Ícono de vidrio con las personas del acceso, solapadas como un grupo. */
export function AccessGlyph({ people, size = 52 }: { people: Person[]; size?: number }) {
  const n = people.length;
  const icon = n <= 1 ? 26 : n === 2 ? 21 : n === 3 ? 17 : 15;
  const overlap = n <= 1 ? 0 : -Math.round(icon * 0.38);
  return (
    <span
      aria-hidden
      className={`lg-pill relative grid shrink-0 place-items-center overflow-hidden rounded-[16px] bg-gradient-to-br ${tintFor(people)}`}
      style={{ width: size, height: size }}
    >
      <span className="flex items-center">
        {people.map((p, i) => (
          <User key={i} className={`${PERSON_COLOR[p]} drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]`} style={{ width: icon, height: icon, marginLeft: i === 0 ? 0 : overlap }} strokeWidth={2.4} />
        ))}
      </span>
    </span>
  );
}

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

function Row({ row, onSelect }: { row: AccessRow; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={row.soldOut}
      aria-pressed={!!row.active}
      className={`flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors active:bg-white/10 disabled:opacity-45 ${row.active ? 'bg-white/[0.08]' : ''}`}
    >
      <AccessGlyph people={row.people} />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold leading-tight text-white">{row.label}</span>
        <span className="mt-0.5 block truncate text-footnote text-white/60">{row.sub}</span>
      </span>
      <span className="shrink-0 text-right">
        {row.soldOut ? (
          <span className="text-subhead font-semibold text-white/60">Agotado</span>
        ) : row.price != null ? (
          <>
            <span className="block text-headline font-semibold tabular-nums text-white">{row.price === 0 ? 'Gratis' : clp(row.price)}</span>
            {row.original != null && row.original > row.price && <span className="block text-caption1 tabular-nums text-white/45 line-through">{clp(row.original)}</span>}
          </>
        ) : null}
      </span>
      {row.needsCode ? <Lock className="h-4 w-4 shrink-0 text-white/40" /> : <ChevronRight className="h-5 w-5 shrink-0 text-white/35" />}
    </button>
  );
}

function Group({ rows, onSelect }: { rows: AccessRow[]; onSelect: (key: string) => void }) {
  return (
    <div className="account-glass overflow-hidden rounded-[22px] divide-y divide-white/[0.08]">
      {rows.map((r) => <Row key={r.key} row={r} onSelect={() => onSelect(r.key)} />)}
    </div>
  );
}

export function AccessList({ rows, onSelect, footnote, codedNote }: { rows: AccessRow[]; onSelect: (key: string) => void; footnote?: string; codedNote?: string }) {
  const open = rows.filter((r) => !r.needsCode);
  const coded = rows.filter((r) => r.needsCode);
  return (
    <div className="space-y-6">
      <section>
        <Group rows={open} onSelect={onSelect} />
        {footnote && <p className="mt-2 px-4 text-footnote text-white/50">{footnote}</p>}
      </section>
      {coded.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 px-4 text-footnote font-semibold uppercase tracking-wide text-white/55">
            <Lock className="h-3.5 w-3.5" /> Con código de comunidad
          </h2>
          <Group rows={coded} onSelect={onSelect} />
          <p className="mt-2 px-4 text-footnote text-white/50">{codedNote ?? 'Para quienes ya son parte de PlayRoom. Si no tienes tu código, lo pides por WhatsApp en el paso siguiente.'}</p>
        </section>
      )}
    </div>
  );
}
