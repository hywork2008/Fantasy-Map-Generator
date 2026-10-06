/** Areas partition physical land; timber is still owned solely by forestStock. */
export const LAND_USE_MODEL_VERSION = 1;
export type LandUseProfile = "mixed_farming" | "embedded" | "port" | "forestry" | "pastoral" | "shifting" | "foraging";
export type LandUseKind =
  | "built"
  | "cultivation"
  | "hay_meadow"
  | "wood_pasture"
  | "pasture"
  | "agroforestry"
  | "managed_forest"
  | "natural_forest"
  | "other_natural"
  | "abandoned";
export interface LandUsePatchBudget {
  id: string;
  sourceCellId: number;
  kind: LandUseKind;
  areaHa: number;
  anchor: [number, number];
  supplierIds: string[];
  stage: "maintained" | "fallow" | "abandoned" | "regenerating";
  /** Intersection with potential forest, not total open area. */
  convertedForestAreaHa: number;
  abandonedYear?: number;
  /** Coarse world geometry owned by FMG. RE clips it without reallocating demand. */
  polygons?: [number, number][][];
  canopyRetention?: number;
  recoveryYears?: number;
  rotation?: { years: number; activeYears: number; epoch: number; phase: number };
  management?: { rotationYears: number; lastHarvestYear: number; harvestedCoverage: number; harvestYear: number };
}
export interface CellLandUseBudget {
  lastUpdatedYear?: number;
  sourceCellId: number;
  physicalLandAreaHa: number;
  ruralPeople: number;
  foodDemandPeople: number;
  unresolvedFoodPeople: number;
  requiredAreaHa: number;
  policyTargetAreaHa: number;
  allocatedAreaHa: number;
  unallocatedAreaHa: number;
  maintenanceShortfallHa: number;
  convertedForestAreaHa: number;
  patches: LandUsePatchBudget[];
  diagnostics: string[];
  forestPolygons?: [number, number][][];
  geometryHaPerUnit?: number;
  forestCapacityCoverage?: number;
  transportAllocations?: { demandCellId: number; areaHa: number; transportCost: number }[];
  clearanceLaborDays?: number;
}
export interface LandUseSnapshot {
  modelVersion: typeof LAND_USE_MODEL_VERSION;
  revision: number;
  year: number;
  seed: string;
  provenance: "authoritative" | "estimated" | "legacy";
  cells: Record<number, CellLandUseBudget>;
  needsAnnualReconciliation?: boolean;
  /** Actual annual harvest receipts; historical initialization never creates one. */
  conversionTimber?: { id: string; sourceCellId: number; year: number; coverage: number; deliveredCoverage: number }[];
}

/** Archive boundary validation: corrupt budgets must not become timber-harvest instructions. */
export function assertValidLandUseSnapshot(
  value: unknown,
  cellCount: number
): asserts value is LandUseSnapshot | undefined {
  if (value === undefined) return;
  const snapshot = value as LandUseSnapshot;
  if (
    !snapshot ||
    snapshot.modelVersion !== LAND_USE_MODEL_VERSION ||
    !Number.isInteger(snapshot.revision) ||
    snapshot.revision < 1 ||
    !Number.isFinite(snapshot.year) ||
    typeof snapshot.seed !== "string" ||
    !["authoritative", "estimated", "legacy"].includes(snapshot.provenance) ||
    !snapshot.cells ||
    typeof snapshot.cells !== "object" ||
    Array.isArray(snapshot.cells)
  )
    throw new Error("Invalid land-use snapshot metadata");
  const validPolygons = (polygons: unknown) =>
    Array.isArray(polygons) &&
    polygons.every(
      p =>
        Array.isArray(p) &&
        p.length >= 3 &&
        p.every(v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite))
    );
  const receiptIds = new Set<string>();
  if (snapshot.conversionTimber !== undefined) {
    if (!Array.isArray(snapshot.conversionTimber)) throw new Error("Invalid conversion timber receipts");
    for (const r of snapshot.conversionTimber) {
      if (
        !r ||
        typeof r.id !== "string" ||
        receiptIds.has(r.id) ||
        !Number.isInteger(r.sourceCellId) ||
        r.sourceCellId < 0 ||
        r.sourceCellId >= cellCount ||
        !Number.isFinite(r.year) ||
        !Number.isFinite(r.coverage) ||
        r.coverage < 0 ||
        !Number.isFinite(r.deliveredCoverage) ||
        r.deliveredCoverage < 0 ||
        r.deliveredCoverage > r.coverage + 1e-10
      )
        throw new Error("Invalid conversion timber receipt");
      receiptIds.add(r.id);
    }
  }
  const ids = new Set<string>();
  for (const [key, cell] of Object.entries(snapshot.cells)) {
    if (
      !cell ||
      String(cell.sourceCellId) !== key ||
      !Number.isInteger(cell.sourceCellId) ||
      cell.sourceCellId < 0 ||
      cell.sourceCellId >= cellCount ||
      !Array.isArray(cell.patches) ||
      !Array.isArray(cell.diagnostics)
    )
      throw new Error("Invalid land-use cell reference");
    for (const field of [
      "physicalLandAreaHa",
      "ruralPeople",
      "foodDemandPeople",
      "unresolvedFoodPeople",
      "requiredAreaHa",
      "policyTargetAreaHa",
      "allocatedAreaHa",
      "unallocatedAreaHa",
      "maintenanceShortfallHa",
      "convertedForestAreaHa"
    ] as const)
      if (!Number.isFinite(cell[field]) || cell[field] < 0) throw new Error(`Invalid land-use ${field}`);
    if (cell.forestPolygons !== undefined && !validPolygons(cell.forestPolygons))
      throw new Error("Invalid forest geometry");
    if (
      cell.geometryHaPerUnit !== undefined &&
      (!Number.isFinite(cell.geometryHaPerUnit) || cell.geometryHaPerUnit <= 0)
    )
      throw new Error("Invalid geometry scale");
    if (
      cell.clearanceLaborDays !== undefined &&
      (!Number.isFinite(cell.clearanceLaborDays) || cell.clearanceLaborDays < 0)
    )
      throw new Error("Invalid clearance labour");
    if (
      cell.transportAllocations !== undefined &&
      (!Array.isArray(cell.transportAllocations) ||
        cell.transportAllocations.some(
          a =>
            !Number.isInteger(a.demandCellId) ||
            a.demandCellId < 0 ||
            a.demandCellId >= cellCount ||
            !Number.isFinite(a.areaHa) ||
            a.areaHa < 0 ||
            !Number.isFinite(a.transportCost) ||
            a.transportCost < 0
        ))
    )
      throw new Error("Invalid supply allocation");
    let total = 0,
      converted = 0;
    for (const patch of cell.patches) {
      if (
        !patch ||
        typeof patch.id !== "string" ||
        ids.has(patch.id) ||
        patch.sourceCellId !== cell.sourceCellId ||
        !Number.isFinite(patch.areaHa) ||
        patch.areaHa < 0 ||
        !Number.isFinite(patch.convertedForestAreaHa) ||
        patch.convertedForestAreaHa < 0 ||
        patch.convertedForestAreaHa > patch.areaHa + 0.000001 ||
        !Array.isArray(patch.anchor) ||
        patch.anchor.length !== 2 ||
        !patch.anchor.every(Number.isFinite) ||
        !Array.isArray(patch.supplierIds) ||
        ![
          "built",
          "cultivation",
          "pasture",
          "hay_meadow",
          "wood_pasture",
          "agroforestry",
          "managed_forest",
          "natural_forest",
          "other_natural",
          "abandoned"
        ].includes(patch.kind) ||
        !["maintained", "fallow", "abandoned", "regenerating"].includes(patch.stage)
      )
        throw new Error("Invalid land-use patch");
      if (patch.polygons !== undefined && !validPolygons(patch.polygons)) throw new Error("Invalid land-use geometry");
      if (
        patch.canopyRetention !== undefined &&
        (!Number.isFinite(patch.canopyRetention) || patch.canopyRetention < 0 || patch.canopyRetention > 1)
      )
        throw new Error("Invalid canopy retention");
      if (patch.recoveryYears !== undefined && (!Number.isFinite(patch.recoveryYears) || patch.recoveryYears <= 0))
        throw new Error("Invalid recovery period");
      if (
        patch.rotation &&
        (!Number.isFinite(patch.rotation.years) ||
          patch.rotation.years <= 0 ||
          !Number.isFinite(patch.rotation.activeYears) ||
          patch.rotation.activeYears <= 0 ||
          patch.rotation.activeYears > patch.rotation.years ||
          !Number.isFinite(patch.rotation.epoch) ||
          !Number.isFinite(patch.rotation.phase) ||
          patch.rotation.phase < 0 ||
          patch.rotation.phase >= patch.rotation.years)
      )
        throw new Error("Invalid land-use rotation");
      if (
        patch.management &&
        (Object.values(patch.management).some(n => !Number.isFinite(n)) ||
          patch.management.rotationYears <= 0 ||
          patch.management.harvestedCoverage < 0)
      )
        throw new Error("Invalid forest management");
      ids.add(patch.id);
      total += patch.areaHa;
      converted += patch.convertedForestAreaHa;
    }
    // Unit-bearing tolerance: 0.000001 hectares (0.01 square metres).
    if (
      Math.abs(total - cell.physicalLandAreaHa) > 0.000001 ||
      Math.abs(converted - cell.convertedForestAreaHa) > 0.000001
    )
      throw new Error("Land-use areas do not conserve physical land");
  }
}

/** Resolved or user-supplied settings. Missing rights/soil data are not invented. */
export interface LandUseSettings {
  tenure?: "common" | "private" | "protected";
  ownerId?: number;
  maxTransportCost?: number;
  access?: { cellId: number; cost: number; allowed?: boolean }[];
  clearanceShare?: number;
  otherOccupationDays?: number;
  grazingAreaHa?: number;
  hayAreaHa?: number;
  woodPastureHa?: number;
  grazedFallowHa?: number;
  fodderWithinFieldsHa?: number;
  managedForestAreaHa?: number;
  forestRotationYears?: number;
  agroforestryAreaHa?: number;
  agroforestryRotationYears?: number;
  shiftingCycleYears?: number;
  shiftingActiveYears?: number;
  importedStaplePeople?: number;
  localStapleShare?: number;
}
