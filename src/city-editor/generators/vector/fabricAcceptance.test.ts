import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseVectorDocument, serializeVectorDocument } from "../../services/io/vector/documentCodec";
import type { VectorCityDocument } from "../../types/vector/document";
import { unpackLine } from "./fabric/pack";
import { vectorPathMeasurement } from "./geometry/measurement";

const output = process.env.CE_MESHLESS_FABRIC_ACCEPTANCE_OUT;
const v7 = process.env.CE_MESHLESS_FABRIC_ACCEPTANCE_V7 ?? "docs/analytics/raw/scaling-v3-20261108";
const v8 = process.env.CE_MESHLESS_FABRIC_ACCEPTANCE_V8 ?? "docs/analytics/raw/scaling-s21e2-20261108";

const length = (points: [number, number][]) =>
  points.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);

/** Houses, dwellings, unplaced people and generated street and lane length, whichever format holds them. */
function summary(doc: VectorCityDocument) {
  const r = doc.urban!.report,
    owned = new Set(doc.urban!.ownedPaths);
  let lanes = Object.values(doc.paths)
    .filter(p => owned.has(p.id))
    .reduce((n, p) => n + vectorPathMeasurement(p).lengthMeters, 0);
  for (const d of Object.values(doc.fabric?.districts ?? {}))
    for (let i = 0; i < d.streets.widths.length; i++) lanes += length(unpackLine(d.streets, i, d.origin));
  for (const c of Object.values(doc.fabric?.cells ?? {}))
    for (let i = 0; i < c.lanes.widths.length; i++) lanes += length(unpackLine(c.lanes, i, c.origin));
  return {
    algorithm: doc.urban!.algorithm,
    housingBuildings: r.housingBuildings,
    capacityDwellings: r.capacityDwellings,
    requiredDwellings: r.requiredDwellings,
    unplacedPopulation: r.unplacedPopulation,
    streetAndLaneMeters: Math.round(lanes * 10) / 10,
    placements: Object.keys(doc.placements).length,
    paths: Object.keys(doc.paths).length
  };
}

/** Opt-in S2.1f acceptance: saved documents reload unchanged, and v7 (generation v3) compares with v8. */
describe.runIf(!!output)("meshless fabric acceptance (S2.1f)", () => {
  it("reloads saved fabric documents and compares v7 with v8", () => {
    const rows: Record<string, unknown>[] = [];
    for (const population of [1000, 5000, 20000, 50000]) {
      const row: Record<string, unknown> = { population };
      for (const [format, dir] of [
        ["v7", v7],
        ["v8", v8]
      ] as const) {
        if (format === "v7" && population > 5000) continue;
        const text = readFileSync(`${dir}/scaling-${population}.json`, "utf8"),
          started = performance.now(),
          doc = parseVectorDocument(text);
        const parseMs = performance.now() - started;
        expect(doc).not.toBeNull();
        const saved = serializeVectorDocument(doc!),
          reloaded = parseVectorDocument(saved);
        row[format] = {
          ...summary(doc!),
          bytes: text.length,
          sha256: createHash("sha256").update(text).digest("hex"),
          parseMs: Math.round(parseMs),
          resavedIdentical: saved === text,
          reloadedEqual: JSON.stringify(reloaded) === JSON.stringify(doc)
        };
        expect(JSON.stringify(reloaded)).toBe(JSON.stringify(doc));
      }
      rows.push(row);
    }
    writeFileSync(
      output!,
      `${JSON.stringify(
        {
          format: "ce-meshless-fabric-acceptance",
          version: 1,
          measuredAtUtc: new Date().toISOString(),
          inputs: { v7, v8 },
          scope:
            "Saved documents of the fixed wall-first synthetic inputs. v7 = generation vector-urban-v3 (houses as placements, lanes as paths); v8 = vector-urban-v6 (fabric records). Street and lane length sums generated lines in either form.",
          rows
        },
        null,
        2
      )}\n`
    );
  }, 600000);
});
