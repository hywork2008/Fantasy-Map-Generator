import { readFileSync, writeFileSync } from "node:fs";
import { worldContext } from "../../context/worldContext";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { parseIncomingPayload } from "../io/incomingCity";
import { DEFAULT_PATCH_PARAMS } from "./gen/patches";
import { burgIdsForTokens, compareShareHousing, loadArchiveWorld } from "./housingReport";

/** RFC 4180 quoting, including multiline JSON/name values and Excel's UTF-8 BOM. */
export function writeCsv(rows: Record<string, unknown>[]): string {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `\uFEFF${[columns, ...rows.map(row => columns.map(key => row[key]))]
    .map(row => row.map(quote).join(","))
    .join("\r\n")}\r\n`;
}

export function readCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let record: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === "," || c === "\n" || c === "\r") {
      record.push(field);
      field = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        records.push(record);
        record = [];
      }
    } else if (c === '"' && !field && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error("Malformed CSV quoting");
      field += c;
    }
  }
  if (quoted) throw new Error("Unterminated CSV field");
  if (field || record.length || closed) {
    record.push(field);
    records.push(record);
  }
  const header = records.shift();
  if (!header?.includes("share_json") || new Set(header).size !== header.length) {
    throw new Error("CSV requires unique column names and a share_json column");
  }
  return records
    .filter(row => row.some(Boolean))
    .map((row, index) => {
      if (row.length !== header.length) throw new Error(`CSV row ${index + 2}: incorrect column count`);
      return Object.fromEntries(header.map((key, i) => [key, row[i]]));
    });
}

export async function exportHousingInputs(archive: string, tokens: string[]): Promise<Record<string, unknown>[]> {
  await loadArchiveWorld(archive);
  const selected = tokens.length
    ? burgIdsForTokens(tokens)
    : (worldContext.pack.burgs ?? []).flatMap((burg, i) =>
        burg && !burg.removed && (burg.i ?? i) > 0 ? [{ burgId: burg.i ?? i, token: String(burg.i ?? i) }] : []
      );
  const seen = new Set<number>();
  return selected.flatMap(({ burgId, token }) => {
    if (burgId === null) throw new Error(`No burg named ${token}`);
    if (seen.has(burgId)) return [];
    seen.add(burgId);
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
        max_bridge_span_meters: descriptor.transport?.maxBridgeSpanMeters,
        share_json: JSON.stringify(share)
      }
    ];
  });
}

export function compareHousingInputs(
  rows: Record<string, string>[],
  progress?: (index: number, total: number) => void
): Record<string, unknown>[] {
  const results = rows.map((row, index) => {
    progress?.(index + 1, rows.length);
    try {
      if (row.schema_version !== "1") throw new Error("Unsupported CSV schema_version");
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
        error: output.generated ? "" : (output.failure ?? "City generation failed")
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
        error: error instanceof Error ? error.message : String(error)
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
