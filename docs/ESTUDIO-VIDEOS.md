# Estudio Motion: videos de motion graphics con la marca

El Estudio (admin → Contenido → Estudio) hace reels 9:16, posts 4:5 y
cuadrados 1:1 con **Remotion** (React para video). La misma composición
(`motion/`) se ve en vivo en el panel (`@remotion/player`) y se graba a MP4 en
GitHub Actions. Las reglas de movimiento salen de la skill
`.claude/skills/remotion-motion-graphics` (nada lineal, entradas escalonadas,
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
