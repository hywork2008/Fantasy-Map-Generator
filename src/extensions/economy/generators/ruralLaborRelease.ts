import { getCellDemographics, setCellDemographics, type WorldContext } from "../../hostCore";
import { getMigratableAdults } from "../economyContext";
import { UrbanLaborIntake } from "./urbanLaborIntake";

/**
 * Population points below which a rural cell is protected from further adult release,
 * regardless of labour-safety-margined surplus. Keeps the smallest viable communities
 * from being drained to nothing by many small yearly releases; on the same order as
 * demography-simulator's MIN_RURAL_POINTS_FOR_PROMOTION / MIN_SETTLEMENT_POINTS floors.
 */
export const MINIMUM_RURAL_COMMUNITY_POPULATION = 1;

/**
 * Pulls each rural cell's already labour-safety-margined `migratableAdults` surplus out of
 * its resident population and hands it to UrbanLaborIntake as a MobileAdultCohort, split
 * male/female by the cell's current adult ratio. Intended to run once per simulation year,
 * right after DevelopmentPotential.updateAnnualAgriculture() refreshes migratableAdults for
 * the year, so a cell's own labour requirement is always protected before release (see
 * docs/plan/megacity-food-import-economy.md §4.1).
 *
 * Children and elders never leave with a released cohort — megacity-food-import-economy.md's
 * decision is that ordinary rural→urban labour migration moves single adults, not households.
 */
export function releaseRuralLaborSurplus(world: Readonly<WorldContext>): void {
  const cells = world.pack.cells;
  const migratableAdults = getMigratableAdults();
  if (!cells?.i || migratableAdults.length !== cells.i.length) return;

  for (const cellId of cells.i) {
    const available = migratableAdults[cellId] ?? 0;
    if (available <= 0) continue;

    const current = getCellDemographics(cells, cellId);
    const adultTotal = current.maleAdults + current.femaleAdults;
    if (adultTotal <= 0) continue;

    const currentTotal = current.children + adultTotal + current.elders;
    const populationFloorRoom = Math.max(0, currentTotal - MINIMUM_RURAL_COMMUNITY_POPULATION);
    const released = Math.min(available, adultTotal, populationFloorRoom);
    if (released <= 0) continue;

    const releasedMale = released * (current.maleAdults / adultTotal);
    const releasedFemale = released - releasedMale;

    setCellDemographics(cells, cellId, {
      children: current.children,
      maleAdults: current.maleAdults - releasedMale,
      femaleAdults: current.femaleAdults - releasedFemale,
      elders: current.elders
    });

    UrbanLaborIntake.enqueueRuralDisplacement({
      originCell: cellId,
      originState: cells.state?.[cellId] ?? 0,
      maleAdults: releasedMale,
      femaleAdults: releasedFemale,
      yearsSearching: 0
    });
  }
}
