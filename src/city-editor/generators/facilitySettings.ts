import type { GuildDomain, SiteStorageYard } from "../types/contracts/burgSiteEconomy";
import type { CityDocument } from "../types/document";

import { FACILITY_LABELS, type FacilityKind } from "../types/facilities";

export { FACILITY_LABELS, type FacilityKind } from "../types/facilities";

export const HALL_DOMAINS: GuildDomain[] = [
  "textiles",
  "leather",
  "woodworking",
  "masonry",
  "metallurgy",
  "glassware",
  "instruments",
  "printing"
];
export const YARD_DOMAINS = {
  bleachingField: "textiles",
  timberYard: "woodworking",
  stoneYard: "masonry",
  limeKiln: "masonry",
  smithyYard: "metallurgy",
  sandYard: "glassware"
} as const;
export const MAX_FACILITY_COUNT = 6;
export function validFacilityCounts(value: unknown): boolean {
  return (
    value === undefined ||
    (!!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(value).every(
        ([key, count]) =>
          Object.hasOwn(FACILITY_LABELS, key) &&
          Number.isInteger(count) &&
          count >= 0 &&
          count <= (key === "gallows" ? 1 : MAX_FACILITY_COUNT)
      ))
  );
}
export function setFacilityCount(document: CityDocument, kind: FacilityKind, count: number | undefined): CityDocument {
  const facilityCounts = { ...document.facilityCounts };
  if (count === undefined) delete facilityCounts[kind];
  else facilityCounts[kind] = Math.max(0, Math.min(kind === "gallows" ? 1 : MAX_FACILITY_COUNT, Math.round(count)));
  return { ...document, facilityCounts };
}
export function facilityStorage(document: CityDocument, original: SiteStorageYard[]): SiteStorageYard[] {
  const counts = document.facilityCounts ?? {};
  let result = [...original];
  for (const kind of [
    "livestockPen",
    "timberYard",
    "stoneYard",
    "fuelStack",
    "granary",
    "warehouse",
    "publicGranary"
  ] as const) {
    const count = counts[kind];
    if (count === undefined) continue;
    const form = kind === "publicGranary" ? "granary" : kind;
    const origin = kind === "publicGranary" ? ("publicWorks" as const) : undefined;
    result = result.filter(yard => yard.form !== form || yard.origin !== origin);
    // Timber and stone yards are placed by the guild-yard recipe above.
    if (kind === "timberYard" || kind === "stoneYard") continue;
    for (let i = 0; i < count; i++)
      result.push({ form, origin, areaM2: 300, mainGoods: [], inflowAzimuthDeg: null, waterborne: false });
  }
  return result;
}
