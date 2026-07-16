import { motion } from 'framer-motion';
import { ScrollText } from 'lucide-react';

const LEGAL_CLAUSES = [
  {
    title: 'PRIMERO',
    text: 'Que el artículo 3 bis de la ley 21.398 "PRO-CONSUMIDOR" establece: "En los contratos celebrados por medios electrónicos, y en aquéllos en que se aceptare una oferta realizada a través de catálogos, avisos o cualquiera otra forma de comunicación a distancia. Sólo en el caso de la contratación de servicios, el proveedor podrá disponer lo contrario, y deberá informar al consumidor sobre dicha exclusión, de manera inequívoca, destacada y fácilmente accesible, en forma previa a la suscripción del contrato y pago del precio del servicio".',
  },
  {
    title: 'SEGUNDO',
    text: 'Que el artículo 5 del reglamento autoriza a los proveedores en contratos de prestación de servicios a excluir el derecho a retracto, siempre que esta exclusión sea informada de forma oportuna al consumidor mediante la comunicación a distancia o el medio que este elija libremente.',
  },
  {
    title: 'TERCERO',
    text: 'Que, para mejor entendimiento, el servicio de PlayRoom comienza desde la adquisición (pago) de la entrada hasta el término del evento, y que el cliente, al momento de comprar la entrada, acepta expresamente la exclusión al derecho a retracto, sin perjuicio de la posibilidad de reprogramación de fecha.',
  },
  {
    title: 'CUARTO',
    text: 'Que el artículo 6 del reglamento establece que el proveedor debe comunicar las exclusiones al derecho a retracto de forma comprensible, accesible y clara, en idioma español, antes del contrato o pago.',
  },
  {
    title: 'QUINTO',
    text: 'En consecuencia, el cliente declara haber sido debidamente notificado de esta política al momento de la compra, ya que se encuentra oportunamente comunicada en todos los canales de venta y difusión de eventos.',
  },
];

const CHANGE_POLICY = [
  {
    title: '1. Plazo para solicitar devoluciones',
    text: 'Se aceptarán solicitudes de devolución hasta 5 días antes del evento. Esto nos permite mantener una organización adecuada para brindar una experiencia de calidad a todos los asistentes.',
  },
  {
    title: '2. Porcentaje de reembolso',
    list: [
      'Si solicitas la devolución hasta 5 días antes del evento: reembolso del 50% del valor de tu entrada.',
      'A partir de 5 días antes del evento: no se realizarán devoluciones, ya que los costos del evento estarán comprometidos.',
    ],
  },
  {
    title: '3. Cambio de fecha (por parte del asistente)',
    text: 'Si no puedes asistir, puedes trasladar tu entrada a otro evento de PlayRoom, manteniendo el mismo tipo de entrada, siempre que:',
    list: [
      'La solicitud se realice hasta 2 días antes del evento original.',
      'El nuevo evento no corresponda a fechas con celebraciones especiales (Año Nuevo, Halloween, San Valentín, etc.).',
      'El cambio sea solicitado por canales oficiales y validado por la producción.',
    ],
    footer: 'Tu entrada quedará registrada para una nueva fecha a elección dentro del calendario disponible.',
  },
  {
    title: '4. Reprogramación del evento por parte de la productora (causas externas o fuerza mayor)',
    text: 'En caso de que un evento deba ser reprogramado por razones de fuerza mayor o causas externas que afecten la calidad del mismo, se ofrecerán dos opciones de compensación:',
    list: [
      'Asistencia con la misma entrada a la nueva fecha reprogramada del evento.',
      'Compensación con dos accesos equivalentes para otras fechas futuras dentro del calendario regular de eventos.',
      'En caso de solicitar reembolso, se aplicará un 50% de devolución del valor total de la entrada. Esta decisión busca equilibrar el compromiso de producción con el respeto por nuestros asistentes.',
    ],
  },
  {
    title: '5. Transferencia de entradas',
    text: 'Si no puedes asistir y estás fuera del plazo de devolución, puedes transferir tu entrada a otra persona. Este cambio debe informarse al menos 48 horas antes del evento, para validar la identidad del nuevo asistente y asegurar su ingreso.',
  },
  {
    title: '6. Proceso de solicitud',
    text: 'Las solicitudes deben ser enviadas por correo electrónico o mensaje directo a los canales oficiales de PlayRoom, incluyendo:',
    list: ['Nombre completo', 'Número de teléfono', 'Comprobante de compra', 'Motivo de la cancelación o solicitud de cambio'],
    footer: '📌 Los reembolsos se realizarán dentro de los 3 días hábiles posterior a la fecha del evento original.',
  },
];

export default function RefundPolicy() {
  return (
    <div className="min-h-dvh pt-24 pb-16">
      <div className="container max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex items-center gap-3 mb-2">
            <ScrollText className="w-6 h-6 text-primary" />
            <p className="text-sm uppercase tracking-[0.25em] text-primary">Mansion Playroom</p>
          </div>
          <h1 className="font-heading font-extrabold text-3xl md:text-4xl tracking-tight mb-8">Política de reembolso</h1>

          <div className="glass-candy rounded-2xl p-6 mb-8 text-sm text-muted-foreground leading-relaxed">
            <p>
              Por favor lee con atención la política que tenemos para mantener la correcta organización y logística
              para asegurar una experiencia óptima para todos los asistentes; las siguientes condiciones se enmarcan
              dentro del artículo 3 bis de la ley 21.398 que modifica la ley 19.946 "Ley del Consumidor" en relación
              al Decreto núm. 52, publicado el 27 de agosto de 2024: "APRUEBA REGLAMENTO QUE REGULA LA FORMA Y
              CONDICIONES EN QUE LOS PROVEEDORES DEBERÁN COMUNICAR LA EXCLUSIÓN DEL DERECHO A RETRACTO Y LOS BIENES
              EN QUE EXCEPCIONALMENTE Y POR SU NATURALEZA PROCEDERÁ TAL EXCLUSIÓN", por lo que, como productora,
              hemos dispuesto las siguientes condiciones para exclusión del derecho a retracto:
            </p>
          </div>

          <h2 className="font-heading font-bold text-xl mb-4">Términos y condiciones de compra</h2>
          <div className="space-y-3 mb-10">
            {LEGAL_CLAUSES.map((c) => (
              <div key={c.title} className="glass-candy rounded-xl p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-primary mb-1.5">{c.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.text}</p>
              </div>
            ))}
          </div>

          <h2 className="font-heading font-bold text-xl mb-4">Políticas de cambio, devolución y reprogramación</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Sin perjuicio de lo anterior y previo acuerdo comercial entre las partes, la productora se compromete a
            los siguientes acuerdos en casos justificados de fuerza mayor:
          </p>
          <div className="space-y-4 mb-10">
            {CHANGE_POLICY.map((c) => (
              <div key={c.title} className="glass-candy rounded-xl p-5">
                <p className="text-sm font-bold mb-2">{c.title}</p>
                {c.text && <p className="text-sm text-muted-foreground leading-relaxed mb-2">{c.text}</p>}
                {c.list && (
                  <ul className="space-y-1.5 mb-2">
                    {c.list.map((item, i) => (
                      <li key={i} className="text-sm text-muted-foreground leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-primary">
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
                {c.footer && <p className="text-sm text-foreground/80 font-medium">{c.footer}</p>}
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Ante cualquier duda, escríbenos por Instagram o WhatsApp — estamos para ayudarte.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
