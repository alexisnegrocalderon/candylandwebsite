/* Textos listos de las campañas de mail del 2º aniversario (se cargan en un clic desde Admin → Mensajes → Mailing y se
 * pueden editar antes de programar). El precio de cada acceso NO va en el texto: el correo lo toma de la base en cada
 * envío (ver `priceList` en server/emailAniversario.ts), así nunca dice un precio que ya cambió. Cada campaña trae dos
 * asuntos (prueba A/B) y el estilo del aniversario. */

export interface AnniversaryPreset {
  key: 'ultimo-dia' | 'recordatorio-noche' | 'bono-app';
  label: string;
  /** Cuándo conviene programarla (hora de Chile). */
  when: string;
  /** Nombre sugerido de la campaña (queda como etiqueta de cada destinatario). */
  campaignName: string;
  /** Adónde lleva el botón: la entrada o la instalación de la app. */
  ctaPath: '/checkout/2do-aniversario-playroom' | '/app';
  /** Sugerencia de filtros de audiencia. */
  audienceHint: string;
  content: {
    subject: string;
    subjectB: string;
    preheader: string;
    headline: string;
    paragraphs: string[];
    ctaText: string;
    highlightLabel: string;
    highlightValue: string;
    theme: 'oro' | 'neon';
  };
}

export const ANNIVERSARY_PRESETS: AnniversaryPreset[] = [
  {
    key: 'ultimo-dia',
    label: 'Último día de preventa',
    when: 'Jueves 12:30',
    campaignName: 'aniv2-ultimo-dia',
    ctaPath: '/checkout/2do-aniversario-playroom',
    audienceHint: 'Sin entrada del evento + leads.',
    content: {
      subject: 'Hoy cierra la preventa del 2º aniversario ⏳',
      subjectB: 'Última oportunidad: mañana tu entrada sube de precio',
      preheader: 'Hasta las 23:59 de hoy, a precio de preventa.',
      headline: 'Hoy es el último día de preventa',
      paragraphs: [
        'Mañana, el día de la fiesta, las entradas del 2º aniversario pasan a precio general. Hoy todavía puedes asegurar la tuya al valor de preventa.',
        'Son 2 años de Mansion Playroom y queremos celebrarlos contigo. Compra en un minuto desde tu celular y llega directo con tu QR.',
      ],
      ctaText: 'Comprar mi entrada',
      highlightLabel: 'Cierra hoy',
      highlightValue: '23:59 hrs',
      theme: 'oro',
    },
  },
  {
    key: 'recordatorio-noche',
    label: 'Recordatorio de la noche',
    when: 'Jueves 19:30',
    campaignName: 'aniv2-recordatorio-noche',
    ctaPath: '/checkout/2do-aniversario-playroom',
    audienceHint: 'Sin entrada del evento + leads (se calcula a las 19:30: quien compró durante el día queda fuera).',
    content: {
      subject: 'Quedan pocas horas de preventa ⏰',
      subjectB: 'Esta noche a las 23:59 sube el precio',
      preheader: 'Después de medianoche, precio general.',
      headline: 'Quedan pocas horas',
      paragraphs: [
        'Todavía no tienes tu entrada para el 2º aniversario y la preventa termina esta noche a las 23:59. Después de esa hora, precio general.',
        'Asegúrala ahora, en un minuto, y entra directo con tu QR.',
      ],
      ctaText: 'Asegurar mi entrada',
      highlightLabel: 'Cierra esta noche',
      highlightValue: '23:59 hrs',
      theme: 'oro',
    },
  },
  {
    key: 'bono-app',
    label: 'Bono $10.000 por instalar la app',
    when: 'Viernes temprano',
    campaignName: 'aniv2-bono-app',
    ctaPath: '/app',
    audienceHint: 'Sin entrada del evento + leads + solo quienes aún no tienen la app. Activa antes el bono en Admin → App → Cupones y pagos.',
    content: {
      subject: 'Hoy es la fiesta: $10.000 de regalo si instalas la app 🎁',
      subjectB: 'Tu bono de $10.000 para el aniversario (solo hoy)',
      preheader: 'Instala la app, entra a tu cuenta y el descuento queda listo.',
      headline: 'Hoy celebramos 2 años: $10.000 para tu entrada',
      paragraphs: [
        'Hoy es el 2º aniversario y todavía puedes sumarte. Para que no te quedes fuera, tenemos un regalo: instala nuestra app y recibe $10.000 de descuento en tu entrada.',
        'Cómo: 1) toca el botón e instala la app desde tu celular. 2) Entra a «Mi cuenta» con tu correo. 3) Tu bono aparece al tiro y se aplica solo cuando compras.',
        'El bono es personal, de un solo uso y vale solo hoy.',
      ],
      ctaText: 'Instalar la app y recibir mi bono',
      highlightLabel: 'Bono de la app',
      highlightValue: '$10.000',
      theme: 'neon',
    },
  },
];
