export const RANKING_WEIGHTS = {
  categoryMatch: 0.3,
  colorMatch: 0.2,
  styleMatch: 0.1,
  priceCompatibility: 0.2,
  sizeAvailability: 0.1,
  nationalProximity: 0.1,
} as const;

const weightSum = Object.values(RANKING_WEIGHTS).reduce((sum, weight) => sum + weight, 0);

// Se valida al cargar el módulo, no solo en un test aparte - si alguien cambia un peso y
// rompe la suma, el error aparece apenas se importa este archivo, no en runtime silencioso.
if (Math.abs(weightSum - 1) > 1e-9) {
  throw new Error(`RANKING_WEIGHTS must sum to 1.0, got ${weightSum}`);
}
