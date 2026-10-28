import type { Forest3dQuality } from "../../city3d/three/forestMeshes";
import type { ForestQualityPreference } from "../types/contracts/forest";

const LEVELS: Forest3dQuality[] = ["light", "standard", "high"];

/** Motion samples only: no timers, rendering loop or changes to the forest's area. */
export class ForestAutoQuality {
  requested: ForestQualityPreference = "auto";
  effective: Forest3dQuality = "standard";
  private samples: number[] = [];
  private slow = 0;
  private fast = 0;
  private switchedAt: number | null = null;

  setPreference(value: ForestQualityPreference): boolean {
    if (this.requested === value) return false;
    this.requested = value;
    this.effective = value === "auto" ? "standard" : value;
    this.resetSamples();
    this.switchedAt = null;
    return true;
  }

  interruptMotion(): void {
    this.slow = this.fast = 0;
  }

  resetSamples(): void {
    this.samples = [];
    this.slow = this.fast = 0;
  }

  sample(ms: number, now: number): boolean {
    if (this.requested !== "auto" || !Number.isFinite(ms) || ms <= 0) return false;
    this.samples.push(ms);
    if (this.samples.length > 120) this.samples.shift();
    this.switchedAt ??= now;
    this.slow = ms > 33 ? this.slow + 1 : 0;
    this.fast = ms < 20 ? this.fast + 1 : 0;
    const index = LEVELS.indexOf(this.effective);
    const down = this.slow >= 30 && now - this.switchedAt >= 5000 && index > 0;
    const up = this.fast >= 120 && now - this.switchedAt >= 20000 && index < LEVELS.length - 1;
    if (!down && !up) return false;
    this.effective = LEVELS[index + (down ? -1 : 1)];
    this.switchedAt = now;
    this.slow = this.fast = 0;
    return true;
  }

  get snapshot() {
    const sorted = [...this.samples].sort((a, b) => a - b);
    return {
      requested: this.requested,
      effective: this.effective,
      motionSamples: sorted.length,
      motionIntervalP95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null
    };
  }
}
