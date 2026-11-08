import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { VectorDocumentHistory } from "../../generators/vector/history";
import { EditorLifetime } from "../../services/editorLifetime";
import { parseVectorDocument } from "../../services/io/vector/documentCodec";
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
      history = new VectorDocumentHistory(doc!);
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
      () => history.peek()
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
            "Workbench and placement panel in jsdom, one document, nine selections each. Excludes 3D and layout/paint.",
          counts: { paths: Object.keys(doc!.paths).length, placements: Object.keys(doc!.placements).length },
          initialMs,
          mapClickMs: { median: median(clickMs), max: Math.max(...clickMs), samples: clickMs },
          workbenchSelectMs: { median: median(selectMs), max: Math.max(...selectMs), samples: selectMs },
          placementSelectMs: { median: median(placementMs), max: Math.max(...placementMs), samples: placementMs },
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
