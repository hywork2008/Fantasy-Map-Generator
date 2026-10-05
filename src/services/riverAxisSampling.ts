import { type CubicRiverAxis, evaluateCubicRiverAxis, sampleCubicRiverAxis } from "./riverCurveGeometry";
import { type RiverAxis, samplePolylineRiverAxis } from "./riverGeometry";

export type PhysicalRiverAxis = RiverAxis | CubicRiverAxis;
export function sampleRiverAxis(axis: PhysicalRiverAxis, arcLength: number, window = 0) {
  return "kind" in axis && axis.kind === "cubicBezier"
    ? sampleCubicRiverAxis(axis, arcLength, window)
    : samplePolylineRiverAxis(axis as RiverAxis, arcLength, window);
}
export function evaluateRiverAxis(axis: PhysicalRiverAxis, arcLength: number) {
  if ("kind" in axis && axis.kind === "cubicBezier") return evaluateCubicRiverAxis(axis, arcLength);
  const polyline = axis as RiverAxis;
  if (arcLength !== 0 && arcLength !== axis.length) return samplePolylineRiverAxis(polyline, arcLength);
  const segment = arcLength === 0 ? polyline.segments[0] : polyline.segments.at(-1);
  if (!segment) return null;
  return {
    segmentIndex: segment.index,
    arcLength,
    point: arcLength === 0 ? segment.start : segment.end,
    tangent: segment.tangent,
    normal: [-segment.tangent[1], segment.tangent[0]] as const
  };
}
