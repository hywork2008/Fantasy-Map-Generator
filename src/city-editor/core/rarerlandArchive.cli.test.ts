import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { worldContext } from "../../context/worldContext";
import { bindSimulationBurgState } from "../../runtime/simulationBurgState";
import { decodeAndValidateWorldArchive } from "../../runtime/worldArchive";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { shareFromDescriptor } from "../io/incomingCity";
import { serializeCitySvg } from "../render/svg";
import { buildBlockFabric } from "./gen/blockInfill";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";

// Opt-in output diagnostic. Ordinary regressions use small descriptor fixtures.
it.skipIf(!process.env.CE_DIAG_ARCHIVE)(
  "generates archive cities and exports their SVGs",
  async () => {
    const buffer = readFileSync(process.env.CE_DIAG_ARCHIVE!);
    const decoded = await decodeAndValidateWorldArchive({
      blob: { arrayBuffer: async () => new Uint8Array(buffer).buffer } as Blob,
      header: new Uint8Array(buffer.subarray(0, 4))
    });
    Object.assign(worldContext, decoded.document.world);
    bindSimulationBurgState(worldContext, decoded.document.simulation);
    const output = process.env.CE_DIAG_OUT!;
    mkdirSync(output, { recursive: true });
    const ids = (process.env.CE_DIAG_BURGS ?? "518").split(",").map(Number);
    const results = [];
    for (const id of ids) {
      const start = performance.now();
      const site = getBurgSiteDescriptor(id);
      expect(site).not.toBeNull();
      if (!site) continue;
      const descriptorMs = performance.now() - start;
      const share = shareFromDescriptor(site);
      const attempts: number[] = [];
      const generationStart = performance.now();
      const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, s =>
        attempts.push(s.attempt)
      );
      const generationMs = performance.now() - generationStart;
      expect(city).not.toBeNull();
      if (!city) continue;
      writeFileSync(join(output, `city-${id}.svg`), serializeCitySvg(city));
      results.push({
        id,
        name: site.burg.name,
        descriptorMs,
        generationMs,
        attempts: Math.max(...attempts),
        piers: buildBlockFabric(city).harbor?.piers.length ?? 0,
        ships: city.elements.filter(e => e.kind === "ship").map(e => e.shipType)
      });
    }
    writeFileSync(join(output, "results.json"), JSON.stringify(results, null, 2));
  },
  120000
);
