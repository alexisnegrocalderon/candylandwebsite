import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowRight, Instagram, RotateCcw, Sparkles } from 'lucide-react';

/* Quiz genérico de puntaje: preguntas de opción múltiple, cada opción suma
 * puntos, y al final un rango de puntaje decide el resultado. Extraído de
 * QueSonLasFiestasLiberales.tsx (donde nació) para que otra página pueda
 * reusar el mismo componente con su propio contenido, en vez de duplicar el
 * ~mismo código con preguntas distintas. */

export type Opcion = { label: string; puntos: number };
export type Pregunta = { id: string; texto: string; opciones: Opcion[] };
export type Resultado = {
  titulo: string;
  copy: string;
  ctaLabel: string;
  ctaHref: string;
};

export function Quiz({
  preguntas,
  resultadoPara,
}: {
  preguntas: Pregunta[];
  resultadoPara: (puntaje: number) => Resultado;
}) {
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const respondidas = Object.keys(respuestas).length;
  const terminado = respondidas === preguntas.length;
  const puntaje = useMemo(() => Object.values(respuestas).reduce((a, b) => a + b, 0), [respuestas]);
  const progreso = Math.round((respondidas / preguntas.length) * 100);

  const elegir = (preguntaId: string, puntos: number) => {
    setRespuestas((prev) => ({ ...prev, [preguntaId]: puntos }));
  };

  const reiniciar = () => setRespuestas({});

  return (
    <div className="glass-candy rounded-3xl p-6 md:p-10">
      <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-8">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progreso}%` }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="h-full rounded-full bg-gradient-to-r from-primary via-cherry to-violet-electric relative overflow-hidden"
        >
          <span className="absolute inset-0 candy-bar-shine" />
        </motion.div>
      </div>

      <AnimatePresence mode="wait">
        {!terminado ? (
          <motion.div
            key="preguntas"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-8"
          >
            {preguntas.map((p, i) => {
              const yaRespondida = respuestas[p.id] !== undefined;
              const esSiguiente = i === respondidas;
              if (i > respondidas) return null;
              return (
                <div key={p.id} className={esSiguiente || yaRespondida ? '' : 'opacity-40'}>
                  <p className="font-heading font-bold text-lg md:text-xl mb-4">
                    {i + 1}. {p.texto}
                  </p>
                  <div className="grid gap-3">
                    {p.opciones.map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => elegir(p.id, o.puntos)}
                        disabled={yaRespondida}
                        className={`btn-jelly interactive text-left px-5 py-3.5 rounded-2xl border transition-colors ${
                          respuestas[p.id] === o.puntos
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card border-border/50 hover:border-primary/40 disabled:opacity-50'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key="resultado"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="text-center"
          >
            <div className="relative w-16 h-16 mx-auto mb-5 flex items-center justify-center">
              <div aria-hidden className="absolute inset-0 rounded-full bg-primary/30 blur-xl candy-glow-pulse" />
              <div className="relative w-12 h-12 rounded-full glass-candy flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
            </div>
            {(() => {
              const r = resultadoPara(puntaje);
              const esInterno = r.ctaHref.startsWith('/');
              return (
                <>
                  <p className="font-heading font-extrabold text-2xl md:text-3xl text-gradient-candy mb-3">
                    {r.titulo}
                  </p>
                  <p className="text-muted-foreground max-w-md mx-auto mb-7">{r.copy}</p>
                  {esInterno ? (
                    <Link
                      href={r.ctaHref}
                      className="btn-jelly inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-bold interactive"
                    >
                      {r.ctaLabel} <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <a
                      href={r.ctaHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-jelly inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-bold interactive"
                    >
                      <Instagram className="w-4 h-4" /> {r.ctaLabel}
                    </a>
                  )}
                </>
              );
            })()}
            <button
              type="button"
              onClick={reiniciar}
              className="mt-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors interactive mx-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Responder de nuevo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
