# Videos del Estudio: grabar a MP4

El Estudio (admin → Marketing → Estudio) arma reels 9:16 y posts animados 3:4
con HyperFrames. «Exportar MP4» los graba en GitHub Actions y deja el video
para descargar en el mismo editor. No usa IA ni gasta créditos. Como el repo es
público, GitHub Actions no cobra los minutos.

## Cómo funciona

1. El panel arma el proyecto (la composición HTML y qué archivo va en cada
   `assets/...`) y lo manda a `contentStudio.renderVideo`.
2. `server/studioRender.ts` lo guarda en el video (`data.render`) y dispara
   `.github/workflows/render-video.yml` con solo tres datos públicos: el id del
   video, el id de la grabación y la dirección del sitio.
3. La máquina de GitHub (`scripts/render-studio-video.mjs`) pide el proyecto
   al sitio con `RENDER_CALLBACK_SECRET`, baja los archivos (solo del sitio o de
   Vercel Blob), graba con `hyperframes render`, pide un permiso de subida que
   vale solo para ese MP4 durante 30 minutos, lo sube a Vercel Blob y avisa al
   sitio.
4. El panel pregunta cada 5 segundos cómo va. Si en 25 minutos no hay
   respuesta, la grabación se da por fallida.

## Configuración (una sola vez)

1. **Clave compartida:** inventa una clave larga (por ejemplo, la salida de
   `openssl rand -hex 32`) y guárdala con el nombre `RENDER_CALLBACK_SECRET` en
   dos lugares:
   - Vercel → proyecto → Settings → Environment Variables.
   - GitHub → repo → Settings → Secrets and variables → Actions → New repository secret.
2. **Token de GitHub:** en GitHub → Settings → Developer settings →
   Fine-grained tokens, crea un token solo para este repo con el permiso
   **Actions: Read and write**. Guárdalo en Vercel como `GITHUB_RENDER_TOKEN`.
3. **Vercel Blob:** ya está configurado (`BLOB_READ_WRITE_TOKEN`); no hay que hacer nada.
4. Vuelve a desplegar en Vercel para que tome las variables nuevas.

Opcionales: `GITHUB_RENDER_REPO` (por defecto `alexisnegrocalderon/candylandwebsite`)
y `GITHUB_RENDER_REF` (rama del workflow, por defecto `main`).

Si falta algo, el editor de video lo dice y deja usar «Descargar proyecto (ZIP)»,
que se graba a mano con `npx hyperframes render` o pidiéndoselo a Claude Code.

## Cuenta regresiva («Faltan sólo 8 días para…»)

Primer formato del **estilo Playroom** (ver `docs/ESTILO-PLAYROOM.md`). En el
Estudio → Video → «Partir de» → **Cuenta regresiva: <evento>**. Arma el reel
9:16 de 6,5 s con los datos reales del evento (hora de Chile): los días que
faltan, el nombre del evento, «SÁB|06 21HRS», la palabra que se comenta y la ciudad. Nunca
lleva la dirección.

- **Cambiar los días** rehace el número, el sello y la etiqueta («FALTA SÓLO... 1 DÍA»,
  «ES... HOY»). Cada texto se puede corregir a mano.
- **Colores:** los de la marca, en un fondo liso (sin degradados): **Celeste** `#00A3FF` o
  **Rosa** `#EF8DFF`, con blanco, magenta `#FF008E` y azul `#0010DF`. Los colores de ediciones
  pasadas (REDROOM rojo, Dark Candy) ya no se usan. Para sumar otro fondo de la marca se agrega
  una entrada en `COUNTDOWN_LOOKS` (`shared/studioCountdown.ts`).
- **Fondo:** sin foto queda el degradado del evento; con una foto o un clip (por
  ejemplo, uno hecho con Nano Banana o Flow) va debajo con un velo del color.
- **Música:** se agrega en el video igual que en los otros formatos, o se deja sin
  audio y se pone la canción al publicar desde Instagram.
- Se graba igual que los demás: «Exportar MP4» (HyperFrames en GitHub Actions). Las
  letras nuevas (Anton y Barlow Condensed, licencia OFL) salen de
  `client/public/studio/fonts/`.

Código: `shared/studioCountdown.ts` (datos, días que faltan, texto) y
`shared/studioCountdownHtml.ts` (la composición). Panel: `CountdownControls.tsx`.
