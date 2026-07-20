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
  // pisa BUILT_IN_FORGE_*, que siguen usando imageGeneration/voiceTranscription/
  // map/dataApi/notification/heartbeat/storage.
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
};
