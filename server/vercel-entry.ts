import { createApp } from "./_core/app";
import { registerSsrMetaRoutes } from "./ssrMeta";

const app = createApp();
// Solo acá (no en createApp(), compartido con el server local) -- ver el
// comentario en server/ssrMeta.ts. Tiene que ir DESPUÉS de todo lo demás
// (tRPC incluido): su catch-all `*` matchea cualquier GET.
registerSsrMetaRoutes(app);

export default app;
