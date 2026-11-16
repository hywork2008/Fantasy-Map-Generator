import type { Point } from "../../types/primitives";
import type { VectorOpenLandmarks } from "../../types/vector/landmark";
import type { VectorRenderSurface } from "./renderData";

const disc = (center: Point, radius: number, steps = 16): Point[] =>
  Array.from({ length: steps }, (_, i): Point => {
    const t = (i / steps) * Math.PI * 2;
    return [center[0] + Math.cos(t) * radius, center[1] + Math.sin(t) * radius];
  });

/** A thin blade from `center` along `angle`, `length` long. */
function blade(center: Point, angle: number, length: number, width: number): Point[] {
  const u: Point = [Math.cos(angle), Math.sin(angle)],
    v: Point = [-u[1] * (width / 2), u[0] * (width / 2)],
    at = (s: number, k: number): Point => [center[0] + u[0] * s + v[0] * k, center[1] + u[1] * s + v[1] * k];
  return [at(0.6, -1), at(length, -1), at(length, 1), at(0.6, 1)];
}

/** Windmills (mound or tower, four sails across the facing) and the gallows (mound and pillars), seen from above. */
export function vectorOpenLandmarkSurfaces(marks: VectorOpenLandmarks): VectorRenderSurface[] {
  const surface = (
    id: string,
    featureKind: string,
    pieceRole: string,
    outer: Point[],
    color: string,
    height: number
  ) => ({
    id,
    kind: "feature" as const,
    featureKind,
    pieceRole,
    polygons: [{ outer, holes: [] }],
    color,
    elevationMeters: pieceRole.endsWith("mound") ? 0.02 : 0.04,
    heightMeters: height
  });
  return [
    ...marks.windmills.flatMap(mill => {
      // Sails turn in the plane across the facing; from above they read as a bar across it.
      const across = mill.facing + Math.PI / 2,
        sails = [0, 1, 2, 3].map(k =>
          surface(
            `${mill.id}:sail:${k}`,
            "windmill",
            "windmill-sail",
            blade(mill.center, across + (k % 2 ? Math.PI : 0) + (k > 1 ? 0.12 : 0), mill.sailLength, 1.6),
            "#e8e0cc",
            0
          )
        );
      return [
        mill.kind === "post"
          ? surface(`${mill.id}:mound`, "windmill", "windmill-mound", disc(mill.center, mill.baseRadius), "#9aa36b", 0)
          : surface(
              `${mill.id}:tower`,
              "windmill",
              "windmill-tower",
              disc(mill.center, mill.baseRadius),
              "#cdbfa3",
              10
            ),
        surface(mill.id, "windmill", `windmill-${mill.kind}`, disc(mill.center, 2.2, 8), "#8a6a45", 0),
        ...sails
      ];
    }),
    ...marks.gallows.flatMap(g => [
      surface(`${g.id}:mound`, "gallows", "gallows-mound", disc(g.center, g.moundRadius), "#a59a72", 0),
      ...g.pillars.map((p, i) =>
        surface(`${g.id}:pillar:${i}`, "gallows", "gallows-pillar", disc(p, 0.5, 6), "#5b4a3a", 4)
      )
    ])
  ];
}
