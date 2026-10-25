import { expect, it, vi } from "vitest";
import { editorText } from "../../i18n/editorMessages";
import { createDocument } from "../generators/document";
import { beginEditorMount } from "../services/editorLifetime";
import { mountCity3d } from "./cityView";

const attempts = vi.hoisted(() => vi.fn());
vi.mock("three", async importOriginal => ({
  ...(await importOriginal<typeof import("three")>()),
  WebGLRenderer: class {
    constructor() {
      attempts();
      throw new Error("Error creating WebGL context.");
    }
  }
}));

it("keeps a trebuchet-only map editable in 2D after WebGL startup fails, without leaking canvases on retry", () => {
  const host = document.createElement("div");
  const map = document.createElement("div");
  host.append(map);
  document.body.append(host);
  const scope = beginEditorMount(host);
  const city = createDocument("webgl-failure");
  city.elements.push({
    id: "trebuchet",
    kind: "object",
    objectType: "trebuchet",
    point: [0, 0],
    faceIds: [],
    locked: false
  });
  const before = JSON.stringify(city);
  const view = mountCity3d({ canvasHost: host, map, scope, getDocument: () => city });
  try {
    const button = host.querySelector<HTMLButtonElement>(".ce-view-toggle")!;
    for (let attempt = 1; attempt <= 2; attempt++) {
      button.click();
      expect(attempts).toHaveBeenCalledTimes(attempt);
      expect(map.hidden).toBe(false);
      expect(host.querySelector<HTMLElement>(".ce-3d")!.hidden).toBe(true);
      expect(button.textContent).toBe("3D");
      expect(button.getAttribute("aria-pressed")).toBe("false");
      expect(host.querySelector("canvas")).toBeNull();
      const readout = host.querySelector<HTMLElement>(".ce-3d-readout")!;
      expect(readout.hidden).toBe(false);
      expect(readout.textContent).toBe(editorText("cityEditor.messages.webglUnavailable"));
      expect(() => view.sync()).not.toThrow();
      expect(JSON.stringify(city)).toBe(before);
    }
  } finally {
    view.dispose();
    scope.dispose();
    host.remove();
  }
});
