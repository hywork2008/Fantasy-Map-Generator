import { resolveBridgeCrossingLimit } from "../../utils/bridgeCrossingPolicy";
// FMG burg inputs against the houses City Editor actually draws.
// The counts are the same core/outskirts footprints the City Editor panel
// labels 「建物」. `houses` drops landmarks and non-residential outbuildings.
// A failed street-offset repair is seeded from the outline's raw text, so
// Chrome and Node can differ by one block's house rows on the same burg.

import { readFileSync } from "node:fs";
import { worldContext } from "../../context/worldContext";
import { decodeAndValidateWorldArchive } from "../../runtime/worldArchive";
import { type BurgSiteDescriptor, getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { type CityEditorShare, parseIncomingPayload } from "../io/incomingCity";
import { createGridDocument, descriptorFrameGridOptions } from "./document";
import { buildBlockFabric, FabricCache } from "./gen/blockInfill";
import type { BuildingLot } from "./gen/buildingLots";
import type { HousingFitStats } from "./gen/fitImportedHousing";
import { polygonArea } from "./gen/geom";
import { DEFAULT_PATCH_PARAMS } from "./gen/patches";
import { defaultGenerationSettings, type GenerationSettings, generateCityOnDocument } from "./generate";
import type { GenerationSample } from "./generationDiagnostics";
import { facePoints } from "./mesh";
import type { CityDocument, DistrictParameters } from "./types";

export interface HousingReportInput {
  population: number;
  /** Required dwellings: ceil(population / 4.5). This is the Burg Editor and City Editor Dwellings value. */
  dwellings: number;
  cityRadiusMeters: number;
  /** Extent stored on the FMG descriptor, before a hamlet window is fitted. */
  sourceExtentMeters: number;
  /** Extent City Editor generates into. */
  extentMeters: number;
  size: string;
  /** True when the hand-off replaced an oversized FMG window with a smaller preset. */
  fitted: boolean;
  nPatches: number;
  blockSizeMeters: number;
  walls: boolean;
  citadel: boolean;
  port: boolean;
  plaza: boolean;
  temple: boolean;
  rivers: number;
  roads: number;
  suggestedGates: number;
  historicalPeriod?: string;
  /** Legacy output alias for the total crossing allowance. */
  maxBridgeSpanMeters?: number;
  maxBridgeCrossingMeters?: number;
}

export interface HousingReportOutput {
  generated: boolean;
  generationSeed: string | null;
  /** All building footprints on core and outskirts cells (the 「建物」 panel). */
  buildings: number;
  buildingsCore: number;
  buildingsOutskirts: number;
  /** Footprints that can house people: untagged or residential main buildings, landmarks excluded. */
  houses: number;
  housesCore: number;
  housesOutskirts: number;
  failure: string | null;
  failureReasons: string[];
  /** Occupancy fit of the adopted attempt and the residential land it filled. */
  occupancy: HousingOccupancySurvey | null;
  diagnostics: GenerationSample[];
}

export interface HousingOccupancyZone {
  /** Residential cells (buildable, non-castle/farm/park/cemetery/empty ward). */
  cells: number;
  areaM2: number;
  /** Area-weighted Lot occupancy after the fit (0–1), as the CE panel shows. */
  occupancy: number | null;
  /** Area-weighted occupancy of the first count (default × guide). */
  initialOccupancy: number | null;
  coverage: number | null;
  lotAreaM2: number | null;
  houses: number;
  houseFootprintM2: number;
}

export interface HousingOccupancySurvey {
  fit: HousingFitStats | null;
  /** Wall time of the adopted attempt's fit, including every rebuild. */
  fitMs: number | null;
  core: HousingOccupancyZone;
  outskirts: HousingOccupancyZone;
  /** Houses the cells would hold at occupancy 1: initialHouses / initial occupancy. */
  capacityAtFullOccupancy: number | null;
  /** dwellings / capacity: the occupancy a one-shot fit would choose. */
  requiredOccupancy: number | null;
  /** Dwellings per residential hectare. */
  dwellingsPerHectare: number | null;
  /** Houses per residential hectare at occupancy 1. */
  capacityPerHectare: number | null;
}

const NON_RESIDENTIAL_WARDS = ["castle", "farm", "park", "cemetery", "empty"];

function occupancyZone(
  document: CityDocument,
  houses: BuildingLot[],
  settlement: string,
  factor: number,
  firstFactor: number
) {
  let cells = 0;
  let areaM2 = 0;
  const weighted = { occupancy: 0, coverage: 0, lotArea: 0, area: 0 };
  const district = new Map<string, DistrictParameters>();
  for (const d of document.fabric?.districts ?? []) for (const id of d.faceIds) district.set(id, d.parameters);
  for (const face of Object.values(document.mesh.faces)) {
    if (!face.properties.buildable || face.properties.settlement !== settlement) continue;
    if (NON_RESIDENTIAL_WARDS.includes(face.properties.ward ?? "empty")) continue;
    const area = Math.abs(polygonArea(facePoints(document.mesh, face)));
    cells++;
    areaM2 += area;
    const parameters = district.get(face.id);
    if (!parameters) continue;
    weighted.occupancy += parameters.occupancy * area;
    weighted.coverage += parameters.coverage * area;
    weighted.lotArea += parameters.lotArea * area;
    weighted.area += area;
  }
  const mean = (sum: number) => (weighted.area > 0 ? sum / weighted.area : null);
  const zoneHouses = houses.filter(lot => settlementOf(document, lot) === settlement);
  const occupancy = mean(weighted.occupancy);
  return {
    cells,
    areaM2,
    occupancy,
    // An emptied zone (factor 0) falls back to its default district occupancy.
    initialOccupancy:
      occupancy === null ? null : (factor > 0 ? occupancy / factor : settlement === "core" ? 1 : 0.82) * firstFactor,
    coverage: mean(weighted.coverage),
    lotAreaM2: mean(weighted.lotArea),
    houses: zoneHouses.length,
    houseFootprintM2: zoneHouses.reduce((sum, lot) => sum + Math.abs(polygonArea(lot.polygon)), 0)
  } satisfies HousingOccupancyZone;
}

export function surveyOccupancy(
  document: CityDocument,
  houses: BuildingLot[],
  dwellings: number,
  fitSample: GenerationSample | undefined
): HousingOccupancySurvey {
  const fit = fitSample?.housingFit ?? null;
  // The first count ran at the guide, clamped so no district exceeded 100%.
  const firstFactor = fit ? fit.targetOccupancy : 1;
  const core = occupancyZone(document, houses, "core", fit?.factor ?? 1, firstFactor);
  const outskirts = occupancyZone(document, houses, "outskirts", fit?.outskirtsFactor ?? 1, firstFactor);
  const area = core.areaM2 + outskirts.areaM2;
  const initialOccupancy =
    area > 0
      ? ((core.initialOccupancy ?? 0) * core.areaM2 + (outskirts.initialOccupancy ?? 0) * outskirts.areaM2) / area
      : 0;
  const capacity = fit?.initialHouses != null && initialOccupancy > 0 ? fit.initialHouses / initialOccupancy : null;
  return {
    fit,
    fitMs: fitSample?.elapsedMs ?? null,
    core,
    outskirts,
    capacityAtFullOccupancy: capacity,
    requiredOccupancy: capacity ? dwellings / capacity : null,
    dwellingsPerHectare: area > 0 ? dwellings / (area / 10_000) : null,
    capacityPerHectare: capacity && area > 0 ? capacity / (area / 10_000) : null
  };
}

export interface HousingReportGap {
  /** houses − Dwellings. Positive means the plan drew more houses than the population requires. */
  housesMinusDwellings: number | null;
  /** houses / Dwellings, two decimal places. */
  housesPerDwelling: number | null;
}

export interface HousingComparison {
  burgId: number | null;
  name: string | null;
  token: string;
  input: HousingReportInput | null;
  output: HousingReportOutput | null;
  gap: HousingReportGap | null;
  error: string | null;
}

export interface HousingReport {
  schemaVersion: 1;
  archive: string;
  rows: HousingComparison[];
}

/** Settings object City Editor builds in `applyShare` before generating. */
export function cityEditorSettings(share: CityEditorShare): GenerationSettings {
  return {
    ...defaultGenerationSettings(),
    buildingPattern: "legacy",
    ...structuredClone(share.settings),
    descriptor: share.descriptor
  };
}

/** Grid document City Editor builds from an incoming share, including a fitted hamlet window. */
export function cityEditorDocument(share: CityEditorShare): CityDocument {
  return createGridDocument({
    size: share.size,
    grid: share.grid,
    seed: share.gridSeed ?? share.seed,
    hexSizeMeters: share.hexSizeMeters,
    patchParams: share.patchParams,
    ...(share.descriptor
      ? descriptorFrameGridOptions(
          share.descriptor.frame,
          share.descriptor.burg.waterAccess?.port.river === true,
          share.descriptor.burg.riverPlacement?.bankDistanceMeters
        )
      : {}),
    measureBlockSize: share.measureBlockSize === true,
    biome: share.descriptor?.biome
  });
}

function isHouse(lot: BuildingLot): boolean {
  if (lot.landmark) return false;
  if (lot.role && lot.role !== "main") return false;
  if (lot.uses && !lot.uses.includes("residential")) return false;
  return true;
}

function settlementOf(document: CityDocument, lot: BuildingLot): string | undefined {
  return document.mesh.faces[lot.faceId]?.properties.settlement;
}

export function housingGap(dwellings: number, houses: number): HousingReportGap {
  return {
    housesMinusDwellings: houses - dwellings,
    housesPerDwelling: dwellings > 0 ? Math.round((houses / dwellings) * 100) / 100 : null
  };
}

/** Run the Burg Editor → City Editor hand-off and count the houses it draws.
 * `buildings` matches the City Editor 「建物」 panel. Each call uses a fresh
 * fabric cache so one burg cannot reuse another's lots. */
export function compareBurgHousing(descriptor: BurgSiteDescriptor): HousingComparison {
  const share = parseIncomingPayload(JSON.stringify(descriptor));
  if (!share) throw new Error("Invalid burg site descriptor");
  return compareShareHousing(share, descriptor.frame.extentMeters);
}

/** Reproduce the complete CE hand-off saved in a batch CSV. */
export function compareShareHousing(
  share: CityEditorShare,
  sourceExtentMeters = share.descriptor?.frame.extentMeters
): HousingComparison {
  const descriptor = share.descriptor;
  if (!descriptor) throw new Error("Housing comparison requires a site descriptor");
  const document = cityEditorDocument(share);
  const settings = cityEditorSettings(share);
  let failure: string | null = null;
  const diagnostics: GenerationSample[] = [];
  const city = generateCityOnDocument(document, settings, share.seed, sample => {
    diagnostics.push(sample);
    if (sample.failure && sample.failure.reason !== "all-attempts-rejected")
      failure = `${sample.failure.reason}: ${sample.failure.message}`;
  });
  const counted = city ?? document;
  const lots = city
    ? buildBlockFabric(counted, new FabricCache()).buildings.filter(lot => {
        const settlement = settlementOf(counted, lot);
        return settlement === "core" || settlement === "outskirts";
      })
    : [];
  const houses = lots.filter(isHouse);
  const inSettlement = (lot: BuildingLot, settlement: string) => settlementOf(counted, lot) === settlement;
  const output: HousingReportOutput = {
    generated: city != null,
    generationSeed: city?.generationSeed ?? null,
    buildings: lots.length,
    buildingsCore: lots.filter(lot => inSettlement(lot, "core")).length,
    buildingsOutskirts: lots.filter(lot => inSettlement(lot, "outskirts")).length,
    houses: houses.length,
    housesCore: houses.filter(lot => inSettlement(lot, "core")).length,
    housesOutskirts: houses.filter(lot => inSettlement(lot, "outskirts")).length,
    failure: city ? null : failure,
    failureReasons: [
      ...new Set(
        diagnostics.flatMap(sample =>
          sample.failure && sample.failure.reason !== "all-attempts-rejected" ? [sample.failure.reason] : []
        )
      )
    ],
    diagnostics: diagnostics.filter(sample => sample.failure || sample.fixedApproaches),
    occupancy: city
      ? surveyOccupancy(
          city,
          houses,
          descriptor.burg.dwellings,
          // The adopted attempt is the last one that reached the fit.
          diagnostics.filter(sample => sample.housingFit).at(-1)
        )
      : null
  };
  const roads = descriptor.roads.filter(road => road.group !== "searoutes");
  return {
    burgId: descriptor.burg.id,
    name: descriptor.burg.name,
    token: String(descriptor.burg.id),
    input: {
      population: descriptor.burg.population,
      dwellings: descriptor.burg.dwellings,
      cityRadiusMeters: descriptor.frame.cityRadiusMeters,
      sourceExtentMeters: sourceExtentMeters ?? descriptor.frame.extentMeters,
      extentMeters: share.descriptor?.frame.extentMeters ?? descriptor.frame.extentMeters,
      size: share.size,
      fitted: share.descriptor?.frame.extentMeters !== sourceExtentMeters,
      nPatches: share.patchParams?.nPatches ?? DEFAULT_PATCH_PARAMS.nPatches,
      blockSizeMeters: counted.frame.blockSizeMeters,
      walls: descriptor.burg.walls,
      citadel: descriptor.burg.citadel,
      port: descriptor.burg.port,
      plaza: descriptor.burg.plaza,
      temple: descriptor.burg.temple,
      rivers: descriptor.rivers.length,
      roads: roads.length,
      suggestedGates: descriptor.suggestedGates,
      historicalPeriod: descriptor.historicalPeriod,
      maxBridgeSpanMeters: resolveBridgeCrossingLimit(descriptor.historicalPeriod, descriptor.transport),
      maxBridgeCrossingMeters: resolveBridgeCrossingLimit(descriptor.historicalPeriod, descriptor.transport)
    },
    output,
    gap: city
      ? housingGap(descriptor.burg.dwellings, output.houses)
      : { housesMinusDwellings: null, housesPerDwelling: null },
    error: null
  };
}

export async function loadArchiveWorld(archivePath: string): Promise<void> {
  const buffer = readFileSync(archivePath);
  const validated = await decodeAndValidateWorldArchive({
    blob: new Blob([buffer]),
    header: new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(4, buffer.byteLength))
  });
  Object.assign(worldContext, validated.document.world);
  const { bindSimulationBurgState } = await import("../../runtime/simulationBurgState");
  bindSimulationBurgState(worldContext, validated.document.simulation);
  // Same post-load repair as the browser loader, so CLI reports match the app.
  const { burgsUnplacedOnRivers, removeRepeatedRiverCells } = await import("../../services/repairRiverCells");
  const repairedRivers = removeRepeatedRiverCells(worldContext);
  if (repairedRivers.size) {
    const { Burgs } = await import("../../generators/burgs-generator");
    Burgs.resiteRiverBurgs(burgsUnplacedOnRivers(worldContext, repairedRivers));
  }
}

/** Numeric tokens are burg indexes. Any other token is an exact burg name, and every match is returned. */
export function burgIdsForTokens(tokens: readonly string[]): Array<{ token: string; burgId: number | null }> {
  const burgs = worldContext.pack.burgs ?? [];
  const resolved: Array<{ token: string; burgId: number | null }> = [];
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      resolved.push({ token, burgId: Number(token) });
      continue;
    }
    const matches = burgs.flatMap((burg, index) =>
      burg && !burg.removed && burg.name === token ? [burg.i ?? index] : []
    );
    if (!matches.length) resolved.push({ token, burgId: null });
    else for (const burgId of matches) resolved.push({ token, burgId });
  }
  return resolved;
}

export async function compareArchiveHousing(archivePath: string, tokens: readonly string[]): Promise<HousingReport> {
  await loadArchiveWorld(archivePath);
  const rows = burgIdsForTokens(tokens).map(({ token, burgId }) => {
    if (burgId == null) {
      return {
        burgId: null,
        name: null,
        token,
        input: null,
        output: null,
        gap: null,
        error: `No burg named ${token}`
      };
    }
    const descriptor = getBurgSiteDescriptor(burgId);
    if (!descriptor) {
      return {
        burgId,
        name: null,
        token,
        input: null,
        output: null,
        gap: null,
        error: `Burg ${burgId} has no site descriptor`
      };
    }
    return { ...compareBurgHousing(descriptor), token };
  });
  return { schemaVersion: 1, archive: archivePath, rows };
}
