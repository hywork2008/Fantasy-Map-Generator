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
