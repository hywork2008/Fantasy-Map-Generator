/**
 * Height-index conversion shared by site descriptors, route grade, and related tooling.
 *
 * Pack height `h` is the discrete 0–100 style index used throughout generation.
 * Display/UI strings stay in `cellInfoService.getHeight`; pure numeric meters live here.
 */

/**
 * Convert pack height index to meters above the land baseline.
 * Matches historical `getHeight()` / burgSiteDescriptor math:
 *   h < 20 → 0
 *   h ≥ 20 → (h - 18) ** exponent
 *
 * Does not round — callers that need integer meters should apply `rn` themselves.
 */
export function heightToMeters(h: number, exponent: number): number {
  return h < 20 ? 0 : (h - 18) ** exponent;
}

/**
 * Clamp / default `heightExponent` from options (valid range 1–5, default 1.8).
 */
export function normalizeHeightExponent(raw: number | undefined): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 1 && raw <= 5 ? raw : 1.8;
}

/**
 * Convert pack height index to water depth in meters below sea level. Matches the legacy
 * `getHeight()` water-cell branch (`cellInfoService.ts`): a fixed formula, independent of
 * `heightExponent` (unlike `heightToMeters()` for land).
 *   h <= 0        → sentinel "too deep to measure" (DEEP_WATER_SENTINEL_M)
 *   0 < h < 20    → ((h - 20) / h) * 50, always negative (deeper as h → 0)
 *   h >= 20 (land)→ 0
 *
 * Returns a negative number for real water depth; callers that want a positive depth magnitude
 * should take `Math.abs()` (`getHeight(h, "abs")`'s existing convention).
 */
export function depthToMeters(h: number): number {
  if (h >= 20) return 0;
  if (h <= 0) return DEEP_WATER_SENTINEL_M;
  return ((h - 20) / h) * 50;
}

/** Sentinel depth (meters, negative) for h <= 0 — deep-water cells the legacy formula never guarded. */
export const DEEP_WATER_SENTINEL_M = -9999;

/**
 * Inverse of `heightToMeters` for land. Returns a pack height index in 20–100.
 * Sea-level land (`meters <= 0`) still maps to 20 so a 0 m plain stays land.
 */
export function metersToHeight(meters: number, exponent: number): number {
  const exp = normalizeHeightExponent(exponent);
  if (!Number.isFinite(meters) || meters <= 0) return 20;
  const raw = 18 + meters ** (1 / exp);
  return Math.max(20, Math.min(100, Math.round(raw)));
}

/**
 * Inverse of `depthToMeters` for water. `depthMeters` is negative (below sea level).
 * Returns a pack height index in 0–19.
 */
export function depthMetersToHeight(depthMeters: number): number {
  if (!Number.isFinite(depthMeters) || depthMeters >= 0) return 19;
  if (depthMeters <= DEEP_WATER_SENTINEL_M / 2) return 0;
  const h = 1000 / (50 - depthMeters);
  return Math.max(0, Math.min(19, Math.round(h)));
}
