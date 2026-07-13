import "dotenv/config";
import { createApp } from "../server/_core/app";

// Punto de entrada serverless para Vercel: toda la API (tRPC, webhooks,
// oauth, export de admin) corre acá como una sola función Node. `vercel.json`
// reescribe /api/:path* hacia esta función antes del catch-all del SPA.
export default createApp();
