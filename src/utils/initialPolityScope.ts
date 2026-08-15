export const MIN_INITIAL_POLITY_REALM_SIZE = 1;
export const MAX_INITIAL_POLITY_REALM_SIZE = 30;
export const DEFAULT_INITIAL_POLITY_REALM_SIZE = MAX_INITIAL_POLITY_REALM_SIZE;

/** Converts saved or UI input to a starting-realm size in cells (1 = capital only). */
export function normalizeInitialPolityRealmSize(value: unknown): number {
  if (value === "capital") return MIN_INITIAL_POLITY_REALM_SIZE;
  if (value === "hinterland") return MAX_INITIAL_POLITY_REALM_SIZE;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_INITIAL_POLITY_REALM_SIZE;
  return Math.max(MIN_INITIAL_POLITY_REALM_SIZE, Math.min(MAX_INITIAL_POLITY_REALM_SIZE, Math.round(parsed)));
}

export function isCapitalOnlyPolityRealm(size: number | undefined): boolean {
  return normalizeInitialPolityRealmSize(size) === MIN_INITIAL_POLITY_REALM_SIZE;
}
