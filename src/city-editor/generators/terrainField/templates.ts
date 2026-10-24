import type { Point } from "../../types/primitives";
import type { TerrainFieldPart, TerrainTemplateId } from "../../types/terrain";
import { makeRng } from "../prng";

function jitter(rng: ReturnType<typeof makeRng>, reach: number): number {
  return rng.range(-reach, reach);
}

/** Parts for one template, in apply order. Positions are metres from the frame centre. */
export function templateParts(template: TerrainTemplateId, seed: number, extentMeters: number): TerrainFieldPart[] {
  const rng = makeRng(`terrain-field:${template}:${seed}`);
  const half = extentMeters / 2;
  const offset = Math.min(half * 0.12, 40);
  if (template === "noise")
    return [
      { kind: "offset", meters: 20 },
      { kind: "noise", amplitudeMeters: 8, wavelengthMeters: 48, octaves: 4, seed },
      { kind: "smooth", radiusMeters: 6 },
      { kind: "mask", dropMeters: 3 }
    ];
  if (template === "crag") {
    // A few metres of jitter keeps the lip inside a 50 m cell instead of sliding onto the next one.
    const center: Point = [jitter(rng, Math.min(4, offset)), jitter(rng, Math.min(4, offset))];
    return [
      { kind: "offset", meters: 16 },
      { kind: "noise", amplitudeMeters: 1.2, wavelengthMeters: 70, octaves: 3, seed },
      { kind: "smooth", radiusMeters: 8 },
      {
        kind: "crag",
        center,
        topRadiusMeters: 16,
        cliffRunMeters: 10,
        heightMeters: 28 + rng.range(0, 4),
        wobble: 0.04
      },
      { kind: "hill", center: [center[0] + 90, center[1] - 40], radiusMeters: 70, heightMeters: 4 },
      { kind: "mask", dropMeters: 2 }
    ];
  }
  if (template === "spur") {
    const root: Point = [-half * 0.15, jitter(rng, offset * 0.4)];
    const tip: Point = [root[0] + Math.min(140, half * 0.45), root[1] + jitter(rng, 12)];
    return [
      { kind: "offset", meters: 14 },
      { kind: "noise", amplitudeMeters: 1, wavelengthMeters: 80, octaves: 3, seed },
      { kind: "smooth", radiusMeters: 8 },
      {
        kind: "spur",
        root,
        tip,
        topWidthMeters: 36,
        cliffRunMeters: 10,
        heightMeters: 30,
        gentleRunMeters: 220
      },
      { kind: "mask", dropMeters: 2 }
    ];
  }
  if (template === "meander") {
    const center: Point = [jitter(rng, offset), half * 0.05];
    const lobe = 48;
    const bow = (side: number): Point[] => {
      const points: Point[] = [];
      for (let step = 0; step <= 8; step++) {
        const t = step / 8;
        const angle = Math.PI * (0.15 + 0.7 * t);
        points.push([center[0] + Math.cos(angle) * lobe * 1.7, center[1] + Math.sin(angle) * lobe * side]);
      }
      return points;
    };
    return [
      { kind: "offset", meters: 18 },
      { kind: "noise", amplitudeMeters: 1, wavelengthMeters: 64, octaves: 3, seed },
      { kind: "smooth", radiusMeters: 6 },
      { kind: "crag", center, topRadiusMeters: 34, cliffRunMeters: 9, heightMeters: 26, wobble: 0.05 },
      { kind: "trough", points: bow(1), radiusMeters: 18, depthMeters: 5 },
      { kind: "mask", dropMeters: 2 }
    ];
  }
  const origin: Point = [jitter(rng, offset), 0];
  const angle = rng.range(-0.4, 0.4);
  return [
    { kind: "offset", meters: 12 },
    { kind: "noise", amplitudeMeters: 1.1, wavelengthMeters: 90, octaves: 3, seed },
    { kind: "smooth", radiusMeters: 8 },
    {
      kind: "scarp",
      origin,
      downhill: [Math.sin(angle), Math.cos(angle)],
      cliffRunMeters: 11,
      heightMeters: 32,
      gentleRunMeters: 260
    },
    { kind: "mask", dropMeters: 2 }
  ];
}
