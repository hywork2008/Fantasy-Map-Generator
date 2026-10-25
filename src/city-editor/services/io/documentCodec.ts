import { validBuildingAppearanceFields } from "../../../buildings/appearance/resolver";
import { isBurialCultureProfile } from "../../../data/burialCultures";
import { isCivilizationContext } from "../../../data/civilizationTraditions";
import { FIXED_SITE_CROSSING_BUDGETS, validFixedBurgCrossings } from "../../../utils/fixedBurgCrossings";
import { requiredSiteExtent } from "../../../utils/requiredSiteBounds";
import { validUrbanMorphology } from "../../../utils/urbanMorphology";
import { validBastionedTown } from "../../generators/bastionedTown/codec";
import { buildBlockFabric } from "../../generators/blockInfill";
import { BLOCK_SIZE_METERS } from "../../generators/document";
import { upgradeFabricPlan, validFabricPlan } from "../../generators/fabricDistricts";
import { validFacilityCounts } from "../../generators/facilitySettings";
import { restoreFixedCrossingApproaches, validSavedFixedApproaches } from "../../generators/fixedApproachAdoption";
import { validateLandmarks } from "../../generators/landmarks";
import { validate } from "../../generators/mesh";
import { populationHousingFacts } from "../../generators/populationHousing";
import { validPopulationDocument } from "../../generators/populationValidation";
import { validRuralFieldSettings } from "../../generators/ruralFieldProfile";
import { validRuralFieldSnapshot } from "../../generators/ruralFieldSnapshot";
import { validRegionalFrameRoads, validSceneRegions } from "../../generators/sceneRegions";
import { repairRiverBeds } from "../../generators/terrainField/corridor";
import { validUrbanGrowth } from "../../generators/urbanGrowth";
import type { FixedApproachProvider } from "../../types/contracts/fixedApproachAdoption";
import type { CityDocument } from "../../types/document";

/** Optional current contract enables saved approaches only after exact replay. */
export function parseDocument(text: string, fixedApproachProvider?: FixedApproachProvider): CityDocument | null {
  try {
    const value = JSON.parse(text) as unknown;
    if (!isDocument(value)) return null;
    repairRiverBeds(value);
    if (value.burialProfile !== undefined && !isBurialCultureProfile(value.burialProfile)) return null;
    if (value.civilization !== undefined && !isCivilizationContext(value.civilization)) delete value.civilization;
    if (value.cemeteries?.some(c => c.burialProfile !== undefined && !isBurialCultureProfile(c.burialProfile)))
      return null;
    if (value.fabric !== undefined && !validFabricPlan(value.fabric)) return null;
    if (value.fabric && value.fabric.version < 4) value.fabric = upgradeFabricPlan(value);
    const recipe = value.fabric?.generation;
    if (recipe && (!isDocument(recipe.input) || "fabric" in recipe.input || validate(recipe.input).length)) return null;
    // Version-1 files saved before the scale-bar addition lack this descriptive
    // field; their geometry was already based on the same 50 m default.
    if (!Number.isFinite(value.frame.blockSizeMeters)) value.frame.blockSizeMeters = BLOCK_SIZE_METERS;
    // Gate anchors were introduced after the first editable-map format. Old
    // documents simply have no gates until the user adds one on a wall vertex.
    if (!Array.isArray(value.gates)) value.gates = [];
    for (const face of Object.values(value.mesh.faces)) {
      const quality = face.properties.farming;
      if (
        quality !== undefined &&
        (!quality ||
          typeof quality !== "object" ||
          Array.isArray(quality) ||
          [quality.soilQuality, quality.wetness].some(n => n !== undefined && (!Number.isFinite(n) || n < 0 || n > 1)))
      )
        return null;
      if (
        face.properties.ward !== null &&
        ![
          "market",
          "castle",
          "merchant",
          "craftsmen",
          "patriciate",
          "harbor",
          "park",
          "farm",
          "cemetery",
          "empty"
        ].includes(face.properties.ward)
      )
        return null;
      if (face.properties.water !== "land") face.properties.depth ??= 3;
    }
    if (validate(value).length || validateLandmarks(value).length) return null;
    if (fixedApproachProvider && value.fixedCrossingApproaches !== undefined) {
      const checked = restoreFixedCrossingApproaches(value, fixedApproachProvider);
      if ("document" in checked) return checked.document;
    }
    return value;
  } catch {
    return null;
  }
}

function isDocument(value: unknown): value is CityDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<CityDocument>;
  return (
    doc.format === "fmg-city-editor" &&
    validBuildingAppearanceFields(doc) &&
    validFacilityCounts(doc.facilityCounts) &&
    (doc.ruralFieldVersion === undefined || doc.ruralFieldVersion === 1 || doc.ruralFieldVersion === 2) &&
    validRuralFieldSettings(doc.ruralFieldSettings) &&
    validRuralFieldSnapshot(doc.ruralFieldSnapshot) &&
    (doc.vacantLotTrees === undefined ||
      (doc.vacantLotTrees !== null &&
        typeof doc.vacantLotTrees === "object" &&
        typeof doc.vacantLotTrees.seed === "string" &&
        typeof doc.vacantLotTrees.visible === "boolean")) &&
    validPopulationDocument(doc) &&
    (doc.townWallGeneration === undefined ||
      (doc.townWallGeneration !== null &&
        typeof doc.townWallGeneration === "object" &&
        ["outer-first", "inner-first"].includes(doc.townWallGeneration.requestedOrder) &&
        ["outer-first", "inner-first", "single"].includes(doc.townWallGeneration.actualOrder) &&
        (doc.townWallGeneration.fallbackReason === undefined ||
          typeof doc.townWallGeneration.fallbackReason === "string"))) &&
    (doc.urbanMorphology === undefined || validUrbanMorphology(doc.urbanMorphology)) &&
    (doc.urbanGrowth === undefined || (doc.urbanMorphology !== undefined && validUrbanGrowth(doc.urbanGrowth))) &&
    (doc.fixedCrossingApproaches === undefined ||
      (!!doc.importedFixedCrossings && validSavedFixedApproaches(doc.fixedCrossingApproaches))) &&
    (doc.version === 1 || doc.version === 2 || doc.version === 3 || doc.version === 4 || doc.version === 5) &&
    (doc.bastionedTown === undefined || (doc.version === 5 && validBastionedTown(doc as CityDocument))) &&
    (doc.sceneRegions === undefined ||
      ((doc.version === 4 || doc.version === 5) &&
        validSceneRegions(doc.sceneRegions) &&
        validRegionalFrameRoads(doc.frameRoads))) &&
    (doc.landmarks === undefined || Array.isArray(doc.landmarks)) &&
    (doc.landmarkAssets === undefined || Array.isArray(doc.landmarkAssets)) &&
    (doc.showElevationTint === undefined || typeof doc.showElevationTint === "boolean") &&
    (doc.farmlandAreaHectares === undefined ||
      (Number.isFinite(doc.farmlandAreaHectares) && doc.farmlandAreaHectares >= 0)) &&
    (doc.biome === undefined ||
      (typeof doc.biome === "object" && doc.biome !== null && typeof (doc.biome as { id: unknown }).id === "number")) &&
    (doc.gridKind === undefined || ["hex", "voronoi", "evolution"].includes(doc.gridKind)) &&
    (doc.buildingPattern === undefined || ["legacy", "medieval"].includes(doc.buildingPattern)) &&
    (doc.coastalOceanFaceIds === undefined ||
      (Array.isArray(doc.coastalOceanFaceIds) && doc.coastalOceanFaceIds.every(id => typeof id === "string"))) &&
    (doc.regionalWaterAreas === undefined ||
      (Array.isArray(doc.regionalWaterAreas) &&
        doc.regionalWaterAreas.every(
          ring =>
            Array.isArray(ring) &&
            ring.length >= 3 &&
            ring.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
        ))) &&
    (doc.regionalSurface === undefined || validRegionalSurface(doc.regionalSurface)) &&
    (doc.waterAreas === undefined ||
      (Array.isArray(doc.waterAreas) &&
        doc.waterAreas.every(
          area =>
            area?.kind === "river" &&
            Array.isArray(area.polygon) &&
            area.polygon.length >= 3 &&
            area.polygon.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
        ))) &&
    (doc.riverFlows === undefined ||
      (Array.isArray(doc.riverFlows) &&
        doc.riverFlows.every(
          flow =>
            typeof flow?.riverId === "number" &&
            Number.isFinite(flow.widthMeters) &&
            Array.isArray(flow.points) &&
            flow.points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
        ))) &&
    (doc.importedRoadCount === undefined || (Number.isInteger(doc.importedRoadCount) && doc.importedRoadCount >= 0)) &&
    (doc.importedFixedCrossings === undefined ||
      (validFixedBurgCrossings(doc.importedFixedCrossings, FIXED_SITE_CROSSING_BUDGETS) &&
        !!doc.frame &&
        Number.isFinite(doc.frame.extentMeters) &&
        doc.frame.extentMeters > 0 &&
        requiredSiteExtent(doc.importedFixedCrossings.requiredBounds) <= doc.frame.extentMeters &&
        (doc.importedFixedCrossings.schemaVersion !== 3 ||
          (doc.importedFixedCrossings.coverageBounds!.minX <= -doc.frame.extentMeters / 2 &&
            doc.importedFixedCrossings.coverageBounds!.minY <= -doc.frame.extentMeters / 2 &&
            doc.importedFixedCrossings.coverageBounds!.maxX >= doc.frame.extentMeters / 2 &&
            doc.importedFixedCrossings.coverageBounds!.maxY >= doc.frame.extentMeters / 2)))) &&
    !!doc.frame &&
    typeof doc.frame.extentMeters === "number" &&
    !!doc.mesh &&
    !!doc.mesh.vertices &&
    !!doc.mesh.edges &&
    !!doc.mesh.faces &&
    Array.isArray(doc.featureGroups) &&
    Array.isArray(doc.elements)
  );
}

function validRegionalSurface(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const surface = value as { features?: unknown; unknown?: unknown };
  const ring = (r: unknown) =>
    Array.isArray(r) &&
    r.length >= 3 &&
    r.length <= 20000 &&
    r.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  return (
    Array.isArray(surface.features) &&
    surface.features.length <= 1000 &&
    surface.features.every(
      f => f && (f.kind === "land" || f.kind === "water") && ring((f as { ring: unknown }).ring)
    ) &&
    Array.isArray(surface.unknown) &&
    surface.unknown.length <= 4 &&
    surface.unknown.every(ring)
  );
}

/** Native editable-map encoding. Match the existing schema selection and spacing. */
export function serializeDocument(document: CityDocument): string {
  if (document.populationPlan && document.appearance === "town") {
    const { populationReport, residentialClusters, housing } = populationHousingFacts(
      document,
      buildBlockFabric(document)
    );
    document = { ...document, populationReport, residentialClusters, housingCapacity: housing };
  }
  return JSON.stringify(
    {
      ...document,
      version: document.bastionedTown
        ? 5
        : document.sceneRegions
          ? 4
          : document.landmarks?.length || document.landmarkAssets?.length
            ? 3
            : 2
    },
    null,
    2
  );
}
