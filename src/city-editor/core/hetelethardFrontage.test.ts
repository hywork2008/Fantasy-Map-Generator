import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { worldContext } from "../../context/worldContext";
import { decodeAndValidateWorldArchive } from "../../runtime/worldArchive";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { shareFromDescriptor } from "../io/incomingCity";
import { renderStandaloneCitySvg } from "../render/svg";
import { createGridDocument, descriptorFrameGridOptions } from "./document";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";

const archive = resolve(process.cwd(), "temp/000.savdata/Buyteland 2026-10-04-06-38.fmg");

describe.skipIf(!existsSync(archive))("Hetelethard frontage", () => {
  it("draws the surveyed river in the northwest of the widened frame", async () => {
    const buffer = readFileSync(archive);
    const validated = await decodeAndValidateWorldArchive({
      blob: new Blob([buffer]),
      header: new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(4, buffer.byteLength))
    });
    Object.assign(worldContext, validated.document.world);
    const { bindSimulationBurgState } = await import("../../runtime/simulationBurgState");
    bindSimulationBurgState(worldContext, validated.document.simulation);
    const descriptor = getBurgSiteDescriptor(17);
    expect(descriptor?.burg.name).toBe("Hetelethard");
    if (!descriptor) return;
    const share = shareFromDescriptor(descriptor);
    const document = createGridDocument({
      size: share.size,
      grid: share.grid,
      seed: share.gridSeed ?? share.seed,
      patchParams: share.patchParams,
      ...(share.descriptor ? descriptorFrameGridOptions(share.descriptor.frame) : {}),
      measureBlockSize: share.measureBlockSize
    });
    const settings = defaultGenerationSettings();
    settings.descriptor = share.descriptor;
    const city = generateCityOnDocument(document, settings, descriptor.burg.seed);
    expect(city, descriptor.burg.name).not.toBeNull();
    if (!city) return;
    expect(city.appearance).toBe("town");
    expect(city.frame.extentMeters).toBeGreaterThan(city.frame.settlementExtentMeters ?? city.frame.extentMeters);
    const svg = renderStandaloneCitySvg(city);
    const [vx, vy, vw, vh] = svg
      .getAttribute("viewBox")!
      .split(/[\s,]+/)
      .map(Number);
    // Imported fixed crossings draw the river in .ce-fixed-river-water (under scale(1,-1))
    // instead of the continuous data-water-area layer.
    const points = [...svg.querySelectorAll("[data-water-area], .ce-fixed-river-water [data-river-id]")].flatMap(
      node => {
        const flip = node.closest(".ce-fixed-river-water") ? -1 : 1;
        const values = (node.getAttribute("d") ?? "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        const out: [number, number][] = [];
        for (let i = 0; i + 1 < values.length; i += 2) out.push([values[i], values[i + 1] * flip]);
        return out;
      }
    );
    expect(points.length).toBeGreaterThan(1);
    const sx = points.reduce((sum, p) => sum + p[0], 0);
    const sy = points.reduce((sum, p) => sum + p[1], 0);
    const count = points.length;
    expect(sx / count).toBeLessThan(vx + vw / 2);
    expect(sy / count).toBeLessThan(vy + vh / 2);
  });
});
