import { getSiteSettings, listAiUsageSince, updateSiteSettings } from './db';
import { sendPushToAdminsAlways } from './push';
import { normalizeAdminAlertsConfig } from '../shared/adminAlertsConfig';
import { chileMonthKey, chileMonthStart, computeAiBudget, type AiBudget } from '../shared/aiBudget';

/* Barra de saldo del gasto de IA (tope mensual + saldo anotado a mano). */

const sum = (rows: { costMicroUsd: number }[]) => rows.reduce((t, r) => t + r.costMicroUsd, 0) / 1_000_000;

export async function loadAiBudget(now = new Date()): Promise<AiBudget & { balanceAt: string; balanceUsd: number }> {
  const settings = await getSiteSettings();
  const cfg = normalizeAdminAlertsConfig((settings as any)?.adminAlertsConfig);
  const monthStart = chileMonthStart(now);
  const balanceAt = cfg.aiBalanceAt ? new Date(cfg.aiBalanceAt) : null;
  const since = balanceAt && balanceAt < monthStart ? balanceAt : monthStart;
  const rows = await listAiUsageSince(since);
  const budget = computeAiBudget({
    capUsd: cfg.aiCapUsd,
    balanceUsd: cfg.aiBalanceUsd,
    spentMonthUsd: sum(rows.filter((r) => new Date(r.createdAt) >= monthStart)),
    spentSinceBalanceUsd: balanceAt ? sum(rows.filter((r) => new Date(r.createdAt) >= balanceAt)) : 0,
  });
  return { ...budget, balanceAt: cfg.aiBalanceAt, balanceUsd: cfg.aiBalanceUsd };
}

export async function saveAiBudget(input: { capUsd: number; balanceUsd: number }, now = new Date()): Promise<void> {
  const settings = await getSiteSettings();
  const cfg = normalizeAdminAlertsConfig((settings as any)?.adminAlertsConfig);
  await updateSiteSettings({
    adminAlertsConfig: normalizeAdminAlertsConfig({
      ...cfg, aiCapUsd: input.capUsd, aiBalanceUsd: input.balanceUsd, aiBalanceAt: now.toISOString(), aiAlertSent: '',
    }),
  });
}

let lastCheck = 0;

/** Avisa por push al cruzar 80 % y 100 % del tope del mes, o cuando el saldo estimado baja de US$1.
 * Se llama después de cada gasto registrado; revisa a lo más cada 5 minutos. Nunca lanza. */
export async function checkAiBudgetAlert(now = new Date()): Promise<void> {
  try {
    if (now.getTime() - lastCheck < 5 * 60_000) return;
    lastCheck = now.getTime();
    const settings = await getSiteSettings();
    const cfg = normalizeAdminAlertsConfig((settings as any)?.adminAlertsConfig);
    if (cfg.aiCapUsd <= 0 && cfg.aiBalanceUsd <= 0) return;
    const b = await loadAiBudget(now);
    const month = chileMonthKey(now);
    const sent = new Set(cfg.aiAlertSent.split(',').filter(Boolean));
    const due: { key: string; title: string; body: string }[] = [];
    if (b.capUsd > 0 && b.percent >= 100) due.push({ key: `${month}:100`, title: '🚫 Tope de IA alcanzado', body: 'El gasto del mes llegó al tope: el agente y el Estudio dejan de responder. Sube el límite en platform.claude.com.' });
    else if (b.capUsd > 0 && b.percent >= 80) due.push({ key: `${month}:80`, title: '⚠️ IA al 80% del tope', body: `Llevas US$${b.spentMonthUsd.toFixed(2)} de US$${b.capUsd.toFixed(2)} este mes.` });
    if (b.balanceLeftUsd != null && b.balanceLeftUsd < 1) due.push({ key: `${cfg.aiBalanceAt}:low`, title: '⚠️ Quedan pocos créditos de IA', body: `Saldo estimado: US$${b.balanceLeftUsd.toFixed(2)}. Agrega fondos en platform.claude.com.` });
    const fresh = due.filter((d) => !sent.has(d.key));
    if (fresh.length === 0) return;
    for (const d of fresh) await sendPushToAdminsAlways({ title: d.title, body: d.body, url: '/admin' });
    await updateSiteSettings({
      adminAlertsConfig: normalizeAdminAlertsConfig({ ...cfg, aiAlertSent: Array.from(sent).concat(fresh.map((d) => d.key)).join(',') }),
    });
  } catch (err) {
    console.warn('[aiBudget] No se pudo revisar el aviso de gasto:', err);
  }
}
