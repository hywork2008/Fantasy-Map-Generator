/** Areas partition physical land; timber is still owned solely by forestStock. */
export const LAND_USE_MODEL_VERSION = 1;
export type LandUseProfile = "mixed_farming" | "embedded" | "port" | "forestry" | "pastoral" | "shifting" | "foraging";
export type LandUseKind =
  | "built"
  | "cultivation"
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
}
export interface LandUseSnapshot {
  modelVersion: typeof LAND_USE_MODEL_VERSION;
  revision: number;
  year: number;
  seed: string;
  provenance: "authoritative" | "estimated" | "legacy";
  cells: Record<number, CellLandUseBudget>;
  needsAnnualReconciliation?: boolean;
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
          "agroforestry",
          "managed_forest",
          "natural_forest",
          "other_natural",
          "abandoned"
        ].includes(patch.kind) ||
        !["maintained", "fallow", "abandoned", "regenerating"].includes(patch.stage)
      )
        throw new Error("Invalid land-use patch");
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
