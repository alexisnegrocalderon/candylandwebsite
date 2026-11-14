# Estudio Motion: videos de motion graphics con la marca

El Estudio (admin → Contenido → Estudio) hace reels 9:16, posts 4:5 y
cuadrados 1:1 con **Remotion** (React para video). La misma composición
(`motion/`) se ve en vivo en el panel (`@remotion/player`) y se graba a MP4 en
GitHub Actions. Las reglas de movimiento salen de las skills
de `.claude/skills/` (ver más abajo) (nada lineal, entradas escalonadas,
salidas más rápidas, 5 capas por escena, Ken Burns, grano, sonido en cada corte).

## Qué hay

- **Plantillas** (`motion/MotionVideo.tsx`, `motion/scenes.tsx`):
  - **Anuncio**: texto cinético; la escena 1 es el gancho, la última la acción.
  - **Countdown**: número grande que corre, frena con estallido y tic-tac.
  - **Montaje**: fotos/clips con Ken Burns y tinte de marca; los cortes caen en el pulso de la música.
  - **Intro / outro**: la firma animada (isotipo + wordmark + frase). Los demás videos la llevan al final (se puede apagar).
- **Estilos** (`motion/kits.tsx`): **Liquid** (manchas líquidas, burbujas, letra «candy bubble» que rebota),
  **Glitch** (señal rota, separación de color, cortes secos) y **Editorial** (revista premium, revelado con máscara, aros finos).
  **Arcade neón** (solo PLAYMORE, «Player 1 vs Player 2»): grilla neón que corre al horizonte, sol retro, marcador P1 (magenta, mundo Playroom) contra P2 (celeste, mundo Dalmore), palabras que entran en saltos de 8 bits y transición de píxeles; fondo «Arcade» (negro con luz ciruela). En «Puntos de partida» está «PLAYMORE · Player 1 vs Player 2» con el dress code por equipo.
- **Fondos**: solo de marca — celeste `#00A3FF`, rosa `#EF8DFF` o azul tinta `#0010DF`
  (`motionPalette` en `shared/motionSpec.ts`; un test revisa que no entre ningún otro color).
- **Música y efectos**: sintetizados en el repo, sin licencias ni descargas
  (`node scripts/motion/gen-audio.mjs` → `client/public/motion/`). Pulse 120 BPM, Drive 124 BPM, Dream 96 BPM.
- **Voz en off y subtítulos**: voz chilena de Azure (Catalina o Lorenzo). Cada escena dura lo que su frase y los
  subtítulos salen palabra por palabra (repartidas por largo dentro de la frase; Azure no entrega el tiempo de cada palabra).

## Estilo no es plantilla: la composición cambia en cada pieza

Un **estilo** es un lenguaje visual (colores, tipografía, movimiento). Lo que cambia entre una pieza y otra es la
**composición**: dónde va el texto, de qué lado, cuánto crece la palabra clave y dónde cae la forma de color.

- **Catálogo por estilo** (`shared/motionVariety.ts` → `LAYOUTS`; la geometría de cada una está en `motion/layouts.ts`):
  kinetic y editorial tienen 6 (texto abajo, arriba, al centro, a la derecha, palabra gigante, partido); póster 3D, 4
  (palabra clave abajo o arriba, objeto a la izquierda o a la derecha); soft UI, 5 (tarjeta arriba, abajo, protagonista,
  inclinada a un lado); liquid y glitch, 5 (centrado, abajo, arriba, izquierda, derecha).
- **Semilla:** cada video guarda una (`spec.seed`). Con ella se elige la composición de cada escena «automática»,
  **sin repetir la de la escena anterior ni la de dos antes**, y se mueven y espejan un poco las formas. Misma semilla =
  mismo resultado (vista previa, láminas y MP4 se ven igual); otra semilla = otra cara, sin gastar IA. Los videos
  guardados antes de esto sacan la semilla de su nombre, así que no cambian de cara al abrirlos.
- **Las formas se deslizan** de una composición a la siguiente al cambiar de escena (en una lámina quieta ya llegaron).
- **Carrusel:** en cada borde entre dos láminas hay una forma de color centrada justo en la línea (media en cada una),
  que se completa al deslizar (`motion/thread.tsx`).
- **Quién decide:** (1) la semilla, con el botón **«Variar composiciones»** del editor; (2) la IA, que en la misma
  llamada elige la composición de cada escena de cada variante y le da a cada una su propia semilla; (3) tú, con el
  selector **«Composición de esta escena»**, que fija una y deja el resto en automático.

## Look: dos videos del mismo estilo no se ven iguales

Encima del estilo va el **look** (`spec.look`, `shared/motionVariety.ts`; se dibuja en `motion/look.tsx`). Son seis
partes, y cada una se fija a mano o queda en **Auto** (la elige la semilla del video):

| Parte | Opciones |
|---|---|
| Transición | la del estilo, barrido de color, iris, persianas, diagonal, cortina, destello |
| Entrada del texto | la del estilo, sube con máscara, rebote, enfoque, golpe, giro 3D, máquina de escribir (no aplica a kinetic ni póster) |
| Trama del fondo | sin trama, puntos, rayas, cuadros, ondas, rayos |
| Adornos | sin adornos, cintas (con la etiqueta o «Comenta X» corriendo), sello (+18 / palabra clave), recuadro, destellos, stickers |
| Cámara | se acerca, se aleja, deriva lateral, late con la música, quieta |
| Etiqueta | píldora, papelito, subrayada, caja con esquinas |

- **En el editor** está el panel «Look del video»: una fila de botones por parte; el borde punteado marca lo que eligió
  «Auto». **«Sorpréndeme»** cambia la semilla por una cuyo look se parezca lo menos posible al actual y a los últimos
  12 videos guardados en ese dispositivo (`lookMemory.ts`); **«Otros colores»** cambia fondo y acento dentro de la
  marca; **«Fijar este look»** deja todo a mano. Nada gasta IA.
- **En «Auto» solo sale lo que le queda bien a cada estilo** (`autoPool`); a mano se puede elegir cualquier opción.
- **Las 3 variantes de la IA** salen cada una con un look distinto (misma llamada, mismo costo).
- **Los videos guardados antes** no traen look y se quedan con el clásico: no cambian de cara. Con «Sorpréndeme»
  pasan a automático.
- Los adornos van entre el fondo y el texto, en la zona que la composición deja libre; usan solo la paleta del video.
- Revisar a mano: `ONLY=liquid pnpm tsx scripts/motion/preview.mts looks ./looks` (cada opción) o con `SEEDS=5`
  (cinco semillas al azar, como «Sorpréndeme»).

## Sonido en la vista previa: tope de audios a la vez

El reproductor del panel (`@remotion/player`) solo deja montar unas pocas etiquetas de audio a la vez; si se pasan, el video se
cae y la pantalla queda en negro (con el tope de fábrica, 5). Por eso: (1) cada efecto de sonido ocupa su etiqueta solo lo que
dura su WAV (`SFX_FRAMES` en `shared/motionSfx.ts`), no 1 s; (2) el calendario de efectos es una función pura (`sfxSchedule`) y
`shared/motionSfx.test.ts` revisa, en miles de combinaciones de estilo, plantilla, gancho de chat, adorno y duración, que nunca
suenen más de 8 a la vez; (3) el panel sube el tope a 14 (`numberOfSharedAudioTags`); y (4) si algo del dibujo falla, la vista
previa muestra el motivo en vez de un triángulo sobre negro. Al sumar un efecto nuevo, agrégalo a `SFX_FRAMES` con lo que mida su WAV.

## El perrito de Playroom (mascota ilustrada)

- **Dibujo** (`motion/playroom/dog.tsx`): el perrito de los vasos de Playroom. Línea negra gruesa, burbujas de globo de modelar y
  **estampados** (puntos, corazones, cuadrícula de rombos, manchas de dálmata, rayas, cuadros de bola disco, estrellas o liso),
  sin cara. Está dibujado en SVG, burbuja por burbuja: se **infla de a una** (hocico → cabeza → cuerpo → cola), la cola y las orejas
  se mueven, y el estampado crece con cada burbuja como si estuviera impreso en el globo.
- **Colores libres** (no solo los de la marca): magenta, rosa, celeste, rojo, amarillo, menta, violeta, naranja, multicolor (cada
  burbuja de un color), oro y plata; y tres de **solo línea** (negra, celeste o rosa, el dibujo del vaso en un solo color sobre blanco).
- **Estampado «automático»:** lo elige la semilla (`resolveMascotPattern`); en la pareja, el segundo perrito lleva otro.
- **Se comporta como el globo 3D** (misma línea de tiempo, `shared/motionMascot.ts`): rebota en cada pulso de la música, da una
  vuelta en cada corte, revienta en confeti y deja la firma. En «Dibujo» se elige entre **Ilustrado** (nuevo, por defecto) y
  **Globo 3D**; los videos guardados con mascota antes de la ilustración quedan con el 3D.
- **Pesa mucho menos que el 3D:** en un celular simulado (CPU 4× más lenta, sin GPU) el ilustrado va a 19–21 cuadros por segundo y
  el 3D a 2; la pareja ilustrada, a 17.
- Revisar a mano: `pnpm tsx scripts/motion/preview.mts dogs ./perritos` (`FRAME=`, `KIND=pareja`, `ONLY=color,estampado`).

## Gancho de chat (WhatsApp, DM y notificaciones)

- **Qué es:** la escena 1 se dibuja como un celular donde llegan mensajes, en vez del titular (`spec.hook`, `motion/chat.tsx`). Frena
  el scroll en el primer segundo. Tres versiones: **WhatsApp** (cabecera de color, fondo con puntitos, hora y doble check),
  **DM de Instagram** (burbujas redondas, degradé de marca, «Visto») y **notificaciones de pantalla de bloqueo** (apiladas,
  vibra el celular al llegar cada una; se ven las 3 más nuevas).
- **Los mensajes salen de la escena 1:** el «Texto grande» es el primer mensaje que llega y las líneas de abajo (una por línea,
  máximo 5 de 70 letras) son los siguientes; se alternan (llega, responde el espectador, llega…). Antes de cada mensaje que
  llega aparece «escribiendo…». Nombre del contacto editable (por defecto Mansion Playroom).
- **No cambia la línea de tiempo:** la escena 1 dura lo mismo que siempre (con voz, lo que dura su frase), así la voz, los
  subtítulos, la canción y el carrusel siguen calzando. Al activarlo, si la escena 1 es muy corta se alarga a lo que pide la
  conversación (`chatMinSecs`: unos 1 s por mensaje).
- **Sonido:** ding cuando llega un mensaje, barrido cuando se envía el tuyo y vibración en las notificaciones (`ding`, `send` y
  `buzz`, sintetizados en `gen-audio.mjs`). El cuadro de cada mensaje (`shared/motionChat.ts`) es el mismo para la imagen y el audio.
- **Colores:** los de la marca (la cabecera y las burbujas salen del color protagonista y del acento del video), nunca el verde de
  WhatsApp ni el azul de iOS.
- Solo en plantillas anuncio y montaje. Los videos guardados antes quedan sin gancho. La IA puede proponerlo en UNA de las 3
  variantes, y hay un punto de partida sin IA («Gancho de chat»).
- Revisar a mano: `pnpm tsx scripts/motion/preview.mts chat ./chat` (`STRESS=1` prueba seis mensajes largos).

## Collage y papel, y Pizarra (estilos de dibujo a mano)

- **Collage y papel** (`motion/kits/collage.tsx`): cuatro papeles dentro de un mismo estilo, que se elige en «Papel» o, en
  «Automático», lo decide la semilla del video (`resolvePaper`): **rasgado** (cada palabra es un recorte con borde dentado que se
  pega de un golpe y tiembla), **risografía** (dos tintas translúcidas que no calzan del todo, se cruzan en una lente),
  **scrapbook** (letras recortadas una por una sobre hoja de cuaderno con cinta) y **diario** (titular de prensa, semitono y la
  palabra clave con resaltador). Todo se mueve «a doses» (cada 2 o 3 cuadros), que es lo que lo hace parecer hecho a mano. La
  transición es una tira de papel rasgado que cruza el cuadro.
- **Pizarra** (`motion/kits/pizarra.tsx`): el texto se escribe con marcador de izquierda a derecha (con la punta), la palabra clave se
  subraya con un trazo que tiembla y cada escena dibuja 3 garabatos (estrella, flecha, círculo, espiral, rayo, corazón…) en las
  zonas que el texto deja libres (`motion/paper.ts`). Las líneas «hierven» cada 3 cuadros. La transición es un borrador de pizarra.
  Letra: Permanent Marker (Apache 2.0, `client/public/studio/fonts/`; aviso en `OFL-NOTICE.txt`).
- Solo colores de la paleta del video (nunca uno nuevo), sin filtros pesados: en celular simulado (CPU 4× más lenta) corren a
  24–28 fps, igual que Liquid, y graban más rápido que Liquid.
- Revisar a mano: `pnpm tsx scripts/motion/preview.mts papers ./papers` (los 4 papeles y la pizarra, con cortes).
- Los dos tienen punto de partida sin IA («Collage de papel» y «Pizarra a mano») y la IA los conoce.

## Skills de motion, subtítulos, música y ritmo

- **Skills en el repo** (`.claude/skills/`, MIT de iart.ai; ver su `README.md`): animation-principles, beat-sync-editing,
  short-form-video, caption-animation, kinetic-typography, countdown-video, lower-thirds, logo-animation y otras.
  Son instrucciones para el agente (Claude Code): al pedir «mejora el timing» o «revisa el gancho» las lee y las aplica sobre
  `motion/`. No se ejecutan en el sitio.
- **Subtítulos** (con voz en off), tres estilos seleccionables (`spec.captionStyle`): *clásico* (de a 3, como siempre),
  *karaoke* (las palabras saltan al decirse y la que suena va en una caja del color protagonista) y *una palabra a la vez*
  (grande, con golpe de zoom). Páginas de hasta 3 palabras que nunca cruzan un punto o una coma (`captionPages`); contorno
  que contrasta con el texto (en fondos claros va del color del fondo); bloque sobre los ~340 px que tapa la interfaz de
  Reels. Los videos guardados antes quedan en «clásico»; los nuevos, en «karaoke».
- **Música de la casa**, sintetizada en código (`node scripts/motion/gen-audio.mjs`): Pulse 120, Drive 124, Dream 96 y las
  nuevas **Neon** (synthwave, 110 BPM), **Latino** (dembow, 98 BPM) y **Hype** (140 BPM). Las nuevas se generan al final
  con su propia semilla, así los WAV anteriores no cambian. Una canción propia (`spec.song`) manda sobre todas.
- **Efectos por acción**: cada adorno del look suena al aparecer (sello → golpe, destellos → centelleo, cintas → rasgado,
  stickers → pops) y en arcade suena una moneda en cada escena.
- **Ritmo en arco** (botón en el editor, sin IA): reparte los mismos segundos con la forma de un reel: gancho corto, escenas
  del medio cada vez más rápidas y cierre largo (`shapePacing`). La IA recibe la misma regla. Con voz en off manda lo que
  dura cada frase y el botón se desactiva.
- Revisar a mano: `pnpm tsx scripts/motion/preview.mts captions ./caps` (los tres estilos de subtítulos).

## Video de fondo con texto que se adapta

Se sube UN video (MP4, MOV o WebM, hasta 150 MB y 3 min) en «Video de fondo». Corre continuo detrás de todo el reel y el texto de cada escena se adapta a lo que hay detrás.

- **Análisis en el navegador** (`client/.../videoAnalysis.ts`): cada 0,5 s mide luz y detalle de arriba, centro y abajo, y los cortes de plano. El resultado viaja dentro de la receta (`spec.backdrop`, `shared/motionBackdrop.ts`); la grabación nunca vuelve a analizar. Todo gratis, sin IA.
- **Adaptación** (`motion/backdrop.tsx`, `shared/motionBackdropPlan.ts`): una decisión por escena (sin parpadeo). Texto claro u oscuro según la luz mediana, y un degradado detrás solo si hace falta para llegar a contraste 4 (tope 0,72). Los colores de marca se conservan; cambia el héroe si no se lee. Opciones: automática, siempre claro, siempre oscuro, sin adaptar.
- **Tramo y repetición**: `start` (se elige tocando el mapa de luz) y `loop` repetir o congelar si el reel dura más que el tramo. `mix` deja ver el fondo del estilo por encima del video.
- **Móvil**: un solo `<video>` en la vista previa, sin filtros CSS sobre el video, análisis cancelable con cuadros de 54×96. Medido con iPhone simulado y CPU 4×: ~21 fps con video vs ~23 sin video.
- **HEVC del iPhone** no se lee en Chrome de escritorio: el panel avisa y pide MP4 (H.264). La grabación en GitHub sí lo decodifica.
- Subida directa a Blob (`studio-backdrops/`, tope 150 MB en `server/blobUpload.ts`).
- Falta (próximas etapas): estilos pensados para video, textos en los cortes, guion con IA viendo el video, audio original, texto detrás de la persona.

## Pack: reel, carrusel, post e historia de una misma idea

El contenido es **uno solo** (las escenas del video). En el editor, la pestaña **Carrusel · Post · Historia** dibuja
esas mismas escenas como láminas quietas, con el mismo estilo, y las descarga como PNG a 1080 px de ancho:

| Salida | Tamaño | Qué lleva |
|---|---|---|
| Carrusel | 4:5 (1080×1350) | una lámina por escena (máximo 10), con «Desliza →» y el cierre (firma o tarjeta del @) como última |
| Post | 4:5 | el gancho (escena 1) |
| Historia | 9:16 (1080×1920) | el gancho y, si hay más de una escena, la última (la acción) |

- Cada lámina es la composición de Remotion **congelada en el cuadro donde la escena ya quedó asentada**
  (`packSlides` en `shared/motionSpec.ts`), así que se ve igual que el reel. En las láminas, el HUD muestra «01 / 04»
  en vez del cronómetro.
- Se generan **en el navegador, sin servidor ni IA** (`client/src/components/admin/motion/PackPanel.tsx` y
  `exportPack.ts`): se dibuja cada lámina a tamaño real fuera de pantalla y se captura con `html-to-image`, con las
  fuentes incrustadas. Botones: PNG o ZIP de la salida elegida, «Compartir» (menú del celular) y «Pack completo (ZIP)».
- Si cambias un texto en el video, las láminas se rehacen solas. El MP4 del reel se graba aparte («Grabar MP4»).
- El póster 3D dibuja con WebGL: en un computador sin tarjeta gráfica la exportación puede tardar más.

## La IA, sin gastar de más

- **«Crear 3 variantes»**: UNA llamada a Claude Sonnet 5.5 (`server/motionAi.ts`, esfuerzo bajo, salida JSON)
  devuelve las tres direcciones (liquid, glitch, editorial) con guion, ritmo, fondo y música. Las reglas y la
  biblioteca van en un system fijo con caché; los datos del evento van aparte. Cuesta ≈ US$ 0,01–0,02 y queda
  registrado en el gasto de IA (`studio-motion`).
- Elegir, editar textos, cambiar estilo, fotos o música **no llama a la IA**: la vista previa se rehace sola.
- **Plan de contenido** (pestaña «Plan»): el calendario hasta el evento (`server/contentPlanner.ts`), ahora
  guardado en el servidor por evento y con su system en caché. Cada pieza sugiere plantilla y estilo, y
  «Crear video» la manda directo a las 3 variantes.

## Grabar a MP4

1. «Grabar MP4» graba lo **guardado**. `server/studioRender.ts` limpia la receta (URLs completas, solo del sitio o
   de Vercel Blob) y dispara `.github/workflows/render-video.yml` con tres datos públicos: id del video, id de
   la grabación y dirección del sitio.
2. La máquina de GitHub (`scripts/render-studio-video.mjs`) instala `motion/package.json` (solo Remotion, React y
   Blob), pide la receta al sitio con `RENDER_CALLBACK_SECRET`, graba con `renderMedia` (h264, CRF 17), pide un
   permiso de subida para ese MP4 y lo sube a Vercel Blob.
3. El panel pregunta cada 5 s. A los 25 min sin respuesta se da por fallida. Si el video cambia después, el panel
   avisa que el MP4 quedó viejo.
4. Con el MP4 listo, «Mandar a embajadores» lo deja en «Por aprobar» (admin → Contenido → Contenido embajadores).

### Configuración (una sola vez)

1. **Clave compartida:** inventa una clave larga (`openssl rand -hex 32`) y guárdala como `RENDER_CALLBACK_SECRET`
   en Vercel (Environment Variables) y en GitHub (Settings → Secrets and variables → Actions).
2. **Token de GitHub:** un fine-grained token solo para este repo con **Actions: Read and write**, en Vercel como
   `GITHUB_RENDER_TOKEN`.
3. **Vercel Blob:** `BLOB_READ_WRITE_TOKEN` (ya está).
4. **Voz (opcional):** recurso Speech de Azure (plan F0 gratis, 500.000 letras al mes) → `AZURE_SPEECH_KEY` y
   `AZURE_SPEECH_REGION` en Vercel.
5. Vuelve a desplegar. El panel dice qué falta.

Opcionales: `GITHUB_RENDER_REPO` y `GITHUB_RENDER_REF` (rama del workflow, por defecto `main`).

**Licencia de Remotion:** gratis para personas y empresas de hasta 3 personas; con más, Remotion pide una
licencia de empresa (remotion.pro).

## Revisar a mano

```bash
pnpm tsx scripts/motion/preview.mts stills ./stills        # cuadros de todas las plantillas × estilos
ONLY=countdown-glitch pnpm tsx scripts/motion/preview.mts stills ./stills
pnpm tsx scripts/motion/preview.mts video receta.json out.mp4
npx remotion studio motion/index.ts                         # Remotion Studio con la receta de partida
```

Código: `shared/motionSpec.ts` (la receta, su limpieza, la línea de tiempo y los subtítulos), `motion/`
(la composición), `server/motionStudio.ts` (guardar, kind `motion` y `plan` en `contentDesigns`),
`server/motionAi.ts` (IA), `client/src/components/admin/motion/` (panel).
