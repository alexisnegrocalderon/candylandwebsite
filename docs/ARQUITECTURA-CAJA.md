# Mansion Playroom OS — Blueprint de arquitectura del módulo `/caja`

> **Documento de arquitectura, no de implementación.** Escrito para ser ejecutado por una sesión de construcción (Claude Sonnet 5) en fases ordenadas. Cada decisión está anclada al código y schema REAL de `candylandwebsite` — no es un diseño desde cero.
>
> Stack existente (no cambiar): React 19 + Vite + wouter (cliente) · Express + tRPC en función serverless de Vercel (`api/index.js`) · Drizzle ORM + TiDB (MySQL) · Tailwind v4 + shadcn/ui · Resend (email) · Mercado Pago (solo ventas web).

---

## 0. Decisiones donde me aparto del diseño propuesto (leer primero)

El diseño solicitado es sólido en objetivos, pero hay 5 puntos donde una arquitectura distinta es objetivamente mejor para este proyecto. Estas decisiones gobiernan todo el documento:

### 0.1 Los "códigos de canje" NO son un sistema nuevo — ya existen al 70%

El pedido describe generar un código alfanumérico único por producto comprado online (`PIS-8F3K-29LX`), con estados, validación y auditoría. **Eso ya existe en producción**: la tabla `tickets` genera hoy un código único (`MP-XXXXXXXXXXXX`) por **cada unidad** comprada — incluidos los extras (piscolas, lockers, estacionamiento), porque `processApprovedOrder` (server/webhooks.ts) itera `quantity` veces por cada `orderItem`. Cada código ya tiene estado (`valid`/`used`/`cancelled`), fecha de uso (`usedAt`), QR servido por URL (`/api/qr/:ticketCode.png`), página pública de verificación (`/verificar/:ticketCode`) y llega por email.

**Decisión**: evolucionar `tickets` (formato legible, prefijo por producto, campos de auditoría de canje) en vez de crear una tabla `redemption_codes` paralela.
- *Ventaja*: cero duplicación, el email/QR/verificación existentes siguen funcionando, y las compras ya realizadas quedan canjeables sin migración de datos.
- *Desventaja*: el nombre "tickets" queda algo genérico (contiene accesos Y canjes de productos). Aceptable — se distinguen por `ticketTypes.category`.
- *Impacto operativo*: nulo. El flujo actual no se toca.

### 0.2 Monolito modular, no plataforma separada

`/caja` debe ser una ruta más del mismo repo/deploy/base de datos, igual que `/admin` — no un proyecto aparte.
- *Por qué*: la "base única de clientes" que se exige **es la consecuencia natural de una base de datos única**. Separar la plataforma obligaría a APIs de sincronización entre sistemas — exactamente la duplicación que se quiere evitar. Además el equipo es 1 persona + IA: cada repo/deploy adicional multiplica el costo de mantención.
- *Modularidad real*: se logra con separación de carpetas (`server/caja/`, `client/src/pages/caja/`), routers tRPC propios (`caja.*`), y tablas nuevas con prefijo claro — no con microservicios.

### 0.3 Ledger append-only, no Event Sourcing completo

Event Sourcing puro (reconstruir estado por replay de eventos) es la herramienta equivocada aquí: complica cada lectura, exige versionado de eventos y snapshots, y el equipo no tiene quien lo mantenga.

**Decisión**: una tabla `ops` **inmutable** (nunca UPDATE ni DELETE) que registra cada operación con quién/dónde/cuándo/qué, **más** las tablas de estado actual que ya existen (`tickets.status`, `orders`, stock). Las escrituras hacen ambas cosas en la misma transacción: mutar el estado + apendear la operación.
- Esto entrega el 100% del requisito ("historial completo de absolutamente todo, nunca eliminar movimientos") con el 20% de la complejidad.
- Si en 5 años se necesita replay real, el ledger ya tiene los datos — la puerta queda abierta.

### 0.4 Ventas presenciales = `orders` con canal "caja", no una tabla nueva

Una venta en caja es una orden aprobada al instante sin pago online. Reutilizar `orders`/`orderItems` con una columna `channel` (`web`/`caja`/`import`) unifica automáticamente: reporting del admin (la pestaña Ventas ya lista `orders`), CSV export existente, correo de registro a contacto@, estadísticas de utilidad. Crear una tabla `sales` paralela duplicaría todo eso.

### 0.5 Offline-first por snapshot + cola de operaciones, no réplica de base de datos

Se evaluaron las alternativas pedidas (ver §6). SQLite embebido en navegador (wa-sqlite/OPFS) y CRDTs se **descartan**: potencia innecesaria para un dominio donde el 95% de las operaciones offline son inserciones (ventas) y transiciones de estado unidireccionales (canjes), que casi no generan conflictos reales. La arquitectura elegida — snapshot del evento en IndexedDB + cola de operaciones idempotente — es la que usan los POS reales de eventos, cabe en el stack actual (Vercel serverless no soporta websockets persistentes de todos modos) y la puede mantener una persona.

---

## 1. Arquitectura general

```
┌──────────────────────────── Vercel ────────────────────────────┐
│                                                                 │
│  SPA React (Vite)                    Función serverless (api/)  │
│  ┌───────────┐ ┌──────────┐ ┌──────┐   ┌─────────────────────┐ │
│  │  Público  │ │  /admin  │ │/caja │──▶│ Express + tRPC       │ │
│  │ (home,    │ │ (gestión)│ │(PWA, │   │  routers: events,    │ │
│  │ checkout, │ │          │ │ off- │   │  orders, tickets,    │ │
│  │ verificar)│ │          │ │ line)│   │  caja.*  (nuevo)     │ │
│  └───────────┘ └──────────┘ └──────┘   └──────────┬──────────┘ │
│                                                    │            │
└────────────────────────────────────────────────────┼────────────┘
                                                     │ TLS
                                              ┌──────▼──────┐
                                              │ TiDB (MySQL)│  única fuente de verdad
                                              └─────────────┘
   Tablets de caja: PWA instalada · IndexedDB (snapshot + cola) · Service Worker
   Terminales de pago: FUERA del sistema (solo se registra el resultado)
   Impresión de tickets físicos: FUERA del sistema (tickets pre-impresos, como hoy)
```

Principios:
- **Una base de datos, una identidad de cliente** (§4.1), **un catálogo** (§12).
- El servidor es la fuente de verdad; las tablets son cachés operativas con cola de escritura.
- Toda mutación de caja pasa por **una** función (`applyOp`, §7) — el mismo código procesa operaciones online y sincronizadas, garantizando idempotencia.

## 2. División de módulos

| Módulo | Ruta/carpeta | Rol de acceso | Estado |
|---|---|---|---|
| Sitio público + checkout | `/`, `/checkout`, `/verificar` | público | existe |
| Admin | `/admin` | admin | existe |
| **Caja** | `/caja` (PWA) | caja, supervisor, admin | nuevo |
| **Barra** (futuro, fase tardía) | `/barra` | barra | preparado, no construir aún |
| **Control acceso** (futuro) | `/acceso` | acceso | preparado, no construir aún |
| Servidor caja | `server/caja/` (routers `caja.*`) | — | nuevo |
| Ledger + operadores | tablas `ops`, `operators`, `registers` | — | nuevo |

Barra y Control Acceso **no se construyen ahora**, pero la arquitectura los deja listos: son la misma PWA con otro rol (barra = solo ve/valida tickets físicos si algún día se digitaliza; acceso = escanea QR de acceso y marca `used` — que es exactamente el flujo de canje de caja con otro tipo de ticket).

## 3. Flujo completo por usuario

### 3.1 Cajera (rol `caja`)
1. **Apertura**: abre la PWA en la tablet → ingresa su PIN (4-6 dígitos) → selecciona caja física ("Caja 1"/"Caja 2") → el sistema descarga el snapshot del evento activo (§6.2) → pantalla principal.
2. **Cliente llega** → busca por: escaneo de QR (cámara de la tablet), nombre, apellido, email o teléfono. La búsqueda corre **contra el índice local** (instantánea, <50ms, funciona offline).
3. **Ficha del cliente** (una sola pantalla, §10.2): acceso y su estado, beneficios, códigos de canje pendientes, compras previas en caja, historial, observaciones.
4. **Canje**: toca el código pendiente → confirma → estado pasa a `used` localmente + op encolada → entrega ticket físico. Total: 2 toques.
5. **Venta presencial**: toca "Nueva venta" → grid de productos (botones grandes con color/imagen) → cantidades → total en pantalla → cobra en el terminal externo → toca "Cobrado en terminal" (selecciona débito/crédito/efectivo como referencia) → entrega ticket físico. La orden se registra con canal `caja`.
6. **Cierre**: al final del turno ve su resumen (ventas, canjes, clientes atendidos) y cierra sesión.

### 3.2 Supervisor (rol `supervisor`)
Todo lo de caja, más: anular un código (con motivo obligatorio), resolver la **cola de conflictos** (§8), corregir una venta mal registrada (genera op de reversa, nunca edita), ver dashboard de caja completo del evento en curso.

### 3.3 Administrador (rol `admin`)
Todo lo anterior, más `/admin` completo: catálogo de productos con costos/márgenes, gestión de operadores y PINs, dashboards históricos (§11), auditoría del ledger, configuración de cajas.

### 3.4 Cliente (sin cambios de fondo)
Compra web como hoy → recibe email con su acceso QR **y ahora también sus códigos de canje legibles** por cada extra → en el evento pasa por caja → canjea → recibe tickets físicos → consume en barra. El flujo operativo actual se mantiene idéntico.

## 4. Modelo de datos

### 4.1 Identidad del cliente: proyección, no tabla maestra nueva

No existe (ni debe existir por ahora) un login de compradores. La identidad real es el **email** (`orders.buyerEmail`), ya usado así por embajadores y por la importación de la ticketera anterior. Crear una tabla `customers` que haya que mantener sincronizada a mano duplicaría información — exactamente lo prohibido.

**Decisión**: `customers` es una **proyección materializada** (tabla mantenida automáticamente en cada orden aprobada — mismo patrón que `ensureOwnAmbassadorCode` usa hoy):

```
customers
  id            PK
  email         UNIQUE (identidad)
  fullName, phone, rut        (últimos conocidos)
  instagram                    (de attendeeData si existe)
  firstSeenAt, lastSeenAt
  totalOrders, totalSpent      (agregados, recalculables)
  notes         TEXT           (observaciones de operadores)
  flags         JSON           (VIP, alerta, etc.)
```

La fuente de verdad siguen siendo `orders`; si `customers` se corrompe, se reconstruye entera con un script. Preparada para NFC/pulseras: una futura tabla `identifiers (customerId, type: 'nfc'|'rfid'|'qr', token UNIQUE)` mapea cualquier medio físico a este mismo registro — buscar por NFC será solo otra rama del mismo buscador.

### 4.2 Tablas nuevas

```
operators
  id PK · name · pinHash (bcrypt) · role ENUM(admin,supervisor,caja,barra,acceso)
  active TINYINT · createdAt

registers                      -- cajas físicas
  id PK · name ("Caja 1") · active

ops                            -- LEDGER APPEND-ONLY (§0.3). Nunca UPDATE/DELETE.
  id            CHAR(36) PK   -- UUID generado en el CLIENTE (clave de idempotencia)
  type          ENUM(redeem, sale, void_code, note, shift_open, shift_close,
                     manual_adjust, ...)
  eventId · operatorId · registerId
  targetType    VARCHAR       -- 'ticket' | 'order' | 'customer' | ...
  targetId      VARCHAR
  payload       JSON          -- detalle completo de la operación
  clientAt      TIMESTAMP     -- hora del dispositivo al ejecutar
  serverAt      TIMESTAMP     -- hora del servidor al aplicar
  result        ENUM(applied, conflict, rejected)
  conflictNote  VARCHAR NULL
```

### 4.3 Columnas nuevas en tablas existentes (migraciones aditivas, sin romper nada)

```
ticketTypes  + costPrice DECIMAL        -- para márgenes (§12)
             + color VARCHAR            -- botón en la grid de caja
             + internalCode VARCHAR     -- 'PIS', 'LOC' → prefijo del código de canje
             + barcode VARCHAR NULL     -- preparado para futuro
             (imageUrl ya existe en el schema actual, no requiere migración)
             + metadata JSON            -- extensibilidad sin tocar schema (§12)

orders       + channel ENUM(web,caja,import) DEFAULT 'web'
             + operatorId INT NULL      -- quién registró (ventas de caja)
             + registerId INT NULL
             + paymentMethod ya existe (se reutiliza: 'terminal-debito', etc.)

tickets      + usedByOperatorId INT NULL   -- auditoría de canje
             + usedAtRegisterId INT NULL
             + displayCode VARCHAR UNIQUE NULL  -- código legible PIS-XXXX-XXXX (§9)
```

## 5. Relaciones entre entidades

```
events 1─N ticketTypes 1─N orderItems N─1 orders N─1 customers(proyección por email)
                │                              │
                └────────1─N tickets N─────────┘
tickets N─1 operators (usedByOperatorId)     orders N─1 operators (ventas caja)
ops N─1 operators · N─1 registers · N─1 events · (targetType,targetId) → cualquier entidad
```

Regla de oro: **todo lo vendible es un `ticketType`** (acceso, piscola, locker, merch), **toda transacción es una `order`**, **todo derecho canjeable es un `ticket`**. No hay excepciones — esa uniformidad es lo que permite agregar tipos de producto sin tocar la arquitectura.

## 6. Arquitectura Offline First

### 6.1 Evaluación de alternativas (pedida explícitamente)

| Opción | Veredicto | Por qué |
|---|---|---|
| PWA + Service Worker | ✅ usar | Instalable en tablet, precachea el shell de la app, funciona en Android/iPad |
| IndexedDB (vía **Dexie**) | ✅ usar | Almacén local robusto y consultable; Dexie da índices y API sana |
| SQLite (wa-sqlite/OPFS) | ❌ descartar | Potencia innecesaria; peor soporte en iPad Safari; complejidad de build |
| Cache local HTTP | ✅ complementario | Solo para assets estáticos (SW precache), no para datos |
| Sincronización diferida + cola | ✅ núcleo del diseño | §6.3 |
| CRDTs | ❌ descartar | Los conflictos aquí son detectables y unidireccionales; CRDTs no aportan |
| Background Sync API | ✅ usar si disponible | Con fallback a reintentos por intervalo (Safari no lo soporta) |

### 6.2 Snapshot del evento (lectura offline)

Al abrir turno, la tablet descarga y guarda en IndexedDB:
- **attendees**: todas las órdenes aprobadas del evento con sus tickets (códigos, estados, tipos), datos de comprador y acompañantes (`attendeeData`), beneficios. Volumen esperado: cientos de filas — trivial.
- **catalog**: productos activos del evento (nombre, precio, color, imagen precacheada).
- **customers**: proyección de clientes vinculados al evento (para notas/historial).
- **meta**: `serverTimeOffset` (diferencia reloj servidor vs. dispositivo — todas las ops se timestampean corregidas), versión del snapshot, eventId.

Refresco: re-descarga incremental cada 60s cuando hay conexión (solo cambios desde la última versión — filtrar por `updatedAt > lastSync`). Así una compra online hecha durante el evento aparece en caja en ≤1 minuto.

### 6.3 Cola de operaciones (escritura offline)

Toda acción de caja: (1) muta el estado local en IndexedDB al instante (UI optimista), (2) apendea la op a la cola local con **UUID generado en el cliente**, y (3) el sincronizador la envía cuando puede. La cajera **nunca espera a la red** — la única diferencia visible entre online y offline es un badge de estado ("✓ sincronizado" / "⏳ 3 pendientes" / "⚠ sin conexión").

## 7. Flujo de sincronización

```
Cliente (tablet)                            Servidor (tRPC caja.sync)
────────────────                            ─────────────────────────
loop: cada 5s si hay cola, y en            recibe batch [op1, op2, ...]
eventos 'online' / Background Sync         para cada op EN ORDEN:
  → POST batch de ops pendientes             1. ¿ops.id ya existe? → devolver
    (máx 50 por batch, en orden)                resultado guardado (idempotencia)
  ← respuesta por op:                        2. validar (¿ticket sigue valid?...)
    applied | conflict | rejected            3. transacción: mutar estado
  → marcar ops locales según resultado          + INSERT en ops con result
  → conflictos → cola de revisión local      4. responder por op
```

- **Idempotencia absoluta**: el UUID del cliente es la PK del ledger. Reenviar un batch (timeout, doble click, reintento) nunca duplica nada — el servidor devuelve el resultado ya registrado.
- **Reintentos**: backoff exponencial (5s → 10s → 30s → 60s máx), sin límite de intentos. La cola sobrevive a cierres de la app (IndexedDB es persistente).
- **Orden**: las ops de una misma tablet se aplican en orden de emisión; entre tablets no se garantiza orden global (no hace falta — ver conflictos).

## 8. Gestión de conflictos

Análisis del dominio: las ventas de caja son **inserciones puras** (no pueden chocar); las notas son "último gana" (aceptable); el único conflicto real es el **doble canje** — dos cajas offline canjean el mismo código antes de sincronizar.

- **Prevención online**: cuando hay conexión, el canje valida contra el servidor en la misma acción (latencia ~200ms, imperceptible) — el conflicto solo puede darse con ambas cajas offline.
- **Detección**: el primero que sincroniza gana (`applied`); el segundo recibe `conflict` con el detalle de quién/cuándo canjeó primero.
- **Resolución**: el conflicto NO se resuelve automáticamente ni en la cara del cliente — cae a la **cola de revisión del supervisor** con toda la información (ambos operadores, cajas, horas). El supervisor decide: anular uno, o marcar como "entrega duplicada" para el inventario. En la práctica esto será rarísimo (requiere ambas cajas offline + el mismo cliente pasando dos veces), pero queda 100% auditado.
- **Stock**: el stock local se decrementa optimista; el server es la verdad. Diferencias se reconcilian en el refresco de snapshot. El stock de productos de barra es referencial (el inventario físico real vive en barra) — no bloquear ventas por stock en fase 1.

## 9. Códigos alfanuméricos de canje

- **Formato**: `{PREFIJO}-{XXXX}-{XXXX}` — prefijo = `ticketTypes.internalCode` (PIS, LOC, ENE...); cuerpo = 8 caracteres del alfabeto **Crockford Base32** (sin 0/O/1/I/L — dictables por teléfono sin ambigüedad). Entropía: 32⁸ ≈ 1.1 billones por prefijo — colisiones imposibles en la práctica (igual: UNIQUE en DB + reintento).
- **Dónde vive**: columna nueva `tickets.displayCode` (§4.3). El `ticketCode` interno (MP-...) se conserva como identificador técnico/QR; el `displayCode` es lo que ve el humano. Para accesos, `displayCode` puede quedar NULL (el QR basta).
- **Generación**: en `processApprovedOrder`, junto a la generación actual de tickets — un cambio de ~15 líneas en código ya existente.
- **Email**: el correo final ya lista los extras (sección "Incluye"); pasa a mostrar el `displayCode` de cada uno, con instrucción "preséntalo en caja".
- **Ciclo de vida** (mapeado al enum existente + ledger):
  - Generado/Enviado/Pendiente de canje → `tickets.status = 'valid'` (el envío del email ya se registra con `orders.emailSent`; la distinción fina Generado→Enviado→Pendiente vive en el ledger, no en 3 estados de columna — un solo estado "canjeable" simplifica toda la validación)
  - Canjeado → `status = 'used'` + `usedAt` + `usedByOperatorId` + `usedAtRegisterId` + op `redeem` en ledger
  - Anulado → `status = 'cancelled'` + op `void_code` con motivo y supervisor
- **Validación al canjear** (las 6 comprobaciones pedidas): existe (lookup por displayCode) · pertenece al cliente (join a order/email) · corresponde al evento (`tickets.eventId`) · no usado (`status='valid'`) · no anulado (≠`cancelled`) · vigente (evento activo). Online valida contra servidor; offline contra snapshot + resolución §8.

## 10. Módulo Caja (`/caja`)

### 10.1 Principios de UX (requisito: "Shopify POS, no ERP")

- Tema **oscuro premium** dedicado (variante de los tokens oklch existentes en `index.css`: mismo rosa primario sobre fondos oscuros ~`oklch(0.2 0.03 330)`), sin las animaciones decorativas del sitio público.
- Targets táctiles ≥ 56px, grid de productos con botones grandes coloreados (color del producto), tipografía grande, cero hover-dependencia.
- **Presupuesto de interacción**: cliente atendido en ≤ 10 segundos y ≤ 4 toques para el caso común (buscar → ficha → canjear → listo).
- Sin navegación profunda: 3 pantallas (Buscar/Ficha/Venta) + dashboard. Transiciones instantáneas (datos locales).

### 10.2 Pantallas

1. **PIN + selección de caja** — numpad grande; la tablet queda "enrolada" una vez por el admin (token de dispositivo persistente), el PIN es por operador y por turno.
2. **Buscar** — un solo input + botón de cámara QR (`BarcodeDetector` API con fallback a librería JS). Resultados instantáneos del índice local (índices Dexie por nombre/email/teléfono/código).
3. **Ficha del cliente** — header con nombre + tipo de acceso + estado (chip verde/rojo); beneficios; lista de códigos pendientes (botón "Canjear" por código); compras del día; historial (del ledger); observaciones editables.
4. **Nueva venta** — grid de productos por categoría → carrito lateral → total gigante → "Cobrado en terminal" (débito/crédito/efectivo) → confirmación → auto-reset para el siguiente cliente.
5. **Dashboard de caja** — ventas del día, por categoría, top productos, utilidad del día (solo supervisor+), clientes atendidos, últimas ventas, canjes realizados. Todo del snapshot local + ledger sincronizado.

## 11. Módulo Administrador (extensiones a `/admin`)

Nuevas pestañas sobre el admin existente (mismo patrón de tabs actual):
- **Productos**: CRUD del catálogo con costo/venta/margen calculado en vivo, color, código interno, imagen, activo/inactivo, stock opcional. (Evolución de la pestaña de ticket types actual.)
- **Operadores**: CRUD de operadores, roles, reset de PIN, activar/desactivar.
- **Caja en vivo**: qué cajas están abiertas, ops recientes, cola de conflictos.
- **Reportes**: ingresos/utilidad/margen por evento y por día; comparativas entre eventos; ranking de productos por unidades y por utilidad; horas punta (histograma de ops por hora, sale gratis del ledger); canjes vs. compras presenciales; clientes por evento.
- **Auditoría**: vista filtrable del ledger completo (por operador, caja, tipo, rango horario).

Los reportes se calculan con SQL agregado sobre `orders`/`orderItems`/`ops` — sin data warehouse. Si en años el volumen lo exige, se materializan vistas; el modelo lo permite sin cambios.

## 12. Productos y márgenes

- **Estructura**: `ticketTypes` ES el catálogo (decisión §0.1/§4.3). `category` se amplía: `acceso | extra | consumo | locker | merch` (o se mantiene `extra` con subcategoría en `metadata` — decisión de implementación; recomiendo ampliar el enum: es una migración aditiva trivial y las categorías son estables).
- **Extensibilidad sin tocar arquitectura**: la columna `metadata JSON` absorbe atributos específicos de tipos futuros (talla del merch, número de locker, duración de happy hour) sin migraciones. Regla: si un atributo empieza a necesitar índice o validación fuerte, se promueve a columna real.
- **Márgenes**: `costPrice` + `price` → margen calculado **siempre en lectura** (`(price - costPrice) / price`), nunca almacenado (evita inconsistencias). Las órdenes guardan `unitPrice` histórico (ya lo hacen); para utilidad histórica exacta se agrega `orderItems.unitCost` (copiado del producto al momento de la venta) — así un cambio de costo futuro no reescribe la utilidad de eventos pasados. **Este es el único dato nuevo crítico para los reportes de utilidad: sin él, los reportes históricos mienten.**
- Reportes derivados: utilidad por producto/evento/día, margen promedio ponderado, ranking por rentabilidad — todo SQL sobre `orderItems` con `unitCost`.

## 13. Riesgos técnicos y mitigación

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| 1 | Doble canje con dos cajas offline | Baja | Medio | §8: server gana, cola de supervisor, ledger completo |
| 2 | Pérdida de cola local (tablet robada/rota antes de sincronizar) | Baja | Alto | Sync agresivo (5s); badge visible de pendientes; protocolo operativo: no cerrar turno con pendientes >0 |
| 3 | iPad/Safari: Background Sync no existe; IndexedDB puede purgarse | Media | Medio | Fallback a intervalo mientras la app está abierta; PWA instalada (evita purga de storage en Safari ≥17); recomendar tablets Android si se compran nuevas |
| 4 | Cold start de Vercel + latencia TiDB en momentos punta | Media | Bajo | La operación es local-first: la latencia del server solo afecta al sync en background, invisible para la cajera |
| 5 | Reloj del dispositivo desviado | Media | Bajo | `serverTimeOffset` en snapshot; `serverAt` siempre lo pone el servidor |
| 6 | Enum/estado inconsistente entre snapshot viejo y server | Media | Medio | Versión de snapshot; canje online-first cuando hay red; refresco incremental cada 60s |
| 7 | PIN débil / tablet compartida | Media | Medio | Enrolamiento de dispositivo por admin + PIN por operador + expiración de sesión por turno + rate limit de PIN |
| 8 | Fraude interno (canje falso, venta no registrada) | Media | Alto | Ledger inmutable con operador/caja/hora en todo; reportes de anulaciones por operador; conteo físico de tickets vs. canjes del sistema al cierre |
| 9 | Crecimiento del ledger | Baja | Bajo | Índices por (eventId, serverAt) y (operatorId); particionar por año si algún día supera millones de filas |
| 10 | Un solo desarrollador | Alta | Alto | Este documento + fases pequeñas verificables + no introducir tecnología fuera del stack actual |

## 14. Roadmap de construcción (orden exacto para la sesión de construcción)

Cada fase termina desplegable y verificable por sí sola. **No avanzar de fase sin verificar la anterior con el checklist.**

**Fase 0 — Fundaciones (schema + auth de operadores)**
`operators`, `registers`, `ops`, columnas nuevas (§4.3), migración Drizzle, seed del admin como operador. Login por PIN (tRPC `caja.login`) + middleware de roles reutilizando el patrón del auth admin. ✔ Verificar: operador creado desde admin puede autenticarse por PIN.

**Fase 1 — Catálogo y códigos legibles**
Costos/color/internalCode en productos (admin UI), generación de `displayCode` en `processApprovedOrder`, email actualizado mostrando códigos de canje, `unitCost` copiado en `orderItems`. ✔ Verificar: compra de prueba con extra genera código `PIS-XXXX-XXXX` visible en el email y en el admin.

**Fase 2 — `/caja` MVP (online-only)**
Las 5 pantallas de §10.2 operando directo contra tRPC (sin offline aún): buscar, ficha, canje con las 6 validaciones, venta presencial (order canal `caja`), dashboard básico. Toda mutación pasa por `applyOp` y escribe el ledger desde el día uno. ✔ Verificar: flujo completo canje + venta en tablet real, ops en el ledger, venta visible en admin/Ventas y en el correo a contacto@.

**Fase 3 — Offline-first**
PWA (manifest + SW con vite-plugin-pwa), Dexie con snapshot §6.2, cola §6.3, endpoint `caja.sync` idempotente, badge de estado, refresco incremental. ✔ Verificar: modo avión → buscar/canjear/vender funcionan → volver online → todo sincroniza sin duplicados; doble canje forzado desde dos navegadores produce 1 `applied` + 1 `conflict`.

**Fase 4 — Supervisor + reportes admin**
Cola de conflictos, anulaciones con motivo, reportes de utilidad/margen/comparativas/horas punta, auditoría del ledger, dashboard caja completo. ✔ Verificar: reportes cuadran contra un CSV manual del evento de prueba.

**Fase 5 — Hardening y cierre de turno**
Shift open/close con resumen, protocolo de pendientes, rate limits, revisión de permisos por rol pantalla por pantalla, pruebas de carga básicas (500 asistentes en snapshot). ✔ Verificar: checklist de seguridad §13 completo.

**Backlog preparado (no construir)**: `/barra`, `/acceso`, `identifiers` (NFC/RFID), pedidos desde mesa, gift cards (= producto con saldo en ledger), promos/happy hour (hook único: el cálculo de precio en `createOrder`/venta caja), múltiples eventos simultáneos (todo ya está keyed por `eventId`), app móvil (la PWA ya lo es).

## 15. Preparación para 5 años

1. **Todo keyed por `eventId` desde el día uno** — múltiples eventos simultáneos no requerirán cambios de modelo, solo un selector de evento al abrir turno.
2. **Abstracción de identificadores** (`identifiers`, §4.1) — NFC, RFID, pulseras y QR industriales son solo nuevas filas de un mapa token→cliente; el buscador de caja no cambia.
3. **Un único punto de cálculo de precio** — descuentos, cupones, happy hour y promociones se implementan una sola vez donde hoy vive la lógica de `discountCodes`, y aplican a web y caja por igual.
4. **El ledger es el activo** — CRM, indicadores, detección de fraude y cualquier análisis futuro se construyen leyendo `ops` + `orders`; nunca habrá que "empezar a registrar" porque ya se registró todo.
5. **Regla de crecimiento del catálogo**: nuevo tipo de producto = nueva categoría + metadata JSON; nunca una tabla nueva por tipo.
6. **Disciplina de inmutabilidad**: correcciones = operaciones de reversa, jamás UPDATE/DELETE de historial. Es una regla de código review, no solo de schema.
7. **Cuándo salir de este diseño**: si algún día hay >5 cajas simultáneas en >3 eventos paralelos con inventario en tiempo real compartido, evaluar un backend con websockets (p. ej. servidor dedicado en Railway/Fly junto al mismo TiDB). El modelo de datos y el ledger sobreviven a esa migración intactos — solo cambia el transporte.
