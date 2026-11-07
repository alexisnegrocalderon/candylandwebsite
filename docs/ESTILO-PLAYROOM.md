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
- **De marca, a todo el sangrado:** **celeste `#00A3FF`**, **rosa `#EF8DFF`** o azul tinta `#0010DF`, con blanco y magenta `#FF008E`.
- **Neutros editoriales (decisión del dueño, nov 2026):** perla `#F2EFEA` y niebla `#E6ECF4`, con texto grafito `#16161A`
  y **un solo** color de marca como acento (el «círculo» de las piezas de revista).
- **Noche (PLAYMORE):** ciruela `#2A0A33` → negro cálido `#0C0908`, texto crema `#F4EFE6` y degradé rosa `#E477EA` → oro `#D6B25E`.
  Solo para piezas de fiesta nocturna.
- Ningún otro color: `BRAND` en `shared/motionSpec.ts` es la lista y un test la hace cumplir.
- Los colores de ediciones pasadas (REDROOM rojo y negro, Dark Candy) ya no se usan.

## Tipografía
- **Gliker** con volumen «candy bubble» para el estilo liquid.
- **Syne** (gruesa, tracking negativo) + **Space Grotesk** para lo editorial: palabras chicas + la protagonista enorme.
- **Inter / Space Grotesk** en micro-tipo para el HUD (barra superior, marcas, @, contador).

## Sonido
- Música fuerte (volumen medio de −12 a −13 dB, picos a 0 dB). Para publicar conviene estandarizar a −14 LUFS.

## Formatos
Desde el Estudio Motion (Remotion, ver `docs/ESTUDIO-VIDEOS.md`):

| Formato | Estado |
|---|---|
| Anuncio (texto cinético) | **Hecho**: plantilla `anuncio` |
| Cuenta regresiva | **Hecho**: plantilla `countdown` |
| Montaje de fotos/clips a ritmo | **Hecho**: plantilla `montaje` (cortes en el pulso) |
| Intro / outro de marca | **Hecho**: plantilla `sting` y firma al final de cada video |
| Reels con voz hablada y subtítulos | **Hecho**: voz chilena de Azure + subtítulos palabra por palabra |
| Presentación con gancho de celular (mockup, mensaje falso) | Pendiente |
| Publicación programada en Instagram | Pendiente (primero con aprobación) |

## Cómo se compara
Cada formato nuevo se recrea a partir de un reel real y se compara cuadro a
cuadro con el original. El de la cuenta regresiva se probó contra el reel
«8 días para REDROOM» (1080×1920, 6 s).
