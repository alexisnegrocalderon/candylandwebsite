import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { ShieldCheck } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';

/* Política de privacidad. Está escrita a partir de lo que el sistema
 * REALMENTE guarda (drizzle/schema.ts), no de una plantilla genérica: cada
 * dato que se nombra acá existe en una tabla concreta, y cada plazo de
 * borrado que se promete está implementado (server/db.ts, cron diario).
 * Si se agrega un dato nuevo o cambia un plazo, hay que actualizar esto. */

const DATOS = [
  {
    title: 'Cuando compras una entrada',
    text: 'Lo que necesitamos para emitir tu acceso, poder validarlo en la puerta y cumplir con la boleta:',
    list: [
      'Tu nombre completo tal como aparece en tu carnet, correo electrónico y teléfono.',
      'Tu RUT, cuando lo entregas, para verificar tu identidad en la entrada.',
      'Los nombres de las personas que vienen contigo, si compras un acceso para más de una.',
      'El detalle de tu compra: qué entrada, cuánto pagaste y cuándo.',
      'Tu Instagram, solo si tú decides dárnoslo.',
    ],
  },
  {
    title: 'Cuando entras al evento',
    text: 'Al escanear tu código QR en la puerta queda registrado que ingresaste, a qué hora y qué miembro del equipo lo marcó. Ese registro existe por dos razones: saber cuánta gente hay dentro del recinto en cada momento (una obligación básica de seguridad) y evitar que una misma entrada se use dos veces.',
  },
  {
    title: 'Cuando usas la fiesta en tu celular',
    text: 'Esta parte es completamente voluntaria: solo existe si tú creas un perfil. Si lo haces, guardamos:',
    list: [
      'El alias que elegiste, el avatar y la categoría (hombre, mujer o pareja) que seleccionaste.',
      'La zona del recinto en la que dices estar y la última vez que abriste la aplicación.',
      'A quién le mandaste un toque y quién te lo aceptó o rechazó.',
      'Los mensajes que intercambias en el chat.',
      'Las personas que bloqueaste y las denuncias que hiciste.',
    ],
    footer: 'No pedimos ni guardamos fotos, apellidos, teléfonos ni redes sociales dentro de la fiesta. Tu alias tampoco puede contener un @, un enlace ni un número de teléfono: el sistema los rechaza.',
  },
  {
    title: 'Cuando invitas o recibes un trago',
    text: 'Guardamos qué trago fue, entre qué dos alias, el precio, la nota que hayas escrito y el código para retirarlo en la barra. El pago lo procesa Mercado Pago: los datos de tu tarjeta viajan directo a ellos y nunca pasan por nuestros servidores ni quedan guardados con nosotros.',
  },
  {
    title: 'Cuando te escribimos',
    text: 'Usamos tu correo para mandarte tu entrada, el código de un trago que te regalaron y, si corresponde, información de eventos. Puedes pedir que dejemos de escribirte cuando quieras y lo haremos sin condiciones.',
  },
];

const NO_HACEMOS = [
  'No vendemos ni arrendamos tus datos a nadie. Nunca.',
  'No usamos cookies de publicidad, píxeles de Facebook ni redes de seguimiento. El sitio no tiene ninguno.',
  'No publicamos ni mostramos quién asistió a un evento.',
  'No mostramos tu nombre real, tu correo ni tu teléfono a otros asistentes en ningún momento.',
  'No guardamos los datos de tu tarjeta.',
  'No usamos tus mensajes del chat para publicidad ni los leemos, salvo que exista una denuncia de por medio.',
];

const PLAZOS = [
  {
    title: 'Los mensajes del chat de la fiesta',
    text: 'Se borran automáticamente 24 horas después de que termina el evento. No los conservamos.',
  },
  {
    title: 'Tu perfil de la fiesta, los toques y los bloqueos',
    text: 'Se borran automáticamente 12 meses después del evento. Mientras tanto solo se usan para que la función opere y para saber cuánta gente la usó.',
  },
  {
    title: 'Los tragos regalados y sin retirar',
    text: 'Estos NO se borran: un trago que pagaste y que la otra persona no alcanzó a retirar sigue válido para la próxima fiesta, así que necesitamos conservar el código hasta que se cobre.',
  },
  {
    title: 'Tus compras y datos de facturación',
    text: 'Los conservamos mientras la ley tributaria y de consumidor nos obliga a respaldar una venta.',
  },
  {
    title: 'Las denuncias',
    text: 'Se conservan mientras sean necesarias para proteger a las personas involucradas y para que el equipo pueda actuar.',
  },
];

const TERCEROS = [
  { nombre: 'Mercado Pago', para: 'Procesar los pagos con tarjeta. Reciben lo mínimo para cobrar y ellos manejan los datos de tu tarjeta, no nosotros.' },
  { nombre: 'Resend', para: 'Enviar los correos con tu entrada y los códigos. Reciben tu correo electrónico y el contenido del mensaje.' },
  { nombre: 'Vercel', para: 'Alojar el sitio web.' },
  { nombre: 'TiDB Cloud', para: 'Alojar la base de datos.' },
];

const DERECHOS = [
  { titulo: 'Acceso', texto: 'Pedirnos una copia de todo lo que tenemos sobre ti.' },
  { titulo: 'Rectificación', texto: 'Corregir cualquier dato que esté equivocado o desactualizado.' },
  { titulo: 'Eliminación', texto: 'Pedir que borremos tus datos, salvo aquellos que estemos legalmente obligados a conservar (por ejemplo, el respaldo tributario de una venta).' },
  { titulo: 'Oposición', texto: 'Pedir que dejemos de usarlos para algo puntual, como los correos de eventos.' },
];

export default function PrivacyPolicy() {
  useSeo({
    title: 'Política de privacidad — Mansion Playroom',
    description: 'Qué datos guardamos, para qué los usamos, cuánto tiempo los conservamos y cómo puedes pedir que los borremos.',
    path: '/politica-de-privacidad',
  });

  return (
    <div className="min-h-dvh pt-24 pb-16">
      <div className="container max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <p className="text-sm uppercase tracking-[0.25em] text-primary">Mansion Playroom</p>
          </div>
          <h1 className="font-heading font-extrabold text-3xl md:text-4xl tracking-tight mb-3">Política de privacidad</h1>
          <p className="text-sm text-muted-foreground mb-8">Última actualización: julio de 2026</p>

          <div className="glass-candy rounded-2xl p-6 mb-10 text-sm text-muted-foreground leading-relaxed space-y-3">
            <p>
              Venir a nuestras fiestas es algo privado, y lo tratamos así. Esta página explica en palabras simples qué
              datos guardamos, para qué los usamos, cuánto tiempo los conservamos y cómo puedes pedir que los
              borremos.
            </p>
            <p>
              Está escrita en conformidad con la <span className="text-foreground font-medium">Ley 19.628 sobre
              Protección de la Vida Privada</span> y con la <span className="text-foreground font-medium">Ley 21.719</span>,
              que actualiza el régimen de protección de datos en Chile.
            </p>
          </div>

          {/* Identificar al responsable del tratamiento es lo primero que
              exige la ley: sin esto, la persona no sabe a quién reclamarle. */}
          <h2 className="font-heading font-bold text-xl mb-4">Quién responde por tus datos</h2>
          <div className="glass-candy rounded-xl p-5 mb-10">
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              El responsable del tratamiento de tus datos personales es:
            </p>
            <div className="space-y-1 mb-3">
              <p className="text-sm"><span className="text-muted-foreground">Razón social:</span> <span className="font-semibold">DYNAMICS SpA</span></p>
              <p className="text-sm"><span className="text-muted-foreground">RUT:</span> <span className="font-semibold">78.203.386-7</span></p>
              <p className="text-sm"><span className="text-muted-foreground">Nombre de fantasía:</span> <span className="font-semibold">Mansion Playroom</span></p>
              <p className="text-sm">
                <span className="text-muted-foreground">Contacto:</span>{' '}
                <a href="mailto:contacto@mansionplayroom.cl" className="text-primary font-medium hover:underline">contacto@mansionplayroom.cl</a>
              </p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Cualquier consulta, reclamo o solicitud sobre tus datos personales puedes dirigirla a ese correo.
            </p>
          </div>

          {/* Discreción: es lo que más le importa a alguien que compra una
              entrada a este tipo de evento, así que va antes que nada. */}
          <div className="rounded-2xl p-6 mb-10 border border-primary/30 bg-primary/5">
            <h2 className="font-heading font-bold text-lg mb-2">Tu discreción es lo primero</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Asistir a un evento como este dice algo sobre tu vida privada, y la ley chilena trata esa clase de
              información con especial cuidado. Nosotros también. Nunca publicamos listas de asistentes, nunca
              confirmamos a terceros si alguien vino, y dentro de la fiesta nadie ve tu nombre real: solo el alias
              que tú elegiste. Si alguna vez recibimos un requerimiento formal de una autoridad, responderemos solo
              lo que la ley nos obligue y nada más.
            </p>
          </div>

          <h2 className="font-heading font-bold text-xl mb-4">Qué datos guardamos y para qué</h2>
          <div className="space-y-4 mb-10">
            {DATOS.map((d) => (
              <div key={d.title} className="glass-candy rounded-xl p-5">
                <p className="text-sm font-bold mb-2">{d.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed mb-2">{d.text}</p>
                {d.list && (
                  <ul className="space-y-1.5 mb-2">
                    {d.list.map((item, i) => (
                      <li key={i} className="text-sm text-muted-foreground leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-primary">
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
                {d.footer && <p className="text-sm text-foreground/80 font-medium leading-relaxed">{d.footer}</p>}
              </div>
            ))}
          </div>

          <h2 className="font-heading font-bold text-xl mb-4">Lo que no hacemos</h2>
          <div className="glass-candy rounded-xl p-5 mb-10">
            <ul className="space-y-2">
              {NO_HACEMOS.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground leading-relaxed pl-5 relative before:content-['✕'] before:absolute before:left-0 before:text-primary before:text-xs before:top-0.5">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <h2 className="font-heading font-bold text-xl mb-4">Cuánto tiempo los guardamos</h2>
          <div className="space-y-3 mb-10">
            {PLAZOS.map((p) => (
              <div key={p.title} className="glass-candy rounded-xl p-5">
                <p className="text-sm font-bold mb-1.5">{p.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.text}</p>
              </div>
            ))}
          </div>

          <h2 className="font-heading font-bold text-xl mb-4">Con quién los compartimos</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Solo con los servicios que necesitamos para que el sitio funcione. Cada uno recibe únicamente lo
            indispensable para hacer su parte:
          </p>
          <div className="glass-candy rounded-xl p-5 mb-10 space-y-3">
            {TERCEROS.map((t) => (
              <div key={t.nombre}>
                <p className="text-sm font-semibold">{t.nombre}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{t.para}</p>
              </div>
            ))}
          </div>

          <h2 className="font-heading font-bold text-xl mb-4">Tus derechos</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Sobre tus datos personales puedes ejercer, en cualquier momento y sin costo:
          </p>
          <div className="glass-candy rounded-xl p-5 mb-4 space-y-3">
            {DERECHOS.map((d) => (
              <div key={d.titulo}>
                <p className="text-sm font-semibold">{d.titulo}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{d.texto}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mb-10 leading-relaxed">
            Para ejercer cualquiera de ellos escríbenos a{' '}
            <a href="mailto:contacto@mansionplayroom.cl" className="text-primary font-medium hover:underline">contacto@mansionplayroom.cl</a>{' '}
            desde el mismo correo con el que compraste. Te respondemos dentro de los plazos que fija la ley.
          </p>

          <h2 className="font-heading font-bold text-xl mb-4">Seguridad</h2>
          <div className="glass-candy rounded-xl p-5 mb-10">
            <p className="text-sm text-muted-foreground leading-relaxed">
              El sitio funciona sobre conexiones cifradas y el acceso a la base de datos está restringido al
              equipo que lo necesita para operar. Ningún sistema es infalible: si alguna vez ocurriera una
              vulneración que afecte tus datos, te avisaremos.
            </p>
          </div>

          <h2 className="font-heading font-bold text-xl mb-4">Solo mayores de 18 años</h2>
          <div className="glass-candy rounded-xl p-5 mb-10">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Nuestros eventos son exclusivamente para mayores de edad y verificamos identidad en la entrada. No
              recogemos datos de menores de forma consciente. Si detectamos que un dato pertenece a una persona
              menor de 18 años, lo eliminamos.
            </p>
          </div>

          <h2 className="font-heading font-bold text-xl mb-4">Cambios a esta política</h2>
          <div className="glass-candy rounded-xl p-5 mb-10">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Si cambiamos algo relevante, actualizamos la fecha del encabezado y avisamos por nuestros canales
              oficiales. Te recomendamos revisarla de vez en cuando.
            </p>
          </div>

          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            ¿Dudas sobre tus datos? Escríbenos a{' '}
            <a href="mailto:contacto@mansionplayroom.cl" className="text-primary font-medium hover:underline">contacto@mansionplayroom.cl</a>,
            por Instagram o por WhatsApp.
            <br />
            También puedes revisar nuestra{' '}
            <Link href="/politica-de-reembolso" className="text-primary font-medium hover:underline interactive">política de reembolso</Link>.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
