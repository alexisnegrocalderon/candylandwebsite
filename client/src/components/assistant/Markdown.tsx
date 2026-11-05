import { Fragment } from 'react';
import { parseMarkdown, type Inline } from '@shared/miniMarkdown';

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => p.t === 'bold' ? <strong key={i} className="font-semibold text-foreground">{p.v}</strong>
        : p.t === 'italic' ? <em key={i}>{p.v}</em>
        : p.t === 'code' ? <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{p.v}</code>
        : <Fragment key={i}>{p.v}</Fragment>)}
    </>
  );
}

/** Las respuestas del asistente: markdown mínimo dibujado con elementos (nunca HTML del texto). */
export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        if (b.kind === 'heading') return <p key={i} className={`font-heading ${b.level === 1 ? 'text-lg' : 'text-base'} font-semibold`}><Inlines parts={b.inline} /></p>;
        if (b.kind === 'paragraph') return <p key={i}><Inlines parts={b.inline} /></p>;
        if (b.kind === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul';
          return <Tag key={i} className={`space-y-1 pl-5 ${b.ordered ? 'list-decimal' : 'list-disc'}`}>{b.items.map((it, j) => <li key={j}><Inlines parts={it} /></li>)}</Tag>;
        }
        return (
          <div key={i} className="-mx-1 overflow-x-auto px-1">
            <table className="w-full border-collapse text-sm tabular-nums">
              <thead><tr>{b.header.map((h, j) => <th key={j} className="border-b border-border px-2 py-1.5 font-semibold" style={{ textAlign: b.align[j] ?? 'left' }}><Inlines parts={h} /></th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j} className="odd:bg-muted/40">{r.map((c, k) => <td key={k} className="px-2 py-1.5" style={{ textAlign: b.align[k] ?? 'left' }}><Inlines parts={c} /></td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
