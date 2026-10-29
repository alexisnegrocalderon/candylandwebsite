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
      list('Apertura', ['Llegar a la hora de citación', 'Entrar a /caja con tu PIN', 'Revisar hielo, vasos, frutas y botellas del turno', 'Hacer el conteo inicial en /barra (tarea «Conteo inicial» de tu app, antes de abrir puertas): botellas cerradas y cuánto le queda a la abierta', 'Ordenar y limpiar la barra', 'Confirmar con el supervisor la carta del día y lo agotado']),
      list('Cierre', ['Guardar y cerrar botellas', 'Hacer el inventario de cierre en /barra (tarea «Inventario de cierre» de tu app, cuando termina la fiesta)', 'Limpiar y ordenar la barra', 'Avisar al supervisor lo que quedó bajo en stock', 'Cerrar tu sesión de caja']),
      text('Servir y canjear', 'Antes de servir un trago canjeado, escanea el QR o ingresa el código del cliente y canjéalo en /caja. Si el cliente tiene varios, canjea solo los que pide en ese momento. Si te equivocas, usa «Deshacer» dentro de 60 segundos.'),
      text('Servicio responsable', 'No se sirve alcohol a personas ebrias ni a menores. No se regalan tragos: todo queda en la caja. Si alguien se descompensa, avisa a seguridad y al supervisor.'),
      text('Reglas', 'Sin consumo propio durante el turno [ajustar según lo acordado].\nCelular solo para tu tarea.\nLa barra queda siempre limpia y ordenada.'),
    ],
  },
  puerta: {
    title: 'Manual de Puerta',
    sections: [
      list('Apertura', ['Llegar a la hora de citación y mostrar tu credencial', 'Entrar a /puerta con tu PIN', 'Revisar que la cámara escanea y que el celular tiene batería y señal', 'Ver en pantalla cuántos estacionamientos VIP están reservados y dejar esos lugares libres, los más cercanos a la escalera de ingreso a la casona', 'Confirmar con los organizadores la hora de apertura y a quién llamar ante una urgencia [falta: teléfono de emergencia]']),
      list('Cierre', ['Revisar con los organizadores que no quede nadie por ingresar', 'Confirmar el registro de los estacionamientos cobrados en la puerta', 'Entregar el efectivo cobrado y el resumen a los organizadores', 'Cerrar tu sesión']),
      text('Cómo recibir', 'Recibe a cada persona de forma grata y cordial. Eres la primera cara de la fiesta: saluda, sonríe y mantén la fila ordenada y tranquila.'),
      text('Revisar el acceso', 'Escanea el acceso de cada persona. Comprueba que el tipo de acceso coincida con las personas que vienen y pide la identificación (cédula o pasaporte) de cada una; compara su nombre y su documento con lo que muestra la pantalla. En la pantalla toca «Verifiqué las cédulas» antes de dar el acceso.\nSi el sistema marca el código como usado o anulado, o la persona no coincide, no la dejes pasar y avisa a los organizadores.'),
      text('Estacionamiento', 'Al escanear, revisa si el acceso ya tiene estacionamiento pagado o si debe pagar, y de qué tipo es: normal o VIP.\nLa pantalla indica cuántos estacionamientos VIP están reservados desde antes. Esa cantidad de lugares queda reservada y debe ser la más cercana a la escalera de ingreso a la casona: indica a los autos VIP hacia ahí.\nSi la persona no tiene estacionamiento pagado (por auto, con el QR del chofer o de quien venga con el asistente): escanea el QR, indica en el sistema que va a pagar estacionamiento y con qué medio de pago (efectivo, débito o crédito). Queda anotado en el sistema.\nSi paga con tarjeta, además se cobra con la máquina: cobra en la máquina por el monto que muestra la pantalla y confirma en el sistema cuando salga aprobado.'),
      text('Fuera del sistema', 'Cualquier situación que no esté en el sistema se resuelve con los organizadores, de inmediato. Usa el botón «Avisar a los organizadores» de tu pantalla: elige el motivo y les llega una notificación al instante. Si no tienes señal, llámalos por teléfono.'),
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
  anfitrion_playmatch: {
    title: 'Manual de Anfitrión Playmatch',
    sections: [
      list('Antes de la fiesta', ['Llegar a la hora de citación y mostrar tu credencial en la puerta', 'Abrir tu app → «Anfitrión Playmatch» y revisar la meta de la noche', 'Tener a mano el QR de «Baja la App» (pantalla con brillo alto)', 'Coordinar con tu compañero/a de anfitrión en qué zona de la casa se pone cada uno']),
      text('Tu trabajo', 'Ayudas a que la gente baje la App, entre a Playmatch y encuentre lo que busca. Tú no decides con quién se conecta nadie: acompañas, explicas cómo funciona y resuelves dudas.'),
      list('Cómo ayudar a alguien', ['Preséntate con tu nombre y tu credencial', 'Muestra el QR de «Baja la App» o ayuda a abrir el link', 'Explica en una frase: pones tu foto, deslizas ♥ y, si los dos se dan ♥, es match y se abre el chat', 'Si falta la foto o contar qué busca, busca a la persona en «Ayudar a armar el perfil» y mándale el aviso', 'Si no quiere participar, lo respetas y no insistes']),
      text('Lo que nunca haces', 'No pidas ni anotes datos personales (teléfono, redes, correo). No saques fotos de las pantallas de otras personas ni muestres perfiles ajenos. No presiones a nadie para participar ni para comprar Super Likes. No prometas matches ni resultados.'),
      text('Denuncias y problemas', 'Si alguien se siente incómodo o te cuenta un problema con otra persona, avisa de inmediato al supervisor o a seguridad. Las denuncias de la App llegan al administrador: tú no expulsas a nadie.'),
      list('Al terminar', ['Revisar la meta final de la noche', 'Contarle al supervisor qué dudas se repitieron', 'Cerrar tu sesión de la app']),
    ],
  },
  animador: {
    title: 'Manual de Animador / MC',
    sections: [
      list('Antes de la fiesta', ['Llegar a la hora de citación y mostrar tu credencial en la puerta', 'Abrir tu app → «Animador» y revisar el guion de la noche', 'Coordinar con el creador de contenido las señales y el orden de tomas', 'Confirmar dónde se graban las dinámicas y dónde queda la zona tranquila']),
      text('Tu trabajo', 'Animas la noche con dinámicas breves y juguetonas. Pones el ritmo, explicas las reglas en una frase y cuidas que todo sea con ganas y con respeto. Tú no obligas a nadie: invitas.'),
      list('Antes de grabar cada dinámica', ['Pregunta si la persona quiere jugar y si quiere salir en cámara', 'Pídele a cámara la frase: «Soy [apodo], tengo +18, juego porque quiero y acepto aparecer en los reels de Candyland»', 'Sin esa frase no se graba a la persona; el creador encuadra otro lado', 'Ofrece siempre la versión suave si dudan']),
      text('Lo que nunca haces', 'Nada de desnudez ni actos sexuales. No presiones ni insistas ante un «no» o un «paso». No uses retos que obliguen a beber. No expongas a nadie sin su consentimiento. No uses las dinámicas atrevidas sin opt-in expreso de todas las personas involucradas.'),
      text('Si alguien se siente incómodo', 'Corta la dinámica con naturalidad, avisa al supervisor o a seguridad y deja que la persona se retire sin explicar nada.'),
      list('Al terminar', ['Contarle al supervisor qué dinámicas funcionaron mejor', 'Confirmar con el creador qué material se grabó solo con consentimiento', 'Cerrar tu sesión de la app']),
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
