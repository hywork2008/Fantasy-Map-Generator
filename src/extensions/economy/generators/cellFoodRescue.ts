import type {
  CellFoodRescuePlan,
  CellFoodReserve,
  CellFreshFoodInput,
  CellFreshFoodOutcome
} from "./cellFoodRescueTypes";

/**
 * Three months is enough to make food safety meaningful without turning every cell into a
 * subsistence-only storehouse. Commercial preservation starts only after this local buffer.
 */
export const CELL_FOOD_RESERVE_MONTHS = 3;

/**
 * Only this bounded share of a cell's residents is planned for preservation work in a normal
 * month. Emergency food work is still limited by the actual fresh harvest, never by population.
 */
export const CELL_FOOD_PRESERVATION_LABOR_SHARE = 0.15;

function positive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function unitInterval(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) ? 1 : Math.min(1, Math.max(0, value));
}

/**
 * Plans one cell's food flow before any raw fresh good is put into a Market. The plan never
 * invents an "unharvested potential" record: units outside the plan simply were not produced.
 *
 * Food safety is a target, not an unlimited priority. The reserve phase is bounded by the local
 * labour budget; once the reserve is healthy, only confirmed commercial demand can add output.
 */
export function planCellFoodRescue(
  inputs: readonly CellFreshFoodInput[],
  currentReserve: Readonly<CellFoodReserve>,
  residentWorkforce: number
): CellFoodRescuePlan {
  const nextReserve: CellFoodReserve = { ...currentReserve };
  const outcomes: CellFreshFoodOutcome[] = [];
  let laborRemaining = positive(residentWorkforce) * CELL_FOOD_PRESERVATION_LABOR_SHARE;
  let processingLaborUsed = 0;

  for (const input of inputs) {
    const harvested = positive(input.harvestedUnits);
    const householdDemand = positive(input.householdDemandUnits);
    const reserveBefore = positive(nextReserve[input.sourceGoodId]);
    const laborPerUnit = positive(input.preservationLaborPerUnit);
    const capacityByLabor = laborPerUnit > 0 ? laborRemaining / laborPerUnit : harvested;
    const maximumPreservationCapacity = Math.max(0, Math.min(harvested, capacityByLabor));
    const reserveTarget = householdDemand * CELL_FOOD_RESERVE_MONTHS;
    const emergencyReserveDemand = positive(input.emergencyReserveDemandUnits);
    // Estimate planned processing first, so a source-only fresh-access share constrains actual
    // harvest rather than the much larger unhandled production potential.
    const reserveInputNeededWithoutFresh = Math.max(
      0,
      reserveTarget - Math.max(0, reserveBefore - emergencyReserveDemand)
    );
    const commercialInputPerOutput = positive(input.commercialPath?.inputPerOutput ?? 0);
    const requestedCommercialInput =
      commercialInputPerOutput > 0 ? positive(input.exportDemandUnits) * commercialInputPerOutput : 0;
    const plannedProcessingInput = Math.min(
      maximumPreservationCapacity,
      reserveInputNeededWithoutFresh + requestedCommercialInput
    );
    const freshShare = unitInterval(input.maxFreshHouseholdShare);
    const maxFreshByProcessing =
      freshShare < 1 ? (plannedProcessingInput * freshShare) / Math.max(1 - freshShare, Number.EPSILON) : harvested;
    const eatenFresh = Math.min(harvested, householdDemand, maxFreshByProcessing);
    // A Cheese reserve is famine insurance, not a second daily dairy ration. Grain and legumes
    // feed rural households in normal months; the caller opens this draw only after staple-food stress.
    const reserveConsumed = Math.min(reserveBefore, emergencyReserveDemand);
    const reserveAfterConsumption = reserveBefore - reserveConsumed;
    const freshRemaining = Math.max(0, harvested - eatenFresh);
    const reserveInputNeeded = Math.max(0, reserveTarget - reserveAfterConsumption);
    const preservationCapacity = Math.max(0, Math.min(freshRemaining, maximumPreservationCapacity));
    const reserveInputUnits = Math.min(preservationCapacity, reserveInputNeeded);
    const commercialInputCapacity = Math.max(0, preservationCapacity - reserveInputUnits);
    const commercialInputUnits = Math.min(commercialInputCapacity, requestedCommercialInput);
    const processedInputUnits = reserveInputUnits + commercialInputUnits;
    const laborUsed = processedInputUnits * laborPerUnit;
    laborRemaining = Math.max(0, laborRemaining - laborUsed);
    processingLaborUsed += laborUsed;

    const canPreserve = input.reservePath !== null && input.preservationSuppliesAvailable;
    const canMakeCommercialOutput = input.commercialPath !== null && input.preservationSuppliesAvailable;
    const spoiledForMissingSuppliesUnits =
      (canPreserve ? 0 : reserveInputUnits) + (canMakeCommercialOutput ? 0 : commercialInputUnits);
    const effectiveReserveInput = canPreserve ? reserveInputUnits : 0;
    const reserveInputPerOutput = positive(input.reservePath?.inputPerOutput ?? 0);
    const reserveOutputUnits = reserveInputPerOutput > 0 ? effectiveReserveInput / reserveInputPerOutput : 0;
    const exportOutputUnits =
      canMakeCommercialOutput && commercialInputPerOutput > 0 ? commercialInputUnits / commercialInputPerOutput : 0;
    nextReserve[input.sourceGoodId] = reserveAfterConsumption + effectiveReserveInput;

    outcomes.push({
      sourceGoodId: input.sourceGoodId,
      producedUnits: eatenFresh + processedInputUnits,
      eatenFreshUnits: eatenFresh + reserveConsumed,
      reserveInputUnits: effectiveReserveInput,
      reserveOutputUnits,
      exportOutputUnits,
      spoiledForMissingSuppliesUnits
    });
  }

  return { outcomes, nextReserve, processingLaborUsed };
}
