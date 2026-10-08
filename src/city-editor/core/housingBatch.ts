import { readFileSync, writeFileSync } from "node:fs";
import { worldContext } from "../../context/worldContext";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { resolveBridgeCrossingLimit } from "../../utils/bridgeCrossingPolicy";
import { parseIncomingPayload } from "../io/incomingCity";
import { readCsv, writeCsv } from "./batchCsv";
import { DEFAULT_PATCH_PARAMS } from "./gen/patches";
import { burgIdsForTokens, compareShareHousing, type HousingOccupancySurvey, loadArchiveWorld } from "./housingReport";

export { readCsv, writeCsv } from "./batchCsv";

export async function exportHousingInputs(archive: string, tokens: string[]): Promise<Record<string, unknown>[]> {
  await loadArchiveWorld(archive);
  const selected = tokens.length
    ? burgIdsForTokens(tokens)
    : (worldContext.pack.burgs ?? []).flatMap((burg, i) =>
        burg && !burg.removed && (burg.i ?? i) > 0 ? [{ burgId: burg.i ?? i, token: String(burg.i ?? i) }] : []
      );
  const seen = new Set<number>();
  return selected.flatMap<Record<string, unknown>>(({ burgId, token }) => {
    if (burgId === null) throw new Error(`No burg named ${token}`);
    if (seen.has(burgId)) return [];
    seen.add(burgId);
    try {
      const descriptor = getBurgSiteDescriptor(burgId);
      if (!descriptor) throw new Error(`Burg ${burgId} has no site descriptor`);
      const share = parseIncomingPayload(JSON.stringify(descriptor));
      if (!share) throw new Error(`Burg ${burgId} has an invalid site descriptor`);
      return [
        {
          schema_version: 1,
          archive,
          burg_id: burgId,
          name: descriptor.burg.name,
          population: descriptor.burg.population,
          dwellings: descriptor.burg.dwellings,
          seed: share.seed,
          grid: share.grid,
          size: share.size,
          city_radius_meters: descriptor.frame.cityRadiusMeters,
          source_extent_meters: descriptor.frame.extentMeters,
          extent_meters: share.descriptor!.frame.extentMeters,
          fitted: share.descriptor!.frame.extentMeters !== descriptor.frame.extentMeters,
          n_patches: share.patchParams?.nPatches ?? DEFAULT_PATCH_PARAMS.nPatches,
          walls: descriptor.burg.walls,
          citadel: descriptor.burg.citadel,
          port: descriptor.burg.port,
          plaza: descriptor.burg.plaza,
          temple: descriptor.burg.temple,
          rivers: descriptor.rivers.length,
          roads: descriptor.roads.filter(road => road.group !== "searoutes").length,
          suggested_gates: descriptor.suggestedGates,
          historical_period: descriptor.historicalPeriod,
          max_bridge_span_meters: resolveBridgeCrossingLimit(descriptor.historicalPeriod, descriptor.transport),
          max_bridge_crossing_meters: resolveBridgeCrossingLimit(descriptor.historicalPeriod, descriptor.transport),
          share_json: JSON.stringify(share)
        }
      ];
    } catch (error) {
      return [
        {
          schema_version: 1,
          archive,
          burg_id: burgId,
          name: worldContext.pack.burgs[burgId]?.name ?? "",
          share_json: "",
          export_error: error instanceof Error ? error.message : String(error)
        }
      ];
    }
  });
}

const round = (value: number | null | undefined, digits = 3) =>
  value == null || !Number.isFinite(value) ? "" : Math.round(value * 10 ** digits) / 10 ** digits;

/** Lot occupancy survey columns; percentages match the CE panel's 「Lot occupancy (%)」. */
function occupancyColumns(survey: HousingOccupancySurvey | null): Record<string, unknown> {
  if (!survey) return {};
  const fit = survey.fit;
  const zone = (prefix: string, z: HousingOccupancySurvey["core"]) => ({
    [`${prefix}_cells`]: z.cells,
    [`${prefix}_area_m2`]: Math.round(z.areaM2),
    [`${prefix}_occupancy_pct`]: round(z.occupancy === null ? null : z.occupancy * 100, 1),
    [`${prefix}_initial_occupancy_pct`]: round(z.initialOccupancy === null ? null : z.initialOccupancy * 100, 1),
    [`${prefix}_coverage`]: round(z.coverage),
    [`${prefix}_lot_area_m2`]: round(z.lotAreaM2, 1),
    [`${prefix}_house_footprint_m2`]: Math.round(z.houseFootprintM2),
    [`${prefix}_footprint_ratio`]: round(z.areaM2 > 0 ? z.houseFootprintM2 / z.areaM2 : null)
  });
  return {
    fit_skipped: fit?.skipped ?? "",
    fit_districts: fit?.districts ?? "",
    fit_initial_houses: fit?.initialHouses ?? "",
    fit_final_houses: fit?.finalHouses ?? "",
    fit_factor: round(fit?.factor, 4),
    fit_rebuilds: fit?.samples.length ?? "",
    fit_samples: fit ? fit.samples.map(([factor, houses]) => `${round(factor, 4)}:${houses}`).join(" ") : "",
    fit_ms: round(survey.fitMs, 0),
    ...zone("core", survey.core),
    ...zone("outskirts", survey.outskirts),
    capacity_at_full_occupancy: round(survey.capacityAtFullOccupancy, 0),
    required_occupancy_pct: round(survey.requiredOccupancy === null ? null : survey.requiredOccupancy * 100, 1),
    dwellings_per_ha: round(survey.dwellingsPerHectare, 1),
    capacity_per_ha: round(survey.capacityPerHectare, 1)
  };
}

export function compareHousingInputs(
  rows: Record<string, string>[],
  progress?: (index: number, total: number) => void
): Record<string, unknown>[] {
  const results = rows.map((row, index) => {
    progress?.(index + 1, rows.length);
    try {
      if (row.schema_version !== "1") throw new Error("Unsupported CSV schema_version");
      if (row.export_error) throw new Error(`Descriptor export: ${row.export_error}`);
      const share = parseIncomingPayload(row.share_json);
      if (!share?.descriptor) throw new Error("Invalid CE share_json or missing descriptor");
      if (String(share.descriptor.burg.id) !== row.burg_id) throw new Error("burg_id differs from share_json");
      const sourceExtent = Number(row.source_extent_meters);
      if (!Number.isFinite(sourceExtent) || sourceExtent <= 0) throw new Error("Invalid source_extent_meters");
      const report = compareShareHousing(share, sourceExtent);
      const output = report.output!;
      const delta = output.generated ? report.gap!.housesMinusDwellings : null;
      return {
        ...row,
        population: report.input!.population,
        dwellings: report.input!.dwellings,
        max_bridge_span_meters: report.input!.maxBridgeSpanMeters,
        max_bridge_crossing_meters: report.input!.maxBridgeCrossingMeters,
        generated: output.generated,
        generation_seed: output.generationSeed,
        buildings: output.buildings,
        buildings_core: output.buildingsCore,
        buildings_outskirts: output.buildingsOutskirts,
        houses: output.houses,
        houses_core: output.housesCore,
        houses_outskirts: output.housesOutskirts,
        houses_minus_dwellings: delta,
        absolute_gap: delta === null ? null : Math.abs(delta),
        houses_per_dwelling: output.generated ? report.gap!.housesPerDwelling : null,
        relative_gap: delta !== null && report.input!.dwellings > 0 ? delta / report.input!.dwellings : null,
        error: output.generated ? "" : (output.failure ?? "City generation failed"),
        failure_reasons: output.failureReasons.join(";"),
        ...occupancyColumns(output.occupancy),
        generation_diagnostics_json: JSON.stringify(output.diagnostics)
      };
    } catch (error) {
      return {
        ...row,
        generated: false,
        generation_seed: "",
        buildings: "",
        buildings_core: "",
        buildings_outskirts: "",
        houses: "",
        houses_core: "",
        houses_outskirts: "",
        houses_minus_dwellings: "",
        absolute_gap: null,
        houses_per_dwelling: "",
        relative_gap: "",
        error: error instanceof Error ? error.message : String(error),
        failure_reasons: "input-error",
        generation_diagnostics_json: "[]"
      };
    }
  });
  return results.sort((a, b) => (b.absolute_gap ?? -1) - (a.absolute_gap ?? -1));
}

export async function runHousingBatch(options: {
  mode: string;
  input: string;
  output: string;
  tokens: string[];
}): Promise<void> {
  const rows =
    options.mode === "export"
      ? await exportHousingInputs(options.input, options.tokens)
      : compareHousingInputs(readCsv(readFileSync(options.input, "utf8")), (index, total) =>
          process.stderr.write(`[housing] ${index}/${total}\n`)
        );
  if (!rows.length) throw new Error("No cities selected");
  writeFileSync(options.output, writeCsv(rows));
  console.error(`[housing] Wrote ${rows.length} cities to ${options.output}`);
}
