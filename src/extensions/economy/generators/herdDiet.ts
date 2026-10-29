/**
 * Milk and meat the herds actually give a wet-land household (docs/plan/wet-region-pastoral-economy.md
 * §3.8). The rainfall share (ruralDiet.ts getWetPastoralDietShare) says how much of the diet the
 * people would take from their herds; the herds standing in the cell say how much they can. The
 * smaller of the two is eaten, so a cell whose herds are short asks the Food Ledger for grain instead.
 *
 * Milk sold as the Milk good is not subtracted: households eat their own milk first and sell the rest
 * (a known overlap with the market, small next to the grain it replaces).
 */

import { ANNUAL_LITERS_PER_LACTATING_FEMALE, LACTATING_SHARE_OF_BREEDING_COHORT } from "./dairyProductionPolicy";
import type { FaunaCohorts } from "./faunaPopulationTypes";
import { DAILY_CALORIC_NEED_KCAL, MILK_KCAL_PER_LITER } from "./nutritionAudit";
import { EXPERIMENTAL_CARCASS_PROFILES, WINTER_SLAUGHTER_POLICY } from "./winterSlaughterPolicy";

const DAYS_PER_YEAR = 365.2425;

/**
 * Yearly slaughter as a share of the standing herd and edible lean and fat per head. Provisional:
 * cattle herds turn over in six to seven years, small stock faster; carcass parts are the Scottish
 * references in winterSlaughterPolicy.ts (goats take the sheep figure less a little).
 */
export const HERD_MEAT_OFFTAKE: Readonly<Record<string, { readonly share: number; readonly edibleKg: number }>> = {
  Cattle: {
    share: 0.15,
    edibleKg:
      EXPERIMENTAL_CARCASS_PROFILES.Cattle.leanKgPerHead + EXPERIMENTAL_CARCASS_PROFILES.Cattle.edibleFatKgPerHead
  },
  Sheep: {
    share: 0.25,
    edibleKg: EXPERIMENTAL_CARCASS_PROFILES.Sheep.leanKgPerHead + EXPERIMENTAL_CARCASS_PROFILES.Sheep.edibleFatKgPerHead
  },
  Goats: { share: 0.25, edibleKg: 9 }
};

/** Food energy a cell's herds give in a year, in kcal. */
export function getHerdFoodKcal(herds: Readonly<Record<string, FaunaCohorts | undefined>>): number {
  let kcal = 0;
  for (const [species, herd] of Object.entries(herds)) {
    if (!herd) continue;
    const liters = ANNUAL_LITERS_PER_LACTATING_FEMALE[species] ?? 0;
    kcal += Math.max(0, herd.breeding) * LACTATING_SHARE_OF_BREEDING_COHORT * liters * MILK_KCAL_PER_LITER;
    const meat = HERD_MEAT_OFFTAKE[species];
    if (meat)
      kcal +=
        Math.max(0, herd.young + herd.breeding + herd.old) *
        meat.share *
        meat.edibleKg *
        WINTER_SLAUGHTER_POLICY.dietaryKcalPerKg;
  }
  return kcal;
}

/**
 * Milk-and-meat diet share the herds can carry, never above the rainfall share. Without a herd table
 * (simplified rural ecosystem) the rainfall share stands as before.
 */
export function calculateHerdDietShare(
  wetPastoralDietShare: ArrayLike<number>,
  realPeople: (cellId: number) => number,
  stock: Readonly<Record<string, FaunaCohorts>> | null
): Float32Array {
  const shares = Float32Array.from(wetPastoralDietShare);
  if (!stock) return shares;
  for (let cellId = 0; cellId < shares.length; cellId++) {
    if (!(shares[cellId] > 0)) continue;
    const need = realPeople(cellId) * DAILY_CALORIC_NEED_KCAL * DAYS_PER_YEAR;
    const herds = Object.fromEntries(
      Object.keys(HERD_MEAT_OFFTAKE).map(species => [species, stock[`${cellId}:${species}`]])
    );
    shares[cellId] = need > 0 ? Math.min(shares[cellId], getHerdFoodKcal(herds) / need) : 0;
  }
  return shares;
}
