import { describe, expect, it, vi } from "vitest";
import {
  prepareVectorEdit,
  reconcileVectorEdit,
  type VectorEditResult
} from "../../generators/vector/editing/dependencies";
import { replaceVectorPath } from "../../generators/vector/editing/paths";
import { syntheticVectorInput } from "../../generators/vector/generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../generators/vector/generation/urban";
import { VectorDocumentHistory } from "../../generators/vector/history";
import { EditorLifetime } from "../../services/editorLifetime";
import { createVectorEditPanel } from "./VectorEditPanel";

const setup = () => {
  const source = generateVectorUrban(
    generateVectorSkeleton(syntheticVectorInput("jobs", 80, false), { ...DEFAULT_VECTOR_GENERATION, branches: 2 })
      .document,
    { ...DEFAULT_VECTOR_URBAN, mode: "medieval", population: 20, maxLanes: 0 }
  );
  const history = new VectorDocumentHistory(source),
    root = document.createElement("div"),
    parent = document.createElement("aside"),
    map = document.createElement("main");
  root.append(parent, map);
  document.body.append(root);
  const scope = new EditorLifetime(root),
    jobs: { resolve: (r: VectorEditResult | null) => void; cancel: ReturnType<typeof vi.fn> }[] = [];
  const start = () => {
    const d = Promise.withResolvers<VectorEditResult | null>(),
      cancel = vi.fn();
    jobs.push({ resolve: d.resolve, cancel });
    return { result: d.promise, cancel };
  };
  const ui = createVectorEditPanel(
    scope,
    parent,
    map,
    () => history.document,
    () => history.currentEntryKey,
    (doc, label) => {
      history.commit(doc, label);
      ui.refresh();
    },
    () => map.replaceChildren(),
    start
  );
  const path = structuredClone(source.paths[Object.keys(source.generation!.pathRevisions)[0]]);
  path.width.leftMeters += 0.2;
  const candidate = replaceVectorPath(prepareVectorEdit(source), path);
  return {
    source,
    candidate,
    history,
    root,
    parent,
    map,
    scope,
    jobs,
    ui,
    dispose: () => {
      scope.dispose();
      root.remove();
    }
  };
};
describe("dependency preview lifetime", () => {
  it("adopts the edit and regenerated placements in one transaction", async () => {
    const s = setup();
    try {
      s.ui.submit(s.candidate, "Edit");
      expect(s.history.index).toBe(0);
      s.jobs[0].resolve(reconcileVectorEdit(s.source, s.candidate));
      await Promise.resolve();
      expect(s.map.querySelector("[data-dependency-preview]")).not.toBeNull();
      s.parent.querySelector<HTMLButtonElement>('[data-dependency-action="adopt"]')!.click();
      expect(s.history.index).toBe(1);
      expect(s.history.undo()).toEqual(s.source);
    } finally {
      s.dispose();
    }
  });
  it("rejects late completion after cancel, another job, undo/redo and disposal", async () => {
    const s = setup();
    try {
      const result = reconcileVectorEdit(s.source, s.candidate);
      s.ui.submit(s.candidate, "First");
      s.ui.submit(s.candidate, "Second");
      expect(s.jobs[0].cancel).toHaveBeenCalled();
      s.jobs[0].resolve(result);
      await Promise.resolve();
      expect(s.map.querySelector("[data-dependency-preview]")).toBeNull();
      s.parent.querySelector<HTMLButtonElement>('[data-dependency-action="cancel"]')!.click();
      s.jobs[1].resolve(result);
      await Promise.resolve();
      expect(s.history.index).toBe(0);
      s.ui.submit(s.candidate, "Third");
      s.history.commit(s.source);
      s.history.undo();
      s.ui.refresh();
      s.jobs[2].resolve(result);
      await Promise.resolve();
      expect(s.map.querySelector("[data-dependency-preview]")).toBeNull();
      s.ui.submit(s.candidate, "Fourth");
      s.scope.dispose();
      s.jobs[3].resolve(result);
      await Promise.resolve();
      expect(s.jobs[3].cancel).toHaveBeenCalled();
      expect(s.history.index).toBe(0);
    } finally {
      s.dispose();
    }
  });
});
