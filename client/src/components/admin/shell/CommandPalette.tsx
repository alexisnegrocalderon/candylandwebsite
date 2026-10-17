import { useEffect, useMemo, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SECTION_KEYWORDS, normalizeSearch, type AdminHub, type ShellSection } from './nav';

/** Buscador Ctrl+K: salta a cualquier sección escribiendo su nombre, su hub
 * o cómo la diría el dueño ("impuestos" → SII). */
export function CommandPalette({ open, onOpenChange, sections, hubs, onSelect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: ShellSection[];
  hubs: AdminHub[];
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  useEffect(() => { if (open) { setQuery(''); setCursor(0); } }, [open]);

  const hubLabel = (id: string) => hubs.find((h) => h.id === id)?.label ?? '';

  const results = useMemo(() => {
    const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return sections;
    return sections.filter((s) => {
      const haystack = normalizeSearch(`${s.label} ${hubLabel(s.hub)} ${SECTION_KEYWORDS[s.id] ?? ''}`);
      return terms.every((t) => haystack.includes(t));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sections]);

  useEffect(() => { setCursor(0); }, [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); onSelect(results[cursor].id); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="admin-glass-sheet top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg [&>button]:hidden">
        <DialogTitle className="sr-only">Buscar en el panel</DialogTitle>
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar sección… (ej. descuentos, impuestos, instagram)"
            className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul className="max-h-[60dvh] overflow-y-auto p-2" role="listbox">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nada coincide con “{query}”.</li>}
          {results.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => onSelect(s.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === cursor ? 'bg-white/10' : ''}`}
              >
                <s.icon className="h-4 w-4 shrink-0 text-primary" />
                <span className="flex-1 truncate text-[15px]">{s.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{hubLabel(s.hub)}</span>
                {i === cursor && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
