import { setRenderMode } from "../actions";
import { viewContext } from "../context/viewContext";

/**
 * Runs a serialization callback against a freshly rendered SVG map. WebGL hybrid
 * keeps most SVG layers intentionally hidden and stale, so full-map exports and
 * saved .map snapshots temporarily use the canonical SVG renderer instead.
 */
export async function withSvgSnapshot<T>(createSnapshot: () => T | Promise<T>): Promise<T> {
  const previousMode = viewContext.renderMode;
  if (previousMode !== "webglHybrid") return createSnapshot();

  setRenderMode("svg");
  try {
    return await createSnapshot();
  } finally {
    setRenderMode(previousMode);
  }
}
