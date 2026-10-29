import type * as THREE from "three";
import { type CanopyLobe, type CanopyPalette, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";

/** Fit the actual high-tier spray vertices, retaining the same branch positions and random sequence. */
export function createConiferCanopyLod(
  quality: "low" | "medium",
  palette: CanopyPalette,
  seed: number,
  coverage: number,
  lowCoverage: number
) {
  let points: THREE.Vector3[] = [];
  const bands = new Map<number, THREE.Vector3[]>();
  const lobes: CanopyLobe[] = [];
  return {
    triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
      points.push(a, b, c);
    },
    finishBranch(level: number) {
      if (!points.length) return;
      if (quality === "medium") lobes.push(fitCanopyLobe(points, coverage, true));
      else {
        const band = Math.floor(level / 2);
        const existing = bands.get(band);
        if (existing) for (const point of points) existing.push(point);
        else bands.set(band, points);
      }
      points = [];
    },
    geometry() {
      for (const points of bands.values()) lobes.push(fitCanopyLobe(points, lowCoverage));
      return createCanopyLobes(lobes, palette, seed);
    }
  };
}
