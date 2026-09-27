import { describe, expect, it } from "vitest";
import { createGridDocument } from "../document";
import { featureGroupVertices } from "../features";
import { defaultGenerationSettings, generateCityOnDocument } from "../generate";
import type { CityDocument, Id, Point } from "../types";

function riverVertices(document: CityDocument): Set<Id> {
  const ids = new Set<Id>();
  for (const group of document.featureGroups) if (group.kind === "river") for (const id of group.vertices) ids.add(id);
  return ids;
}

/** Degrees away from a right angle with the river tangent. 0 is perpendicular. */
function offPerpendicular(origin: Point, arm: Point, tangent: Point): number {
  const vx = arm[0] - origin[0];
  const vy = arm[1] - origin[1];
  const len = Math.hypot(vx, vy) || 1;
  const along = Math.abs(vx * tangent[0] + vy * tangent[1]) / len;
  const across = Math.abs(-tangent[1] * vx + tangent[0] * vy) / len;
  return (Math.atan2(along, across) * 180) / Math.PI;
}

describe("river crossings", () => {
  it("keeps gc:road-2 square to the river and off the next river vertex", () => {
    const document = createGridDocument({
      size: "tiny",
      grid: "evolution",
      seed: "17am4q7",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = defaultGenerationSettings();
    settings.config = {
      ...settings.config,
      coast: "none",
      rivers: ["through"],
      relief: false,
      features: { walls: true, plaza: true, temple: true, citadel: false, port: false, shanty: true },
      wall: { envelope: "auto", coast: "auto", line: "auto" },
      layout: "organic"
    };
    settings.layout = "organic";
    settings.walledAreaShare = 1;
    settings.streets = { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true };
    const city = generateCityOnDocument(document, settings, "fkuk32:junction-retry:1");
    expect(city).not.toBeNull();
    if (!city) return;
    const rivers = riverVertices(city);
    for (const group of city.featureGroups) {
      if (group.kind !== "road") continue;
      const vertices = featureGroupVertices(city, group);
      for (let i = 1; i < vertices.length; i++) {
        expect(
          rivers.has(vertices[i - 1]) && rivers.has(vertices[i]),
          `${group.id} ${vertices[i - 1]}→${vertices[i]}`
        ).toBe(false);
      }
    }
    const road = city.featureGroups.find(group => group.id === "gc:road-2");
    const river = city.featureGroups.find(group => group.id === "gc:river-0");
    expect(road?.kind).toBe("road");
    expect(river?.kind).toBe("river");
    if (road?.kind !== "road" || river?.kind !== "river") return;
    const roadVertices = featureGroupVertices(city, road);
    const channel = featureGroupVertices(city, river);
    const mid = roadVertices.find(id => rivers.has(id));
    expect(mid).toBeTruthy();
    if (!mid) return;
    const index = channel.indexOf(mid);
    const prev = city.mesh.vertices[channel[index - 1]].point;
    const next = city.mesh.vertices[channel[index + 1]].point;
    const origin = city.mesh.vertices[mid].point;
    const unit = (point: Point): Point => {
      const len = Math.hypot(point[0], point[1]) || 1;
      return [point[0] / len, point[1] / len];
    };
    const backward = unit([origin[0] - prev[0], origin[1] - prev[1]]);
    const forward = unit([next[0] - origin[0], next[1] - origin[1]]);
    const tx = backward[0] + forward[0];
    const ty = backward[1] + forward[1];
    const span = Math.hypot(tx, ty) || 1;
    const tangent: Point = [tx / span, ty / span];
    const at = roadVertices.indexOf(mid);
    for (const id of [roadVertices[at - 1], roadVertices[at + 1]]) {
      expect(rivers.has(id), id).toBe(false);
      expect(offPerpendicular(origin, city.mesh.vertices[id].point, tangent)).toBeLessThan(12);
    }
  });
});
