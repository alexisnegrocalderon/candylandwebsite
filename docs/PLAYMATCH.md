# Playmatch por dentro

Cómo está armado Playmatch (la fiesta dentro del celular) y qué puede cambiar el administrador sin publicar nada.

## Lo que ve el invitado

- **Descubrir** (swipe), **Fiesta** (quién está en cada zona), **Matches** y **Disfraces** (solo con el Modo Halloween y el concurso prendidos).
- **Super Like ⭐** (antes «Caramelo»): el primero de la noche es gratis; los demás se compran. La otra persona se entera al tiro. Si ya te había mandado uno, devolverlo es match y no cuesta.
- **Afinidad %** en cada tarjeta (`shared/playmatchMarket.ts: affinityPercent`): pesa lo que buscan esta noche, cómo se relacionan y si están en la misma zona. Si ninguno contó nada con qué comparar, no se muestra un número inventado.
- **«Alguien muy afín llegó»**: push cuando entra al juego alguien con 80 % o más de afinidad (máximo 2 por persona y noche, sin decir quién es).
- **«Les gustas a N personas»**: el número siempre; quiénes son, tras pagar el desbloqueo de la noche (con botón ♥ para dar match al tiro).
- **Disfraces**: galería para votar (3 votos, se pueden cambiar). El ranking no lo ve nadie mientras se vota; el administrador **revela el podio**, y ahí se cierra la votación.

## Cómo se paga

Playcoins primero y, lo que falte, del saldo PlayCard (1 Playcoin = $1). Si no alcanza entre los dos no se descuenta nada y se ofrece recargar (la misma recarga de siempre, con el código de la entrada).

- Precios por defecto: Super Like **$500**, pack de **10 por $2.500**, hasta **10 comprados** por persona y noche (el gratis va aparte), «Ver quién me dio ♥» **$300**.
- Todo cobro es **una transacción** (`server/playmatchMarket.ts: charge`): el cargo de Playmatch, el descuento condicional de cada billetera (`WHERE saldo >= monto`: nunca queda en negativo), los dos libros (`playcoinsLedger` y `prepaidLedger`, razón `spend_playmatch`) y lo comprado. O pasa todo o no pasa nada.
- El celular manda un `opId` por intento: reintentar el mismo no cobra dos veces (índice único en `partyCharges.opId`).
- Los Super Likes sin usar no se acumulan ni se devuelven. Un Super Like sin respuesta solo lo devuelve el administrador.

## Lo que controla el administrador (Admin → App → Playmatch en vivo)

- **En vivo**: perfiles, con foto, activos, ♥/✕, Super Likes, matches, chats, mensajes, votos, plata cobrada (Playcoins y saldo por separado) y cobros por hora.
- **Cobros**: cada compra, regalo, devolución y ajuste, con CSV.
- **Personas**: regalar Super Likes, devolver uno sin respuesta, poner un tope propio.
- **Ajustes**: interruptores (Playmatch, Super Likes, «Ver quién me dio ♥», concurso), precios y topes, meta de los anfitriones y la revelación del podio. Se guarda por fiesta en `partyEventConfig` y llega a los celulares en unos 5 segundos.

## Anfitriones de Playmatch

Cargo **«Anfitrión Playmatch»** (Admin → Noche → Staff). En su app ven «Anfitrión Playmatch»: QR de «Baja la App» y cuántos ya la abrieron/entraron/armaron perfil, búsqueda de personas para ayudarles a armar el perfil (alias, o nombre con apellido abreviado) con aviso push de «Falta tu foto» (uno cada 10 minutos por persona), y la meta de la noche. El cargo no abre ninguna pantalla de trabajo (puerta, caja…). El dueño también la ve para probarla.

## La base de datos se completa sola

`drizzle/0136_playmatch_identidad.sql` y `0137_playmatch_mercado.sql` están en el repo, pero `server/partySchema.ts` las aplica solo si faltan (columnas, tablas, índices y valores nuevos de enum; nunca borra ni cambia datos):

- Se lanza al abrir la base y **no frena al resto del sitio**: solo Playmatch espera (`getPartyActor` y todo `server/playmatchMarket.ts`).
- Va en grupos separados: si falla el de las billeteras, el perfil igual queda listo y **los cobros quedan apagados** (`playmatchWalletReady`): nunca se descuenta plata sin poder anotarla.
- La config va en su propia tabla y no en `siteSettings`: esa fila la lee todo el sitio y una columna sin migrar lo tumbaría.

## Privacidad

Orientación, cómo se relaciona y qué busca se borran al cerrar la fiesta; los ♥/✕ también; los votos de disfraz, 24 horas después. Los cobros quedan como respaldo de la venta. La política de privacidad (`client/src/pages/PrivacyPolicy.tsx`) lo dice: si cambia algo acá, hay que cambiarlo allá.
