import { cemeteryGroundColor } from "../core/gen/cultureCemeteryLayout";
import { polygonCentroid } from "../core/gen/geom";
import type { CemeteryPlan, Point } from "../core/types";

const NS = "http://www.w3.org/2000/svg";
function element<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
const line = (points: Point[]) => points.map(([x, y], i) => `${i ? "L" : "M"}${x},${-y}`).join(" ");
const polygon = (points: Point[]) => `${line(points)} Z`;

/** Render saved footprints without substituting Christian buildings or grave symbols. */
export function renderCultureCemetery(plan: CemeteryPlan): SVGGElement {
  const profile = plan.burialProfile!;
  const group = element("g", { "data-burial-profile": profile.id });
  for (const court of plan.courtyards)
    group.appendChild(element("path", { d: polygon(court), fill: cemeteryGroundColor(profile) }));
  const boundary = profile.boundary;
  if (boundary === "high_stone_wall" || boundary === "low_curb_or_hedge" || boundary === "ditch_and_rampart") {
    group.appendChild(
      element("path", {
        d: polygon(plan.boundary),
        fill: "none",
        stroke: boundary === "low_curb_or_hedge" ? "#54724a" : "#655b49",
        "stroke-width": boundary === "ditch_and_rampart" ? "2.5" : boundary === "high_stone_wall" ? "1.2" : "0.6",
        ...(boundary === "ditch_and_rampart" ? { "stroke-dasharray": "3 1" } : {})
      })
    );
  } else if (boundary === "stepped_water_terrace") {
    const waterEdge = plan.accesses.find(a => a.widthMeters === 0.3)?.points;
    for (let i = 0; i < plan.boundary.length; i++) {
      const a = plan.boundary[i],
        b = plan.boundary[(i + 1) % plan.boundary.length];
      // The terrace edge remains open to water; the land sides have a low curb.
      if (
        waterEdge &&
        Math.hypot(
          (a[0] + b[0]) / 2 - (waterEdge[0][0] + waterEdge[1][0]) / 2,
          (a[1] + b[1]) / 2 - (waterEdge[0][1] + waterEdge[1][1]) / 2
        ) < 5
      )
        continue;
      group.appendChild(element("path", { d: line([a, b]), fill: "none", stroke: "#655b49", "stroke-width": "0.5" }));
    }
  }
  for (const access of plan.accesses)
    group.appendChild(
      element("path", {
        d: line(access.points),
        fill: "none",
        stroke: access.widthMeters === 0.3 ? "#655b49" : "#ded3bf",
        "stroke-width": String(access.widthMeters)
      })
    );
  for (const part of plan.parts) {
    const partGroup = element("g", { "data-cemetery-kind": part.kind ?? part.role });
    const p = polygonCentroid(part.footprint);
    const mound = part.kind === "stepped_tumuli_mounds";
    const wood = part.kind === "cremation_woodyard";
    partGroup.appendChild(
      element("path", {
        d: polygon(part.footprint) + (part.holes?.length ? ` ${polygon(part.holes[0])}` : ""),
        fill: mound ? "#9eaa71" : wood ? "#9c7046" : part.kind === "flat_ground_markers" ? "#b7b0a1" : "#d7ccba",
        "fill-rule": "evenodd",
        stroke: "#60584a",
        "stroke-width": part.role === "monument" ? "0.3" : "0.8"
      })
    );
    const radius = Math.min(...part.footprint.map(q => Math.hypot(q[0] - p[0], q[1] - p[1])));
    const circle = (r: number, fill: string) =>
      partGroup.appendChild(
        element("circle", {
          cx: String(p[0]),
          cy: String(-p[1]),
          r: String(r),
          fill,
          stroke: "#60584a",
          "stroke-width": "0.4"
        })
      );
    if (part.kind === "mausoleum_dome" || part.kind === "stupa_chorten") {
      circle(radius * 0.72, "#b7aa8d");
      circle(radius * 0.28, "#e7d4a1");
      if (part.kind === "stupa_chorten") circle(radius * 0.95, "none");
    } else if (part.kind === "tower_of_silence") {
      if (part.holes?.[1]) partGroup.appendChild(element("path", { d: polygon(part.holes[1]), fill: "#514c43" }));
      const outer = part.footprint;
      for (let i = 0; i < outer.length; i += 2) {
        const q = outer[i];
        const inward: Point = [p[0] + (q[0] - p[0]) * 0.3, p[1] + (q[1] - p[1]) * 0.3];
        partGroup.appendChild(element("path", { d: line([inward, q]), stroke: "#827767", "stroke-width": "0.35" }));
      }
    } else if (part.kind === "preaching_cross_calvary") {
      partGroup.appendChild(
        element("path", {
          d: `${line([
            [p[0], p[1] - radius],
            [p[0], p[1] + radius]
          ])} ${line([
            [p[0] - radius * 0.7, p[1] + radius * 0.3],
            [p[0] + radius * 0.7, p[1] + radius * 0.3]
          ])}`,
          stroke: "#494238",
          "stroke-width": "0.5"
        })
      );
    } else if (part.kind === "ablution_fountain") circle(radius * 0.65, "#91b7bc");
    else if (
      part.kind === "cremation_pyre_platform" ||
      wood ||
      part.kind === "skull_shelf" ||
      part.kind === "columbarium_walls"
    ) {
      const a = part.footprint[0],
        b = part.footprint[1],
        c = part.footprint[2],
        d = part.footprint[3];
      if (d)
        for (const t of [0.25, 0.5, 0.75]) {
          partGroup.appendChild(
            element("path", {
              d: line([
                [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
                [d[0] + (c[0] - d[0]) * t, d[1] + (c[1] - d[1]) * t]
              ]),
              stroke: wood ? "#654629" : "#827767",
              "stroke-width": "0.4"
            })
          );
        }
    }
    group.appendChild(partGroup);
  }
  for (const tree of plan.trees) {
    const species = profile.vegetation;
    const treeGroup = element("g", { class: "ce-cemetery-tree", "data-species": species });
    const narrow = species === "mediterranean_cypress";
    const broad = species === "sacred_bodhi_and_fig";
    treeGroup.appendChild(
      element("ellipse", {
        cx: String(tree[0]),
        cy: String(-tree[1]),
        rx: narrow ? "1" : broad ? "4" : "2",
        ry: narrow ? "2.8" : broad ? "3" : species === "peaceful_willow" ? "3" : "2",
        fill: species === "oriental_evergreen" ? "#496b4d" : "#557849",
        stroke: "#385230",
        "stroke-width": "0.5"
      })
    );
    group.appendChild(treeGroup);
  }
  return group;
}
