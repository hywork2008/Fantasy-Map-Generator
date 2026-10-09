import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { worldContext } from "../../context/worldContext";
import { decodeAndValidateWorldArchive } from "../../runtime/worldArchive";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { shareFromDescriptor } from "../io/incomingCity";
import { renderStandaloneCitySvg } from "../render/svg";
import { bridgeDecks, clipPolylineOutsideRivers, documentBridgeSkewLimit, riverRibbons } from "./bridgeDeck";
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
  it.each(sources)("preserves the current Bonenfeld site and its road handoff (%s)", async source => {
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
    expect(descriptor.suggestedArchetype).toBe(source === "archive" ? "crossroads" : "riverCrossing");

    if (source === "archive") {
      // Current FMG preserves the true river offset instead of snapping this
      // off-site river to the burg bank. It is a crossroads, not a crossing fixture.
      expect(descriptor.rivers[0].crossesSite).toBe(false);
      expect(descriptor.rivers[0].offsetMeters).toBeGreaterThan(descriptor.frame.extentMeters / 2);
      expect(shareFromDescriptor(descriptor).descriptor).toEqual(descriptor);
      return;
    }

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
    expect(city).not.toBeNull();
    for (const name of ["Senau", "Schosin"]) {
      const road = city!.featureGroups.find(g => g.beyond?.settlement.name === name);
      expect(road).toBeDefined();
      expect(road!.beyond?.realm.relation).toBe("domestic");
    }
    expect(city?.appearance).toBe("town");
    expect(city?.generationSeed).toBe(`${descriptor.burg.seed}:junction-retry:3`);
    expect(validate(city!)).toEqual([]);
    const bridge = city!.featureGroups.find(g => g.id === "gc:bridgeApproach-0")!;
    const points = featureGroupVertices(city!, bridge).map(id => city!.mesh.vertices[id].point);
    const deck = bridgeDecks(city!).find(deck => deck.groupId === "gc:bridge-0")!;
    expect(deck).toBeDefined();
    const river = city!.featureGroups.find(g => g.kind === "river")!;
    expect(Math.hypot(deck.points[1][0] - deck.points[0][0], deck.points[1][1] - deck.points[0][1])).toBeLessThan(
      river.style.widthMeters * 1.2
    );
    // The span itself must meet the shared skew policy; bank approaches may bend.
    expect(deck.skewDegrees).toBeLessThanOrEqual(documentBridgeSkewLimit(city!));
    expect(deck.skewDegrees).toBeLessThanOrEqual(10);
    const runs = clipPolylineOutsideRivers(points, riverRibbons(city!));
    expect(runs).toHaveLength(2);
    for (const end of [runs[0].at(-1)!, runs[1][0]])
      expect(nearestOnPolyline(end, deck.points).dist).toBeLessThan(bridge.style.widthMeters / 2);
    const sourceRoads = city!.featureGroups.filter(g => g.kind === "road" && g.sourceRoad);
    expect(sourceRoads).toHaveLength(descriptor.roads.length);
    expect(sourceRoads.map(g => (g.kind === "road" ? g.sourceRoad!.index : -1)).sort()).toEqual(
      descriptor.roads.map((_, index) => index)
    );
    for (const road of sourceRoads) {
      const vertices = featureGroupVertices(city!, road);
      expect(vertices.length).toBeGreaterThan(1);
      expect(new Set(vertices).size).toBe(vertices.length);
    }
  });
});
