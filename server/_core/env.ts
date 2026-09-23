export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Fallback gratuito de LLM para despliegues fuera de la plataforma Forge
  // (ver server/_core/llm.ts, resolveProvider) -- variable propia, nunca
  // pisa BUILT_IN_FORGE_*, que siguen usando llm/notification.
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  // Proveedor de IA principal cuando está configurada (ver
  // server/_core/llm.ts, resolveProvider) -- tiene prioridad sobre
  // geminiApiKey/forgeApiKey. Créditos propios del dueño en Claude Console.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Autentica al cron diario de mailing (server/cronRoutes.ts) -- Vercel
  // manda `Authorization: Bearer <CRON_SECRET>` automáticamente en cada
  // invocación cuando esta variable está seteada en el proyecto. Sin ella
  // configurada en producción, el endpoint queda abierto a cualquiera.
  cronSecret: process.env.CRON_SECRET ?? "",
  // --- Agente de IA del Instagram (server/instagram.ts) ---
  // Secreto de la app de Meta: firma cada entrega del webhook en la cabecera
  // `X-Hub-Signature-256`. Sin esta variable el webhook RECHAZA todo en
  // producción -- la URL es pública y adivinable, la firma es lo único que
  // distingue a Meta de cualquiera que le pegue al endpoint.
  igAppSecret: process.env.IG_APP_SECRET ?? "",
  // Palabra que uno inventa y escribe en los dos lados (acá y en el panel de
  // Meta) -- Meta la devuelve en el GET de verificación al dar de alta o
  // reactivar el webhook.
  igVerifyToken: process.env.IG_VERIFY_TOKEN ?? "",
  // Token de larga duración de la cuenta de Instagram (60 días). Lo renueva
  // solo el cron /api/cron/instagram-token; si igual caduca, el envío falla
  // con 190 y el hilo queda en la bandeja esperando a una persona.
  igAccessToken: process.env.IG_ACCESS_TOKEN ?? "",
  // IGSID de la cuenta de la productora (el destinatario de los webhooks).
  // Se usa para distinguir los mensajes que mandamos nosotros (`is_echo`) de
  // los que manda la gente.
  igUserId: process.env.IG_USER_ID ?? "",
  // --- Agente de IA del WhatsApp (server/whatsapp.ts) ---
  // Secreto de la app de Meta que recibe el webhook de WhatsApp. Si es la
  // misma app que la de Instagram, es el mismo valor que IG_APP_SECRET. Sin
  // esta variable el webhook RECHAZA todo en producción (misma regla).
  waAppSecret: process.env.WA_APP_SECRET ?? "",
  // Palabra inventada, la misma acá y en el panel de Meta (alta del webhook).
  waVerifyToken: process.env.WA_VERIFY_TOKEN ?? "",
  // Token PERMANENTE de un "usuario del sistema" del Business Manager con
  // permiso whatsapp_business_messaging -- a diferencia del de Instagram no
  // vence, así que no hace falta cron de renovación.
  waAccessToken: process.env.WA_ACCESS_TOKEN ?? "",
  // Id del número de teléfono en la Cloud API (no es el número en sí).
  waPhoneNumberId: process.env.WA_PHONE_NUMBER_ID ?? "",
};
