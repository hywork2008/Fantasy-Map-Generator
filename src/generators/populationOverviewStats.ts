/**
 * Aggregate living population stats per state for Population Overview.
 * Recomputes from cells/burgs (not stale state.rural/urban) so demography ticks show up.
 *
 * Display people:
 * - rural: points × populationRate
 * - urban: points × populationRate × urbanization
 * - underArms: regiment headcount (already people)
 */
import type { PackedGraph } from "../types/PackedGraph";
import { currentLandTroops, getDraftEfficiency, landRegiments } from "./manpower";

export interface StateLivingStats {
  id: number;
  name: string;
  fullName: string;
  color: string;
  rural: number;
  urban: number;
  /** Land troops currently under arms (people). */
  underArms: number;
  /** rural + urban + underArms */
  total: number;
  children: number;
  civilianMale: number;
  civilianFemale: number;
  elders: number;
  /** underArms / total × 100 */
  mobilizationPct: number;
  /**
   * Share of adult males among adults (civilian male + under arms + civilian female), 0–100.
   * High values ≈ male-heavy (garrison/draft); low ≈ widow-skewed.
   */
  adultMalePct: number;
  /** Current food disruption 0–~1.5 if present on state. */
  foodStress: number;
  /** 0..1 wartime supply strain (Economy warIntensity rollup). */
  supplyStrain: number;
  /** Mean land regiment quality 0..1 when recruit quality is tracked. */
  meanQuality: number;
  /** Draft efficiency 0..1 (food + supply). */
  draftEfficiency: number;
}

export function collectLivingStatsByState(
  pack: PackedGraph,
  populationRate: number,
  urbanization: number
): StateLivingStats[] {
  const rate = populationRate || 1;
  const urb = urbanization || 1;
  const n = pack.states?.length ?? 0;

  const ruralPts = new Float64Array(n);
  const urbanPts = new Float64Array(n);
  const ruralChildPts = new Float64Array(n);
  const ruralMalePts = new Float64Array(n);
  const ruralFemalePts = new Float64Array(n);
  const ruralElderPts = new Float64Array(n);
  const urbanChildPts = new Float64Array(n);
  const urbanMalePts = new Float64Array(n);
  const urbanFemalePts = new Float64Array(n);
  const urbanElderPts = new Float64Array(n);

  const { cells, burgs, states } = pack;
  if (!cells || !states) return [];

  for (let i = 0; i < cells.i.length; i++) {
    const s = cells.state[i];
    if (!s || s >= n) continue;
    ruralPts[s] += cells.pop[i] ?? 0;
    ruralChildPts[s] += cells.children?.[i] ?? 0;
    ruralMalePts[s] += cells.maleAdults?.[i] ?? 0;
    ruralFemalePts[s] += cells.femaleAdults?.[i] ?? 0;
    ruralElderPts[s] += cells.elders?.[i] ?? 0;
  }

  for (const burg of burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    const s = burg.state ?? 0;
    if (!s || s >= n) continue;
    const pop = burg.population ?? 0;
    urbanPts[s] += pop;
    if (burg.demographics) {
      urbanChildPts[s] += burg.demographics.children;
      urbanMalePts[s] += burg.demographics.maleAdults;
      urbanFemalePts[s] += burg.demographics.femaleAdults;
      urbanElderPts[s] += burg.demographics.elders;
    } else {
      // Fallback if demographics missing: treat whole burg pop as unsplit mass in urban only
    }
  }

  const rows: StateLivingStats[] = [];
  for (const state of states) {
    if (!state?.i || state.removed) continue;
    const id = state.i;
    const rural = ruralPts[id] * rate;
    const urban = urbanPts[id] * rate * urb;
    const underArms = currentLandTroops(state);
    const children = ruralChildPts[id] * rate + urbanChildPts[id] * rate * urb;
    const civilianMale = ruralMalePts[id] * rate + urbanMalePts[id] * rate * urb;
    const civilianFemale = ruralFemalePts[id] * rate + urbanFemalePts[id] * rate * urb;
    const elders = ruralElderPts[id] * rate + urbanElderPts[id] * rate * urb;
    const civilianGeo = rural + urban;
    const total = civilianGeo + underArms;
    const adultPool = civilianMale + underArms + civilianFemale;
    const adultMalePct = adultPool > 0 ? ((civilianMale + underArms) / adultPool) * 100 : 50;
    const mobilizationPct = total > 0 ? (underArms / total) * 100 : 0;

    const land = landRegiments(state);
    let qSum = 0;
    let qN = 0;
    for (const r of land) {
      if (r.a <= 0) continue;
      qSum += (r.quality ?? 1) * r.a;
      qN += r.a;
    }

    rows.push({
      id,
      name: state.name,
      fullName: state.fullName || state.name,
      color: state.color || "#999",
      rural,
      urban,
      underArms,
      total,
      children,
      civilianMale,
      civilianFemale,
      elders,
      mobilizationPct,
      adultMalePct,
      foodStress: state.foodStress ?? 0,
      supplyStrain: state.supplyStrain ?? 0,
      meanQuality: qN > 0 ? qSum / qN : 1,
      draftEfficiency: getDraftEfficiency(state)
    });
  }
  return rows;
}
