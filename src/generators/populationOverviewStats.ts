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
import { currentLandTroops } from "./manpower";

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
  const childPts = new Float64Array(n);
  const malePts = new Float64Array(n);
  const femalePts = new Float64Array(n);
  const elderPts = new Float64Array(n);

  const { cells, burgs, states } = pack;
  if (!cells || !states) return [];

  for (let i = 0; i < cells.i.length; i++) {
    const s = cells.state[i];
    if (!s || s >= n) continue;
    ruralPts[s] += cells.pop[i] ?? 0;
    childPts[s] += cells.children?.[i] ?? 0;
    malePts[s] += cells.maleAdults?.[i] ?? 0;
    femalePts[s] += cells.femaleAdults?.[i] ?? 0;
    elderPts[s] += cells.elders?.[i] ?? 0;
  }

  for (const burg of burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    const s = burg.state ?? 0;
    if (!s || s >= n) continue;
    const pop = burg.population ?? 0;
    urbanPts[s] += pop;
    if (burg.demographics) {
      childPts[s] += burg.demographics.children;
      malePts[s] += burg.demographics.maleAdults;
      femalePts[s] += burg.demographics.femaleAdults;
      elderPts[s] += burg.demographics.elders;
    } else {
      // Fallback if demographics missing: treat whole burg pop as unsplit mass in urban only
    }
  }

  const rows: StateLivingStats[] = [];
  for (const state of states) {
    if (!state?.i || state.removed) continue;
    const id = state.i;
    const rural = ruralPts[id] * rate;
    // Urban display uses urbanization; age buckets for burgs are mixed into malePts etc. at rural rate.
    // Split rural vs urban bucket display is approximate: age columns use rate only so they match
    // "population points × rate". Under-arms are separate.
    // For consistency with Burg Editor urban display, scale urban share of buckets by urbanization:
    // we don't track which age points came from urban vs rural cheaply — use blended approach:
    // children/male/female/elders all × rate (same as casualty tracker). Urban/rural totals use proper formula.
    const urban = urbanPts[id] * rate * urb;
    const underArms = currentLandTroops(state);
    const children = childPts[id] * rate;
    const civilianMale = malePts[id] * rate;
    const civilianFemale = femalePts[id] * rate;
    const elders = elderPts[id] * rate;
    // Civilian settlement total from geography; age sum may differ slightly due to urban multiplier on pop only
    const civilianGeo = rural + urban;
    const total = civilianGeo + underArms;
    const adultPool = civilianMale + underArms + civilianFemale;
    const adultMalePct = adultPool > 0 ? ((civilianMale + underArms) / adultPool) * 100 : 50;
    const mobilizationPct = total > 0 ? (underArms / total) * 100 : 0;

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
      foodStress: state.foodStress ?? 0
    });
  }
  return rows;
}
