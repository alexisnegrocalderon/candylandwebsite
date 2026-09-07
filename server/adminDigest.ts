/** Correo resumen diario de novedades del admin (interruptor propio,
 * `adminAlertsConfig.dailyDigestEmail`, apagado por defecto). Corre por cron
 * (server/cronRoutes.ts) y también se puede disparar a mano desde Ajustes
 * para probarlo antes de confiar en el cron. */
import { getSiteSettings, getAdminBadgeCounts, getNewWebRevenue } from './db';
import { normalizeAdminAlertsConfig } from '../shared/adminAlertsConfig';
import { buildAdminDigestEmail, sendEmail } from './email';
import { ADMIN_NOTIFICATION_EMAIL } from '../shared/const';

export async function runAdminDigest(): Promise<{ success: boolean; sent: boolean; reason?: string }> {
  const settings = await getSiteSettings();
  const config = normalizeAdminAlertsConfig((settings as any).adminAlertsConfig);
  if (!config.dailyDigestEmail) return { success: true, sent: false, reason: 'apagado en Ajustes' };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [counts, newWebRevenue] = await Promise.all([
    getAdminBadgeCounts({
      'orders-web': since, 'orders-caja': since, 'leads': since, 'customers': since, 'referrals': since,
    }),
    getNewWebRevenue(since),
  ]);

  const html = buildAdminDigestEmail({
    newOrdersWeb: counts['orders-web'],
    newOrdersCaja: counts['orders-caja'],
    newWebRevenue,
    newLeads: counts['leads'],
    newCustomers: counts['customers'],
    newReferrals: counts['referrals'],
    pendingApplications: counts['ambassadors'],
    openReports: counts['denuncias'],
    unclaimedGifts: counts['party-gifts'],
    openShifts: counts['caja'],
  });

  const result = await sendEmail({
    to: ADMIN_NOTIFICATION_EMAIL,
    subject: '📋 Resumen de novedades — Mansion Playroom',
    html,
  });
  return { success: result.success, sent: result.success, reason: result.success ? undefined : result.reason };
}
