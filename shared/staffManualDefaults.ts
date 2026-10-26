/* Borradores del manual del staff: el punto de partida que el admin carga en el editor, corrige y publica. Hablan de lo
 * que hace la app hoy (/caja, /puerta, /cocina, /guardarropia). Lo que depende del dueño (montos, castigos, horarios
 * exactos) queda entre [corchetes] para completar: nada de eso se inventa acá. */
import type { ManualKey, ManualSection } from './staffManuals';

const text = (title: string, body: string): ManualSection => ({ title, kind: 'text', text: body, items: [] });
const list = (title: string, items: string[]): ManualSection => ({ title, kind: 'checklist', text: '', items });

export const MANUAL_DRAFTS: Record<ManualKey, { title: string; sections: ManualSection[] }> = {
  general: {
    title: 'Reglamento general del staff',
    sections: [
      text('Quiénes somos y cómo trabajamos', 'Trabajamos para que cada persona viva una noche segura y bien atendida. Trata a todos con respeto, sin excepciones, y recuerda que representas a Mansion PlayRoom ante el público.'),
      text('Condiciones del trabajo', 'Pago: [monto o forma pactada] por noche, por [transferencia / boleta de honorarios], dentro de [plazo] después de la fiesta.\nLa puntualidad es parte del trabajo: llega a la hora de citación que ves en tu app. Si no puedes llegar, avisa con anticipación al contacto de producción.\nConsumo propio: [definir: qué incluye el staff, o no incluye].'),
      text('Conducta', 'No se consume alcohol ni drogas durante tu turno. Quien llegue en mal estado no podrá trabajar esa noche.\nNo se atiende el celular personal frente al público, salvo para tu tarea.\nNo se discute ni se pelea con clientes: si la situación escala, llama a seguridad y al supervisor.'),
      text('Confidencialidad y fotos', 'No saques fotos ni videos a clientes sin su permiso, ni compartas datos de clientes (nombres, teléfonos, listas, ventas). Lo que ves en la app es solo para trabajar.'),
      text('Dinero y consumos', 'Nunca regales ni cobres de más: todo se registra en la caja. Las anulaciones y correcciones las hace solo el supervisor. Si algo no cuadra, avísalo de inmediato; no lo arregles por tu cuenta.'),
      text('Menores de edad y personas ebrias', 'Solo entra y consume quien cumple la edad requerida. No se sirve alcohol a personas ebrias ni a menores. Ante la duda, consulta al supervisor.'),
      text('Si algo no cumples', '[Definir: qué pasa ante un incumplimiento: advertencia, descuento, no volver a ser convocado…]'),
    ],
  },
  caja: {
    title: 'Manual de Caja',
    sections: [
      list('Apertura', ['Llegar a la hora de citación y mostrar tu credencial en la puerta', 'Entrar a /caja con tu PIN y elegir tu caja', 'Abrir el turno con el efectivo inicial y contarlo', 'Probar una venta de prueba y una impresión o pantalla', 'Confirmar que la tablet está sincronizando (sin avisos rojos)']),
      list('Cierre', ['Cerrar la última venta y revisar «Por rehacer» (no debe quedar nada)', 'Esperar a que todo se sincronice', 'Contar el efectivo y cerrar el turno con el monto real', 'Entregar el efectivo y el reporte al supervisor']),
      text('Cómo se vende y se cobra', 'Todo cobro se registra en la caja, aunque sea un trago regalado o una cortesía. Verifica el medio de pago antes de entregar. Si no hay señal, sigue vendiendo: la tablet guarda todo y lo sincroniza sola cuando vuelve la conexión.'),
      text('Canjear extras (tragos, estacionamiento, etc.)', 'Busca al cliente por su nombre o escanea su QR. Si tiene varios tragos, elige cuántos cobra ahora con el selector: no hace falta cobrar todos juntos. Si te equivocas, tienes 60 segundos para tocar «Deshacer». Pasado ese tiempo, solo un supervisor puede anular.'),
      text('Reglas', 'No cobres ni canjees sin ver el código o el QR.\nNo anules ventas: pídele al supervisor.\nNo dejes la caja sin atender ni la tablet sin vigilar.'),
      text('Si algo falla', 'Sin señal: sigue vendiendo.\nLa tablet no responde: avisa al supervisor.\nDiscrepancia de dinero: no la tapes; avísala y queda anotada en el cierre.'),
    ],
  },
  barra: {
    title: 'Manual de Barra',
    sections: [
      list('Apertura', ['Llegar a la hora de citación', 'Entrar a /caja con tu PIN', 'Revisar hielo, vasos, frutas y botellas del turno', 'Ordenar y limpiar la barra', 'Confirmar con el supervisor la carta del día y lo agotado']),
      list('Cierre', ['Guardar y cerrar botellas', 'Limpiar y ordenar la barra', 'Avisar al supervisor lo que quedó bajo en stock', 'Cerrar tu sesión de caja']),
      text('Servir y canjear', 'Antes de servir un trago canjeado, escanea el QR o ingresa el código del cliente y canjéalo en /caja. Si el cliente tiene varios, canjea solo los que pide en ese momento. Si te equivocas, usa «Deshacer» dentro de 60 segundos.'),
      text('Servicio responsable', 'No se sirve alcohol a personas ebrias ni a menores. No se regalan tragos: todo queda en la caja. Si alguien se descompensa, avisa a seguridad y al supervisor.'),
      text('Reglas', 'Sin consumo propio durante el turno [ajustar según lo acordado].\nCelular solo para tu tarea.\nLa barra queda siempre limpia y ordenada.'),
    ],
  },
  puerta: {
    title: 'Manual de Puerta y Seguridad',
    sections: [
      list('Apertura', ['Llegar a la hora de citación', 'Entrar a /puerta con tu PIN', 'Revisar que el escáner y la cámara funcionan', 'Coordinar con el supervisor la hora de apertura y los accesos', 'Revisar la lista de staff y de invitados de la noche']),
      list('Cierre', ['Revisar que el recinto quede despejado', 'Confirmar con el supervisor que no queda nadie atrás', 'Cerrar tu sesión']),
      text('Cómo se ingresa', 'Cada persona entra con su QR: escanéalo en /puerta y comprueba que el estado diga válido. Una entrada se usa una sola vez. Si el sistema marca «ya usada» o «anulada», no dejes pasar y avisa al supervisor. Revisa el documento de identidad cuando corresponda.'),
      text('Qué hacer ante problemas', 'Cliente sin entrada o con una entrada rara: se le deriva al supervisor, nunca se improvisa.\nPersona ebria o agresiva: no entra; mantén la calma y llama al supervisor.\nPelea o emergencia: protocolo de seguridad, llamar a [teléfono de emergencia / producción].'),
      text('Reglas', 'No se deja entrar a menores ni a personas que no cumplan las condiciones del evento.\nNo se registran fotos ni datos de clientes.\nNo se discute: ante dudas, el supervisor decide.'),
    ],
  },
  cocina: {
    title: 'Manual de Cocina',
    sections: [
      list('Apertura', ['Llegar a la hora de citación', 'Entrar a /cocina con tu PIN', 'Revisar stock, refrigeración y utensilios', 'Encender y limpiar la plancha / freidora', 'Confirmar con el supervisor la carta del día y lo agotado']),
      list('Cierre', ['Apagar equipos y cerrar gas', 'Limpiar y guardar la comida', 'Sacar la basura y limpiar el piso', 'Avisar al supervisor lo agotado o lo que falta']),
      text('Pedidos', 'Los pedidos llegan a /cocina. Prepáralos en orden y márcalos como listos para que el cliente sea avisado. Si algo se agota, avísalo de inmediato para que lo marquen agotado y no se siga vendiendo.'),
      text('Higiene', 'Manos limpias, pelo recogido, superficies desinfectadas. No se reutiliza comida que se cayó ni la que no está bien refrigerada.'),
      text('Reglas', 'No se regala comida sin que quede registrada en la caja.\nNo se consume alcohol durante el turno.\nLa cocina queda siempre limpia al final.'),
    ],
  },
  guardarropia: {
    title: 'Manual de Guardarropía',
    sections: [
      list('Apertura', ['Llegar a la hora de citación', 'Entrar a /guardarropia con tu PIN', 'Revisar perchas, números y lector de QR', 'Ordenar el espacio y dejarlo despejado', 'Confirmar con el supervisor cualquier regla especial de la noche']),
      list('Cierre', ['Devolver todas las prendas', 'Anotar y entregar al supervisor lo que quedó sin retirar', 'Cerrar tu sesión']),
      text('Recibir y entregar', 'Cada prenda queda asociada al código del cliente. Al entregarla, comprueba el QR o el código y registra la entrega. Nunca entregues sin verificar.'),
      text('Prendas perdidas o dañadas', 'Si algo se pierde o se daña, avisa al supervisor en el momento y deja constancia. No prometas reembolsos ni compensaciones por tu cuenta.'),
      text('Reglas', 'No se guardan objetos de valor sin que el supervisor lo autorice.\nNo se revisan bolsillos ni mochilas sin motivo.\nMantén el espacio ordenado y bien identificado.'),
    ],
  },
  supervisor: {
    title: 'Manual de Supervisor y Producción',
    sections: [
      list('Apertura', ['Llegar antes que el equipo y revisar todos los puestos', 'Confirmar la hora de citación y la llegada de cada persona', 'Abrir turnos de caja con el efectivo inicial', 'Revisar quién aceptó el manual y pedir que acepten en el lugar a quien no lo haya hecho', 'Confirmar la carta del día, lo agotado y los contactos de emergencia']),
      list('Cierre', ['Cerrar y cuadrar todos los turnos de caja', 'Revisar «Por rehacer» y las ventas rechazadas', 'Recibir los reportes y el efectivo', 'Confirmar que cocina, barra y guardarropía quedaron cerradas', 'Registrar incidentes de la noche']),
      text('Qué puedes hacer que los demás no', 'Anular ventas y canjes, corregir errores pasado el tiempo de «Deshacer» y cerrar turnos. Cada anulación exige un motivo y queda registrada: úsala solo cuando corresponde.'),
      text('Durante la noche', 'Recorre los puestos, resuelve dudas y escala los problemas. Ante una emergencia, tú coordinas: seguridad, primeros auxilios y contacto con producción [definir teléfono].'),
    ],
  },
  dj: {
    title: 'Manual de DJ y Artistas',
    sections: [
      list('Antes del evento', ['Confirmar horario de montaje y de tu set con producción', 'Enviar tu rider técnico y lo que necesitas', 'Llegar a la hora de citación y mostrar tu credencial']),
      list('Al terminar', ['Retirar tus equipos', 'Avisar a producción que terminaste', 'Confirmar tu pago']),
      text('Tu set', 'Respeta tu horario y el volumen acordado. Si producción te pide bajar el volumen o cortar, se hace de inmediato.'),
      text('Tu link de ventas', 'Con tu link y tu código, cada entrada que se compre queda a tu nombre. Compártelo solo desde tus canales y sin prometer cosas que el evento no ofrece.'),
    ],
  },
  rrpp: {
    title: 'Manual de RRPP y Promotores',
    sections: [
      list('Antes del evento', ['Confirmar tu link y tu código de referido en tu app', 'Conocer la fecha, el lugar y las condiciones de entrada', 'Compartir tu link por tus canales']),
      list('Al terminar', ['Revisar tus ventas en tu app', 'Confirmar con producción el pago o la comisión']),
      text('Cómo promocionar', 'Comparte tu link de ventas y tu código. Informa con verdad: fecha, lugar, precios, edad y condiciones. No prometas ingreso ni beneficios que no ofrece el evento.'),
      text('Reglas', 'No uses las marcas de forma engañosa. No recibas dinero por fuera del link: la venta debe quedar registrada para que cuente a tu nombre.'),
    ],
  },
  produccion: {
    title: 'Manual de Montaje y Foto',
    sections: [
      list('Antes de abrir', ['Llegar a la hora de citación', 'Revisar el plan de montaje y de fotos con producción', 'Confirmar zonas, accesos y límites']),
      list('Al terminar', ['Entregar el material (fotos, videos) a producción', 'Dejar tu zona ordenada', 'Avisar al supervisor que terminaste']),
      text('Fotos y videos', 'Fotografía al público solo en las zonas y formas acordadas. Si un cliente no quiere salir, se respeta de inmediato. El material es de la empresa y no se comparte por tu cuenta.'),
    ],
  },
  otro: {
    title: 'Manual del equipo',
    sections: [
      list('Antes de empezar', ['Llegar a la hora de citación', 'Mostrar tu credencial en la puerta', 'Confirmar tus tareas con el supervisor']),
      list('Al terminar', ['Dejar tu zona ordenada', 'Avisar al supervisor que terminaste']),
      text('Tus tareas', '[Describe aquí qué hace esta persona durante la noche y a quién reporta]'),
    ],
  },
};
