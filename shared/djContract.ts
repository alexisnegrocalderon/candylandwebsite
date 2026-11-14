/* Contrato digital para DJs/artistas de una fiesta (primero FaeDior en PLAYMORE). Un solo lugar arma el texto: el
 * servidor lo congela al firmar (con su hash) y la página y el PDF lo muestran igual. Plantilla razonable, no asesoría
 * legal: conviene que un abogado la revise antes de usarla. */
import { honorariosBreakdown } from './honorarios';

/** Sube si cambia el texto de las cláusulas: cada contrato firmado guarda la versión con la que se firmó. */
export const DJ_CONTRACT_VERSION = 'djc-1';

export interface DjContractTerms {
  artistName: string;
  eventName: string;
  /** «viernes 4 de diciembre de 2026» */
  eventDateText: string;
  /** «madrugada del sábado 5 de diciembre de 2026» */
  setDateText: string;
  /** «02:00» · «04:00» */
  setStart: string;
  setEnd: string;
  /** Llegada al recinto y prueba de sonido, «00:30». */
  callTime: string;
  soundcheckTime: string;
  venueText: string;
  amountClp: number;
  /** `liquido`: ella recibe exacto lo pactado; `bruto`: es el monto de la boleta. */
  amountMode: 'liquido' | 'bruto';
  /** Año de la boleta (define la retención). */
  year: number;
  /** Si llega tarde o acorta el set, el monto baja en proporción al tiempo no tocado. */
  proportionalDiscount: boolean;
  cancellation: { enabled: boolean; noticeDays: number; penaltyPercent: number };
}

export interface DjSigner { legalName?: string | null; rut?: string | null }

export interface DjContract {
  version: string;
  title: string;
  summary: { label: string; value: string }[];
  sections: { heading: string; paragraphs: string[] }[];
}

export const PRODUCERS = [
  { key: 'alexis', name: 'Alexis Calderón', role: 'Productor de Playroom', company: 'Mansión Playroom' },
  { key: 'gino', name: 'Gino Pérez', role: 'Productor de Dalmore', company: 'Dalmore Music & Experiences' },
] as const;
export type ProducerKey = (typeof PRODUCERS)[number]['key'];

/** Las firmas de la Producción que se estampan en el contrato al enviarlo (la imagen y cuándo se estampó). */
export type ProducersStamp = Record<ProducerKey, { image: string; at: string }>;

export const isSignaturePng = (s: unknown): s is string => typeof s === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]{200,}$/.test(s) && s.length <= 400_000;

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

export function djPayment(terms: Pick<DjContractTerms, 'amountClp' | 'amountMode' | 'year'>) {
  return honorariosBreakdown({ amount: terms.amountClp, paymentType: 'boleta_honorarios', amountMode: terms.amountMode, year: terms.year });
}

export function buildDjContract(terms: DjContractTerms, signer: DjSigner = {}): DjContract {
  const pay = djPayment(terms);
  const rate = String(pay.ratePercent).replace('.', ',');
  const who = signer.legalName?.trim()
    ? `${signer.legalName.trim()}${signer.rut?.trim() ? `, RUT ${signer.rut.trim()}` : ''}, conocida artísticamente como «${terms.artistName}»`
    : `quien firma este documento, conocida artísticamente como «${terms.artistName}» (su nombre completo y RUT quedan registrados al firmar)`;
  const producers = PRODUCERS.map((p) => `${p.name} (${p.role})`).join(' y ');

  const sections: DjContract['sections'] = [
    {
      heading: '1. Las partes',
      paragraphs: [
        `Por una parte, Mansión Playroom y Dalmore Music & Experiences, representadas por ${producers} (en adelante «la Producción»), y por la otra ${who} (en adelante «la Artista»).`,
      ],
    },
    {
      heading: '2. El evento y el servicio',
      paragraphs: [
        `La Artista se compromete a presentar un set de perreo old school como cierre de la noche en ${terms.eventName}, el ${terms.eventDateText}, en ${terms.venueText}. La fiesta es solo para mayores de 21 años, con código de vestimenta.`,
        `El set es de ${terms.setStart} a ${terms.setEnd} hrs (${terms.setDateText}): el estallido final de la noche. La Producción informa la dirección exacta del recinto a la Artista una vez firmado este contrato.`,
      ],
    },
    {
      heading: '3. Horario y puntualidad',
      paragraphs: [
        `Llegada al recinto: ${terms.callTime} hrs. Prueba de sonido: ${terms.soundcheckTime} hrs. La Artista debe estar lista y con su música cargada antes del inicio del set.`,
        `El set comienza a las ${terms.setStart} hrs y termina a las ${terms.setEnd} hrs. La Artista no puede acortarlo ni extenderlo sin acuerdo con la Producción, y debe avisar de inmediato cualquier retraso por WhatsApp.`,
        terms.proportionalDiscount
          ? 'Si la Artista llega después de la hora acordada, o termina su set antes de tiempo por causas que le sean imputables, el monto pactado se reduce en proporción al tiempo no tocado.'
          : 'La Producción podrá reclamar los perjuicios que cause a la fiesta un atraso o un término anticipado del set por causas imputables a la Artista.',
        'La Producción pone los equipos de sonido y luces del escenario principal y un camarín o zona reservada, y avisa con anticipación cualquier cambio de horario del evento.',
      ],
    },
    {
      heading: '4. Pago',
      paragraphs: [
        `Por el servicio, la Producción pagará ${terms.amountMode === 'liquido'
          ? `${clp(pay.net)} líquidos a la Artista, que corresponden a una boleta de honorarios por ${clp(pay.gross)} brutos (retención del ${rate} % por ${clp(pay.retention)})`
          : `${clp(pay.gross)} brutos mediante boleta de honorarios (retención del ${rate} % por ${clp(pay.retention)}, la Artista recibe ${clp(pay.net)})`}.`,
        'El 100 % se paga el mismo día del evento, al terminar el set, por transferencia bancaria y contra la boleta de honorarios, que la Artista emite en ese momento a nombre de quien le indique la Producción. No hay pago anticipado.',
        'La Artista entrega sus datos bancarios al firmar este contrato.',
      ],
    },
    {
      heading: '5. Imagen, promoción y confidencialidad',
      paragraphs: [
        `La Artista autoriza a la Producción a usar su nombre artístico, imagen y fotos o videos del evento en el line up, redes sociales y material de promoción de ${terms.eventName}, antes y después de la fecha.`,
        'La Artista guardará reserva sobre la ubicación exacta del recinto hasta que la Producción la haga pública, y no grabará ni transmitirá a asistentes sin su consentimiento. Mantendrá un trato de respeto con el público y el equipo.',
      ],
    },
  ];

  if (terms.cancellation.enabled) {
    sections.push({
      heading: '6. Cancelación',
      paragraphs: [
        `Si la Artista cancela con menos de ${terms.cancellation.noticeDays} días de anticipación, salvo fuerza mayor, pagará a la Producción una indemnización equivalente al ${terms.cancellation.penaltyPercent} % del monto pactado. Si la Producción cancela el evento por causas imputables a ella, pagará a la Artista el mismo porcentaje.`,
      ],
    });
  }

  const n = terms.cancellation.enabled ? 7 : 6;
  sections.push({
    heading: `${n}. Fuerza mayor y legislación`,
    paragraphs: [
      'Ninguna parte responde por incumplimientos causados por fuerza mayor o caso fortuito (por ejemplo, orden de autoridad, emergencia o suspensión del evento por causas ajenas). En ese caso las partes acuerdan una nueva fecha o liberan el pago de lo no prestado.',
      'Este contrato se rige por la ley chilena y cualquier diferencia se somete a los tribunales ordinarios de Santiago. Se firma de forma electrónica, y la fecha, hora y dirección IP quedan registradas como constancia.',
    ],
  });

  return {
    version: DJ_CONTRACT_VERSION,
    title: `Contrato de prestación de servicios artísticos · ${terms.eventName}`,
    summary: [
      { label: 'Evento', value: `${terms.eventName} · ${terms.eventDateText}` },
      { label: 'Tu set', value: `${terms.setStart} a ${terms.setEnd} hrs · cierre de la noche` },
      { label: 'Llegada', value: `${terms.callTime} hrs (prueba de sonido ${terms.soundcheckTime} hrs)` },
      { label: 'Pago', value: `${clp(pay.gross)} brutos en boleta de honorarios · ${clp(pay.net)} líquidos` },
      { label: 'Cuándo se paga', value: '100 % el mismo día, al terminar el set' },
    ],
    sections,
  };
}

/** El contrato como texto plano: es lo que se congela y se hashea al firmar. */
export function djContractPlainText(c: DjContract): string {
  return [c.title, `Versión ${c.version}`, ...c.sections.flatMap((s) => [s.heading, ...s.paragraphs])].join('\n\n');
}

/** Lo que la persona escribe al firmar. Devuelve el primer problema, o null si está todo bien. */
export function validateSignature(input: { legalName: string; rut: string; bank: string; accept: boolean; signature: string }, isValidRut: (r: string) => boolean): string | null {
  if (input.legalName.trim().split(/\s+/).filter(Boolean).length < 2) return 'Escribe tu nombre completo, con nombre y apellido.';
  if (!isValidRut(input.rut)) return 'El RUT no es válido. Revísalo.';
  if (input.bank.trim().length < 8) return 'Escribe tus datos bancarios (banco, tipo y número de cuenta) para la transferencia.';
  if (!input.accept) return 'Marca que leíste y aceptas el contrato.';
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]{200,}$/.test(input.signature)) return 'Dibuja tu firma en el recuadro.';
  if (input.signature.length > 400_000) return 'La firma es demasiado grande. Bórrala y vuelve a dibujarla.';
  return null;
}
