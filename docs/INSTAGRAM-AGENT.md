# Agente de IA del Instagram

Contesta solo los mensajes directos de `@mansionplayroom` con los datos
reales del panel: fechas publicadas, precios vigentes y si quedan entradas.
Lo que no puede resolver lo deriva a una persona y queda esperando en
**/admin → Marketing → Instagram**.

Lee la base de datos, así que "¿queda cupo para el sábado?" se responde con
el stock de verdad. El mismo agente contesta también el WhatsApp (ver
`docs/WHATSAPP-AGENT.md`): las notas de marca, el tono y el mensaje de
derivación que se editan acá aplican a los dos canales.

---

## 1. Cómo funciona

```
DM en Instagram
      ↓
Webhook de Meta  →  POST /api/webhooks/instagram        (server/instagram.ts)
      ↓            · valida la firma X-Hub-Signature-256
      ↓            · descarta ecos y reintentos
      ↓            · guarda el mensaje en igThreads / igMessages
      ↓
Agente           →  invokeLLM con el contexto real       (server/instagramAgent.ts)
      ↓            · eventos + precios + disponibilidad desde server/db.ts
      ↓            · devuelve { reply, handoff, handoffReason }
      ↓
Respuesta        →  Graph API de Instagram               (server/instagramSend.ts)
                   · si derivó: pausa el bot en ese hilo y manda push al admin
```

Decisiones que vale la pena conocer antes de tocar el código:

- **El webhook procesa antes de responder 200.** En una función serverless
  todo lo que quede pendiente después de `res.end()` se puede cortar, así que
  "responder rápido y seguir en segundo plano" acá equivale a perder
  respuestas en silencio.
- **No hay tool calling.** Todo el contexto se arma de una en una sola
  consulta. Cada vuelta extra de tool calling son segundos de espera de Meta.
- **El agente nunca ve un número de cupo.** Recibe un semáforo
  (`disponible` / `quedan pocas` / `AGOTADA`), nunca el remanente exacto —
  misma regla que ya rige el sitio público.
- **Solo datos públicos.** Ni clientes, ni ventas, ni plata llegan al prompt.
- **Un error nunca deja a alguien sin respuesta**: cualquier falla (IA caída,
  JSON inválido, token vencido) termina en la frase de derivación y en un
  push al admin.
- **Ni siquiera un "mensaje personal" mal clasificado queda en silencio
  total.** Cuando la IA marca un mensaje como personal (o llega un adjunto
  sin texto) no se manda respuesta automática -- pero SIEMPRE se avisa por
  push al admin (pedido explícito del dueño, 23/09, tras un caso real donde
  una pregunta de cliente se clasificó mal como personal y nadie se enteró).
  La clasificación de la IA puede fallar; que nadie se entere, no.

## 2. Alta en Meta (es lo que más demora, no el código)

1. La cuenta `@mansionplayroom` tiene que ser **profesional** (empresa o
   creador), no personal.
2. En la app de Instagram: **Configuración → Herramientas y controles de
   empresa → Permitir el acceso a los mensajes**. Sin esto Meta no entrega
   nada, aunque el resto esté perfecto.
3. En [developers.facebook.com](https://developers.facebook.com) crear una
   app y agregarle el producto **Instagram → API de Instagram con inicio de
   sesión de Instagram** (esta variante no necesita una página de Facebook
   enlazada).
4. Generar el **token de acceso de larga duración** de la cuenta y anotar el
   **ID de la cuenta de Instagram** (IGSID de la productora).
5. En **Webhooks**, suscribirse al campo `messages` con:
   - URL de devolución de llamada: `https://mansionplayroom.cl/api/webhooks/instagram`
   - Token de verificación: el mismo texto que vas a poner en `IG_VERIFY_TOKEN`
6. **Verificación del negocio + revisión de la app** para los permisos
   `instagram_business_basic` e `instagram_business_manage_messages`. Antes de
   aprobarse, el agente solo contesta a las cuentas cargadas como probadores
   en el panel de Meta — lo cual sirve perfecto para probarlo de verdad.

## 3. Variables de entorno (en Vercel)

| Variable | Para qué |
|---|---|
| `IG_APP_SECRET` | Firma de cada entrega del webhook. **Sin esta variable el webhook rechaza todo en producción.** |
| `IG_VERIFY_TOKEN` | Texto inventado, el mismo acá y en el panel de Meta. |
| `IG_ACCESS_TOKEN` | Token de larga duración de la cuenta (60 días). |
| `IG_USER_ID` | ID de la cuenta de Instagram de la productora. |

La sección de Instagram del admin muestra cuáles faltan.

## 4. Base de datos

```bash
pnpm db:push
```

Crea `igThreads`, `igMessages` y la columna `siteSettings.instagramAgentConfig`
(migración `drizzle/0057_nasty_the_phantom.sql`).

## 5. Prenderlo

En **/admin → Marketing → Instagram**:

1. Revisar que no falte ninguna variable (la tarjeta amarilla lo dice).
2. Editar **"Qué tiene que saber el agente"**: tono, edad mínima, qué se
   responde de la privacidad, cómo se compra. Las fechas y los precios NO se
   escriben ahí — salen solos de los eventos del panel.
3. Usar **"Probar sin mandar nada"** con las preguntas que llegan siempre.
   El botón *"Ver los datos que recibe la IA"* muestra el bloque exacto que
   se le pasa: si el agente contesta algo raro, casi siempre es un evento mal
   cargado, no el prompt.
4. Recién ahí, prender **"Contestar automáticamente"**.
5. En **Ajustes → Alertas**, prender *"Instagram sin resolver"* para recibir
   el push cuando una conversación quede esperando a una persona.

Prenderlo es siempre una decisión manual: desplegar el código no hace que la
cuenta empiece a contestarle a nadie.

## 6. Seguir entrenando al agente

"Qué tiene que saber el agente" (`brandNotes`) NO es para poner todo. Las
fechas, precios y disponibilidad de cada fiesta salen solos de los eventos
cargados en el panel -- repetirlos ahí es redundante y, peor, se puede
desactualizar y contradecir a la base real. Ahí va lo que la base NO sabe:
políticas (edad, reembolsos, privacidad), aclaraciones de tono, y respuestas
a preguntas frecuentes que no están resueltas en ningún link del sitio. Es el
mismo campo para Instagram y WhatsApp -- ambos comparten un solo cerebro, así
que entrenarlo acá entrena los dos canales a la vez.

Para enterarse de lo que la gente pregunta y el agente no supo resolver solo,
la tarjeta **"Preguntas que el agente no supo resolver"** (arriba de
Automatizaciones, en el mismo panel) lista cada derivación real -- la
pregunta tal cual llegó, el motivo, quién y cuándo -- y queda ahí aunque
después se reactive la conversación desde la bandeja (a diferencia del motivo
que se ve al abrir un hilo, que se borra al reactivarlo). El flujo:

1. Revisarla de vez en cuando.
2. Decidir si la respuesta vale la pena agregarla a "Qué tiene que saber el
   agente" (curada, no copiada tal cual -- son las conclusiones, no el log).
3. Tocar **"Ya lo agregué"** para sacarla de pendientes.

## 7. Operación diaria

- **Tomar una conversación**: abrir el hilo y apagar *"Respuesta automática en
  esta conversación"*. El agente no vuelve a meterse hasta que se prenda.
- **Ventana de 24 horas**: Meta solo deja responder dentro de las 24 horas
  siguientes al último mensaje de la persona. Pasado ese plazo la bandeja lo
  avisa y hay que contestar desde la app de Instagram.
- **Token**: el cron `/api/cron/instagram-token` corre los lunes, lo renueva
  y manda un correo cuando quedan 10 días o menos. Ahí hay que generar uno
  nuevo en Meta y pegarlo en `IG_ACCESS_TOKEN` (no se puede guardar solo: en
  Vercel las variables son de solo lectura desde la función).
- **Recordatorio de cierre por silencio**: si alguien deja de contestar
  después de que el bot ya le respondió, el cron `/api/cron/instagram-followup`
  (cada 15 minutos) le manda un único mensaje de cierre pasados los minutos
  configurados (Ajustes del agente → "Recordatorio si no contesta", 120 min
  por defecto). No es un cierre generado por IA -- es el texto fijo que se
  edita ahí mismo.
- **"Muchas gracias"**: si el mensaje que llega es solo un agradecimiento por
  lo ya conversado (sin ninguna pregunta ni pedido nuevo), el agente NO
  deriva a una persona -- contesta con el texto fijo de "Mensaje cuando solo
  agradecen" (Ajustes del agente) y el hilo sigue como si nada, listo para
  la próxima pregunta real.

## 8. Qué hacer si...

| Síntoma | Causa habitual |
|---|---|
| El alta del webhook falla en Meta | Falta `IG_VERIFY_TOKEN`, o no coincide con lo escrito en el panel. |
| Llegan los mensajes pero nadie responde | El interruptor está apagado, o el hilo quedó pausado por una derivación previa. |
| Meta entrega y el servidor devuelve 403 | `IG_APP_SECRET` mal copiado: la firma no cuadra. |
| Responde una vez y después deja de responder ese hilo | Es lo esperado tras una derivación: la conversación quedó para una persona. |
| Deja de responder de golpe en todos lados | Token vencido (`IG_ACCESS_TOKEN`). |

## 9. Archivos

| Archivo | Qué hace |
|---|---|
| `server/instagram.ts` | Webhook: firma, ecos, idempotencia, derivación |
| `server/instagramAgent.ts` | Contexto real + prompt + llamada a la IA |
| `server/instagramSend.ts` | Graph API: enviar, perfil, refrescar token |
| `server/instagramAutomations.ts` | Armado del mensaje de una automatización por palabra clave |
| `server/instagramFollowUp.ts` | Recordatorio de cierre por silencio (cron cada 15 min) |
| `shared/instagramAgentConfig.ts` | Config editable desde el admin (compartida con WhatsApp) |
| `drizzle/schema.ts` (`agentHandoffLog`) | Registro permanente de derivaciones, para "seguir entrenando" (sección 6) |
| `client/src/components/admin/InstagramInbox.tsx` | Bandeja del panel |
| `client/src/components/admin/InstagramAutomations.tsx` | Panel de automatizaciones por palabra clave |
| `server/instagram.test.ts` | Tests de firma, contexto y caídas de la IA |

## 10. Automatizaciones por palabra clave (comentarios / respuestas a historia)

Además del agente conversacional, **/admin → Marketing → Instagram** tiene
una tarjeta para armar campañas puntuales: alguien comenta o responde a una
historia con la palabra que definas y le llega automático un DM -- un link,
un mensaje de puro texto, o un código de descuento (compartido para todos
los que cumplan la palabra, con tope de usos y vencimiento configurables).

Hay dos mecanismos de Meta detrás, con requisitos muy distintos:

- **Respuestas a historias**: llegan por el mismo webhook `messages` que ya
  está dado de alta (sección 2 de arriba, campo `reply_to.story` del
  mensaje). **No hace falta pedirle nada nuevo a Meta** -- funciona apenas
  se despliega el código.
- **Comentarios en posts/reels**: usan "Private Replies" de Meta y
  necesitan un permiso APARTE con Advanced Access,
  `instagram_business_manage_comments`, más suscribirse al campo de webhook
  `comments` (mismo lugar del panel de Meta donde ya está suscrito
  `messages`, sección 2 arriba). Sin ese permiso aprobado, Meta simplemente
  nunca manda ningún `change` de tipo `comments` -- el código ya está listo
  (`handleCommentChange` en `server/instagram.ts`) pero queda dormido hasta
  entonces. La revisión de Meta para este permiso puede demorar semanas y
  pedir un video mostrando el uso real -- es un trámite del dueño en su
  panel de developers.facebook.com, no algo que el código pueda apurar.

Migración nueva: `igKeywordAutomations` (la campaña: palabra, dónde aplica,
mensaje, código de descuento opcional) e `igKeywordRedemptions` (quién ya
recibió el regalo de cada campaña, para no mandarlo dos veces).
