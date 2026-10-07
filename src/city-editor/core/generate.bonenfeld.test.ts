import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { worldContext } from "../../context/worldContext";
import { decodeAndValidateWorldArchive } from "../../runtime/worldArchive";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { shareFromDescriptor } from "../io/incomingCity";
import { renderStandaloneCitySvg } from "../render/svg";
import { bridgeDecks, clipPolylineOutsideRivers, riverRibbons } from "./bridgeDeck";
import { createGridDocument } from "./document";
import { featureGroupVertices } from "./features";
import { nearestOnPolyline } from "./gen/geom";
import type { BurgSiteDescriptor } from "./gen/site/burgSiteDescriptor";
import bonenfeldSite from "./gen/site/fixtures/bonenfeld.json";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";
import { validate } from "./mesh";

const fmgPath = resolve(process.cwd(), "temp/Alyatland 2026-09-28-02-26.fmg");
const sources = existsSync(fmgPath) ? ["fixture", "archive"] : ["fixture"];

describe("Bonenfeld wide-river generation", () => {
  it.each(sources)("connects both far-bank FMG roads through a short perpendicular bridge (%s)", async source => {
    let descriptor = structuredClone(bonenfeldSite) as BurgSiteDescriptor;
    // The fixture predates historicalPeriod; its 402 m river needs a period whose
    // routine crossing allowance (bridgeCrossingPolicy) reaches it to stay bridged.
    descriptor.historicalPeriod = "highMedieval";
    if (source === "archive") {
      const buffer = readFileSync(fmgPath);
      const blob = new Blob([buffer]);
      const header = new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(4, buffer.byteLength));

      const validated = await decodeAndValidateWorldArchive({ blob, header });
      Object.assign(worldContext, validated.document.world);
      const { bindSimulationBurgState } = await import("../../runtime/simulationBurgState");
      bindSimulationBurgState(worldContext, validated.document.simulation);

      const pack = worldContext.pack;
      const bonenfeld = pack.burgs.find((b: any) => b && b.name === "Bonenfeld");
      expect(bonenfeld).toBeDefined();

      // Verify Bonenfeld's true simulated population is loaded (~13,046)
      expect(Math.round(bonenfeld.population * 1000)).toBe(13046);

      descriptor = getBurgSiteDescriptor(bonenfeld.i)!;
    }
    expect(descriptor).toBeDefined();
    expect(descriptor.burg.population).toBe(13046);
    expect(descriptor.suggestedArchetype).toBe("riverCrossing");

    const share = shareFromDescriptor(descriptor);
    const gridDoc = createGridDocument({
      size: share.size,
      grid: share.grid,
      seed: share.gridSeed ?? share.seed,
      hexSizeMeters: share.hexSizeMeters,
      extentMeters: descriptor.frame.extentMeters,
      cityRadiusMeters: descriptor.frame.cityRadiusMeters
    });

    const settings = {
      ...defaultGenerationSettings(),
      descriptor
    };
    const city = generateCityOnDocument(gridDoc, settings, descriptor.burg.seed);
    if (city && process.env.CE_BONENFELD_EXPORT)
      writeFileSync(process.env.CE_BONENFELD_EXPORT, renderStandaloneCitySvg(city).outerHTML);
    const riverRoad1 = city!.featureGroups.find(g => g.id === "gc:riverRoad-0-1")!;
    expect(riverRoad1).toBeDefined();
    expect(riverRoad1.beyond?.realm.relation).toBe("domestic");
    expect(riverRoad1.beyond?.settlement.name).toBe("Senau");

    const riverRoad2 = city!.featureGroups.find(g => g.id === "gc:riverRoad-0-2")!;
    expect(riverRoad2).toBeDefined();
    expect(riverRoad2.beyond?.realm.relation).toBe("domestic");
    expect(riverRoad2.beyond?.settlement.name).toBe("Schosin");
    expect(riverRoad2.beyond?.settlement.role).toBe("fortress");
    expect(city?.appearance).toBe("town");
    expect(city?.generationSeed).toBe(descriptor.burg.seed);
    expect(validate(city!)).toEqual([]);
    const bridge = city!.featureGroups.find(g => g.id === "gc:bridgeApproach-0")!;
    const points = featureGroupVertices(city!, bridge).map(id => city!.mesh.vertices[id].point);
    const deck = bridgeDecks(city!).find(deck => deck.groupId === "gc:bridge-0")!;
    expect(deck).toBeDefined();
    const river = city!.featureGroups.find(g => g.kind === "river")!;
    expect(Math.hypot(deck.points[1][0] - deck.points[0][0], deck.points[1][1] - deck.points[0][1])).toBeLessThan(
      river.style.widthMeters * 1.2
    );
    // The bank approaches and the rendered deck must describe the same normal.
    for (const point of points) {
      const [a, b] = deck.points;
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      expect(Math.abs(dx * (point[1] - a[1]) - dy * (point[0] - a[0])) / Math.hypot(dx, dy)).toBeLessThan(1);
    }
    const runs = clipPolylineOutsideRivers(points, riverRibbons(city!));
    expect(runs).toHaveLength(2);
    for (const end of [runs[0].at(-1)!, runs[1][0]]) expect(nearestOnPolyline(end, deck.points).dist).toBeLessThan(1);
    // Both far-bank FMG routes use the complete normal span in order.
    const crossingRoads = city!.featureGroups.filter(g => g.id.startsWith("gc:riverRoad-0-"));
    expect(crossingRoads).toHaveLength(2);
    for (const road of crossingRoads) {
      const vertices = featureGroupVertices(city!, road);
      const bridgeVertices = featureGroupVertices(city!, bridge);
      expect(vertices).toContain(bridgeVertices[0]);
      expect(vertices).toContain(bridgeVertices.at(-1));
      expect(new Set(vertices).size).toBe(vertices.length);
      const joined = vertices.join(",");
      expect(
        joined.includes(bridgeVertices.join(",")) || joined.includes(bridgeVertices.slice().reverse().join(","))
      ).toBe(true);
      const far = city!.mesh.vertices[vertices[0]].point;
      expect(Math.max(Math.abs(far[0]), Math.abs(far[1]))).toBeCloseTo(descriptor.frame.extentMeters / 2);
    }
  });
});
