import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { occupancyRadiusMeters } from "../../utils/cultureLotOccupancy";
import { populationWindowMeters } from "../../utils/requiredSiteBounds";
import { serializeCitySvg } from "../renderers/standaloneSvg";
import { cityEditorDocument, cityEditorSettings, loadArchiveWorld } from "../services/analysis/housingReport";
import { parseDocument } from "../services/io/documentCodec";
import { shareFromDescriptor } from "../services/io/incomingCity";
import { buildBlockFabric } from "./blockInfill";
import { gapToLines } from "./defenseClearance";
import { generateCityOnDocument } from "./generation/generateCity";
import { FabricCache } from "./localInfill";
import { measureHousingCapacity } from "./residentialCapacity";
import { polylineArc } from "./urbanGrowth";

const archive = process.env.URBAN_GROWTH_ARCHIVE;
const out = process.env.URBAN_GROWTH_OUT;
describe.skipIf(!archive || !out)("Triviers morphology acceptance", () => {
  it("generates reproducible non-economic towns, capacity reports and before/after drawings", async () => {
    await loadArchiveWorld(archive!);
    const directory = resolve(out!);
    mkdirSync(directory, { recursive: true });
    const summaries = [];
    for (const id of (process.env.URBAN_GROWTH_BURGS ?? "1,2,8").split(",").map(Number)) {
      const descriptor = getBurgSiteDescriptor(id)!;
      const share = shareFromDescriptor(descriptor);
      const diagnostics: unknown[] = [];
      const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, sample =>
        diagnostics.push(sample)
      );
      writeFileSync(join(directory, `${id}-generation-diagnostics.json`), JSON.stringify(diagnostics, null, 2));
      expect(city, `${id}: generation`).not.toBeNull();
      const lots = buildBlockFabric(city!, new FabricCache()).buildings;
      const housing = measureHousingCapacity(city!, lots, descriptor.burg.dwellings);
      expect(housing.unplacedDwellings, `${id}: housing`).toBe(0);
      expect(housing.assignedOutside).toBeLessThanOrEqual(housing.outsideCap);
      expect(housing.assignedInside + housing.assignedOutside).toBe(descriptor.burg.dwellings);
      for (const building of lots) {
        if (
          city!.mesh.faces[building.faceId]?.properties.settlement !== "outskirts" ||
          city!.mesh.faces[building.faceId]?.properties.locked
        )
          continue;
        expect(building.growthRegionId).toBeTruthy();
        const r = city!.urbanGrowth!.regions.find(r => r.id === building.growthRegionId)!;
        expect(
          building.polygon.every(p => {
            const hit = polylineArc(p, r.points);
            return hit.s >= r.start && hit.s <= r.start + r.length && hit.distance <= r.halfWidth;
          })
        ).toBe(true);
        for (const wedge of city!.urbanGrowth!.openWedges)
          expect(gapToLines(building.polygon, [wedge.points])).toBeGreaterThanOrEqual(wedge.widthMeters / 2);
      }
      const reread = parseDocument(JSON.stringify(city));
      expect(reread).not.toBeNull();
      expect(buildBlockFabric(reread!, new FabricCache()).buildings).toEqual(lots);
      writeFileSync(join(directory, `${id}-after.ce.json`), JSON.stringify(city));
      writeFileSync(join(directory, `${id}-after.svg`), serializeCitySvg(city!));
      writeFileSync(
        join(directory, `${id}-profile.json`),
        JSON.stringify({ history: descriptor.urbanMorphology, plan: city!.urbanGrowth, capacity: housing }, null, 2)
      );
      summaries.push({ id, name: descriptor.burg.name, population: descriptor.burg.population, housing });
      if (id === 1) {
        const legacy = structuredClone(descriptor);
        delete legacy.urbanMorphology;
        delete legacy.economy;
        for (const road of legacy.roads) {
          delete road.traffic;
          delete road.trafficRank;
        }
        legacy.frame.cityRadiusMeters = occupancyRadiusMeters(
          legacy.burg.population,
          legacy.burg.lotOccupancy ?? 0.8,
          legacy.burg
        );
        legacy.frame.extentMeters = populationWindowMeters(legacy.frame.cityRadiusMeters);
        const oldShare = shareFromDescriptor(legacy);
        const before = generateCityOnDocument(
          cityEditorDocument(oldShare),
          cityEditorSettings(oldShare),
          oldShare.seed
        );
        expect(before).not.toBeNull();
        writeFileSync(join(directory, "1-before.svg"), serializeCitySvg(before!));
        writeFileSync(join(directory, "1-before.ce.json"), JSON.stringify(before));
      }
    }
    writeFileSync(join(directory, "summary.json"), JSON.stringify({ archive: resolve(archive!), summaries }, null, 2));
  }, 300_000);
});
