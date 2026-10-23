import { editorText } from "../../i18n/editorMessages";
import { platformOutline } from "../generators/terrainElevation";
import type { CityDocument, Point } from "../types/document";
import { element, line, polygon } from "./svgPrimitives";

const pick = (id: string, label: string) =>
  encodeURIComponent(JSON.stringify({ id, kind: "terrain-ramp", label, layer: "fortifications" }));

/** Ramp side lines, offset from the centre line with mitred corners. */
function sides(centerline: readonly Point[], half: number): [Point[], Point[]] {
  const offset = (sign: number) =>
    centerline.map((point, i) => {
      const before = centerline[Math.max(0, i - 1)],
        after = centerline[Math.min(centerline.length - 1, i + 1)];
      const dx = after[0] - before[0],
        dy = after[1] - before[1];
      const length = Math.hypot(dx, dy) || 1;
      return [point[0] - (dy / length) * half * sign, point[1] + (dx / length) * half * sign] as Point;
    });
  return [offset(1), offset(-1)];
}

/** Cliff edges of cell platforms and the masonry ramps that climb them. */
export function renderTerrainEarthworks(document: CityDocument): SVGElement {
  const group = element("g", { class: "ce-terrain-earthworks" });
  for (const feature of document.terrain?.features ?? []) {
    if (feature.edge.kind !== "cliff" || feature.summit.kind !== "faces") continue;
    const segments = platformOutline(document, feature.summit.faceIds);
    // Terrace walls of a hill town are many and low; a castle scarp is drawn heavier.
    const terrace = feature.role === "terrace";
    // Short ticks on the low side read as a scarp, as on survey maps.
    group.append(
      element("path", {
        d: segments.map(s => line([s.a, s.b])).join(" "),
        stroke: "#5d5446",
        "stroke-width": terrace ? "0.5" : "1.2",
        fill: "none",
        "pointer-events": "none"
      }),
      element("path", {
        d: segments
          .flatMap(s => {
            const length = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
            const ticks: string[] = [];
            for (let at = 2; at < length; at += terrace ? 6 : 4) {
              const p: Point = [s.a[0] + ((s.b[0] - s.a[0]) * at) / length, s.a[1] + ((s.b[1] - s.a[1]) * at) / length];
              const tick = terrace ? 1.5 : 3;
              ticks.push(line([p, [p[0] - s.inward[0] * tick, p[1] - s.inward[1] * tick]]));
            }
            return ticks;
          })
          .join(" "),
        stroke: "#7a6e5c",
        "stroke-width": "0.5",
        fill: "none",
        "pointer-events": "none"
      })
    );
  }
  for (const ramp of document.terrain?.ramps ?? []) {
    const [left, right] = sides(ramp.centerline, ramp.widthMeters / 2);
    group.append(
      element("path", {
        d: polygon([...left, ...[...right].reverse()]),
        fill: "#cdbb94",
        stroke: "#6f6658",
        "stroke-width": "0.6",
        "data-pick": pick(ramp.id, editorText("cityEditor.messages.castleRamp"))
      })
    );
    // Chevrons point uphill, toward the landing at the end of the centre line.
    const chevrons: string[] = [];
    for (let i = 1; i < ramp.centerline.length; i += 1) {
      const a = ramp.centerline[i - 1],
        b = ramp.centerline[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 1) continue;
      const ux = (b[0] - a[0]) / length,
        uy = (b[1] - a[1]) / length,
        w = ramp.widthMeters * 0.3;
      for (let at = 3; at < length; at += 6) {
        const p: Point = [a[0] + ux * at, a[1] + uy * at];
        chevrons.push(
          line([[p[0] - ux * w - uy * w, p[1] - uy * w + ux * w], p, [p[0] - ux * w + uy * w, p[1] - uy * w - ux * w]])
        );
      }
    }
    group.append(
      element("path", {
        d: chevrons.join(" "),
        stroke: "#6f6658",
        "stroke-width": "0.35",
        fill: "none",
        "pointer-events": "none"
      })
    );
  }
  return group;
}
