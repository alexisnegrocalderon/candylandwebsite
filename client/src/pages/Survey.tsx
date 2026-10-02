import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { motion } from 'framer-motion';
import { Star, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

/* Encuesta post-fiesta (server/eventSurvey.ts): la persona llega desde el
 * link personal de su correo (/encuesta/:token). Una sola respuesta por
 * link. Nunca muestra ni pide nombre ni correo. */

const STAR_LABELS = ['Mala', 'Regular', 'Buena', 'Muy buena', 'Increíble'];

/** Lo que muestra el correo de prueba que se manda el dueño. */
const PREVIEW_TOKEN = 'prueba';

export default function Survey() {
  const [, params] = useRoute('/encuesta/:token');
  const token = params?.token ?? '';
  useSeo({
    title: '¿Cómo estuvo la fiesta? — Mansion Playroom',
    description: 'Cuéntanos cómo estuvo la fiesta.',
    path: '/encuesta',
    noindex: true,
  });

  const isPreview = token === PREVIEW_TOKEN;
  const query = trpc.survey.get.useQuery({ token }, { retry: false, enabled: token.length > 0 && !isPreview });
  const submit = trpc.survey.submit.useMutation();

  const [rating, setRating] = useState(0);
  const [liked, setLiked] = useState('');
  const [improve, setImprove] = useState('');
  const [done, setDone] = useState(false);

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen pt-24 pb-16 flex items-start justify-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg mx-auto px-4"
      >
        {children}
      </motion.div>
    </div>
  );

  const message = (icon: React.ReactNode, title: string, text: string) =>
    shell(
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">{icon}</div>
        <h1 className="font-heading text-3xl md:text-4xl mb-3">{title}</h1>
        <p className="text-muted-foreground mb-8">{text}</p>
        <Link href="/eventos" className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-semibold interactive">
          Ver próximos eventos
        </Link>
      </div>,
    );

  if (isPreview) {
    return message(<AlertTriangle className="h-8 w-8 text-primary" />, 'Esto es una prueba', 'Este es el link de muestra del correo de prueba. En el correo real, cada persona recibe un link personal con la encuesta.');
  }
  if (query.isLoading) {
    return shell(<div className="flex justify-center pt-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>);
  }
  if (query.isError) {
    const notFound = query.error.data?.code === 'NOT_FOUND';
    return message(
      <AlertTriangle className="h-8 w-8 text-primary" />,
      notFound ? 'Este link no es válido' : 'No pudimos cargar la encuesta',
      notFound ? 'Revisa que hayas abierto el link completo de tu correo.' : 'Intenta de nuevo en un rato.',
    );
  }
  if (!query.data) return null;

  if (done || query.data.answered) {
    return message(
      <CheckCircle2 className="h-8 w-8 text-primary" />,
      done ? '¡Gracias! 💜' : 'Ya respondiste esta encuesta',
      done ? 'Leemos todas las respuestas para que la próxima fiesta sea todavía mejor.' : 'Gracias por contarnos cómo estuvo.',
    );
  }

  const { eventTitle, firstName } = query.data;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || submit.isPending) return;
    submit.mutate(
      { token, rating, liked: liked.trim() || undefined, improve: improve.trim() || undefined },
      { onSuccess: () => setDone(true) },
    );
  };

  return shell(
    <form onSubmit={handleSubmit} className="space-y-7">
      <div className="text-center">
        <h1 className="font-heading text-3xl md:text-4xl mb-2">{firstName ? `${firstName}, ` : ''}¿cómo estuvo?</h1>
        <p className="text-muted-foreground">{eventTitle}</p>
      </div>

      <div className="space-y-3">
        <Label className="block text-center">¿Qué nota le pones a la fiesta?</Label>
        <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="Nota de 1 a 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} de 5: ${STAR_LABELS[n - 1]}`}
              onClick={() => setRating(n)}
              className="p-1.5 rounded-xl transition-transform active:scale-90"
            >
              <Star className={`h-10 w-10 ${n <= rating ? 'fill-primary text-primary' : 'text-muted-foreground/40'}`} />
            </button>
          ))}
        </div>
        <p className="h-5 text-center text-sm text-muted-foreground">{rating > 0 ? STAR_LABELS[rating - 1] : ''}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="liked">¿Qué fue lo que más te gustó? <span className="text-muted-foreground">(opcional)</span></Label>
        <Textarea id="liked" rows={3} maxLength={1000} value={liked} onChange={(e) => setLiked(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="improve">¿Qué mejorarías para la próxima? <span className="text-muted-foreground">(opcional)</span></Label>
        <Textarea id="improve" rows={3} maxLength={1000} value={improve} onChange={(e) => setImprove(e.target.value)} />
      </div>

      {submit.isError && (
        <p className="text-sm text-destructive text-center">{submit.error.message}</p>
      )}

      <button
        type="submit"
        disabled={rating < 1 || submit.isPending}
        className="w-full px-8 py-4 bg-primary text-primary-foreground rounded-full font-semibold transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 interactive"
      >
        {submit.isPending ? 'Enviando…' : 'Enviar'}
      </button>
      <p className="text-center text-xs text-muted-foreground">Las respuestas se leen sin nombre ni correo.</p>
    </form>,
  );
}
