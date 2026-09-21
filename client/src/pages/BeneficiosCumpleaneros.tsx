import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Sparkles, Instagram, MessageCircle, Cake, Gift, PartyPopper, CheckCircle2 } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  BIRTHDAY_WINDOW_DAYS,
  sanitizeApplicantName,
  sanitizeApplicationMessage,
  sanitizeBirthDate,
  sanitizeInstagram,
  sanitizeWhatsapp,
  isBirthdayEligible,
} from '@shared/birthdayApplication';
import { BIRTHDAY_TIERS } from '@shared/birthdayTiers';

type FieldErrors = Partial<Record<'name' | 'email' | 'whatsapp' | 'instagram' | 'birthDate' | 'message' | 'acceptedTerms', string>>;

const TIER_ICONS = [Gift, PartyPopper, Cake];

export default function BeneficiosCumpleaneros() {
  useSeo({
    title: 'Beneficios Cumpleañeros — Mansion Playroom',
    description: 'Si tu cumpleaños cae cerca de la fiesta, postula para ser cumpleañero: comparte tu código y desbloquea entrada gratis, espumante, covers y más.',
    path: '/beneficios-cumpleaneros',
  });

  const eligibility = trpc.birthdayApplications.eligibility.useQuery();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [instagram, setInstagram] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [message, setMessage] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState<{ alreadyPending: boolean } | null>(null);

  const submit = trpc.birthdayApplications.submit.useMutation({
    onSuccess: (result) => setSubmitted({ alreadyPending: result.alreadyPending }),
    onError: (err) => toast.error(err.message || 'No pudimos enviar tu postulación. Intenta de nuevo.'),
  });

  const event = eligibility.data;

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
    const fecha = sanitizeBirthDate(birthDate);
    if (!fecha.ok) nextErrors.birthDate = fecha.reason;
    else if (event && !isBirthdayEligible(event.eventDate, fecha.value)) {
      nextErrors.birthDate = `Tu cumpleaños tiene que caer dentro de ${BIRTHDAY_WINDOW_DAYS} días antes o después del ${new Date(event.eventDate).toLocaleDateString('es-CL')}`;
    }
    const mensaje = sanitizeApplicationMessage(message);
    if (!mensaje.ok) nextErrors.message = mensaje.reason;
    if (!acceptedTerms) nextErrors.acceptedTerms = 'Tienes que confirmar que aceptas los requisitos';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    submit.mutate({
      name,
      email: email.trim(),
      whatsapp,
      instagram: instagram.trim() || undefined,
      birthDate,
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
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Beneficios Cumpleañeros</p>
          <h1 className="font-heading text-5xl md:text-7xl tracking-tight mb-6">
            Celebra tu <span className="text-gradient">cumpleaños</span> con nosotros
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Si tu cumpleaños cae hasta {BIRTHDAY_WINDOW_DAYS} días antes o después de la fiesta, postula, comparte tu
            código con tus invitados y desbloquea premios que suben mientras más entradas se vendan con tu código.
          </p>
          {event && (
            <p className="text-sm text-primary font-semibold mt-4">
              Postulando ahora para: {event.eventTitle}
            </p>
          )}
        </motion.div>

        {/* Tramos de premios */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <h2 className="font-heading text-2xl md:text-3xl text-center mb-2">Tus premios</h2>
          <p className="text-muted-foreground text-sm text-center mb-8 max-w-lg mx-auto">
            Cada tramo reemplaza al anterior -- mientras más entradas vendas con tu código, mejor el premio.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {BIRTHDAY_TIERS.map((tier, i) => {
              const Icon = TIER_ICONS[i] ?? Gift;
              return (
                <div key={tier.tier} className="glass-candy rounded-2xl p-6 text-center flex flex-col items-center">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold mb-2">
                    {tier.minTickets} {tier.minTickets === 1 ? 'entrada vendida' : 'entradas vendidas'}
                  </p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {tier.items.map((item) => (
                      <li key={item.label}>{item.label}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Requisitos */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mx-auto mb-16"
        >
          <div className="glass-candy rounded-2xl p-6">
            <h3 className="font-heading text-xl mb-4">Requisitos</h3>
            <ul className="space-y-3">
              {(event?.requirements ?? []).map((r) => (
                <li key={r} className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  {r}
                </li>
              ))}
            </ul>
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
                    : 'Te va a llegar un correo de confirmación. Si quedas aprobado, recibes tu código personal para compartir con tus invitados.'}
                </p>
              </div>
            ) : !event ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">
                  No hay un evento activo para postular ahora mismo. Vuelve a intentarlo más adelante.
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
                    <Instagram className="w-3.5 h-3.5" /> Instagram (opcional)
                  </label>
                  <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@tu.usuario" />
                  {errors.instagram && <p className="text-destructive text-xs mt-1">{errors.instagram}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1.5 block flex items-center gap-1.5">
                    <Cake className="w-3.5 h-3.5" /> Fecha de nacimiento
                  </label>
                  <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                  {errors.birthDate && <p className="text-destructive text-xs mt-1">{errors.birthDate}</p>}
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
                    Confirmo que mi fecha de nacimiento es real y cae dentro de la ventana permitida.
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
