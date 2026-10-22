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
