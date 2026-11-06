import { afterEach, describe, expect, it, vi } from "vitest";
import { createVectorExample } from "../../generators/vector/document";
import { syntheticVectorInput } from "../../generators/vector/generation/input";
import { DEFAULT_VECTOR_GENERATION } from "../../generators/vector/generation/pipeline";
import { EditorLifetime } from "../../services/editorLifetime";
import { createVectorPresentationPanel } from "./VectorPresentationPanel";

const mounted = vi.hoisted(() => ({ dispose: vi.fn(), calls: vi.fn() }));
vi.mock("../../renderers/vector/view3d", () => ({
  mountVector3d: (host: HTMLElement, data: unknown) => {
    host.replaceChildren(document.createElement("canvas"));
    mounted.calls(data);
    return { warnings: [], png: async () => new Blob(), dispose: mounted.dispose };
  }
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const setup = () => {
  const root = document.createElement("div"),
    map = document.createElement("main"),
    host = document.createElement("main"),
    panel = document.createElement("aside");
  root.append(panel, map, host);
  document.body.append(root);
  const scope = new EditorLifetime(root),
    doc = createVectorExample(),
    ui = createVectorPresentationPanel(scope, panel, map, host, () => doc);
  ui.refresh();
  return {
    root,
    panel,
    map,
    host,
    scope,
    doc,
    ui,
    close: () => {
      scope.dispose();
      root.remove();
    }
  };
};
describe("vector presentation lifetime", () => {
  it("builds 3D from the current stage and releases resources on view changes and disposal", async () => {
    const s = setup();
    try {
      const view = s.panel.querySelector<HTMLSelectElement>('[data-presentation-field="view"]')!;
      view.value = "3d";
      view.dispatchEvent(new Event("change"));
      await vi.waitFor(() => expect(mounted.calls).toHaveBeenCalledOnce());
      expect(s.map.hidden).toBe(true);
      expect(mounted.calls.mock.calls[0][0].revision).toBe(s.doc.revision);
      view.value = "2d";
      view.dispatchEvent(new Event("change"));
      expect(mounted.dispose).toHaveBeenCalledOnce();
      expect(s.map.hidden).toBe(false);
      view.value = "3d";
      view.dispatchEvent(new Event("change"));
      await vi.waitFor(() => expect(mounted.calls).toHaveBeenCalledTimes(2));
      s.scope.dispose();
      expect(mounted.dispose).toHaveBeenCalledTimes(2);
    } finally {
      s.close();
    }
  });
  it("ignores a late recipe worker result after a new document render", () => {
    const s = setup(),
      commit = vi.fn();
    let latest: { onmessage?: (event: MessageEvent) => void; terminate: ReturnType<typeof vi.fn> };
    class FakeWorker {
      onmessage?: (e: MessageEvent) => void;
      terminate = vi.fn();
      postMessage() {}
      constructor() {
        latest = this;
      }
    }
    vi.stubGlobal("Worker", FakeWorker);
    try {
      s.ui.replay({ input: syntheticVectorInput(), skeleton: DEFAULT_VECTOR_GENERATION }, commit);
      const delayed = latest!.onmessage!;
      s.ui.refresh();
      delayed({ data: { document: s.doc } } as MessageEvent);
      expect(latest!.terminate).toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    } finally {
      s.close();
    }
  });
});
