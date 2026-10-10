/** Interruptores de las alertas del admin (push al iPad + correo resumen
 * diario) -- lo edita el dueño desde Ajustes, se guarda como JSON en
 * siteSettings.adminAlertsConfig.
 *
 * Arrancan TODAS apagadas a propósito: desplegar este código no debe
 * empezar a notificar solo (mismo criterio que foundersPromoEnabled). */
export interface AdminAlertsConfig {
  /** Push inmediato: venta web aprobada. */
  pushNewOrder: boolean;
  /** Push inmediato: nueva postulación a Embajador VIP. */
  pushAmbassadorApplication: boolean;
  /** Push inmediato: denuncia nueva desde Playmatch. */
  pushPartyReport: boolean;
  /** Push inmediato: un mensaje del Instagram quedó esperando a una persona
   * (el agente derivó, se cayó la IA, o el hilo está en manos del admin). No
   * avisa de cada DM: solo de los que el bot NO resolvió. */
  pushInstagramHandoff: boolean;
  /** Push inmediato: una conversación del WhatsApp quedó esperando a una
   * persona -- mismo criterio que pushInstagramHandoff. */
  pushWhatsAppHandoff: boolean;
  /** Correo diario a ADMIN_NOTIFICATION_EMAIL con el resumen de novedades. */
  dailyDigestEmail: boolean;
  /** Vigilante de caja (server/caja/alerts.ts): push inmediato por ventas
   * anuladas, clave admin incorrecta en una caja, stock bajo/agotado, ventas
   * o descuentos fuera de lo normal, descuadres al cerrar turno y cajas sin
   * actividad durante la fiesta. */
  pushCajaAlerts: boolean;
  /** Resumen escrito por IA cada hora durante la fiesta (push) y correo al
   * cierre de la noche con todo lo que pasó en caja. */
  cajaAiSummary: boolean;
  /** Correo con el resumen financiero de la noche, la mañana siguiente al evento. */
  financeNightlyEmail: boolean;
  /** Correo de los lunes con el mes, el año y lo que hay por pagar. */
  financeWeeklyEmail: boolean;
  /** Meta de margen neto (%) que usa Finanzas para el veredicto, los consejos y las alertas. */
  financeMarginTargetPercent: number;
  /** Avisa cuando a un producto le quedan esta cantidad de unidades o menos. */
  cajaLowStockUnits: number;
  /** Avisa de cualquier venta de caja por sobre este monto (CLP). */
  cajaHighSaleClp: number;
}

export const DEFAULT_ADMIN_ALERTS_CONFIG: AdminAlertsConfig = {
  pushNewOrder: false,
  pushAmbassadorApplication: false,
  pushPartyReport: false,
  pushInstagramHandoff: false,
  pushWhatsAppHandoff: false,
  dailyDigestEmail: false,
  pushCajaAlerts: false,
  cajaAiSummary: false,
  financeMarginTargetPercent: 30,
  financeNightlyEmail: false,
  financeWeeklyEmail: false,
  cajaLowStockUnits: 10,
  cajaHighSaleClp: 100000,
};

/** Meta de margen válida: entre 1 y 90 %; si no, la de siempre (30 %). */
export function marginTarget(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 90 ? Math.round(value * 10) / 10 : 30;
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Completa con los valores por defecto (todo apagado) cualquier campo
 * faltante -- una config vieja/parcial nunca deja un interruptor en
 * `undefined` (que en un `if` se comporta distinto a `false` en JSON). */
export function normalizeAdminAlertsConfig(raw: unknown): AdminAlertsConfig {
  const partial = (raw && typeof raw === 'object' ? raw : {}) as Partial<AdminAlertsConfig>;
  return {
    pushNewOrder: partial.pushNewOrder ?? DEFAULT_ADMIN_ALERTS_CONFIG.pushNewOrder,
    pushAmbassadorApplication: partial.pushAmbassadorApplication ?? DEFAULT_ADMIN_ALERTS_CONFIG.pushAmbassadorApplication,
    pushPartyReport: partial.pushPartyReport ?? DEFAULT_ADMIN_ALERTS_CONFIG.pushPartyReport,
    pushInstagramHandoff: partial.pushInstagramHandoff ?? DEFAULT_ADMIN_ALERTS_CONFIG.pushInstagramHandoff,
    pushWhatsAppHandoff: partial.pushWhatsAppHandoff ?? DEFAULT_ADMIN_ALERTS_CONFIG.pushWhatsAppHandoff,
    dailyDigestEmail: partial.dailyDigestEmail ?? DEFAULT_ADMIN_ALERTS_CONFIG.dailyDigestEmail,
    pushCajaAlerts: partial.pushCajaAlerts ?? DEFAULT_ADMIN_ALERTS_CONFIG.pushCajaAlerts,
    cajaAiSummary: partial.cajaAiSummary ?? DEFAULT_ADMIN_ALERTS_CONFIG.cajaAiSummary,
    financeMarginTargetPercent: marginTarget(partial.financeMarginTargetPercent),
    financeNightlyEmail: partial.financeNightlyEmail ?? DEFAULT_ADMIN_ALERTS_CONFIG.financeNightlyEmail,
    financeWeeklyEmail: partial.financeWeeklyEmail ?? DEFAULT_ADMIN_ALERTS_CONFIG.financeWeeklyEmail,
    cajaLowStockUnits: nonNegativeNumber(partial.cajaLowStockUnits, DEFAULT_ADMIN_ALERTS_CONFIG.cajaLowStockUnits),
    cajaHighSaleClp: nonNegativeNumber(partial.cajaHighSaleClp, DEFAULT_ADMIN_ALERTS_CONFIG.cajaHighSaleClp),
  };
}
