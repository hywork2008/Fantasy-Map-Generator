import { CHILD_COHORT_YEARS, getCellDemographics, setCellDemographics, type WorldContext } from "../../hostCore";
import { getMigratableAdults, getRuralReleasePressure } from "../economyContext";
import { UrbanLaborIntake } from "./urbanLaborIntake";

/**
 * Population points below which a rural cell is protected from further adult release,
 * regardless of labour-safety-margined surplus. Keeps the smallest viable communities
 * from being drained to nothing by many small yearly releases; on the same order as
 * demography-simulator's MIN_RURAL_POINTS_FOR_PROMOTION / MIN_SETTLEMENT_POINTS floors.
 */
export const MINIMUM_RURAL_COMMUNITY_POPULATION = 1;

/**
 * Pulls each rural cell's safe yearly labor-release amount out of its resident population and
 * hands it to UrbanLaborIntake as a MobileAdultCohort. Intended to run once per simulation
 * year, right after DevelopmentPotential.updateAnnualAgriculture() refreshes migratableAdults
 * and ruralReleasePressure for the year (see docs/plan/megacity-food-import-economy.md §4.1).
 *
 * The released amount never exceeds min(migratableAdults, sustainableAdultOutflow,
 * ruralReleasePressure):
 * - migratableAdults: this cell's *current* cultivated area doesn't need this many adults.
 * - sustainableAdultOutflow: this year's estimated children→adults arrivals (children /
 *   CHILD_COHORT_YEARS), so ordinary migration only draws on new adults and never hollows
 *   out the existing resident adult stock.
 * - ruralReleasePressure: adults beyond what the cell's *minimum* food plan needs, so a cell
 *   that only just meets its own subsistence never releases anyone even if the other two caps
 *   would allow it.
 *
 * Children and elders never leave with a released cohort — megacity-food-import-economy.md's
 * decision is that ordinary rural→urban labour migration moves single adults, not households.
 * The released cohort splits male/female 50/50 (the same arrival ratio child→adult aging uses
 * in demography-simulator.ts), falling back to whichever sex the cell actually has when one is
 * scarce.
 */
export function releaseRuralLaborSurplus(world: Readonly<WorldContext>): void {
  const cells = world.pack.cells;
  const migratableAdults = getMigratableAdults();
  const ruralReleasePressure = getRuralReleasePressure();
  if (!cells?.i || migratableAdults.length !== cells.i.length || ruralReleasePressure.length !== cells.i.length) {
    return;
  }

  for (const cellId of cells.i) {
    const current = getCellDemographics(cells, cellId);
    const adultTotal = current.maleAdults + current.femaleAdults;
    if (adultTotal <= 0) continue;

    const sustainableAdultOutflow = current.children / CHILD_COHORT_YEARS;
    const available = Math.min(
      migratableAdults[cellId] ?? 0,
      sustainableAdultOutflow,
      ruralReleasePressure[cellId] ?? 0
    );
    if (available <= 0) continue;

    const currentTotal = current.children + adultTotal + current.elders;
    const populationFloorRoom = Math.max(0, currentTotal - MINIMUM_RURAL_COMMUNITY_POPULATION);
    const released = Math.min(available, adultTotal, populationFloorRoom);
    if (released <= 0) continue;

    const releasedFemale = Math.min(released / 2, current.femaleAdults);
    const releasedMale = Math.min(released - releasedFemale, current.maleAdults);
    if (releasedMale + releasedFemale <= 0) continue;

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
