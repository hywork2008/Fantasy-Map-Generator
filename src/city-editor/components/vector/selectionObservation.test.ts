import { readFileSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { polygonCentroid } from "../../generators/geom";
import { fabricHouseInfo } from "../../generators/vector/fabric/houses";
import { VectorDocumentHistory } from "../../generators/vector/history";
import { vectorPickHouse } from "../../renderers/vector/picking";
import { vectorRenderData } from "../../renderers/vector/renderData";
import { createVectorScene } from "../../renderers/vector/scene3d";
import { EditorLifetime } from "../../services/editorLifetime";
import { parseVectorDocument } from "../../services/io/vector/documentCodec";
import { createVectorFabricHousePanel } from "./VectorFabricHousePanel";
import { createVectorPlacementPanel } from "./VectorPlacementPanel";
import { createVectorWorkbench } from "./VectorWorkbench";

const input = process.env.CE_MESHLESS_SELECTION_DOC;
const output = process.env.CE_MESHLESS_SELECTION_OUT;

/** Opt-in: time selecting paths and placements in a saved meshless document, without editing it. */
describe.runIf(!!input && !!output)("meshless selection cost observation", () => {
  it("records map click and inspector selection times", () => {
    const doc = parseVectorDocument(readFileSync(input!, "utf8"));
    expect(doc).not.toBeNull();
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
      history = new VectorDocumentHistory(doc!),
      houses = createVectorFabricHousePanel(scope, panel, () => history.peek());
    let renders = 0;
    const workbench = createVectorWorkbench(
      scope,
      panel,
      map,
      status,
      () => history.document,
      (next, label) => {
        history.commit(next, label);
        workbench.refresh();
      },
      () => renders++,
      () => history.peek(),
      id => (id ? houses.select(id) : houses.clear())
    );
    const placements = createVectorPlacementPanel(
      scope,
      panel,
      () => history.document,
      (next, label) => history.commit(next, label),
      () => history.peek()
    );
    let started = performance.now();
    workbench.refresh();
    placements.refresh();
    const initialMs = performance.now() - started;
    const time = (fn: () => void) => {
      const start = performance.now();
      fn();
      return performance.now() - start;
    };
    const median = (values: number[]) => values.slice().sort((a, b) => a - b)[values.length >> 1];
    const pathIds = Object.keys(doc!.paths)
      .filter((_, i) => i % 97 === 0)
      .slice(0, 9);
    const clickMs = pathIds.map(id =>
      time(() => {
        const target = map.querySelector(`[data-vector-path="${id}"]`)!;
        target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      })
    );
    const selectMs = pathIds.map(id => time(() => workbench.select(id)));
    const placementIds = Object.keys(doc!.placements)
      .filter((_, i) => i % 97 === 0)
      .slice(0, 9);
    const placementMs = placementIds.map(id => time(() => placements.select(id)));
    // Generated houses in fabric records: 2D click inside a street block, 3D ray pick, inspector.
    const svg = map.querySelector("svg")!,
      box = svg.getAttribute("viewBox")!.split(" ").map(Number),
      scale = 400 / box[2],
      cells = Object.values(doc!.fabric?.cells ?? {}).filter(c => c.houses.offsets.length),
      sample = cells.filter((_, i) => i % Math.max(1, Math.floor(cells.length / 9)) === 0).slice(0, 9),
      houseIds = sample.map(c => `${c.id}#0`),
      centres = houseIds.map(id => polygonCentroid(fabricHouseInfo(history.peek().fabric, id)!.ring));
    let houseClicksSelected = 0;
    const houseClickMs = sample.map((cell, i) => {
      const [x, y] = centres[i],
        target = map.querySelector(`[data-vector-fabric-cell="${cell.id}"]`)!,
        ms = time(() =>
          target.dispatchEvent(
            new PointerEvent("pointerdown", {
              bubbles: true,
              button: 0,
              clientX: (x - box[0]) * scale,
              clientY: (-y - box[1]) * scale
            })
          )
        );
      if (map.querySelector(`[data-vector-selected-house="${houseIds[i]}"]`)) houseClicksSelected++;
      return ms;
    });
    const inspectorMs = houseIds.map(id => time(() => houses.select(id)));
    let scene3dMs = 0,
      houseMeshes = 0,
      housePickMs: number[] = [],
      housePicksCorrect = 0;
    if (cells.length) {
      started = performance.now();
      const data = vectorRenderData(structuredClone(doc!)),
        scene = createVectorScene(data);
      scene3dMs = performance.now() - started;
      scene.group.updateMatrixWorld(true);
      houseMeshes = scene.group.children.filter(o => o.userData.representation === "fabric-houses").length;
      const ray = new THREE.Raycaster(),
        datum = scene.group.position.y;
      housePickMs = houseIds.map((id, i) =>
        time(() => {
          const [x, y] = centres[i],
            info = fabricHouseInfo(history.peek().fabric, id)!;
          ray.set(new THREE.Vector3(x, datum + 500, -y), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObject(scene.group, true)[0],
            picked = hit ? vectorPickHouse(hit.object, hit.faceIndex) : null;
          if (picked?.id === info.id) housePicksCorrect++;
          if (picked) houses.select(picked.id);
        })
      );
      scene.dispose();
    }
    started = performance.now();
    const unchanged = JSON.stringify(history.peek()) === JSON.stringify(doc);
    const compareMs = performance.now() - started;
    expect(unchanged).toBe(true);
    writeFileSync(
      output!,
      `${JSON.stringify(
        {
          format: "ce-meshless-selection-observation",
          version: 1,
          measuredAtUtc: new Date().toISOString(),
          input,
          scope:
            "Workbench, placement and generated-house panels in jsdom, one document, nine selections each. 3D: scene build and a vertical ray pick without WebGL rendering. Excludes layout/paint.",
          counts: { paths: Object.keys(doc!.paths).length, placements: Object.keys(doc!.placements).length },
          initialMs,
          mapClickMs: { median: median(clickMs), max: Math.max(...clickMs), samples: clickMs },
          workbenchSelectMs: { median: median(selectMs), max: Math.max(...selectMs), samples: selectMs },
          placementSelectMs: { median: median(placementMs), max: Math.max(...placementMs), samples: placementMs },
          fabric: {
            cells: cells.length,
            houseMapClickMs: { median: median(houseClickMs), max: Math.max(...houseClickMs), samples: houseClickMs },
            houseClicksSelected,
            houseInspectorMs: { median: median(inspectorMs), max: Math.max(...inspectorMs), samples: inspectorMs },
            scene3dBuildMs: scene3dMs,
            houseMeshes,
            house3dPickMs: { median: median(housePickMs), max: Math.max(...housePickMs), samples: housePickMs },
            house3dPicksCorrect: housePicksCorrect
          },
          renderCallbacks: renders,
          snapshotUnchanged: unchanged,
          compareMs
        },
        null,
        2
      )}\n`
    );
    scope.dispose();
    root.remove();
  }, 600000);
});
