import type { BuildingRecord } from "./record";
import { sha256Hex } from "./sha256";

function formatNumber(value: number): string {
  let n = Object.is(value, -0) ? 0 : value;
  if (!Number.isFinite(n)) throw new Error("canonicalJson refuses a non-finite number");
  n = Math.round(n * 1e6) / 1e6;
  if (Object.is(n, -0)) n = 0;
  if (Number.isSafeInteger(n)) return String(n);
  const text = n.toFixed(6).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
}

/** Key-sorted UTF-8 JSON. Array order is kept. Numbers use one canonical spelling. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return formatNumber(value);
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, unknown] => entry[1] !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error("canonicalJson refuses this value");
}

/** Fields the digest covers. Name, region, format, and source are not geometry. */
export function authoritativePayload(record: BuildingRecord): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: record.id,
    revision: record.revision,
    kind: record.kind,
    period: record.period,
    occupancyMeters: record.occupancyMeters,
    levels: record.levels,
    verticalLinks: record.verticalLinks,
    roofs: record.roofs,
    materials: record.materials,
    provenance: record.provenance,
    placementStyles: record.placementStyles
  };
  if (record.planFamily !== undefined) payload.planFamily = record.planFamily;
  if (record.approachAzimuthRadians !== undefined) payload.approachAzimuthRadians = record.approachAzimuthRadians;
  if (record.generation !== undefined) payload.generation = record.generation;
  return payload;
}

export function contentDigest(record: BuildingRecord): string {
  return sha256Hex(canonicalJson(authoritativePayload(record)));
}

export function sealRecord<T extends BuildingRecord>(record: T): T {
  return { ...record, contentHash: contentDigest(record) };
}
