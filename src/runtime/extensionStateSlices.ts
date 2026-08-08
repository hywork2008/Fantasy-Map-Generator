import type { ExtensionStateSlices, SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { CoreReference } from "./extensionArchiveTypes";
import {
  collectEntityReferences,
  type ExtensionStateSliceSpec,
  registerStateSliceSpec
} from "./extensionStateSliceRegistry";

type ExtensionSliceDefinition = {
  readonly extensionId: string;
  readonly legacyTarget: "pack" | "cells";
  readonly legacyField: string;
  readonly defaultValue: () => unknown;
};

type ExtensionEntitySliceDefinition = {
  readonly extensionId: string;
  readonly legacyTarget: "burgs" | "states";
  readonly legacyField: string;
  readonly sliceField: string;
  readonly defaultValue: () => unknown;
};

/**
 * Machine-readable ownership inventory for extension fields that historically
 * augmented `PackedGraph`. Extension code receives its historical property
 * through the adapter below while the storage itself lives in one named slice.
 */
export const EXTENSION_SLICE_DEFINITIONS: readonly ExtensionSliceDefinition[] = [
  { extensionId: "characters", legacyTarget: "pack", legacyField: "characters", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "goods", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "markets", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "deals", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "caravans", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "nextCaravanId", defaultValue: () => 0 },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "burgMarketLedgers", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "merchantOrganizations", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "strategicProcurementOrders", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "strategicGoodsPolicies", defaultValue: () => [] },
  {
    extensionId: "economy",
    legacyTarget: "pack",
    legacyField: "nextStrategicProcurementOrderId",
    defaultValue: () => 0
  },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "strategicLaborMarkets", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "mineralGeologicalProvinces", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "mineralDistricts", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "mineralDeposits", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "mineOperations", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "smelterOperations", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "mintLedgers", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "militaryResourceLedgers", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "tradeSecurityLedgers", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "innFacilities", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "pack", legacyField: "urbanWaterSystems", defaultValue: () => [] },
  { extensionId: "economy", legacyTarget: "cells", legacyField: "good", defaultValue: () => new Uint16Array() },
  { extensionId: "economy", legacyTarget: "cells", legacyField: "market", defaultValue: () => new Uint16Array() }
];

/** Extension fields historically augmented onto individual core entities. */
export const EXTENSION_ENTITY_SLICE_DEFINITIONS: readonly ExtensionEntitySliceDefinition[] = [
  {
    extensionId: "economy",
    legacyTarget: "burgs",
    legacyField: "production",
    sliceField: "productionByBurg",
    defaultValue: () => []
  },
  {
    extensionId: "nobility",
    legacyTarget: "states",
    legacyField: "rulerId",
    sliceField: "rulerIdByState",
    defaultValue: () => undefined
  },
  {
    extensionId: "nobility",
    legacyTarget: "states",
    legacyField: "conflictAuthorizations",
    sliceField: "conflictAuthorizationsByState",
    defaultValue: () => ({})
  }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Archive ${name} must be a record`);
}

function assertArray(value: unknown, name: string): void {
  if (!Array.isArray(value)) throw new Error(`Archive ${name} must be an array`);
}

function assertNonNegativeInteger(value: unknown, name: string): void {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Archive ${name} must be a non-negative integer`);
  }
}

function assertEntityKeyedRecord(value: unknown, entities: readonly unknown[], name: string): void {
  assertRecord(value, name);
  for (const [rawId] of Object.entries(value)) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 0 || String(id) !== rawId || !entities[id]) {
      throw new Error(`Archive ${name} references missing entity ${rawId}`);
    }
  }
}

function assertOptionalArrayField(slice: Record<string, unknown>, field: string, extensionId: string): void {
  if (slice[field] !== undefined) assertArray(slice[field], `simulation.extensions.${extensionId}.${field}`);
}

const INN_CLASSES = new Set(["wayside", "market", "waterside", "grand", "caravanserai"]);
const LODGING_STYLES = new Set(["medievalCentralEuropean", "highFantasy", "jrpg"]);

function validateInnFacilities(value: unknown, world: WorldContext): void {
  if (value === undefined) return;
  const name = "simulation.extensions.economy.innFacilities";
  if (!Array.isArray(value)) throw new Error(`Archive ${name} must be an array`);
  for (const [index, facility] of value.entries()) {
    const entryName = `${name}[${index}]`;
    assertRecord(facility, entryName);
    const burgId = facility.burgId;
    const resolvedBurgId = typeof burgId === "number" ? burgId : -1;
    if (!Number.isInteger(resolvedBurgId) || resolvedBurgId <= 0 || !world.pack.burgs[resolvedBurgId]) {
      throw new Error(`${entryName}.burgId must reference an existing burg`);
    }
    if (typeof facility.innClass !== "string" || !INN_CLASSES.has(facility.innClass)) {
      throw new Error(`${entryName}.innClass is invalid`);
    }
    for (const field of ["buildingCount", "privateRooms", "sharedBeds", "privateBeds", "commonSeats", "stableSpaces"]) {
      assertNonNegativeInteger(facility[field], `${entryName}.${field}`);
    }
    if ((facility.buildingCount as number) < 1) {
      throw new Error(`${entryName}.buildingCount must be at least 1`);
    }
    if (
      typeof facility.condition !== "number" ||
      !Number.isFinite(facility.condition) ||
      facility.condition < 0 ||
      facility.condition > 1
    ) {
      throw new Error(`${entryName}.condition must be a finite number from 0 to 1`);
    }
  }
}

function assertUnitInterval(value: unknown, name: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a finite number from 0 to 1`);
  }
}

function validateUrbanWaterSystems(value: unknown, world: WorldContext): void {
  if (value === undefined) return;
  const name = "simulation.extensions.economy.urbanWaterSystems";
  if (!Array.isArray(value)) throw new Error(`Archive ${name} must be an array`);
  const seenBurgIds = new Set<number>();
  for (const [index, system] of value.entries()) {
    const entryName = `${name}[${index}]`;
    assertRecord(system, entryName);
    const burgId = typeof system.burgId === "number" ? system.burgId : -1;
    if (!Number.isInteger(burgId) || burgId <= 0 || !world.pack.burgs[burgId]) {
      throw new Error(`${entryName}.burgId must reference an existing burg`);
    }
    if (seenBurgIds.has(burgId)) throw new Error(`${entryName}.burgId is duplicated`);
    seenBurgIds.add(burgId);
    const tier = system.tier;
    if (!Number.isInteger(tier) || (tier as number) < 0 || (tier as number) > 5) {
      throw new Error(`${entryName}.tier must be an integer from 0 to 5`);
    }
    for (const field of [
      "drinkingWaterSecurity",
      "serviceWaterCapacity",
      "irrigationCapacity",
      "stormwaterDrainageCapacity",
      "wastewaterCapacity",
      "maintenanceCondition",
      "sanitationBurden",
      "waterContamination",
      "floodExposure",
      "muddiness",
      "odor",
      "stormwaterDemand",
      "wastewaterDemand"
    ]) {
      assertUnitInterval(system[field], `${entryName}.${field}`);
    }
    // Phase 2–3 fields — optional on older archives; when present they must be valid.
    for (const field of [
      "clogging",
      "upgradeProgress",
      "demandUrgency",
      "lastMaintenanceCoverage",
      "connectionPermitCoverage",
      "cleaningTaxRate",
      "dischargeRegulation",
      "organicStreetLoad",
      "compostingEfficiency",
      "pigToiletPractice",
      "upstreamPollutionImport",
      "downstreamPollutionExport",
      "healthPressure",
      "waterLifting",
      "municipalSanitation",
      "sanitaryEngineering",
      "pollutionDiplomaticStrain"
    ]) {
      if (system[field] !== undefined) assertUnitInterval(system[field], `${entryName}.${field}`);
    }
    for (const field of [
      "lastMaintenanceSpend",
      "lastConstructionSpend",
      "lastCleaningTaxRevenue",
      "lastPollutionCompensationPaid",
      "lastPollutionCompensationReceived"
    ]) {
      if (system[field] === undefined) continue;
      if (
        typeof system[field] !== "number" ||
        !Number.isFinite(system[field] as number) ||
        (system[field] as number) < 0
      ) {
        throw new Error(`${entryName}.${field} must be a finite non-negative number`);
      }
    }
    if (system.activeProject !== undefined && system.activeProject !== null) {
      if (
        typeof system.activeProject !== "string" ||
        ![
          "openDitches",
          "stoneDrains",
          "coveredCulverts",
          "managedSewers",
          "sanitarySeparation",
          "waterLiftingWorks"
        ].includes(system.activeProject)
      ) {
        throw new Error(`${entryName}.activeProject is invalid`);
      }
    }
    if (system.primaryDemandSignal !== undefined && system.primaryDemandSignal !== null) {
      if (typeof system.primaryDemandSignal !== "string") {
        throw new Error(`${entryName}.primaryDemandSignal is invalid`);
      }
    }
    for (const field of ["hasUpstreamIntake", "hasDownstreamOutfall", "hasSeparateWastewaterRoute"]) {
      if (typeof system[field] !== "boolean") {
        throw new Error(`${entryName}.${field} must be a boolean`);
      }
    }
    if (system.localMixedIntakeOutfall !== undefined && typeof system.localMixedIntakeOutfall !== "boolean") {
      throw new Error(`${entryName}.localMixedIntakeOutfall must be a boolean`);
    }
  }
}

function validateInnConstructionOrders(value: unknown, world: WorldContext): void {
  if (value === undefined) return;
  const name = "simulation.extensions.economy.innConstructionOrders";
  if (!Array.isArray(value)) throw new Error(`Archive ${name} must be an array`);
  const seenKeys = new Set<string>();
  for (const [index, order] of value.entries()) {
    const entryName = `${name}[${index}]`;
    assertRecord(order, entryName);
    const burgId = typeof order.burgId === "number" ? order.burgId : -1;
    if (!Number.isInteger(burgId) || burgId <= 0 || !world.pack.burgs[burgId]) {
      throw new Error(`${entryName}.burgId must reference an existing burg`);
    }
    if (typeof order.innClass !== "string" || !INN_CLASSES.has(order.innClass)) {
      throw new Error(`${entryName}.innClass is invalid`);
    }
    const key = `${burgId}:${order.innClass}`;
    if (seenKeys.has(key)) throw new Error(`${entryName} duplicates an inn construction order for ${key}`);
    seenKeys.add(key);
    if (typeof order.startedYear !== "number" || !Number.isFinite(order.startedYear)) {
      throw new Error(`${entryName}.startedYear must be a finite number`);
    }
    for (const field of ["laborProgress", "woodAcquired", "masonryAcquired"]) {
      const valueAtField = order[field];
      if (typeof valueAtField !== "number" || !Number.isFinite(valueAtField) || valueAtField < 0) {
        throw new Error(`${entryName}.${field} must be a finite non-negative number`);
      }
    }
    if ((order.laborProgress as number) > 1) {
      throw new Error(`${entryName}.laborProgress must not exceed 1`);
    }
  }
}

function validateInnStayLedgers(value: unknown, world: WorldContext): void {
  if (value === undefined) return;
  const name = "simulation.extensions.economy.innStayLedgers";
  if (!Array.isArray(value)) throw new Error(`Archive ${name} must be an array`);
  const seenBurgIds = new Set<number>();
  for (const [index, ledger] of value.entries()) {
    const entryName = `${name}[${index}]`;
    assertRecord(ledger, entryName);
    const burgId = typeof ledger.burgId === "number" ? ledger.burgId : -1;
    if (!Number.isInteger(burgId) || burgId <= 0 || !world.pack.burgs[burgId]) {
      throw new Error(`${entryName}.burgId must reference an existing burg`);
    }
    if (seenBurgIds.has(burgId)) throw new Error(`${entryName}.burgId is duplicated`);
    seenBurgIds.add(burgId);
    if (
      typeof ledger.transientGuests !== "number" ||
      !Number.isFinite(ledger.transientGuests) ||
      ledger.transientGuests < 0
    ) {
      throw new Error(`${entryName}.transientGuests must be a finite non-negative number`);
    }
    if (!Array.isArray(ledger.temporaryLodgerCohorts)) {
      throw new Error(`${entryName}.temporaryLodgerCohorts must be an array`);
    }
    for (const [cohortIndex, cohort] of ledger.temporaryLodgerCohorts.entries()) {
      const cohortName = `${entryName}.temporaryLodgerCohorts[${cohortIndex}]`;
      assertRecord(cohort, cohortName);
      for (const field of ["maleAdults", "femaleAdults"]) {
        const count = cohort[field];
        if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
          throw new Error(`${cohortName}.${field} must be a finite non-negative number`);
        }
      }
      for (const field of ["originCell", "originState", "deadlineMonth"]) {
        if (!Number.isInteger(cohort[field])) throw new Error(`${cohortName}.${field} must be an integer`);
      }
    }
  }
}

function validateCharactersSlice(slice: Record<string, unknown>): void {
  assertOptionalArrayField(slice, "characters", "characters");
}

function validateEconomySlice(slice: Record<string, unknown>, world: WorldContext): void {
  for (const field of [
    "goods",
    "markets",
    "deals",
    "caravans",
    "burgMarketLedgers",
    "merchantOrganizations",
    "strategicProcurementOrders",
    "strategicGoodsPolicies",
    "strategicLaborMarkets",
    "mineralGeologicalProvinces",
    "mineralDistricts",
    "mineralDeposits",
    "mineOperations",
    "smelterOperations",
    "mintLedgers",
    "militaryResourceLedgers",
    "tradeSecurityLedgers",
    "guildChapters",
    "individualSkills",
    // Threat cull hire board (docs/plan/player-threat-cull-jobs.md PR-2) — stricter than
    // construction hire arrays, which remain unvalidated opaque fields.
    "cullJobPostings",
    "cullHireApplications",
    "cullActiveContracts",
    // Escort (護衛) job board — all culture sets.
    "escortJobPostings",
    "escortHireApplications",
    "escortActiveContracts"
  ]) {
    assertOptionalArrayField(slice, field, "economy");
  }
  if (slice.cullCooldowns !== undefined) {
    if (typeof slice.cullCooldowns !== "object" || slice.cullCooldowns === null || Array.isArray(slice.cullCooldowns)) {
      throw new Error("Archive simulation.extensions.economy.cullCooldowns must be a record");
    }
    for (const [key, value] of Object.entries(slice.cullCooldowns as Record<string, unknown>)) {
      if (!/^\d+$/.test(key)) {
        throw new Error(`Archive simulation.extensions.economy.cullCooldowns has invalid key ${key}`);
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Archive simulation.extensions.economy.cullCooldowns.${key} must be a finite number`);
      }
    }
  }
  if (slice.escortCooldowns !== undefined) {
    if (
      typeof slice.escortCooldowns !== "object" ||
      slice.escortCooldowns === null ||
      Array.isArray(slice.escortCooldowns)
    ) {
      throw new Error("Archive simulation.extensions.economy.escortCooldowns must be a record");
    }
    for (const [key, value] of Object.entries(slice.escortCooldowns as Record<string, unknown>)) {
      if (!/^\d+$/.test(key)) {
        throw new Error(`Archive simulation.extensions.economy.escortCooldowns has invalid key ${key}`);
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Archive simulation.extensions.economy.escortCooldowns.${key} must be a finite number`);
      }
    }
  }
  validateInnFacilities(slice.innFacilities, world);
  validateInnConstructionOrders(slice.innConstructionOrders, world);
  validateInnStayLedgers(slice.innStayLedgers, world);
  validateUrbanWaterSystems(slice.urbanWaterSystems, world);
  if (slice.lodgingStyle !== undefined) {
    if (typeof slice.lodgingStyle !== "string" || !LODGING_STYLES.has(slice.lodgingStyle)) {
      throw new Error("Archive simulation.extensions.economy.lodgingStyle is invalid");
    }
  }
  if (slice.innFacilitiesLastSettledYear !== undefined) {
    const year = slice.innFacilitiesLastSettledYear;
    if (typeof year !== "number" || !Number.isFinite(year)) {
      throw new Error("Archive simulation.extensions.economy.innFacilitiesLastSettledYear must be a finite number");
    }
  }
  if (slice.urbanWaterLastSettledYear !== undefined) {
    const year = slice.urbanWaterLastSettledYear;
    if (typeof year !== "number" || !Number.isFinite(year)) {
      throw new Error("Archive simulation.extensions.economy.urbanWaterLastSettledYear must be a finite number");
    }
  }
  if (slice.guildChaptersLastSettledYear !== undefined) {
    const year = slice.guildChaptersLastSettledYear;
    if (typeof year !== "number" || !Number.isFinite(year)) {
      throw new Error("Archive simulation.extensions.economy.guildChaptersLastSettledYear must be a finite number");
    }
  }
  for (const field of ["nextCaravanId", "nextStrategicProcurementOrderId"]) {
    if (slice[field] !== undefined) assertNonNegativeInteger(slice[field], `simulation.extensions.economy.${field}`);
  }
  const cellCount = world.pack.cells.i?.length;
  for (const field of ["good", "market"]) {
    const column = slice[field];
    if (column === undefined) continue;
    if (!(column instanceof Uint16Array)) {
      throw new Error(`Archive simulation.extensions.economy.${field} must be a Uint16Array`);
    }
    // Length 0 is the unallocated default from bindExtensionStateSlices when
    // economy has not generated cell columns yet (disabled extension / pre-gen).
    // Only non-empty columns must match pack topology.
    if (column.length === 0) continue;
    if (cellCount !== undefined && column.length !== cellCount) {
      throw new Error(
        `Archive simulation.extensions.economy.${field} has length ${column.length}; expected ${cellCount}`
      );
    }
  }
  if (slice.productionByBurg !== undefined) {
    assertEntityKeyedRecord(slice.productionByBurg, world.pack.burgs, "simulation.extensions.economy.productionByBurg");
    for (const [burgId, production] of Object.entries(slice.productionByBurg as Record<string, unknown>)) {
      assertArray(production, `simulation.extensions.economy.productionByBurg.${burgId}`);
    }
  }
}

function validateNobilitySlice(slice: Record<string, unknown>, world: WorldContext): void {
  for (const field of ["rulerIdByState", "conflictAuthorizationsByState"]) {
    const values = slice[field];
    if (values === undefined) continue;
    assertEntityKeyedRecord(values, world.pack.states, `simulation.extensions.nobility.${field}`);
    if (field === "rulerIdByState") {
      for (const [stateId, rulerId] of Object.entries(values as Record<string, unknown>)) {
        // Compatibility projection may materialise undefined slots for every state.
        if (rulerId === undefined) continue;
        assertNonNegativeInteger(rulerId, `simulation.extensions.nobility.rulerIdByState.${stateId}`);
      }
    }
  }
  if (slice.voyageIntelBonus !== undefined) {
    assertRecord(slice.voyageIntelBonus, "simulation.extensions.nobility.voyageIntelBonus");
    for (const [key, amount] of Object.entries(slice.voyageIntelBonus as Record<string, unknown>)) {
      if (!/^\d+:\d+$/.test(key)) {
        throw new Error(`Archive simulation.extensions.nobility.voyageIntelBonus has invalid key ${key}`);
      }
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
        throw new Error(`Archive simulation.extensions.nobility.voyageIntelBonus.${key} must be a non-negative number`);
      }
    }
  }
}

function validateShipbuildingSlice(slice: Record<string, unknown>): void {
  if (slice.runtimeState === undefined) return;
  assertRecord(slice.runtimeState, "simulation.extensions.shipbuilding.runtimeState");
  const runtimeState = slice.runtimeState;
  for (const field of ["queues", "surplusQueues", "stateTechPoints", "completedHulls", "hulls"]) {
    assertRecord(runtimeState[field], `simulation.extensions.shipbuilding.runtimeState.${field}`);
  }
  assertNonNegativeInteger(runtimeState.nextHullId, "simulation.extensions.shipbuilding.runtimeState.nextHullId");
}

function collectEconomyCoreReferences(slice: Record<string, unknown>): readonly CoreReference[] {
  return [
    ...collectEntityReferences(slice.productionByBurg, "burg"),
    ...collectEntityReferences(slice.innFacilities, "burg", "orphan"),
    ...collectEntityReferences(slice.innConstructionOrders, "burg", "orphan"),
    ...collectEntityReferences(slice.innStayLedgers, "burg", "orphan"),
    ...collectEntityReferences(slice.urbanWaterSystems, "burg", "orphan"),
    ...collectEntityReferences(slice.strategicGoodsPolicies, "state", "orphan")
  ];
}

function collectNobilityCoreReferences(slice: Record<string, unknown>): readonly CoreReference[] {
  const refs: CoreReference[] = [];
  const seen = new Set<number>();
  const addState = (rawId: string): void => {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) return;
    seen.add(id);
    refs.push({ kind: "state", id, onDelete: "restrict" });
  };

  const rulers = isRecord(slice.rulerIdByState) ? slice.rulerIdByState : {};
  for (const [stateId, rulerId] of Object.entries(rulers)) {
    // Compatibility projection materialises undefined slots for every state.
    if (typeof rulerId === "number" && Number.isInteger(rulerId) && rulerId >= 0) addState(stateId);
  }

  const authorizations = isRecord(slice.conflictAuthorizationsByState) ? slice.conflictAuthorizationsByState : {};
  for (const [stateId, auth] of Object.entries(authorizations)) {
    if (isRecord(auth) && Object.keys(auth).length > 0) addState(stateId);
  }

  // Voyage intel is soft bonus data; orphan keys may remain after state delete.
  const voyageIntel = isRecord(slice.voyageIntelBonus) ? slice.voyageIntelBonus : {};
  for (const key of Object.keys(voyageIntel)) {
    const [observerRaw, targetRaw] = key.split(":");
    for (const raw of [observerRaw, targetRaw]) {
      const id = Number(raw);
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      refs.push({ kind: "state", id, onDelete: "orphan" });
    }
  }

  return refs;
}

function collectShipbuildingCoreReferences(slice: Record<string, unknown>): readonly CoreReference[] {
  const runtimeState = isRecord(slice.runtimeState) ? slice.runtimeState : {};
  return [
    ...collectEntityReferences(runtimeState.queues, "burg", "orphan"),
    ...collectEntityReferences(runtimeState.stateTechPoints, "state", "orphan")
  ];
}

function identityMigrate(_fromVersion: number, value: unknown): unknown {
  return value;
}

const BUILTIN_STATE_SLICE_SPECS: readonly ExtensionStateSliceSpec[] = [
  {
    extensionId: "characters",
    schemaVersion: 1,
    defaultState: () => ({ characters: [] }),
    validate: value => {
      assertRecord(value, "simulation.extensions.characters");
      validateCharactersSlice(value);
    },
    migrate: identityMigrate,
    collectCoreReferences: () => []
  },
  {
    extensionId: "economy",
    schemaVersion: 1,
    defaultState: () => ({}),
    validate: (value, world) => {
      assertRecord(value, "simulation.extensions.economy");
      validateEconomySlice(value, world);
    },
    migrate: identityMigrate,
    collectCoreReferences: slice => collectEconomyCoreReferences(slice)
  },
  {
    extensionId: "nobility",
    schemaVersion: 1,
    defaultState: () => ({}),
    validate: (value, world) => {
      assertRecord(value, "simulation.extensions.nobility");
      validateNobilitySlice(value, world);
    },
    migrate: identityMigrate,
    collectCoreReferences: slice => collectNobilityCoreReferences(slice)
  },
  {
    extensionId: "shipbuilding",
    schemaVersion: 1,
    defaultState: () => ({}),
    validate: value => {
      assertRecord(value, "simulation.extensions.shipbuilding");
      validateShipbuildingSlice(value);
    },
    migrate: identityMigrate,
    collectCoreReferences: slice => collectShipbuildingCoreReferences(slice)
  }
];

let builtinsRegistered = false;

/** Ensures host-known extension slices stay registered across test clears. */
export function ensureBuiltinStateSlicesRegistered(): void {
  if (builtinsRegistered) {
    // Re-register after a full registry clear without flipping the flag early.
    for (const spec of BUILTIN_STATE_SLICE_SPECS) {
      try {
        registerStateSliceSpec(spec);
      } catch {
        // Already present.
      }
    }
    return;
  }
  for (const spec of BUILTIN_STATE_SLICE_SPECS) registerStateSliceSpec(spec);
  builtinsRegistered = true;
}

ensureBuiltinStateSlicesRegistered();

/**
 * Validates the host-known extension slice fields before archive replacement.
 * Unknown extension ids remain safe record containers until migration demotes
 * them to opaque chunks or a registered validator claims them.
 */
export function assertValidExtensionStateSlices(world: WorldContext, simulation: SimulationContext): void {
  ensureBuiltinStateSlicesRegistered();
  if (simulation.extensions === undefined) return;
  assertRecord(simulation.extensions, "simulation.extensions");
  for (const [extensionId, slice] of Object.entries(simulation.extensions)) {
    assertRecord(slice, `simulation.extensions.${extensionId}`);
  }

  const characters = simulation.extensions.characters;
  if (characters) validateCharactersSlice(characters);

  const economy = simulation.extensions.economy;
  if (economy) validateEconomySlice(economy, world);

  const nobility = simulation.extensions.nobility;
  if (nobility) validateNobilitySlice(nobility, world);

  const shipbuilding = simulation.extensions.shipbuilding;
  if (shipbuilding) validateShipbuildingSlice(shipbuilding);
}

function getSlice(slices: ExtensionStateSlices, extensionId: string): Record<string, unknown> {
  const existing = slices[extensionId];
  if (existing) return existing;
  const slice: Record<string, unknown> = {};
  slices[extensionId] = slice;
  return slice;
}

function getLegacyTarget(
  world: WorldContext,
  target: ExtensionSliceDefinition["legacyTarget"]
): Record<string, unknown> | null {
  const legacyTarget = target === "pack" ? world.pack : world.pack.cells;
  return legacyTarget ? (legacyTarget as unknown as Record<string, unknown>) : null;
}

function getEntities(world: WorldContext, target: ExtensionEntitySliceDefinition["legacyTarget"]): unknown[] {
  const entities = target === "burgs" ? world.pack.burgs : world.pack.states;
  return entities ?? [];
}

function getEntityId(entity: Record<string, unknown>, index: number): number | null {
  const value = entity.i;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  return index > 0 ? index : null;
}

function getEntityValues(slice: Record<string, unknown>, field: string): Record<number, unknown> {
  const existing = slice[field];
  if (isRecord(existing)) return existing as Record<number, unknown>;
  const values: Record<number, unknown> = {};
  slice[field] = values;
  return values;
}

/**
 * Projects legacy extension fields from namespaced simulation slices. The
 * projection is reapplied after graph replacement and archive replacement;
 * assigning a legacy field updates only the extension's owned slice.
 */
export function bindExtensionStateSlices(world: WorldContext, simulation: SimulationContext): void {
  if (!simulation.extensions || !isRecord(simulation.extensions)) simulation.extensions = {};

  for (const definition of EXTENSION_SLICE_DEFINITIONS) {
    const target = getLegacyTarget(world, definition.legacyTarget);
    if (!target) continue;
    const descriptor = Object.getOwnPropertyDescriptor(target, definition.legacyField);
    const legacyValue = descriptor && "value" in descriptor ? descriptor.value : undefined;
    const slice = getSlice(simulation.extensions, definition.extensionId);
    const nextValue = legacyValue ?? slice[definition.legacyField] ?? definition.defaultValue();
    slice[definition.legacyField] = nextValue;

    Object.defineProperty(target, definition.legacyField, {
      configurable: true,
      enumerable: true,
      get: () => slice[definition.legacyField],
      set: value => {
        slice[definition.legacyField] = value;
      }
    });
  }

  for (const definition of EXTENSION_ENTITY_SLICE_DEFINITIONS) {
    const slice = getSlice(simulation.extensions, definition.extensionId);
    const values = getEntityValues(slice, definition.sliceField);

    getEntities(world, definition.legacyTarget).forEach((entity, index) => {
      if (!isRecord(entity)) return;
      const entityId = getEntityId(entity, index);
      if (entityId === null) return;
      const descriptor = Object.getOwnPropertyDescriptor(entity, definition.legacyField);
      const legacyValue = descriptor && "value" in descriptor ? descriptor.value : undefined;
      if (legacyValue !== undefined || !Object.hasOwn(values, entityId)) {
        values[entityId] = legacyValue ?? definition.defaultValue();
      }

      Object.defineProperty(entity, definition.legacyField, {
        configurable: true,
        enumerable: true,
        get: () => values[entityId],
        set: value => {
          values[entityId] = value;
        }
      });
    });
  }
}

/** Starts a fresh map without retaining prior-world extension state. */
export function resetExtensionStateSlices(simulation: SimulationContext): void {
  simulation.extensions = {};
}

/** Removes only mirrors whose namespaced slice was present in the snapshot. */
export function removeExtensionStateSliceMirrors(world: WorldContext, simulation: SimulationContext): void {
  if (!simulation.extensions || !isRecord(simulation.extensions)) return;

  for (const definition of EXTENSION_SLICE_DEFINITIONS) {
    const slice = simulation.extensions[definition.extensionId];
    if (!slice || !(definition.legacyField in slice)) continue;
    const target = getLegacyTarget(world, definition.legacyTarget);
    if (target) delete target[definition.legacyField];
  }

  for (const definition of EXTENSION_ENTITY_SLICE_DEFINITIONS) {
    const slice = simulation.extensions[definition.extensionId];
    if (!slice) continue;
    const values = slice[definition.sliceField];
    if (!isRecord(values)) continue;

    getEntities(world, definition.legacyTarget).forEach((entity, index) => {
      if (!isRecord(entity)) return;
      const entityId = getEntityId(entity, index);
      if (entityId !== null && Object.hasOwn(values, entityId)) delete entity[definition.legacyField];
    });
  }
}
