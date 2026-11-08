import type * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { polygonCentroid } from "../../generators/geom";
import { fabricHouseInfo } from "../../generators/vector/fabric/houses";
import { syntheticVectorInput } from "../../generators/vector/generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../generators/vector/generation/urban";
import { renderVectorDocument } from "../../renderers/vector/documentSvg";
import { vectorPickHouse } from "../../renderers/vector/picking";
import { vectorRenderData } from "../../renderers/vector/renderData";
import { createVectorScene } from "../../renderers/vector/scene3d";
import { EditorLifetime } from "../../services/editorLifetime";
import { createVectorFabricHousePanel } from "./VectorFabricHousePanel";
import { createVectorWorkbench } from "./VectorWorkbench";

const doc = generateVectorUrban(
  generateVectorSkeleton(syntheticVectorInput("m5", 100, false), { ...DEFAULT_VECTOR_GENERATION, branches: 4 })
    .document,
  { ...DEFAULT_VECTOR_URBAN, mode: "medieval", population: 90, maxLanes: 4 }
);
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("generated houses drawn and selected from fabric records", () => {
  it("draws one 2D path per street block and batched 3D meshes that map back to every house", () => {
    const before = JSON.stringify(doc),
      data = vectorRenderData(doc),
      blocks = data.surfaces.filter(s => s.houses),
      ids = new Set(blocks.flatMap(s => s.houses!.ids));
    expect(ids.size).toBe(doc.urban!.report.housingBuildings);
    expect(blocks.length).toBeLessThan(ids.size);
    const svg = renderVectorDocument(doc);
    expect(svg.querySelectorAll("[data-vector-fabric-cell]")).toHaveLength(blocks.length);
    expect(svg.querySelector('[data-vector-placement][data-vector-building-kind="housing"]')).toBeNull();
    const scene = createVectorScene(data),
      meshes = scene.group.children.filter(o => o.userData.representation === "fabric-houses") as THREE.Mesh[];
    expect(meshes.length).toBeLessThan(ids.size);
    const picked = new Set<string>();
    for (const mesh of meshes) {
      const { ids: houseIds, firstTriangles, triangles } = mesh.userData.fabricHouses;
      expect(mesh.geometry.getAttribute("position").count).toBe(triangles * 3);
      houseIds.forEach((id: string, i: number) => {
        const end = i + 1 < firstTriangles.length ? firstTriangles[i + 1] : triangles;
        expect(vectorPickHouse(mesh, firstTriangles[i])).toEqual({
          id,
          firstTriangle: firstTriangles[i],
          endTriangle: end
        });
        expect(vectorPickHouse(mesh, end - 1)!.id).toBe(id);
        picked.add(id);
      });
    }
    expect(picked).toEqual(ids);
    scene.dispose();
    expect(JSON.stringify(doc)).toBe(before);
  });
  it("selects a house by a map click inside its street block and shows only that house in the inspector", () => {
    const root = document.createElement("div"),
      panel = document.createElement("aside"),
      map = document.createElement("main"),
      status = document.createElement("output");
    root.append(panel, map, status);
    document.body.append(root);
    vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      toJSON: () => ({})
    });
    const scope = new EditorLifetime(root),
      before = JSON.stringify(doc),
      houses = createVectorFabricHousePanel(scope, panel, () => doc),
      chosen: string[] = [];
    let renders = 0;
    const workbench = createVectorWorkbench(
      scope,
      panel,
      map,
      status,
      () => structuredClone(doc),
      () => undefined,
      () => renders++,
      () => doc,
      id => {
        chosen.push(id);
        if (id) houses.select(id);
        else houses.clear();
      }
    );
    workbench.refresh();
    const cell = Object.values(doc.fabric!.cells).find(c => c.houses.offsets.length)!,
      id = `${cell.id}#0`,
      info = fabricHouseInfo(doc.fabric, id)!,
      [x, y] = polygonCentroid(info.ring),
      svg = map.querySelector("svg")!,
      box = svg.getAttribute("viewBox")!.split(" ").map(Number),
      scale = 400 / box[2],
      target = map.querySelector(`[data-vector-fabric-cell="${cell.id}"]`)!;
    const rendersBefore = renders;
    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: (x - box[0]) * scale,
        clientY: (-y - box[1]) * scale
      })
    );
    expect(chosen).toEqual([id]);
    expect(renders).toBe(rendersBefore);
    expect(map.querySelector(`[data-vector-selected-house="${id}"]`)).not.toBeNull();
    const field = (key: string) => panel.querySelector(`[data-fabric-house-field="${key}"]`)!.textContent;
    expect(panel.querySelector<HTMLElement>("[data-vector-fabric-house]")!.hidden).toBe(false);
    expect(field("id")).toBe(id);
    expect(field("dwellings")).toBe(String(cell.houses.dwellings[0]));
    expect(field("storeys")).toBe(String(cell.houses.storeys[0]));
    // Choosing a path moves the selection away from the house.
    const path = map.querySelector<SVGElement>("[data-vector-path]")!;
    path.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    expect(chosen).toEqual([id, ""]);
    expect(map.querySelector("[data-vector-selected-house]")).toBeNull();
    expect(panel.querySelector<HTMLElement>("[data-vector-fabric-house]")!.hidden).toBe(true);
    expect(houses.select(`${cell.id}#${cell.houses.offsets.length}`)).toBe(false);
    expect(JSON.stringify(doc)).toBe(before);
    scope.dispose();
  });
});
