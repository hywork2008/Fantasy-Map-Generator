import { describe, expect, it, vi } from "vitest";
import type { VectorRenderData } from "./renderData";

const owned = vi.hoisted(() => ({ dispose: vi.fn() }));
vi.mock("./scene3d", () => ({
  createVectorScene: () => ({ dispose: owned.dispose }),
  VectorSceneLayers: class {
    dispose() {}
  }
}));
vi.mock("three", async original => ({
  ...(await original<typeof import("three")>()),
  WebGLRenderer: class {
    constructor() {
      throw Error("context-unavailable");
    }
  }
}));

import { mountVector3d } from "./view3d";

describe("3D initialization ownership", () => {
  it("releases already-built geometry when no WebGL context can be allocated", () => {
    expect(() => mountVector3d(document.createElement("div"), {} as VectorRenderData)).toThrow("context-unavailable");
    expect(owned.dispose).toHaveBeenCalledOnce();
  });
});
