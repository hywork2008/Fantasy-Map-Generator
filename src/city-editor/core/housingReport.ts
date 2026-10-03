// FMG burg inputs against the houses City Editor actually draws.
// The counts are the same core/outskirts footprints the City Editor panel
// labels 「建物」. `houses` drops landmarks and non-residential outbuildings.
// A failed street-offset repair is seeded from the outline's raw text, so
// Chrome and Node can differ by one block's house rows on the same burg.

import { readFileSync } from "node:fs";
import { worldContext } from "../../context/worldContext";
import { decodeAndValidateWorldArchive } from "../../runtime/worldArchive";
import { type BurgSiteDescriptor, getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { type CityEditorShare, shareFromDescriptor } from "../io/incomingCity";
import { createGridDocument } from "./document";
import { buildBlockFabric, FabricCache } from "./gen/blockInfill";
import type { BuildingLot } from "./gen/buildingLots";
import { DEFAULT_PATCH_PARAMS } from "./gen/patches";
import { defaultGenerationSettings, type GenerationSettings, generateCityOnDocument } from "./generate";
import type { CityDocument } from "./types";

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
  maxBridgeSpanMeters?: number;
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
    extentMeters: share.descriptor?.frame.extentMeters,
    cityRadiusMeters: share.descriptor?.frame.cityRadiusMeters,
    measureBlockSize: share.measureBlockSize === true
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
  const share = shareFromDescriptor(descriptor);
  const document = cityEditorDocument(share);
  const settings = cityEditorSettings(share);
  let failure: string | null = null;
  const city = generateCityOnDocument(document, settings, descriptor.burg.seed, sample => {
    if (sample.failure) failure = sample.failure.message;
  });
  const counted = city ?? document;
  const lots = buildBlockFabric(counted, new FabricCache()).buildings.filter(lot => {
    const settlement = settlementOf(counted, lot);
    return settlement === "core" || settlement === "outskirts";
  });
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
    failure: city ? null : failure
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
      sourceExtentMeters: descriptor.frame.extentMeters,
      extentMeters: share.descriptor?.frame.extentMeters ?? descriptor.frame.extentMeters,
      size: share.size,
      fitted: share.descriptor?.frame.extentMeters !== descriptor.frame.extentMeters,
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
      maxBridgeSpanMeters: descriptor.transport?.maxBridgeSpanMeters
    },
    output,
    gap: housingGap(descriptor.burg.dwellings, output.houses),
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
