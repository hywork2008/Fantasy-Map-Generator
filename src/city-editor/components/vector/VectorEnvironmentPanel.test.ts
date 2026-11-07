import { describe, expect, it, vi } from "vitest";
import { createVectorDocument } from "../../generators/vector/document";
import { rebuildRoadGraph } from "../../generators/vector/editing/network";
import { curveSource } from "../../generators/vector/editing/paths";
import { legacyLandscapeFixture } from "../../generators/vector/fixtures/legacyLandscape";
import { VectorDocumentHistory } from "../../generators/vector/history";
import { renderVectorDocument } from "../../renderers/vector/documentSvg";
import { EditorLifetime } from "../../services/editorLifetime";
import { copyLegacyCity } from "../../services/io/vector/legacyCopy";
import type { VectorCityDocument } from "../../types/vector/document";
import { createVectorEnvironmentPanel } from "./VectorEnvironmentPanel";

const setup = (initial?: VectorCityDocument) => {
  const root = document.createElement("div"),
    controls = document.createElement("aside"),
    map = document.createElement("main");
  root.append(controls, map);
  document.body.append(root);
  const scope = new EditorLifetime(root),
    doc = initial ?? createVectorDocument();
  if (!initial)
    doc.paths.road = {
      id: "road",
      role: "road",
      revision: 0,
      origin: "manual",
      editPolicy: "editable",
      source: curveSource(
        [
          [100, -150],
          [100, 150]
        ],
        "polyline",
        false
      ),
      width: { leftMeters: 3, rightMeters: 3, stations: [] }
    };
  rebuildRoadGraph(doc);
  const history = new VectorDocumentHistory(doc),
    submitted = vi.fn((doc, label) => {
      history.commit(doc, label);
      ui.refresh();
      map.replaceChildren(renderVectorDocument(doc));
    });
  const ui = createVectorEnvironmentPanel(scope, controls, map, () => history.document, submitted, submitted, vi.fn());
  ui.refresh();
  return {
    root,
    scope,
    history,
    submitted,
    field: (name: string) =>
      root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-environment-field="${name}"]`)!,
    click: (name: string) => root.querySelector<HTMLButtonElement>(`[data-environment-action="${name}"]`)!.click(),
    close: () => {
      scope.dispose();
      root.remove();
    }
  };
};
describe("M8 editor transactions", () => {
  it("keeps site creation, visibility and removal undoable, and refuses removal of a fixed site", async () => {
    const s = setup();
    try {
      s.field("kind").value = "forest";
      s.click("add");
      await vi.waitFor(() => expect(s.submitted).toHaveBeenCalledTimes(1));
      const id = Object.keys(s.history.document.environment!.features)[0];
      s.field("selection").value = id;
      s.click("visibility");
      await vi.waitFor(() => expect(s.history.document.environment!.hidden).toEqual([id]));
      s.history.undo();
      expect(s.history.document.environment!.hidden).toEqual([]);
      s.field("selection").value = id;
      s.click("lock");
      await vi.waitFor(() => expect(s.history.document.environment!.features[id].editPolicy).toBe("fixed"));
      s.field("selection").value = id;
      s.click("remove");
      await vi.waitFor(() => expect(s.root.textContent).toContain("feature-fixed"));
      expect(s.history.document.environment!.features[id]).toBeDefined();
    } finally {
      s.close();
    }
  });
  it("regenerates imported forest modes and local faith as undoable native transactions", async () => {
    const doc = copyLegacyCity(legacyLandscapeFixture()).document,
      s = setup(doc);
    try {
      expect(s.field("landscapeMode").disabled).toBe(false);
      s.field("landscapeMode").value = "legacy";
      s.click("regenerateLandscape");
      await vi.waitFor(() => expect(s.history.document.environment!.landscape!.forest.regionIds).toHaveLength(0));
      expect(s.history.undo()).not.toBeNull();
      expect(s.history.document.environment!.landscape!.forest.regionIds.length).toBeGreaterThan(0);
      const original = s.history.document.environment!.landscape!.cemeteries[0].burialProfile!.id;
      s.click("applyLocalFaith");
      await vi.waitFor(() =>
        expect(s.history.document.environment!.landscape!.cemeteries[0].burialProfile!.id).not.toBe(original)
      );
      expect(s.history.document.environment!.landscape!.context.civilization).toEqual(
        doc.environment!.landscape!.context.civilization
      );
    } finally {
      s.close();
    }
  });
  it("does not accept a late Freeform file read after the editor closes", async () => {
    const s = setup();
    let resolve: (value: string) => void = () => {};
    const file = new File([""], "source.json");
    vi.spyOn(file, "text").mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    Object.defineProperty(s.field("freeform"), "files", { value: [file] });
    s.field("freeform").dispatchEvent(new Event("change"));
    s.scope.dispose();
    resolve("{}");
    await Promise.resolve();
    expect(s.submitted).not.toHaveBeenCalled();
    s.close();
  });
});
