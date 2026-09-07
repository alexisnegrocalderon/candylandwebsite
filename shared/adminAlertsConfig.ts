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
  /** Correo diario a ADMIN_NOTIFICATION_EMAIL con el resumen de novedades. */
  dailyDigestEmail: boolean;
}

export const DEFAULT_ADMIN_ALERTS_CONFIG: AdminAlertsConfig = {
  pushNewOrder: false,
  pushAmbassadorApplication: false,
  pushPartyReport: false,
  dailyDigestEmail: false,
};

/** Completa con los valores por defecto (todo apagado) cualquier campo
 * faltante -- una config vieja/parcial nunca deja un interruptor en
 * `undefined` (que en un `if` se comporta distinto a `false` en JSON). */
export function normalizeAdminAlertsConfig(raw: unknown): AdminAlertsConfig {
  const partial = (raw && typeof raw === 'object' ? raw : {}) as Partial<AdminAlertsConfig>;
  return {
    pushNewOrder: partial.pushNewOrder ?? DEFAULT_ADMIN_ALERTS_CONFIG.pushNewOrder,
    pushAmbassadorApplication: partial.pushAmbassadorApplication ?? DEFAULT_ADMIN_ALERTS_CONFIG.pushAmbassadorApplication,
    pushPartyReport: partial.pushPartyReport ?? DEFAULT_ADMIN_ALERTS_CONFIG.pushPartyReport,
    dailyDigestEmail: partial.dailyDigestEmail ?? DEFAULT_ADMIN_ALERTS_CONFIG.dailyDigestEmail,
  };
}
