import type { FaunaCohorts } from "./faunaPopulationTypes";

export interface RenewableHerdOutput {
  species: string;
  cohorts: FaunaCohorts;
  /** Physical output per head of each cohort per year, before feed/care losses. */
  yields: Readonly<Record<string, FaunaCohorts>>;
}

/** A standing inventory and an annual flow have different dimensions. Unknowns stay null. */
export function assessJointHerdDemand(
  herds: readonly RenewableHerdOutput[],
  annualDemand: Readonly<Record<string, number | null>>,
  inventory: Readonly<Record<string, number>> = {}
) {
  const nonnegative = (value: number) => {
    if (!Number.isFinite(value) || value < 0) throw new Error("Expected a finite nonnegative physical quantity");
    return value;
  };
  const outputs = herds.map(herd => {
    const cohorts = Object.fromEntries(
      Object.entries(herd.cohorts).map(([age, heads]) => [age, nonnegative(heads)])
    ) as unknown as FaunaCohorts;
    const heads = cohorts.young + cohorts.breeding + cohorts.old;
    const annualOutput = Object.fromEntries(
      Object.entries(herd.yields).map(([product, yields]) => [
        product,
        cohorts.young * nonnegative(yields.young) +
          cohorts.breeding * nonnegative(yields.breeding) +
          cohorts.old * nonnegative(yields.old)
      ])
    );
    return { species: herd.species, heads, annualOutput };
  });
  const products = Object.fromEntries(
    Object.entries(annualDemand).map(([product, demand]) => {
      const stock = nonnegative(inventory[product] ?? 0);
      const netAnnualDemand = demand === null ? null : Math.max(0, nonnegative(demand) - stock);
      const annualPotential = outputs.reduce((sum, herd) => sum + (herd.annualOutput[product] ?? 0), 0);
      return [
        product,
        {
          annualDemand: demand,
          inventory: stock,
          netAnnualDemand,
          annualPotential,
          potentialGap: netAnnualDemand === null ? null : Math.max(0, netAnnualDemand - annualPotential)
        }
      ];
    })
  );
  return {
    products,
    herds: outputs.map(herd => {
      let lowerBound = 0;
      const unresolved: string[] = [];
      const requirements: Record<string, number | null> = {};
      for (const [product, row] of Object.entries(products)) {
        if (row.netAnnualDemand === null) {
          unresolved.push(product);
          requirements[product] = null;
          continue;
        }
        const ownOutput = herd.annualOutput[product] ?? 0;
        const residual = Math.max(0, row.netAnnualDemand - (row.annualPotential - ownOutput));
        const yieldPerHead = herd.heads > 0 ? ownOutput / herd.heads : 0;
        if (residual <= 0) requirements[product] = 0;
        else if (yieldPerHead > 0) {
          requirements[product] = residual / yieldPerHead;
          lowerBound = Math.max(lowerBound, requirements[product]);
        } else {
          requirements[product] = null;
          unresolved.push(product);
        }
      }
      // Conditional lower bounds hold all OTHER herds fixed; they are not simultaneous targets.
      return {
        ...herd,
        conditionalMinimumHeads: lowerBound,
        requirements,
        unresolvedProducts: unresolved,
        completeConditionalBoundHeads: unresolved.length ? null : lowerBound
      };
    })
  };
}

/** Meat and hides from the same annual slaughter flow require the maximum, not the sum. */
export function requiredJointOfftakeHeads(
  annualDemand: Readonly<Record<string, number | null>>,
  outputPerSlaughteredHead: Readonly<Record<string, number | null>>
): number | null {
  let heads = 0;
  for (const [product, demand] of Object.entries(annualDemand)) {
    if (demand === null || !Number.isFinite(demand) || demand < 0) return null;
    if (demand === 0) continue;
    const yieldPerHead = outputPerSlaughteredHead[product];
    if (yieldPerHead == null || !Number.isFinite(yieldPerHead) || yieldPerHead <= 0) return null;
    heads = Math.max(heads, demand / yieldPerHead);
  }
  return heads;
}

/**
 * Annual natural change before culling; internal age transfers do not change total heads.
 * Wild stock breeds logistically toward capacity. A managed herd breeds at full rate while it has
 * any supported place, and the keeper sells or slaughters the surplus instead.
 */
export function assessAnnualHerdRenewal(
  cohorts: FaunaCohorts,
  capacityHeads: number,
  annualBreedingRate: number,
  oldLifespanYears: number,
  annualOfftakeHeads: number | null,
  managed = false
) {
  const heads = cohorts.young + cohorts.breeding + cohorts.old;
  const room = !(capacityHeads > 0) ? 0 : managed ? 1 : Math.max(0, 1 - heads / capacityHeads);
  const birthsHeads = cohorts.breeding * annualBreedingRate * room;
  const naturalDeathsHeads = cohorts.old / Math.max(0.1, oldLifespanYears);
  const naturalNetHeads = birthsHeads - naturalDeathsHeads;
  return {
    birthsHeads,
    naturalDeathsHeads,
    naturalNetHeads,
    annualOfftakeHeads,
    netAfterOfftakeHeads: annualOfftakeHeads === null ? null : naturalNetHeads - annualOfftakeHeads
  };
}
