# SEO — Mansion Playroom

Auditoría y estrategia para dejar de depender de una sola búsqueda ("fiesta liberal") y capturar también a quien busca **salir a bailar**, **panoramas nocturnos** y **eventos** en Viña del Mar, Valparaíso y la Región de Valparaíso.

---

## Resumen ejecutivo

El sitio está técnicamente mejor de lo esperable: tiene Open Graph completo, favicons, `noindex` bien aplicado, sitemap y datos estructurados. **El problema no es técnico, es de posicionamiento.**

Dos cosas frenan el crecimiento:

1. **Cuatro páginas peleaban la misma búsqueda.** El home, `/eventos`, `/eventos/:slug` y `/entradas` llevaban casi el mismo título con la frase "Fiesta Liberal en Viña del Mar y Valparaíso". Google no sabía cuál mostrar y repartía la fuerza entre las cuatro en vez de concentrarla en una. Ya está corregido: cada página tiene ahora una intención propia.

2. **No existe contenido de descubrimiento.** Todas las páginas son de compra o de marca. No hay una sola página que responda "qué hacer en Viña del Mar de noche". Para captar a esa persona no basta con optimizar lo que hay: **hay que crear lo que no existe**. Ése es el trabajo de la Fase 2.

La jugada de fondo: el sitio hoy solo le habla a quien ya conoce la marca. La oportunidad está en aparecer antes, cuando la persona todavía está decidiendo qué hacer el sábado.

---

## 1. Auditoría técnica

### Corregido en esta entrega

| # | Hallazgo | Impacto |
|---|---|---|
| 1 | Cuatro páginas con el mismo título → canibalización | 🔴 Alto |
| 2 | `Event` schema fijo en `index.html`: se emitía en todas las páginas (hasta en la política de privacidad) con la fecha quemada | 🔴 Alto |
| 3 | `Event` sin `price`/`priceCurrency`/`endDate` → Google descartaba el resultado enriquecido | 🔴 Alto |
| 4 | Sin `FAQPage` pese a tener 7 preguntas ya escritas | 🟡 Medio |
| 5 | Sin `BreadcrumbList` ni `WebSite` | 🟡 Medio |
| 5b | *(Se evaluó agregar `SearchAction` — el cuadro de búsqueda de Google — y **se descartó**: el sitio no tiene buscador, y declarar una acción inexistente es prometerle a Google algo que no se cumple)* | — |
| 6 | `NightClub` sin teléfono ni rango de precios | 🟡 Medio |
| 7 | `meta keywords` (Google lo ignora desde 2009) | 🟢 Bajo |
| 8 | `/mis-referidos` es `noindex` pero estaba enlazada desde el navbar y el pie de todas las páginas | 🟢 Bajo |

### Pendiente

| # | Hallazgo | Cuándo |
|---|---|---|
| 9 | **El HTML se sirve vacío y se rellena con JavaScript.** Google lo indexa igual, pero en una segunda pasada más lenta | Fase 3 |
| 10 | **El canonical del HTML servido apunta siempre al home.** `useSeo` lo corrige por JS, pero un crawler sin JS ve todas las páginas como copias del home | Fase 3 (necesita pre-renderizado) |
| 11 | Fuentes desde Google Fonts = un salto de red externo en el camino crítico. Ya está mitigado con `preconnect` + `display=swap` | Opcional |

### Lo que ya estaba bien
Open Graph completo con dimensiones y `og:locale`, Twitter Card, set completo de favicons, `lang="es"`, viewport correcto, `robots.txt` con sitemap declarado, `noindex` correcto en checkout/pago/panel/caja, analítica diferida, y el runtime de debug excluido de producción.

> **Nota sobre la dirección**: el schema declara solo comuna y región, nunca la dirección exacta. Publicarla daría mejor señal de SEO local, pero el modelo de la marca es "dirección exacta al comprar" y eso manda. No se toca.

---

## 2. Mapa de intención

La regla que evita duplicación: **una intención = una página = un título**. Nadie repite el ángulo de otro.

| Intención | Qué busca la persona | Página | Estado |
|---|---|---|---|
| **Descubrimiento** | "qué hacer en Viña del Mar de noche" | `/panoramas/vina-del-mar` | Fase 2 |
| **Descubrimiento** | "vida nocturna Valparaíso" | `/panoramas/valparaiso` | Fase 2 |
| **Comparación** | "mejores panoramas nocturnos" | `/panoramas` | Fase 2 |
| **Decisión** | "eventos este sábado en Valparaíso" | `/eventos` | ✅ |
| **Decisión** | nombre del evento + fecha | `/eventos/:slug` | ✅ |
| **Conversión** | "entradas", "precios" | `/entradas` | ✅ |
| **Marca** | "mansion playroom" | `/` | ✅ |
| **Confianza** | "¿es seguro?", "¿quiénes son?" | `/nosotros` | ✅ |
| **Long tail** | preguntas concretas | `/blog/:slug` | Fase 2 |

### Títulos y descripciones

Ya aplicados:

| Página | Título | Meta description |
|---|---|---|
| `/` | Mansion Playroom — Fiesta Liberal en Viña del Mar \| +18 | La fiesta liberal más grande de la V Región: 2 pistas, Playground XXL y Kink Room. Comunidad, consentimiento y una noche para salir a bailar en Viña del Mar y Valparaíso. Evento +18. |
| `/eventos` | Eventos y Fiestas en Valparaíso — Calendario \| Mansion Playroom | Calendario de próximos eventos de Mansion Playroom en la Región de Valparaíso. Fechas, horarios y entradas para tu próxima salida nocturna en Viña del Mar y Valparaíso. |
| `/entradas` | Entradas y Precios — Mansion Playroom | Valores y tipos de acceso para Candyland: Dúo, Soltera, Dúo Mujeres y Soltero. Compra online con confirmación inmediata por correo. Evento +18. |
| `/nosotros` | Quiénes Somos — Comunidad y Consentimiento \| Mansion Playroom | Cómo cuidamos el espacio: respeto, consentimiento y libertad. Conoce la comunidad detrás de las noches de Mansion Playroom en la Región de Valparaíso. |

Para las páginas de la Fase 2:

| Página | Título | Meta description |
|---|---|---|
| `/panoramas` | Panoramas Nocturnos en la Región de Valparaíso — Guía | Qué hacer de noche en Viña del Mar y Valparaíso: panoramas, fiestas, planes de fin de semana y salidas en pareja. Guía actualizada. |
| `/panoramas/vina-del-mar` | Qué Hacer en Viña del Mar de Noche — Guía | Panoramas nocturnos en Viña del Mar: dónde salir a bailar, qué esperar y cómo elegir tu noche. Guía local actualizada. |
| `/panoramas/valparaiso` | Vida Nocturna en Valparaíso — Dónde Salir de Noche | Guía de vida nocturna en Valparaíso: panoramas, fiestas temáticas y planes de fin de semana en la Región de Valparaíso. |

---

## 3. Keywords por intención

### Alta intención (conversión)
`entradas fiesta viña del mar` · `comprar entradas fiesta valparaíso` · `fiesta liberal viña del mar` · `mansion playroom` · `mansion playroom entradas` · `candyland viña del mar`

### Media intención (comparación)
`mejores panoramas nocturnos viña del mar` · `dónde salir a bailar en viña del mar` · `discotecas valparaíso` · `fiestas temáticas chile` · `eventos este fin de semana valparaíso` · `panoramas de noche quinta región`

### Baja intención (descubrimiento)
`qué hacer en viña del mar de noche` · `qué hacer en valparaíso de noche` · `vida nocturna viña del mar` · `panoramas fin de semana quinta región` · `planes nocturnos región de valparaíso` · `salir de noche en viña`

### Long tail
`qué hacer en viña del mar de noche en pareja` · `panoramas para el fin de semana en valparaíso` · `fiestas con dress code en viña del mar` · `dónde ir a bailar reggaetón en valparaíso` · `eventos +18 región de valparaíso` · `fiestas con estacionamiento en viña del mar`

### Preguntas (long tail conversacional)
`¿qué me pongo para una fiesta temática?` · `¿cómo funciona una fiesta liberal?` · `¿es seguro ir solo a una fiesta?` · `¿qué llevar a un evento nocturno?` · `¿a qué hora conviene llegar a una fiesta?` · `¿cómo llegar a una fiesta sin auto en viña?`

---

## 4. Contenido: qué escribir y por qué

Cada artículo apunta a una pregunta real y termina llevando al evento. **El orden importa**: los primeros tres son los que más rápido pueden traer tráfico nuevo.

| # | Artículo | Intención | Lleva a |
|---|---|---|---|
| 1 | Qué hacer en Viña del Mar de noche: guía de panoramas | Descubrimiento | `/eventos` |
| 2 | Vida nocturna en Valparaíso: dónde salir según lo que buscas | Descubrimiento | `/eventos` |
| 3 | Planes de fin de semana en la Quinta Región | Descubrimiento | `/eventos` |
| 4 | Cómo elegir una fiesta temática (y no equivocarse) | Comparación | `/entradas` |
| 5 | Qué llevar a un evento nocturno: la lista corta | Preparación | `/eventos/:slug` |
| 6 | Dress code explicado: qué significa cada estilo | Preparación | `/entradas` |
| 7 | Primera vez en una fiesta liberal: qué esperar | Confianza | `/nosotros` |
| 8 | Consentimiento en la pista: cómo funciona | Confianza | `/nosotros` |
| 9 | Ideas para salir en pareja de noche en Viña | Descubrimiento | `/entradas` |
| 10 | Cómo llegar y dónde estacionar | Logística | `/eventos/:slug` |
| 11 | Salir sin auto en Viña y Valpo: qué conviene | Logística | `/eventos` |
| 12 | Guía de la noche: horarios reales de la Quinta Región | Descubrimiento | `/eventos` |
| 13 | Qué es una Kink Room y cómo se usa | Curiosidad | `/nosotros` |
| 14 | Ir solo/a a una fiesta: cómo se hace bien | Confianza | `/entradas` |
| 15 | Preguntas frecuentes antes de tu primera noche | Preparación | `/entradas` |

**Regla anti-duplicación**: las guías de panorama (`/panoramas/*`) son **contenido editorial** — hablan de la escena, no venden. La marca aparece como *una* opción entre varias. Las páginas de evento venden. Si la guía se convierte en un folleto, Google la trata como página comercial y pierde justamente la búsqueda que se quería ganar.

---

## 5. Enlazado interno

```
                    ┌─────────┐
                    │  Home   │
                    └────┬────┘
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │/panoramas│──▶│ /eventos │──▶│/entradas │
    └────┬─────┘   └────┬─────┘   └──────────┘
         │              │               ▲
    ┌────┴────┐         ▼               │
    ▼         ▼   ┌──────────┐          │
 /vina    /valpo  │/eventos/:│──────────┘
    │         │   │  slug    │
    └────┬────┘   └──────────┘
         ▼
      /blog/:slug ──────▶ /nosotros
```

Principios:
- **Las guías alimentan al calendario**, el calendario al evento, el evento a la compra. Nunca al revés.
- Cada artículo enlaza a **una** página de conversión, no a cinco.
- `/nosotros` recibe enlaces desde los artículos de confianza — es la página que cierra la duda de "¿puedo confiar?".
- Las páginas `noindex` (panel, checkout, referidos) **no** se enlazan desde el navbar ni el pie.

---

## 6. Conversión: qué responde cada página

| Página | Qué busca | Por qué esta marca | Qué hace después |
|---|---|---|---|
| `/panoramas/*` | Ideas para salir | Conoce la escena local de verdad | Ver el calendario · seguir en IG |
| `/eventos` | Fechas concretas | Hay algo pronto | Entrar al evento |
| `/eventos/:slug` | Detalles de esa noche | Sabe qué esperar | Comprar |
| `/entradas` | Cuánto cuesta | Precios claros, sin sorpresas | Comprar |
| `/nosotros` | ¿Es seguro? | Consentimiento y comunidad explícitos | Ver eventos |
| `/blog/:slug` | Una respuesta | Responde sin vender | Guía relacionada · evento |

---

## 7. Instagram ↔ SEO

Los dos canales cumplen roles distintos y se alimentan. **No son lo mismo con distinto formato.**

**Google trae desconocidos.** Alguien busca "qué hacer en Viña de noche", llega a una guía, y ahí recién descubre la marca. Esa persona no está lista para comprar: está lista para **seguir**. Por eso las guías llevan a Instagram, no al checkout.

**Instagram trae gente que ya confía.** Vio las historias, conoce la estética, sabe de qué se trata. Esa persona sí está lista para comprar. Por eso el link de la bio apunta a `/entradas` o al evento — mandarla al home la obliga a buscar de nuevo lo que ya decidió.

Cómo se retroalimentan:
- **Cada guía se recicla como carrusel.** Mismo contenido, dos canales, un solo trabajo de redacción.
- **Los artículos nacen de los DM.** Las preguntas que llegan por mensaje directo son, literalmente, lo que la gente escribe en Google. Si tres personas preguntan lo mismo, ahí hay un artículo.
- **Las historias de la noche alimentan las guías.** Las fotos y clips del evento son el material visual de la guía del mes siguiente.
- **La prueba social vive en la web.** Un bloque de contenido real de Instagram en las guías convierte visitante frío en seguidor.

---

## 8. Plan por fases

### ✅ Fase 1 — esta entrega
Títulos por intención (rompe la canibalización) · schema por página con datos reales · `FAQPage` con las 7 preguntas existentes · `BreadcrumbList` · `WebSite` · `Event` con precio y fecha de término · limpieza de enlazado interno · este documento.

### ✅ Fase 2 — contenido (entregada)
2 guías de panorama (`/panoramas/vina-del-mar`, `/panoramas/valparaiso`) + hub `/panoramas` · blog con 4 artículos · `BlogPosting` schema · FAQ del home ampliada de 7 a 14 preguntas · `/nosotros` y `/entradas` con contenido nuevo · sitemap actualizado.

> Ruta `/blog` en singular **a propósito**: `vercel.json` excluye `blogs/` del rewrite por rutas heredadas de Shopify, así que el plural daría 404.

**Regla de redacción que se siguió**: solo se afirma lo verificable en `client/src/config/candyland.ts`. No se inventaron locales de terceros, barrios, horarios de transporte ni datos de la escena. Contenido genérico inflado es justo lo que penaliza el sistema de contenido útil de Google, y recomendar lugares no verificables es un riesgo para la marca.

**Lo que falta y depende del dueño**: las guías ganarían bastante con material real que solo él tiene — las preguntas que llegan por DM (son literalmente lo que la gente escribe en Google), detalles concretos de transporte de vuelta a esa hora, y cómo se vive la noche por dentro hora a hora. Con eso, cada guía puede duplicar su profundidad sin inventar nada.

### Fase 3 — pre-renderizado
HTML generado por ruta en el build, con el `<head>` correcto (incluido el canonical propio, que hoy no se puede arreglar sin esto) y el cuerpo renderizado para las páginas de contenido puro. Las páginas con datos en vivo quedan como están.

### Fase 4 — medición
Google Search Console (propiedad + sitemap) · validar rich results de `Event` y `FAQPage` · revisar cobertura de indexación · ajustar con datos reales, no con supuestos.

---

## 9. Qué hacer fuera del código

Cosas que no dependen de programación y valen tanto como el resto:

1. **Google Business Profile.** Es la palanca de SEO local más grande que existe y no requiere tocar el sitio. Aunque la dirección exacta sea privada, se puede crear como negocio con área de servicio (Viña del Mar / Valparaíso) sin publicar la calle.
2. **Search Console.** Sin esto se trabaja a ciegas: es lo que dice qué búsquedas ya traen gente y qué páginas están indexadas.
3. **Reseñas.** Las reseñas reales pesan en el paquete local y en la decisión de quien duda.
4. **Constancia sobre volumen.** Un artículo al mes sostenido gana a diez de una vez y después nada.
