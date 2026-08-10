import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { Sparkles, Instagram, MessageCircle, Users, TrendingUp, Gift, Trophy, CheckCircle2, Crown, ArrowDown } from 'lucide-react';
import { prefersReducedMotion, scrollToId } from '@/lib/smoothScroll';
import { useSeo } from '@/hooks/useSeo';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AMBASSADOR_REQUIREMENTS,
  AMBASSADOR_TASKS,
  sanitizeApplicantName,
  sanitizeApplicationMessage,
  sanitizeFollowers,
  sanitizeInstagram,
  sanitizeWhatsapp,
} from '@shared/ambassadorApplication';

const BENEFITS = [
  { icon: TrendingUp, title: 'Comisión por venta', text: 'Ganas una comisión cada vez que alguien compra con tu código. Sube mientras más vendes en el mes.' },
  { icon: Gift, title: 'Beneficios mensuales', text: 'Desbloqueas beneficios exclusivos a medida que subes de nivel.' },
  { icon: Trophy, title: 'Ranking y reconocimiento', text: 'Compites en el ranking de embajadoras y embajadores de cada evento.' },
  { icon: Users, title: 'Panel personal', text: 'Tu propio panel donde ves en tiempo real tus ventas, tu nivel y tu comisión acumulada.' },
];

const STEPS = [
  'Postulas dejando tus datos',
  'Te contactamos por WhatsApp o Instagram',
  'Recibes tu código personal',
  'Lo compartes con tu círculo',
  'Cobras tu comisión por cada venta',
];

type FieldErrors = Partial<Record<'name' | 'email' | 'whatsapp' | 'instagram' | 'followers' | 'message' | 'acceptedTerms', string>>;

/** Tarjeta VIP: acceso al panel del embajador (`/embajador`) más un atajo al
 * formulario de postulación, destacados arriba de la página en vez de un link
 * chico al final -- reusa el brillo que sigue al mouse de las tarjetas de
 * entrada (`CandyPass.tsx` / `.candy-sheen` + `.candy-holo` en index.css), sin
 * el tilt 3D porque acá es un banner ancho y no una tarjeta tipo carnet. */
function AmbassadorPanelBanner() {
  const ref = useRef<HTMLDivElement>(null);
  const rm = prefersReducedMotion();

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (rm || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 100;
    const py = ((e.clientY - r.top) / r.height) * 100;
    ref.current.style.setProperty('--mx', `${px}%`);
    ref.current.style.setProperty('--my', `${py}%`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.15 }}
      className="max-w-4xl mx-auto mb-16"
    >
      <div
        ref={ref}
        onPointerMove={handleMove}
        className="candy-pass relative glass-candy-pastel rounded-3xl p-5 md:p-7 overflow-hidden border border-violet-electric/30 flex flex-col sm:flex-row items-center gap-4 sm:gap-6"
      >
        <div
          aria-hidden
          className="absolute -inset-6 rounded-[3rem] blur-3xl opacity-45 -z-10"
          style={{ background: 'radial-gradient(circle, oklch(0.70 0.14 280 / 0.3), transparent 70%)' }}
        />
        <div
          aria-hidden
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{ background: 'linear-gradient(135deg, oklch(0.70 0.14 280 / 0.14), oklch(0.70 0.20 350 / 0.1) 60%, transparent 100%)' }}
        />
        <div className="candy-holo" />
        <div className="candy-sheen" />

        <div
          className="relative shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center candy-glow-pulse"
          style={{ background: 'linear-gradient(135deg, var(--color-violet-electric), var(--color-cherry))' }}
        >
          <Crown className="w-6 h-6 text-white" />
        </div>

        <div className="relative flex-1 text-center sm:text-left">
          <p className="text-xs uppercase tracking-[0.25em] text-violet-electric font-bold mb-1">Acceso Embajador</p>
          <h3 className="font-heading text-xl md:text-2xl mb-1">¿Ya eres Embajador VIP?</h3>
          <p className="text-muted-foreground text-sm">Postula abajo, o entra a tu panel si ya tienes tu código.</p>
        </div>

        <div className="relative shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            onClick={() => scrollToId('postular-form')}
            className="btn-jelly inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-bold interactive"
          >
            Postular <ArrowDown className="w-3.5 h-3.5" />
          </button>

          <Link href="/embajador" className="group interactive">
            <span
              className="relative inline-block rounded-full p-[1.5px] bg-left bg-[length:200%_100%] transition-[background-position,transform] duration-700 ease-out group-hover:bg-right group-hover:-translate-y-0.5"
              style={{ backgroundImage: 'linear-gradient(90deg, var(--color-violet-electric), var(--color-cherry), var(--color-violet-electric))' }}
            >
              <span className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-background/95 backdrop-blur-sm text-sm font-bold whitespace-nowrap">
                <Crown className="w-3.5 h-3.5 text-violet-electric shrink-0" />
                <span
                  style={{
                    background: 'linear-gradient(90deg, var(--color-violet-electric), var(--color-cherry))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Entrar a mi panel
                </span>
              </span>
            </span>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

export default function Embajadores() {
  useSeo({
    title: 'Sé Embajador VIP — Mansion Playroom',
    description: 'Postula para ser Embajador VIP de Mansion Playroom: gana comisión por cada venta con tu código, sube de nivel y desbloquea beneficios exclusivos.',
    path: '/embajadores',
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [instagram, setInstagram] = useState('');
  const [followers, setFollowers] = useState('');
  const [message, setMessage] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState<{ alreadyPending: boolean } | null>(null);

  const submit = trpc.ambassadorApplications.submit.useMutation({
    onSuccess: (result) => setSubmitted({ alreadyPending: result.alreadyPending }),
    onError: (err) => toast.error(err.message || 'No pudimos enviar tu postulación. Intenta de nuevo.'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors: FieldErrors = {};
    const nombre = sanitizeApplicantName(name);
    if (!nombre.ok) nextErrors.name = nombre.reason;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = 'Escribe un correo válido';
    const wsp = sanitizeWhatsapp(whatsapp);
    if (!wsp.ok) nextErrors.whatsapp = wsp.reason;
    const ig = sanitizeInstagram(instagram);
    if (!ig.ok) nextErrors.instagram = ig.reason;
    if (!followers.trim()) {
      nextErrors.followers = 'Escribe tu cantidad de seguidores';
    } else {
      const seguidores = sanitizeFollowers(followers);
      if (!seguidores.ok) nextErrors.followers = seguidores.reason;
    }
    const mensaje = sanitizeApplicationMessage(message);
    if (!mensaje.ok) nextErrors.message = mensaje.reason;
    if (!acceptedTerms) nextErrors.acceptedTerms = 'Tienes que confirmar que cumples los requisitos y tareas';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    submit.mutate({
      name,
      email: email.trim(),
      whatsapp,
      instagram,
      followers: followers.trim() || undefined,
      message: message.trim() || undefined,
      acceptedTerms,
    });
  };

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-3xl mx-auto text-center mb-16"
        >
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Embajadores VIP</p>
          <h1 className="font-heading text-5xl md:text-7xl tracking-tight mb-6">
            Sé <span className="text-gradient">Embajador</span> de Mansion Playroom
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Comparte tu código, gana comisión por cada venta y desbloquea beneficios exclusivos. Postula dejando tus
            datos y te contactamos.
          </p>
        </motion.div>

        <AmbassadorPanelBanner />

        {/* Qué ganas */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <h2 className="font-heading text-2xl md:text-3xl text-center mb-8">¿Qué ganas?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {BENEFITS.map((b) => (
              <div key={b.title} className="glass-candy rounded-2xl p-6 flex gap-4">
                <div className="w-11 h-11 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
                  <b.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{b.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{b.text}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-6 max-w-lg mx-auto">
            Los porcentajes y montos exactos te los contamos al aceptar tu postulación.
          </p>
        </motion.div>

        {/* Requisitos y tareas */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-16"
        >
          <div className="glass-candy rounded-2xl p-6">
            <h3 className="font-heading text-xl mb-4">Requisitos</h3>
            <ul className="space-y-3">
              {AMBASSADOR_REQUIREMENTS.map((r) => (
                <li key={r} className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass-candy rounded-2xl p-6">
            <h3 className="font-heading text-xl mb-4">Qué se espera de ti</h3>
            <ul className="space-y-3">
              {AMBASSADOR_TASKS.map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  {t}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border/40">
              Asistir a la fiesta no es obligatorio.
            </p>
          </div>
        </motion.div>

        {/* Cómo funciona */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <h2 className="font-heading text-2xl md:text-3xl text-center mb-10">¿Cómo funciona?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 max-w-5xl mx-auto">
            {STEPS.map((step, i) => (
              <div key={step} className="text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="font-heading text-xl text-primary">{i + 1}</span>
                </div>
                <p className="text-sm text-muted-foreground">{step}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Formulario */}
        <motion.div
          id="postular-form"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-xl mx-auto scroll-mt-24"
        >
          <div className="bg-card border border-border/50 rounded-2xl p-6 md:p-8">
            {submitted ? (
              <div className="text-center py-8">
                <Sparkles className="w-10 h-10 text-primary mx-auto mb-4" />
                <h3 className="font-heading text-2xl mb-2">
                  {submitted.alreadyPending ? 'Ya tienes una postulación en revisión' : '¡Postulación recibida!'}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {submitted.alreadyPending
                    ? 'Ya recibimos tus datos y todavía la estamos revisando. Te vamos a contactar pronto.'
                    : 'Te va a llegar un correo de confirmación. Nuestro equipo va a revisar tu postulación y te contacta por WhatsApp o Instagram.'}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="font-heading text-2xl mb-2">Postula acá</h3>
                <div>
                  <label className="text-sm font-semibold mb-1.5 block">Nombre completo</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
                  {errors.name && <p className="text-destructive text-xs mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1.5 block">Correo</label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" />
                  {errors.email && <p className="text-destructive text-xs mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1.5 block flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </label>
                  <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+56 9 1234 5678" />
                  {errors.whatsapp && <p className="text-destructive text-xs mt-1">{errors.whatsapp}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1.5 block flex items-center gap-1.5">
                    <Instagram className="w-3.5 h-3.5" /> Instagram
                  </label>
                  <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@tu.usuario" />
                  {errors.instagram && <p className="text-destructive text-xs mt-1">{errors.instagram}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1.5 block">Seguidores</label>
                  <Input value={followers} onChange={(e) => setFollowers(e.target.value)} placeholder="1500" inputMode="numeric" />
                  {errors.followers && <p className="text-destructive text-xs mt-1">{errors.followers}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1.5 block">Cuéntanos algo más (opcional)</label>
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Lo que quieras contarnos" rows={3} />
                  {errors.message && <p className="text-destructive text-xs mt-1">{errors.message}</p>}
                </div>
                <div className="flex items-start gap-2.5 pt-1">
                  <Checkbox
                    id="acceptedTerms"
                    checked={acceptedTerms}
                    onCheckedChange={(v) => setAcceptedTerms(v === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor="acceptedTerms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                    Soy mayor de 18 años y cumplo los requisitos y tareas descritos arriba.
                  </label>
                </div>
                {errors.acceptedTerms && <p className="text-destructive text-xs">{errors.acceptedTerms}</p>}

                <Button type="submit" size="lg" className="w-full interactive glow-pink" disabled={submit.isPending}>
                  {submit.isPending ? 'Enviando...' : 'Enviar postulación'}
                </Button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
