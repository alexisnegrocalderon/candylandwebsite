import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Minus, Plus, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BRAND_COLORS, FONT_SIZE_MAX, FONT_SIZE_MIN, FONT_SIZE_STEP, normalizeHex } from '@shared/slideEdit';
import type { StudioFormat } from '@shared/contentStudio';
import { SlideFrame } from './SlideFrame';
import {
  describe, getBoard, installEditorStyle, pickTarget, readStyle, readText, select, serializeBoard, setBackground, setFontSize,
  setTextColor, writeText, type StyleModel, type TextModel,
} from './slideEdit';

/* Editor a mano de UNA lámina del Diseñador IA: se toca un texto (o el fondo)
 * en la propia lámina y un panel deja cambiar su texto, tamaño y colores, sin
 * gastar IA. Los cambios se ven al instante en la lámina; «Guardar» manda el
 * HTML resultante al servidor (que lo sanea y deja una versión para volver). */

/** Los cambios seguidos del MISMO tipo sobre el MISMO elemento (escribir, mover
 * el control de tamaño) se juntan en un solo paso de «Deshacer»; cualquier otra
 * cosa es un paso aparte. */
const HISTORY_COALESCE_MS = 700;
const HISTORY_MAX = 40;

type ChangeKind = 'text' | 'size' | 'color' | 'background';

interface Selection {
  el: HTMLElement;
  isBoard: boolean;
  label: string;
  text: TextModel;
  style: StyleModel;
  hasText: boolean;
}

function ColorRow({ label, value, onPick, onClear }: { label: string; value: string | null; onPick: (hex: string) => void; onClear?: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {onClear && <button type="button" className="text-xs underline text-muted-foreground" onClick={onClear}>Quitar</button>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {BRAND_COLORS.map((c) => {
          const active = value === c.hex.toLowerCase();
          return (
            <button
              key={c.hex}
              type="button"
              title={c.name}
              aria-label={`${label}: ${c.name}`}
              aria-pressed={active}
              onClick={() => onPick(c.hex.toLowerCase())}
              className={`h-9 w-9 rounded-full border shadow-sm ${active ? 'ring-2 ring-primary ring-offset-2' : ''}`}
              style={{ background: c.hex }}
            />
          );
        })}
        <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border text-xs text-muted-foreground" title="Otro color">
          <span aria-hidden>+</span>
          <input
            type="color"
            aria-label={`${label}: otro color`}
            value={value ?? '#000000'}
            onChange={(e) => { const hex = normalizeHex(e.target.value); if (hex) onPick(hex); }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}

export function SlideEditor({ css, format, html, width, saving, onSave, onCancel }: {
  css: string;
  format: StudioFormat;
  html: string;
  /** Ancho en pantalla de la lámina (px). */
  width: number;
  saving: boolean;
  onSave: (html: string) => void;
  onCancel: () => void;
}) {
  const docRef = useRef<Document | null>(null);
  const history = useRef<{ html: string; at: number; el: HTMLElement | null; kind: ChangeKind }[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [text, setText] = useState('');

  const refresh = useCallback((el: HTMLElement | null) => {
    const doc = docRef.current;
    const board = doc && getBoard(doc);
    if (!doc || !board || !el) { setSelection(null); return; }
    const model = readText(el);
    setSelection({
      el,
      isBoard: el === board,
      label: describe(board, el),
      text: model,
      style: readStyle(el),
      hasText: el !== board && (el.textContent ?? '').trim().length > 0,
    });
    setText(model.text);
  }, []);

  /** Se guarda el estado ANTES de cambiarlo, así «Deshacer» vuelve a él. */
  const remember = useCallback((el: HTMLElement, kind: ChangeKind) => {
    const doc = docRef.current;
    if (!doc) return;
    const now = Date.now();
    const last = history.current[history.current.length - 1];
    if (last && last.el === el && last.kind === kind && now - last.at < HISTORY_COALESCE_MS) { last.at = now; return; }
    history.current.push({ html: doc.body.innerHTML, at: now, el, kind });
    if (history.current.length > HISTORY_MAX) history.current.shift();
    setCanUndo(true);
  }, []);

  const mutate = useCallback((kind: ChangeKind, change: (el: HTMLElement) => void) => {
    if (!selection) return;
    remember(selection.el, kind);
    change(selection.el);
    setDirty(true);
    refresh(selection.el);
  }, [selection, remember, refresh]);

  const undo = () => {
    const doc = docRef.current;
    const prev = history.current.pop();
    if (!doc || !prev) return;
    doc.body.innerHTML = prev.html;
    setCanUndo(history.current.length > 0);
    setDirty(history.current.length > 0);
    setSelection(null);
  };

  const onDocReady = useCallback((doc: Document) => {
    docRef.current = doc;
    installEditorStyle(doc);
    history.current = [];
    setCanUndo(false);
    setDirty(false);
    setSelection(null);
    doc.addEventListener('click', (e) => {
      const board = getBoard(doc);
      if (!board) return;
      e.preventDefault();
      e.stopPropagation();
      const el = pickTarget(board, e.target);
      select(board, el);
      refresh(el);
    }, true);
  }, [refresh]);

  // Al salir con cambios sin guardar el navegador avisa.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = () => {
    const doc = docRef.current;
    const out = doc && serializeBoard(doc);
    if (out) onSave(out);
  };

  const cancel = () => {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
    onCancel();
  };

  const style = selection?.style;
  const stepSize = (delta: number) => mutate('size', (el) => setFontSize(el, (style?.fontSize ?? 0) + delta));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Toca un texto o el fondo de la lámina para cambiarlo.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={undo} disabled={!canUndo || saving}><Undo2 className="w-4 h-4 mr-1" /> Deshacer</Button>
          <Button size="sm" variant="outline" onClick={cancel} disabled={saving}><X className="w-4 h-4 mr-1" /> Cancelar</Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />} Guardar cambios
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-start">
        <div className="mx-auto" style={{ width }}>
          <SlideFrame css={css} format={format} slide={{ html }} width={width} interactive onDocReady={onDocReady} className="rounded-xl shadow-sm" />
        </div>

        <div className="rounded-2xl border p-4 space-y-4 min-w-0">
          {!selection ? (
            <p className="text-sm text-muted-foreground">Nada elegido todavía. Toca el título, un texto, una píldora o el fondo.</p>
          ) : (
            <>
              {!selection.isBoard && <p className="text-sm font-medium break-words">{selection.label}</p>}

              {selection.text.editable && !selection.isBoard && (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-text">Texto</Label>
                  <Textarea
                    id="edit-text"
                    rows={3}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      remember(selection.el, 'text');
                      writeText(selection.el, e.target.value);
                      setDirty(true);
                    }}
                  />
                  {selection.text.partial && (
                    <p className="text-xs text-muted-foreground">Este bloque tiene partes con otro estilo (como la letra a/b): solo cambia su texto principal.</p>
                  )}
                </div>
              )}

              {selection.hasText && style && (
                <>
                  <div className="space-y-1.5">
                    <Label>Tamaño de letra</Label>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="icon" variant="outline" aria-label="Más chica" onClick={() => stepSize(-FONT_SIZE_STEP)}><Minus className="w-4 h-4" /></Button>
                      <input
                        type="range"
                        aria-label="Tamaño de letra"
                        min={FONT_SIZE_MIN}
                        max={FONT_SIZE_MAX}
                        step={2}
                        value={Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, style.fontSize))}
                        onChange={(e) => mutate('size', (el) => setFontSize(el, Number(e.target.value)))}
                        className="flex-1"
                      />
                      <Button type="button" size="icon" variant="outline" aria-label="Más grande" onClick={() => stepSize(FONT_SIZE_STEP)}><Plus className="w-4 h-4" /></Button>
                      <span className="w-14 text-right text-sm tabular-nums">{style.fontSize} px</span>
                    </div>
                  </div>
                  <ColorRow label="Color del texto" value={style.color} onPick={(hex) => mutate('color', (el) => setTextColor(el, hex))} />
                </>
              )}

              <ColorRow
                label={selection.isBoard ? 'Fondo de la lámina' : 'Fondo de este bloque'}
                value={style?.background ?? null}
                onPick={(hex) => mutate('background', (el) => setBackground(el, hex))}
                onClear={selection.isBoard ? undefined : () => mutate('background', (el) => setBackground(el, null))}
              />

              {!selection.isBoard && (
                <button type="button" className="text-xs underline text-muted-foreground" onClick={() => {
                  const doc = docRef.current;
                  const board = doc && getBoard(doc);
                  if (board) { select(board, board); refresh(board); }
                }}>
                  Cambiar el fondo de toda la lámina
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

