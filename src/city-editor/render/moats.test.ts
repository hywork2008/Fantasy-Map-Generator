import { describe, expect, it } from "vitest";
import { createSizedDocument, parseDocument } from "../core/document";
import { boundaryEdges, validateFortifications } from "../core/fortifications";
import { defaultGenerationSettings, generateGateStep } from "../core/generate";
import { meshFromCells } from "../core/mesh";
import type { CityDocument } from "../core/types";
import { renderMoats, renderStandaloneCitySvg, serializeCitySvg } from "./svg";

function fixture(): CityDocument {
  const mesh = meshFromCells([
    {
      id: 0,
      polygon: [
        [-40, -40],
        [40, -40],
        [40, 40],
        [-40, 40]
      ],
      site: [0, 0],
      centroid: [0, 0],
      neighbors: [],
      onBorder: true
    }
  ]);
  const segments = boundaryEdges(mesh, ["f0"]);
  return {
    format: "fmg-city-editor",
    version: 2,
    appearance: "town",
    mesh,
    frame: { extentMeters: 200, cityRadiusMeters: 40, blockSizeMeters: 50 },
    featureGroups: [
      {
        id: "wall",
        kind: "wall",
        name: "Curtain",
        segments,
        style: { widthMeters: 4, color: "#292a26" },
        locked: false
      }
    ],
    defenseCircuits: [
      {
        id: "town",
        scope: "town",
        areaFaceIds: ["f0"],
        wallGroupIds: ["wall"],
        naturalBarriers: [],
        locked: false,
        moat: { enabled: true, widthMeters: 12 }
      }
    ],
    gates: [{ id: "gate", vertexId: mesh.edges[segments[0].edgeId].a, locked: false, passageWidthMeters: 8 }],
    elements: []
  };
}

describe("exterior moats", () => {
  it("masks the enclosed faces, keeps the curtain continuous at gates, and adds a bridge", () => {
    const doc = fixture();
    const layer = renderMoats(doc);
    expect(layer.querySelector("mask path")?.getAttribute("fill")).toBe("black");
    expect(layer.querySelectorAll(".ce-moat-water")).toHaveLength(1);
    expect(layer.querySelector(".ce-moat-water")?.getAttribute("stroke-width")).toBe("28");
    expect(layer.querySelectorAll(".ce-moat-bridge")).toHaveLength(1);
    expect(Object.values(doc.mesh.faces).every(f => f.properties.water === "land")).toBe(true);
  });

  it("draws a lowered timber drawbridge and keeps only the interior town gate plaza", () => {
    const doc = fixture();
    const svg = renderStandaloneCitySvg(doc);
    expect(svg.querySelectorAll(".ce-drawbridge")).toHaveLength(1);
    expect(svg.querySelectorAll(".ce-drawbridge-chain")).toHaveLength(2);
    expect(svg.querySelectorAll(".ce-drawbridge-hinge")).toHaveLength(1);
    expect(svg.querySelectorAll(".ce-drawbridge-plank").length).toBeGreaterThan(2);
    const plazas = svg.querySelectorAll(".ce-gate-plaza");
    expect(plazas).toHaveLength(1);
    expect(plazas[0].getAttribute("d")).toContain(" 0 0 0 ");
    doc.defenseCircuits![0].moat!.enabled = false;
    const dry = renderStandaloneCitySvg(doc);
    expect(dry.querySelectorAll(".ce-drawbridge")).toHaveLength(0);
    expect(dry.querySelectorAll(".ce-gate-plaza")).toHaveLength(2);
  });

  it("starts the lifting leaf at the gate centre with four metres beyond the gate and a fixed far-bank bridge", () => {
    const bridge = renderStandaloneCitySvg(fixture()).querySelector(".ce-drawbridge")!;
    const points = (selector: string) => {
      const coordinates = bridge
        .querySelector(selector)!
        .getAttribute("d")!
        .split(/[ML ,]+/)
        .filter(Boolean)
        .map(Number);
      return Array.from({ length: coordinates.length / 2 }, (_, i) => [coordinates[i * 2], coordinates[i * 2 + 1]]);
    };
    const leaf = points(".ce-drawbridge-deck");
    const fixed = points(".ce-moat-fixed-bridge-deck");
    const length = (p: number[][]) =>
      p.slice(1).reduce((sum, q, i) => sum + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
    expect(length(leaf)).toBeCloseTo(6, 8);
    expect(length(fixed)).toBeGreaterThan(6);
    expect(fixed[0]).toEqual(leaf.at(-1));
    for (const chain of bridge.querySelectorAll(".ce-drawbridge-chain")) {
      const coordinates = chain
        .getAttribute("d")!
        .split(/[ML ,]+/)
        .filter(Boolean)
        .map(Number);
      expect(Math.hypot(coordinates[2] - coordinates[0], coordinates[3] - coordinates[1])).toBeLessThan(7);
    }
  });

  it("aligns the road drawbridge hinge with the gate even for an incoming road", () => {
    const doc = fixture();
    const gate = doc.mesh.vertices[doc.gates[0].vertexId];
    const far: [number, number] = [gate.point[0] * 2, gate.point[1] * 2];
    doc.mesh.vertices.outside = { id: "outside", point: far, locked: false };
    doc.mesh.edges.approach = {
      id: "approach",
      a: "outside",
      b: gate.id,
      leftFace: null,
      rightFace: null,
      locked: false
    };
    doc.featureGroups.push({
      id: "approach",
      kind: "road",
      name: "Approach",
      segments: [{ edgeId: "approach", forward: true }],
      style: { widthMeters: 8, color: "black" },
      locked: false
    });
    const svg = renderStandaloneCitySvg(doc);
    const bridge = svg.querySelector(".ce-moat-road-bridge.ce-drawbridge");
    expect(bridge?.getAttribute("data-gate-id")).toBe(doc.gates[0].id);
    const d = bridge?.querySelector(".ce-drawbridge-deck")?.getAttribute("d") ?? "";
    const coordinates = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(coordinates[0]).toBeCloseTo(gate.point[0]);
    expect(coordinates[1]).toBeCloseTo(-gate.point[1]);
    expect(svg.querySelectorAll(".ce-drawbridge")).toHaveLength(1);
  });

  it("draws a citadel moat with a lifting leaf and a fixed far-bank bridge", () => {
    const doc = fixture();
    doc.defenseCircuits![0].scope = "castle";
    doc.defenseCircuits![0].ownerCastleId = "castle";
    doc.gates[0].ownerCastleId = "castle";
    const svg = renderStandaloneCitySvg(doc);
    expect(svg.querySelectorAll(".ce-moat-bridge")).toHaveLength(1);
    expect(svg.querySelectorAll(".ce-drawbridge")).toHaveLength(1);
    expect(svg.querySelectorAll(".ce-moat-fixed-bridge-deck")).toHaveLength(1);
    expect(svg.querySelectorAll(".ce-drawbridge-chain")).toHaveLength(2);
  });

  it("supports castle moats independently and draws a shared curtain only once", () => {
    const doc = fixture();
    doc.defenseCircuits!.push({
      ...doc.defenseCircuits![0],
      id: "castle",
      scope: "castle",
      ownerCastleId: "castle-owner",
      moat: { enabled: true, widthMeters: 8 }
    });
    expect(renderMoats(doc).querySelectorAll(".ce-moat-water")).toHaveLength(1);
    doc.defenseCircuits![0].moat!.enabled = false;
    const layer = renderMoats(doc);
    expect(layer.querySelector(".ce-moat-water")?.getAttribute("stroke-width")).toBe("20");
    expect(layer.querySelector(".ce-moat-water")?.parentElement?.getAttribute("data-circuit")).toBe("castle");
    doc.defenseCircuits![1].moat!.enabled = false;
    expect(renderMoats(doc).querySelectorAll(".ce-moat-water")).toHaveLength(0);
  });

  it("saves moat settings, exports standalone SVG, and rejects invalid widths", () => {
    const doc = fixture();
    const imported = parseDocument(JSON.stringify(doc));
    expect(imported?.defenseCircuits?.[0].moat).toEqual({ enabled: true, widthMeters: 12 });
    expect(serializeCitySvg(doc)).toContain("ce-moat-water");
    doc.defenseCircuits![0].moat!.widthMeters = -1;
    expect(validateFortifications(doc)).toContain("Invalid moat town");
  });

  it("applies the selected moat options at the wall generation stage", () => {
    const settings = defaultGenerationSettings();
    settings.config.features.walls = true;
    settings.config.features.citadel = true;
    settings.moats = { town: true, castle: true };
    const result = generateGateStep(createSizedDocument("tiny", "conceal-wall"), settings, "conceal-wall", -1);
    expect(result.document).not.toBeNull();
    expect(result.document?.defenseCircuits?.find(c => c.scope === "town")?.moat?.enabled).toBe(true);
    expect(result.document?.defenseCircuits?.find(c => c.scope === "castle")?.moat?.enabled).toBe(true);
  });
});
