import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import { featureGroupVertices } from "./features";
import input from "./fixtures/fontaliano-20261009.json";
import { frameRoadTownConnection } from "./frameRoadConnection";
import { frameRoadLegs } from "./frameRoads";
import { generateStageOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";

// Fontaliano: FMG trail 67 leaves the south gate and crosses a 633 m river on
// a bridge whose far bank lies beyond the frame. The town square cuts through
// the channel, so the exterior leg starts at the bank inside the mesh.
describe("Fontaliano (south road onto a wide-river bridge)", () => {
  const value = parseIncomingPayload(JSON.stringify(input))!;

  it("adds no bank road that FMG never had", () => {
    const leg = frameRoadLegs(value.descriptor!, "beyond-mesh").find(l => l.routeId === 67)!;
    // Approach, then the bridge: nothing continues along the near bank.
    expect(leg.pieces.map(p => p.kind)).toEqual(["road", "bridge"]);
  });

  it("connects the south street to the bridge foot by stage ⑧", () => {
    const city = generateStageOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed, 8)!;
    const leg = city.frameRoads!.find(l => l.routeId === 67)!;
    const foot = leg.pieces[0].points.at(-1)!;
    expect(leg.pieces[1].kind).toBe("bridge");
    expect(frameRoadTownConnection(city, leg)).not.toBeNull();
    const street = city.featureGroups.find(g => g.kind === "road" && g.sourceRoad?.index === leg.sourceIndex)!;
    const gap = Math.min(
      ...featureGroupVertices(city, street).map(id => {
        const p = city.mesh.vertices[id].point;
        return Math.hypot(p[0] - foot[0], p[1] - foot[1]);
      })
    );
    expect(gap).toBeLessThan(8);
  });
});
