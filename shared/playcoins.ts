/** Programa de puntos "Playcoins" (pedido explícito del usuario, reemplaza
 * el sistema de puntos que la tienda tenía en Shopify) -- fuente única
 * compartida entre server (ganar/canjear) y client (previews de "vas a
 * ganar X" / "puedes canjear hasta $Y"). */

export const PLAYCOINS_PER_1000_CLP = 25;
export const PLAYCOINS_MIN_REDEEM_BALANCE = 5000;
export const PLAYCOINS_TO_CLP = 1; // 1 Playcoin = $1 CLP

/** Puntos ganados por una compra de `totalClp` -- redondeo hacia abajo por
 * cada $1.000 completo, nunca puntos "fraccionados" por una compra de $999. */
export function playcoinsEarnedForPurchase(totalClp: number): number {
  if (!Number.isFinite(totalClp) || totalClp <= 0) return 0;
  return Math.floor(totalClp / 1000) * PLAYCOINS_PER_1000_CLP;
}

export function playcoinsToClp(playcoins: number): number {
  return playcoins * PLAYCOINS_TO_CLP;
}

export function canRedeem(balance: number): boolean {
  return balance >= PLAYCOINS_MIN_REDEEM_BALANCE;
}

/** Clamp de un canje pedido: nunca más que el saldo disponible, nunca
 * negativo, y nada si el saldo no alcanza el mínimo para poder canjear. */
export function clampRedeemAmount(requested: number, balance: number): number {
  if (!canRedeem(balance)) return 0;
  return Math.max(0, Math.min(requested, balance));
}
