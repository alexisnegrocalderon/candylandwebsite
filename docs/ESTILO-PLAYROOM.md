# Estilo Playroom de reels

Lo que se sacó de los reels de motion graphics hechos a mano en CapCut
(estructura, letras y movimiento; los colores son los de la marca, ver abajo). Es la referencia para armar cada formato nuevo del
Estudio: si algo no se parece a esto, se ajusta el formato, no el estilo.

## Estructura
- **Gancho en el primer segundo:** celular girando, mensaje de WhatsApp falso o el logo con efecto.
- **Una frase por momento**, de 1,2 a 2,5 s y casi siempre de 5 palabras o menos.
- **Cierre fijo:** fecha y hora en una etiqueta, «Comenta "X" y revisa tu DM» y la ciudad abajo.
- Duran de 6 a 21 s.

## Texto
- Letra negrita, condensada y en mayúsculas; una segunda letra (graffiti o cursiva) para una palabra clave.
- Sellos (rojos, ladeados), papelitos pegados, cintas de contenedor ("FALTAN SÓLO...") y recuadros con esquinas marcadas.

## Movimiento
- Glitch con separación de color (dos copias cian y rosada que se juntan), aparición desde el desenfoque, eco, zoom y máscaras.
- Cortes secos o con destello. Todo cae en el ritmo de la música (pendiente: detectar el beat).

## Color
- Solo los colores de la marca (PlayRoom Design System): fondo liso **celeste `#00A3FF`** o **rosa `#EF8DFF`**,
  con blanco, magenta `#FF008E` y azul `#0010DF`. Un solo fondo por pieza, sin degradados.
- Los colores de los reels de ediciones pasadas (REDROOM en rojo y negro, Dark Candy en negro, rosado y verde ácido)
  ya no se usan.

## Sonido
- Música fuerte (volumen medio de −12 a −13 dB, picos a 0 dB). Para publicar conviene estandarizar a −14 LUFS.

## Formatos
| Formato | Estado |
|---|---|
| Cuenta regresiva | **Hecho** (`shared/studioCountdown*.ts`) |
| Lista de características (sellos, papelitos, ritmo) | Pendiente |
| Presentación con gancho de celular (mockup, mensaje falso) | Pendiente |
| Reels con voz hablada y subtítulos (Whisper) | Pendiente |
| Cuenta regresiva diaria automática | Pendiente (`countdownVideo` ya calcula todo desde la fecha del evento) |
| Publicación programada en Instagram | Pendiente (primero con aprobación) |

## Cómo se compara
Cada formato nuevo se recrea a partir de un reel real y se compara cuadro a
cuadro con el original. El de la cuenta regresiva se probó contra el reel
«8 días para REDROOM» (1080×1920, 6 s).
