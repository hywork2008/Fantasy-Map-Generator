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
