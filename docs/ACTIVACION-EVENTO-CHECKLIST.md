# Checklist de activación de un evento

Esta lista debe completarse antes de cambiar un evento a `published`. Su objetivo es evitar que una nueva fecha aparezca en SEO o venta antes de que precios, comunicación y operación estén sincronizados.

## Identidad pública

Verificar que el título, slug, descripción corta, imagen, fecha, horario de puertas, venue y ciudad sean correctos. El slug debe ser permanente y legible; si se renombra, se debe agregar un redirect 301 desde la URL anterior.

## Venta y precios

Crear y revisar los tipos de entrada de categoría `acceso`, sus precios, stock, estado `active`, límite por orden y `accesoSlug`. Confirmar que los extras estén separados de los accesos. Probar `/entradas`, `/eventos/:slug` y `/checkout/:eventSlug` en móvil, incluyendo la ausencia de accesos y el estado sold out.

## Confianza y reglas

Confirmar que la ficha del evento indique edad mínima, dress code, consentimiento, reglas de convivencia, tratamiento de la dirección y condiciones de estacionamiento. Revisar que la política de reembolso esté enlazada desde el checkout y que los mensajes no contradigan la política publicada.

## SEO y distribución

Comprobar que la ruta del evento entrega title, description, canonical, `og:image`, JSON-LD de evento y estado HTTP correcto. Verificar que el evento publicado aparezca en `sitemap.xml`; un evento pasado debe pasar a `past` y dejar de presentarse como comprable. Validar la URL con el script `scripts/verify-ssr.sh` y revisar la tarjeta al compartir por WhatsApp.

## Operación

Confirmar que Caja, Puerta, Cocina, Guardarropía, Gastos, operadores, dispositivos y resúmenes de asistencia apunten al mismo `eventId`. Realizar una compra de prueba o un flujo controlado de invitación sin alterar datos reales; confirmar correo, QR, verificación de entrada y reversión de la prueba según el protocolo interno.

## Cierre

Registrar quién activó el evento, fecha y hora de revisión, versión de precios, responsable de operación y resultado del smoke test. Si falta cualquiera de los bloques anteriores, mantener el evento en `draft` o comunicarlo como “próximamente”, nunca como disponible para compra.
