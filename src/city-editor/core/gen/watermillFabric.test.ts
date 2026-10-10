import { describe, expect, it } from "vitest";
import { renderEditorSvg } from "../../render/svg";
import { createDocument } from "../document";
import { polygonOverlaps } from "../fortifications";
import type { CityDocument, Id, Point, RiverGroup } from "../types";
import { polygonArea } from "./geom";
import type { BurgSiteEconomy } from "./site/burgSiteEconomy";
import { buildWatermillPlan, calculateWatermillCount } from "./watermillFabric";

/**
 * Creates a test document with a central flowing river.
 */
function createRiverDocument(extentMeters = 600): CityDocument {
  const doc = createDocument("watermill-test", extentMeters);

  // Find vertices running across the map from north to south
  const half = extentMeters / 2;
  const riverVertices: Id[] = [];

  // Pick vertices roughly along x ≈ 0 from north (y > 0) to south (y < 0)
  const sortedVertices = Object.values(doc.mesh.vertices).sort((a, b) => b.point[1] - a.point[1]);

  let currentY = half * 0.8;
  for (const v of sortedVertices) {
    if (Math.abs(v.point[0]) < 60 && v.point[1] <= currentY) {
      riverVertices.push(v.id);
      currentY = v.point[1] - 40;
      if (currentY < -half * 0.8) break;
    }
  }

  // Ensure all faces are land faces
  for (const face of Object.values(doc.mesh.faces)) {
    face.properties.water = "land";
    face.properties.ward = "craftsmen";
    face.properties.buildable = true;
  }

  const riverGroup: RiverGroup = {
    id: "river-0",
    kind: "river",
    name: "Test River",
    vertices: riverVertices,
    source: { vertexId: riverVertices[0], kind: "mapBoundary" },
    mouth: { vertexId: riverVertices[riverVertices.length - 1], kind: "mapBoundary" },
    style: { widthMeters: 14, color: "#4d6b7b" },
    locked: false
  };

  doc.featureGroups.push(riverGroup);
  return doc;
}

describe("watermillFabric", () => {
  it("reserves a riverside mill site without covering an existing alley", () => {
    const doc = createRiverDocument();
    const original = buildWatermillPlan(doc, 500);
    expect(original.mills.length).toBeGreaterThan(0);
    const house = original.mills[0].millhousePolygon;
    const center: Point = [
      house.reduce((sum, p) => sum + p[0], 0) / house.length,
      house.reduce((sum, p) => sum + p[1], 0) / house.length
    ];
    const alley = {
      points: [
        [center[0] - 12, center[1]],
        [center[0] + 12, center[1]]
      ] as Point[],
      widthMeters: 3
    };
    const plan = buildWatermillPlan(doc, 500, "watermill-fabric", [alley]);
    expect(plan.mills.length).toBeGreaterThan(0);
    expect(
      plan.mills.every(
        mill =>
          !polygonOverlaps(mill.millhousePolygon, [
            [center[0] - 12, center[1] - 1.5],
            [center[0] + 12, center[1] - 1.5],
            [center[0] + 12, center[1] + 1.5],
            [center[0] - 12, center[1] + 1.5]
          ])
      )
    ).toBe(true);
  });

  it("does not place a millhouse over a cultivated field", () => {
    const doc = createRiverDocument();
    const first = buildWatermillPlan(doc, 500).mills[0];
    expect(first).toBeDefined();
    const field = first.millhousePolygon.map(([x, y]) => [x, y] as Point);
    const plan = buildWatermillPlan(doc, 500, "watermill-fabric", [], [field]);
    expect(plan.mills.every(mill => !polygonOverlaps(mill.millhousePolygon, field))).toBe(true);
  });
  describe("calculateWatermillCount", () => {
    it("returns 0 for zero or negative buildings", () => {
      expect(calculateWatermillCount(0)).toBe(0);
      expect(calculateWatermillCount(-10)).toBe(0);
    });

    it("scales appropriately with derived population", () => {
      // 30 buildings (~135 pop) -> 1 mill
      expect(calculateWatermillCount(30)).toBe(1);

      // 100 buildings (~450 pop) -> 2 mills
      expect(calculateWatermillCount(100)).toBe(2);

      // 250 buildings (~1,125 pop) -> 3 mills
      expect(calculateWatermillCount(250)).toBe(3);

      // 500 buildings (~2,250 pop) -> 4 mills
      expect(calculateWatermillCount(500)).toBe(4);

      // 1000 buildings (~4,500 pop) -> 6 mills
      expect(calculateWatermillCount(1000)).toBe(6);

      // 2000 buildings (~9,000 pop) -> 8 mills
      expect(calculateWatermillCount(2000)).toBe(8);

      // 3000 buildings (~13,500 pop) -> 10 mills
      expect(calculateWatermillCount(3000)).toBe(10);

      // 4000 buildings (~18,000 pop) -> 10+ mills (capped at 15)
      expect(calculateWatermillCount(4000)).toBeGreaterThanOrEqual(10);
      expect(calculateWatermillCount(4000)).toBeLessThanOrEqual(15);
    });
  });

  describe("buildWatermillPlan", () => {
    it("produces 0 watermills when there are no rivers in the city", () => {
      const doc = createDocument("no-river-test", 400);
      // document has no river groups
      const plan = buildWatermillPlan(doc, 500);
      expect(plan.mills.length).toBe(0);
      expect(plan.buildingCount).toBe(500);
      expect(plan.derivedPopulation).toBe(2250);
    });

    it("uses the profile water count instead of the population bands", () => {
      const doc = createRiverDocument(800);
      const economy: BurgSiteEconomy = {
        version: 1,
        year: 1350,
        commerce: { rank: 0, marketCenter: false, merchantHouse: null, mint: false, caravanArrivalRank: 0 },
        guilds: [],
        storage: [],
        facilities: [],
        tradePartners: [],
        mills: { wind: 0, water: 1 }
      };
      doc.siteEconomy = economy;
      const plan = buildWatermillPlan(doc, 400);
      expect(calculateWatermillCount(400)).toBe(4);
      expect(plan.mills).toHaveLength(1);
      expect(plan.mills[0].kind).toBe("gristmill");
    });

    it("places watermills along rivers with millhouses and waterwheels", () => {
      const doc = createRiverDocument(800);
      const buildingCount = 400; // pop ~ 1,800 -> 4 mills
      const plan = buildWatermillPlan(doc, buildingCount);

      expect(plan.mills.length).toBeGreaterThanOrEqual(2);
      expect(plan.buildingCount).toBe(buildingCount);
      expect(plan.derivedPopulation).toBe(1800);

      for (const mill of plan.mills) {
        expect(mill.id).toMatch(/^watermill-\d+$/);
        expect(mill.name).toContain("Watermill");
        expect(["left", "right"]).toContain(mill.bankSide);

        // Millhouse footprint check
        expect(mill.millhousePolygon.length).toBe(4);
        const houseArea = Math.abs(polygonArea(mill.millhousePolygon));
        expect(houseArea).toBeGreaterThan(30);
        expect(houseArea).toBeLessThan(100);

        // Ridge line check
        expect(mill.millhouseRidge.length).toBe(2);

        // Roof slopes
        expect(mill.riverSideRoof.length).toBe(4);
        expect(mill.landSideRoof.length).toBe(4);

        // Waterwheel check
        expect(mill.wheel.radius).toBeGreaterThan(1.5);
        expect(mill.wheel.radius).toBeLessThan(3.0);
        expect(mill.wheel.width).toBeGreaterThan(1.0);
        expect(mill.wheel.bladeCount).toBeGreaterThanOrEqual(6);
        expect(Number.isFinite(mill.wheel.angleRad)).toBe(true);

        // Weir check (if generated)
        if (mill.weir) {
          expect(mill.weir.points.length).toBe(2);
          expect(mill.weir.crestWidth).toBeGreaterThan(1.0);
          expect(mill.weir.foamPoints.length).toBe(2);
        }

        // Wake check
        expect(mill.wakePolyline.length).toBe(2);
      }
    });

    it("maintains spacing between consecutive watermills", () => {
      const doc = createRiverDocument(1200);
      const plan = buildWatermillPlan(doc, 1500); // multiple mills
      expect(plan.mills.length).toBeGreaterThanOrEqual(3);

      for (let i = 0; i < plan.mills.length; i++) {
        for (let j = i + 1; j < plan.mills.length; j++) {
          const ptA = plan.mills[i].wheel.center;
          const ptB = plan.mills[j].wheel.center;
          const dist = Math.hypot(ptA[0] - ptB[0], ptA[1] - ptB[1]);
          expect(dist).toBeGreaterThanOrEqual(30);
        }
      }
    });

    it("identifies bridge mills when a bridge crosses the river", () => {
      const doc = createRiverDocument(800);
      const river = doc.featureGroups.find(g => g.kind === "river")!;
      const midVertexId = river.vertices[Math.floor(river.vertices.length / 2)];
      const midPt = doc.mesh.vertices[midVertexId].point;

      // Add a bridge road crossing
      const bridgeEdgeId = Object.keys(doc.mesh.edges)[0];
      doc.featureGroups.push({
        id: "gc:bridge-0",
        kind: "road",
        name: "Old Stone Bridge",
        segments: [{ edgeId: bridgeEdgeId, forward: true }],
        style: { widthMeters: 6, color: "#d5cfbf" },
        locked: false
      });
      // Attach bridge edge vertices near midPt
      const edge = doc.mesh.edges[bridgeEdgeId];
      if (edge && doc.mesh.vertices[edge.a] && doc.mesh.vertices[edge.b]) {
        doc.mesh.vertices[edge.a].point = [midPt[0] - 15, midPt[1]];
        doc.mesh.vertices[edge.b].point = [midPt[0] + 15, midPt[1]];
      }

      const plan = buildWatermillPlan(doc, 600);
      expect(plan.mills.length).toBeGreaterThan(0);
      // At least one mill should benefit from bridge mill proximity scoring
      const bridgeMill = plan.mills.find(m => m.isBridgeMill);
      expect(bridgeMill).toBeDefined();
    });
  });

  describe("renderEditorSvg with watermills", () => {
    it("renders millhouses, waterwheels, and weirs in town SVG view", () => {
      const doc = createRiverDocument(800);
      doc.appearance = "town";

      const svg = renderEditorSvg(
        doc,
        "select",
        {
          faceId: null,
          edgeId: null,
          vertexId: null,
          groupId: null
        },
        "-400 -400 800 800",
        1
      );

      const watermillsLayer = svg.querySelector(".ce-watermills");
      expect(watermillsLayer).not.toBeNull();

      const millhouses = svg.querySelectorAll(".ce-millhouse-group");
      expect(millhouses.length).toBeGreaterThanOrEqual(1);

      const waterwheels = svg.querySelectorAll(".ce-waterwheel-unit");
      expect(waterwheels.length).toBeGreaterThanOrEqual(1);

      // Verify pick info
      const firstMill = millhouses[0];
      const pickAttr = firstMill.getAttribute("data-pick");
      expect(pickAttr).not.toBeNull();
      const pickData = JSON.parse(decodeURIComponent(pickAttr!));
      expect(pickData.layer).toBe("buildings");
      expect(pickData.kind).toBe("watermill");
      expect(pickData.label).toContain("水車");
    });
  });
});
