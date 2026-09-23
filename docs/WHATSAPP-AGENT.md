# Agente de IA del WhatsApp

Reemplaza al asistente "Business AI" de Meta en el WhatsApp de la productora
por el **mismo agente que ya contesta el Instagram** (`server/instagramAgent.ts`),
que lee fechas, precios y disponibilidad reales de la base. Lo que el agente
sabe (notas de marca, ejemplos de tono, mensaje de derivación) se edita UNA
vez en **/admin → Marketing → Instagram** y aplica a los dos canales.

Además de lo que ya hace en Instagram, en WhatsApp:

- **Menú de bienvenida con botones** ("Próximas fechas", "Precios", "Hablar
  con alguien") cuando alguien escribe por primera vez solo un saludo.
- **Lista de fechas** para elegir tocando, y al elegir una: día, horario,
  lugar, precios con semáforo (nunca el remanente exacto) y botón
  **"Comprar entrada"** con el link real. Todo esto sale de la base, **sin IA**
  (instantáneo y sin costo).
- **Respuestas rápidas sugeridas por la IA** ("Solo/a", "En pareja", "En
  grupo") para que la persona toque en vez de escribir.
- **Visto azul + "escribiendo…"** mientras el agente arma la respuesta.
- **Coexistencia**: el número sigue funcionando en la app WhatsApp Business
  del teléfono. Si el dueño contesta desde ahí, el bot se hace a un lado en
  esa conversación.

---

## 1. Cómo funciona

```
Mensaje de WhatsApp
      ↓
Webhook de Meta  →  POST /api/webhooks/whatsapp          (server/whatsapp.ts)
      ↓            · valida la firma X-Hub-Signature-256
      ↓            · descarta reintentos (UNIQUE de waMessages.wamid)
      ↓            · guarda en waThreads / waMessages
      ↓
¿Tocó un botón nuestro? → respuesta desde la base, sin IA (server/whatsappInteractive.ts)
¿Saludo en hilo nuevo?  → menú de bienvenida, sin IA
Si no                   → agente compartido con channel: 'whatsapp'
      ↓
Respuesta        →  Cloud API: texto / botones / lista / botón con link
                    (server/whatsappSend.ts)
```

Las mismas decisiones del agente de Instagram aplican acá: se procesa antes
de responder 200, solo datos públicos, un error nunca deja a alguien sin
respuesta, y prenderlo es siempre una decisión manual.

## 2. Costos

- **Respuestas dentro de las 24 h** desde el último mensaje del cliente: sin
  costo en la Cloud API de Meta. Es todo lo que hace esta fase.
- **IA**: se usa la API key de Claude que ya existe (`ANTHROPIC_API_KEY`).
  Los botones, listas y el menú no llaman a la IA.
- **Plantillas** (escribirle a alguien fuera de las 24 h: entradas por
  WhatsApp, recordatorios, marketing): tienen costo por mensaje. No se usan
  todavía — son las fases siguientes.

## 3. Alta en Meta

1. En [developers.facebook.com](https://developers.facebook.com), en la misma
   app del Instagram (o una nueva), agregar el producto **WhatsApp**.
2. Conectar el número actual en modo **coexistencia** (onboarding de la app
   WhatsApp Business: se escanea un QR desde la app del teléfono). Si el
   panel no ofrece la opción directo para esta app, hay que hacerlo a través
   de un proveedor (BSP) que la soporte.
   - Al activar coexistencia algunas funciones de la app del teléfono dejan
     de estar disponibles (por ejemplo listas de difusión y mensajes
     temporales).
3. **Apagar el asistente de IA de Meta** en la app WhatsApp Business del
   teléfono (si no, contestan los dos).
4. En el Business Manager crear un **usuario del sistema** con permiso
   `whatsapp_business_messaging` y generar su token (permanente).
5. Anotar el **Phone number ID** del número (panel de WhatsApp → API Setup).
6. En **Webhooks** del producto WhatsApp:
   - URL: `https://mansionplayroom.cl/api/webhooks/whatsapp`
   - Token de verificación: el mismo texto que `WA_VERIFY_TOKEN`
   - Suscribirse a los campos **`messages`** y **`smb_message_echoes`**
     (este último es el que avisa cuando el dueño contesta desde la app).

## 4. Variables de entorno (en Vercel)

| Variable | Para qué |
|---|---|
| `WA_APP_SECRET` | Firma de cada entrega. Si es la misma app de Meta que la del Instagram, es el mismo valor que `IG_APP_SECRET`. **Sin esta variable el webhook rechaza todo en producción.** |
| `WA_VERIFY_TOKEN` | Texto inventado, el mismo acá y en el panel de Meta. |
| `WA_ACCESS_TOKEN` | Token permanente del usuario del sistema. No vence: no hay cron de renovación. |
| `WA_PHONE_NUMBER_ID` | Id del número en la Cloud API (no es el número de teléfono). |

La sección WhatsApp del admin muestra cuáles faltan.

## 5. Base de datos

```bash
pnpm db:push
```

Crea `waThreads`, `waMessages` y la columna `siteSettings.whatsappAgentConfig`
(migración `drizzle/0066_aberrant_miss_america.sql`).

## 6. Prenderlo

1. **/admin → Marketing → Instagram**: revisar "Qué tiene que saber el
   agente" — es lo mismo que va a usar WhatsApp.
2. **/admin → Marketing → WhatsApp**: revisar variables, texto del menú de
   bienvenida, y usar **"Probar sin mandar nada"** (muestra también los
   botones y si agregaría la lista o el botón de compra).
3. Apagar el asistente de Meta en la app del teléfono y prender
   **"Contestar automáticamente"**.
4. **Ajustes → Alertas**: prender *"WhatsApp sin resolver"*.

## 7. Operación diaria

- **Tomar una conversación**: contestar desde el panel o desde la app del
  teléfono — en los dos casos el bot se pausa solo en ese hilo. Para
  devolvérselo, prender el switch del hilo en el panel.
- **"Hablar con alguien"** (botón del menú): manda el mensaje de derivación,
  pausa el hilo y avisa por push.
- **Audios, fotos y stickers sin texto**: quedan para una persona, sin
  respuesta automática.
- **Ventana de 24 horas**: pasado ese plazo el panel no deja responder; se
  contesta desde la app del teléfono.
- **Recordatorio de cierre por silencio**: comparte el cron
  `/api/cron/instagram-followup`, con su propio interruptor y texto en la
  sección WhatsApp.

## 8. Qué hacer si...

| Síntoma | Causa habitual |
|---|---|
| El alta del webhook falla en Meta | Falta `WA_VERIFY_TOKEN` o no coincide. |
| Meta entrega y el servidor devuelve 403 | `WA_APP_SECRET` no es el secreto de la app que manda el webhook. |
| Llegan los mensajes pero nadie responde | Interruptor apagado, o el hilo quedó pausado. |
| Contestan dos bots | Falta apagar el asistente de IA de Meta en la app del teléfono. |
| El bot le contesta encima al dueño | No está suscrito el campo `smb_message_echoes` del webhook. |
| "Falló el envío a WhatsApp" en un hilo | Token revocado o `WA_PHONE_NUMBER_ID` incorrecto. |

## 9. Archivos

| Archivo | Qué hace |
|---|---|
| `server/whatsapp.ts` | Webhook: firma, reintentos, ruteo botones/IA, eco de coexistencia |
| `server/whatsappInteractive.ts` | Menú, lista de fechas y detalle con botón de compra (desde la base) |
| `server/whatsappSend.ts` | Cloud API: texto, botones, lista, botón con link, visto + escribiendo |
| `server/whatsappFollowUp.ts` | Recordatorio de cierre por silencio |
| `server/instagramAgent.ts` | Cerebro compartido (`channel: 'instagram' \| 'whatsapp'`) |
| `shared/whatsappAgentConfig.ts` | Config propia del canal |
| `client/src/components/admin/WhatsAppInbox.tsx` | Bandeja del panel |
| `server/whatsapp.test.ts` | Tests de topes de Meta, ruteo, derivaciones y coexistencia |

## 10. Próximas fases (no implementadas)

- **Transaccional** (plantillas "utility"): confirmación de compra con la
  entrada/QR por WhatsApp, recordatorio el día del evento, estacionamiento.
  Requiere opt-in en el checkout.
- **Marketing** (plantillas "marketing", las más caras): carrito abandonado,
  aviso de fecha nueva a quienes aceptaron, cumpleañeros.
- **Extras**: WhatsApp Flows (formularios nativos para postulaciones),
  bandeja unificada Instagram + WhatsApp, respuestas rápidas también en
  Instagram, transcripción de audios.
