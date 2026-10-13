export interface PatchParams {
  /** Side length of the square window, metres. */
  extentMeters: number;
  /** TownGeneratorTS `nPatches` — the built-up patch count. Total scatter = 8×. */
  nPatches: number;
  /** How many centre-most sites (spiral order) to relax toward their centroid
   * each pass. TownGeneratorTS relaxes `[0,1,2,nPatches]` ≈ 4. 0 = no relax. */
  relaxCount: number;
  /** Relax passes over those sites (TownGeneratorTS: 3). */
  relaxPasses: number;
  /** How fast cells grow toward the rim, 0–100. 100 (default) is TownGeneratorTS:
   * spiral radius linear in i, cell width ∝ √r. 0 spaces the spiral at √i, so
   * cells keep one size out to the rim. Total site count is unchanged, so a
   * lower value coarsens the centre while refining the rim. */
  rimGrowthPercent?: number;
  /** User ceiling for nPatches (UI slider and automatic town count). Default 48. */
  maxPatches?: number;
}
