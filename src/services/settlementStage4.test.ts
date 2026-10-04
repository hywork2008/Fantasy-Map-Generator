import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createGridDocument, descriptorFrameGridOptions, parseDocument } from "../city-editor/core/document";
import { defaultGenerationSettings, generateCityOnDocument } from "../city-editor/core/generate";
import { shareFromDescriptor } from "../city-editor/io/incomingCity";
import { renderStandaloneCitySvg } from "../city-editor/render/svg";
import { worldContext } from "../context/worldContext";
import { decodeAndValidateWorldArchive } from "../runtime/worldArchive";
import { requiredSiteExtent } from "../utils/requiredSiteBounds";
import { getBurgSiteDescriptor } from "./burgSiteDescriptor";

const archive = resolve(process.cwd(), "temp/000.savdata/Buyteland 2026-10-04-06-38.fmg");
describe.skipIf(!existsSync(archive))("stage 4 real-world final frame", () => {
  it("runs ordinary river-town placement on the archived full world", async () => {
    const buffer = readFileSync(archive);
    const result = await decodeAndValidateWorldArchive({
      blob: new Blob([buffer]),
      header: new Uint8Array(buffer.buffer, buffer.byteOffset, 4)
    });
    Object.assign(worldContext, result.document.world);
    const { bindSimulationBurgState } = await import("../runtime/simulationBurgState");
    bindSimulationBurgState(worldContext, result.document.simulation);
    const { Burgs } = await import("../generators/burgs-generator");
    const start = performance.now();
    await Burgs.shiftAsync();
    if (process.env.STAGE4_PROFILE)
      console.info(
        `River-town placement: ${Math.round(performance.now() - start)} ms; ${worldContext.pack.rivers.length} rivers; ${worldContext.pack.burgs.length} burg records`
      );
    expect(worldContext.pack.burgs.filter(b => b.i && b.riverSiteStatus).length).toBeGreaterThan(0);
  }, 60000);
  it("retains Hetelethard's northwest shoreline through generation and save/load", async () => {
    const buffer = readFileSync(archive);
    const result = await decodeAndValidateWorldArchive({
      blob: new Blob([buffer]),
      header: new Uint8Array(buffer.buffer, buffer.byteOffset, 4)
    });
    Object.assign(worldContext, result.document.world);
    const { bindSimulationBurgState } = await import("../runtime/simulationBurgState");
    bindSimulationBurgState(worldContext, result.document.simulation);
    const burg = worldContext.pack.burgs[17];
    const position = [burg.x, burg.y];
    const descriptor = getBurgSiteDescriptor(17)!;
    expect(descriptor.burg.name).toBe("Hetelethard");
    expect(descriptor.frame.extentMeters).toBeLessThanOrEqual(4500);
    expect(descriptor.frame.requiredBounds).toBeDefined();
    const share = shareFromDescriptor(descriptor);
    const doc = createGridDocument({
      size: share.size,
      grid: share.grid,
      seed: share.gridSeed ?? share.seed,
      patchParams: share.patchParams,
      ...(share.descriptor ? descriptorFrameGridOptions(share.descriptor.frame) : {})
    });
    const city = generateCityOnDocument(
      doc,
      { ...defaultGenerationSettings(), descriptor: share.descriptor },
      descriptor.burg.seed
    )!;
    expect(city).not.toBeNull();
    expect(city.frame.extentMeters).toBeGreaterThanOrEqual(requiredSiteExtent(descriptor.frame.requiredBounds!));
    expect(city.frame.cityRadiusMeters).toBe(descriptor.frame.cityRadiusMeters);
    const restored = parseDocument(JSON.stringify(city))!;
    const svg = renderStandaloneCitySvg(restored);
    expect(svg.querySelectorAll(".ce-fixed-river-water path, .ce-continuous-water path").length).toBeGreaterThan(0);
    expect([burg.x, burg.y]).toEqual(position);
    if (process.env.STAGE4_SVG_OUTPUT) writeFileSync(process.env.STAGE4_SVG_OUTPUT, svg.outerHTML);
  }, 60000);
});
