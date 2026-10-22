import type { RuralFieldSnapshot } from "../types/contracts/ruralFields";

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const line = (value: unknown, minimum = 2): boolean =>
  Array.isArray(value) &&
  value.length >= minimum &&
  value.every(p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === "number" && Number.isFinite(n)));
const lines = (value: unknown): boolean => Array.isArray(value) && value.every(p => line(p));

/** Validate saved geometry before renderers consume its nested coordinate arrays. */
export function validRuralFieldSnapshot(value: unknown): value is RuralFieldSnapshot | undefined {
  if (value === undefined) return true;
  if (
    !record(value) ||
    typeof value.fingerprint !== "string" ||
    !Array.isArray(value.farms) ||
    !Array.isArray(value.lanes)
  )
    return false;
  if (
    !value.farms.every(
      farm =>
        record(farm) &&
        typeof farm.faceId === "string" &&
        line(farm.polygon, 3) &&
        lines(farm.rows) &&
        (farm.holdingPolygon === undefined || line(farm.holdingPolygon, 3)) &&
        (farm.boundaries === undefined || lines(farm.boundaries)) &&
        (farm.tenureStrips === undefined || lines(farm.tenureStrips)) &&
        (farm.sourceFaceIds === undefined ||
          (Array.isArray(farm.sourceFaceIds) && farm.sourceFaceIds.every(id => typeof id === "string"))) &&
        [farm.orientationRadians, farm.rotationGroup].every(
          n => n === undefined || (typeof n === "number" && Number.isFinite(n))
        )
    )
  )
    return false;
  if (
    !value.lanes.every(
      lane =>
        record(lane) &&
        typeof lane.faceId === "string" &&
        line(lane.points) &&
        typeof lane.widthMeters === "number" &&
        Number.isFinite(lane.widthMeters) &&
        lane.widthMeters > 0 &&
        (lane.kind === undefined || lane.kind === "farm-track" || lane.kind === "headland")
    )
  )
    return false;
  if (value.ruralFields === undefined) return true;
  const diagnostic = value.ruralFields;
  return (
    record(diagnostic) &&
    [
      "candidateAreaM2",
      "reachableAreaM2",
      "cultivatedAreaM2",
      "shortfallAreaM2",
      "gridMeters",
      "orientationRadians"
    ].every(key => typeof diagnostic[key] === "number" && Number.isFinite(diagnostic[key])) &&
    ["requestedAreaM2", "fixedAreaM2", "overBudgetAreaM2", "unsuitableAreaM2", "suitableCapacityM2"].every(
      key => diagnostic[key] === undefined || (typeof diagnostic[key] === "number" && Number.isFinite(diagnostic[key]))
    )
  );
}
