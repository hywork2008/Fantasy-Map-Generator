import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import { renderEditorSvg } from "../render/svg";
import { featureGroupVertices } from "./features";
import input from "./fixtures/batonykut-20261010.json";
import { polygonOverlaps, townGates } from "./fortifications";
import { buildBlockFabric } from "./gen/blockInfill";
import { ferryLandingReserves, ferryPlan } from "./gen/ferryLanding";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { vertexHasCrossing } from "./passages";

// Batonykut: FMG's road to Balgar runs into a 708 m river no bridge spans.
// Every coarse vertex near its landing lay in the river, and the road used to
// stop ~100 m inland with no landing drawn.
describe("Batonykut (ferry landing on a regional river)", () => {
  const value = parseIncomingPayload(JSON.stringify(input))!;
  const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), input.seed)!;

  it("links every gate to a road", () => {
    expect(city).not.toBeNull();
    const gates = townGates(city);
    expect(gates.length).toBeGreaterThan(0);
    for (const gate of gates) expect(vertexHasCrossing(city, gate.vertexId, "wall", "road"), gate.id).toBe(true);
  }, 120000);

  it("runs the ferry road from the routed road to a landing on the bank", () => {
    const [ferry] = city.riverConnections ?? [];
    expect(ferry?.crossing.kind).toBe("ferry");
    const group = city.featureGroups.find(g => g.kind === "road" && g.sourceRoad?.index === ferry.sourceIndex)!;
    const outer = city.mesh.vertices[featureGroupVertices(city, group)[0]].point;
    expect(ferry.townRoad[0]).toEqual(outer);
    expect(ferry.townRoad.at(-1)).toEqual(ferry.banks[0]);
    const landing = ferry.banks[0];
    for (const mill of buildBlockFabric(city).watermills?.mills ?? [])
      for (const p of mill.millhousePolygon)
        expect(Math.hypot(p[0] - landing[0], p[1] - landing[1]), mill.id).toBeGreaterThan(20);
    const h = city.frame.extentMeters / 2;
    const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
    const svg = renderEditorSvg(city, "select", selection, `${-h} ${-h} ${2 * h} ${2 * h}`, 1);
    // Out and back: two crossings, and a towpath up this bank.
    expect(svg.querySelectorAll(".ce-ferry-route")).toHaveLength(2);
    expect(svg.querySelectorAll(".ce-ferry-tow")).toHaveLength(1);
    // The far bank is off the map, so only the town landing is drawn.
    expect(svg.querySelectorAll(".ce-ferry-landing")).toHaveLength(1);
    expect(svg.querySelectorAll(".ce-ferry-jetty")).toHaveLength(1);
  }, 120000);

  // Riverside works yield the landing: a bleaching field used to sit on it.
  // The headless export carries no economy, so attach the guilds that build
  // riverside yards.
  it("keeps riverside works off the ferry landing, and still builds them", () => {
    const chapter = (domain: string) => ({
      domain,
      status: "chapter",
      practitioners: 6,
      prestige: 0.6,
      foundedYear: 1204
    });
    const raw = structuredClone(input) as typeof input & { descriptor: { economy?: unknown } };
    raw.descriptor.economy = {
      version: 1,
      year: 1348,
      commerce: { rank: 0, marketCenter: false, merchantHouse: null, mint: false, caravanArrivalRank: 0 },
      guilds: ["textiles", "leather", "woodworking", "masonry"].map(chapter),
      storage: [],
      facilities: [],
      tradePartners: []
    };
    const guilded = parseIncomingPayload(JSON.stringify(raw))!;
    for (let i = 0; i < 6; i++) {
      const seed = String(Number(input.seed) + i);
      const town = generateCityOnDocument(cityEditorDocument(guilded), cityEditorSettings(guilded), seed);
      expect(town, seed).not.toBeNull();
      if (!town) continue;
      const reserves = ferryLandingReserves(town);
      // The landing and its towpath.
      expect(reserves.length, seed).toBe(2);
      const fabric = buildBlockFabric(town);
      const aerial = fabric.aerialLandmarks!;
      expect(
        aerial.guildYards.some(yard => yard.kind === "bleachingField"),
        seed
      ).toBe(true);
      const works = [
        ...aerial.guildYards.map(yard => [yard.id, yard.polygon] as const),
        ...aerial.storageYards.map(yard => [yard.id, yard.polygon] as const),
        ...aerial.tanneries.map(tannery => [tannery.id, tannery.yard] as const),
        ...(fabric.watermills?.mills ?? []).map(mill => [mill.id, mill.millhousePolygon] as const)
      ];
      for (const [id, polygon] of works)
        for (const reserve of reserves) expect(polygonOverlaps(polygon, reserve), `${seed} ${id}`).toBe(false);
    }
  }, 600000);

  // A ferry heads square across rather than against the current, drifts
  // downstream, and is hauled back up the bank (the mill shows the flow).
  it("crosses square to the flow and lands downstream on the return", () => {
    const connection = city.riverConnections![0];
    const plan = ferryPlan(city, connection)!;
    expect(plan).not.toBeNull();
    const flow = city.riverFlows![0];
    const [a, b] = [flow.points[0], flow.points.at(-1)!];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const down = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1];
    // Square to the flow, not along FMG's diagonal road.
    expect(Math.abs(dot(plan.across, down))).toBeLessThan(0.05);
    const [first, second] = plan.outbound;
    const leg = [second[0] - first[0], second[1] - first[1]];
    expect(dot(leg, plan.across) / Math.hypot(leg[0], leg[1])).toBeGreaterThan(0.95);
    // 0.22 m/s over ~708 m at 1 m/s carries the return boat ~150 m downstream.
    const [arrival, landing] = plan.townTow;
    const drift = dot([arrival[0] - landing[0], arrival[1] - landing[1]], down);
    expect(drift).toBeGreaterThan(100);
    expect(drift).toBeLessThan(200);
    expect(plan.inbound.at(-1)).toEqual(arrival);
    expect(plan.farInFrame).toBe(false);
  }, 120000);
});
