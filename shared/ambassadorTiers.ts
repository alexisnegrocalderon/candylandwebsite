/** Niveles de premios del programa de embajadores -- fuente única compartida
 * entre server/email.ts (correos) y client/src/pages/MyReferrals.tsx (Hall
 * de la Fama). Antes esto vivía duplicado en ambos archivos con formas
 * distintas ({emoji,umbral,premio} vs {name,min,reward}). */
export interface AmbassadorTier {
  name: string;
  min: number;
  emoji: string;
  reward: string;
}

export const AMBASSADOR_TIERS: AmbassadorTier[] = [
  { name: 'Bronce', min: 3, emoji: '🥉', reward: '1 consumo' },
  { name: 'Plata', min: 5, emoji: '🥈', reward: '2 consumos + acceso al próximo evento' },
  { name: 'Oro', min: 10, emoji: '🥇', reward: 'Mesa VIP + 2 botellas de espumante (o 1 de pisco) + acceso al próximo evento' },
];

export function tierForCount(count: number): AmbassadorTier | undefined {
  return AMBASSADOR_TIERS.filter(t => count >= t.min).pop();
}

export function nextTierForCount(count: number): AmbassadorTier | undefined {
  return AMBASSADOR_TIERS.find(t => count < t.min);
}
