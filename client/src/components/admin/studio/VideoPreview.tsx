import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

/* Vista previa de un video del Estudio con el reproductor oficial de
 * HyperFrames (<hyperframes-player>): carga la composición en un iframe
 * aislado y la reproduce tal como se va a grabar. Se carga recién cuando se
 * abre un video, para no sumar peso al resto del panel. */

let playerReady: Promise<unknown> | null = null;

type PlayerEl = HTMLElement & { ready?: boolean; pause?: () => void; seek?: (t: number) => void };

/** `seekTo`: segundo al que salta (y queda en pausa) cada vez que cambia `n`;
 * también después de rehacerse la composición, para seguir en la escena que se edita. */
export function VideoPreview({ html, width, height, maxWidth, seekTo }: { html: string; width: number; height: number; maxWidth: number; seekTo?: { t: number; n: number } | null }) {
  const [ready, setReady] = useState(false);
  const el = useRef<PlayerEl | null>(null);
  const seekRef = useRef(seekTo);
  seekRef.current = seekTo;
  const jump = useCallback(() => {
    const p = el.current;
    const target = seekRef.current;
    if (!p || !target || !p.ready) return;
    p.pause?.();
    p.seek?.(target.t);
  }, []);
  useEffect(() => { jump(); }, [seekTo?.n, jump]);
  const attach = useCallback((node: PlayerEl | null) => {
    el.current = node;
    node?.addEventListener('ready', jump);
  }, [jump]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    playerReady ??= import('@hyperframes/player');
    playerReady.then(() => alive && setReady(true), () => {
      playerReady = null;
      if (alive) setFailed(true);
    });
    return () => { alive = false; };
  }, []);

  const box = { width: '100%', maxWidth, aspectRatio: `${width} / ${height}` };
  if (failed) return <div className="mx-auto rounded-lg bg-muted p-4 text-sm text-muted-foreground" style={box}>No se pudo cargar el reproductor. Revisa la conexión y vuelve a abrir el video.</div>;
  if (!ready) return <div className="mx-auto flex items-center justify-center rounded-lg bg-muted" style={box}><Loader2 className="w-5 h-5 animate-spin" /></div>;
  // `key`: con otra composición se monta un reproductor nuevo (parte desde el segundo 0).
  return createElement('hyperframes-player', {
    key: html.length + ':' + hash(html),
    srcdoc: html,
    width,
    height,
    controls: true,
    muted: true,
    loop: true,
    ref: attach,
    style: { display: 'block', margin: '0 auto', borderRadius: 12, overflow: 'hidden', background: '#000', ...box },
  });
}

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}
