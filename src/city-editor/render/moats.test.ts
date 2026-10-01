import { describe, expect, it } from "vitest";
import { createSizedDocument, parseDocument } from "../core/document";
import { boundaryEdges, validateFortifications } from "../core/fortifications";
import { defaultGenerationSettings, generateGateStep } from "../core/generate";
import { meshFromCells } from "../core/mesh";
import type { CityDocument } from "../core/types";
import { renderMoats, serializeCitySvg } from "./svg";

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
