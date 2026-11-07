import type { VectorPath } from "../../../types/vector/document";
import { polygonArea } from "../../geom";
import { pathIsClosed } from "./curves";
import { presetArea } from "./presets";
import { samplePath } from "./sampling";
/** Measurements use accepted metre curves, independent of view zoom or triangle quality. */
export function vectorPathMeasurement(path: VectorPath) {
  const samples = samplePath(path),
    closed = pathIsClosed(path);
  return {
    lengthMeters: samples.at(-1)?.distance ?? 0,
    areaMeters2: closed
      ? path.source.kind === "preset"
        ? presetArea(path.source)
        : Math.abs(polygonArea(samples.map(s => s.point)))
      : null
  };
}
