// Translucent land tint so a cell-elevation preset or brush is visible in 2D.

import { facePoints } from "../generators/mesh";
import type { Face, Mesh } from "../types/document";
import { element, polygon } from "./svgPrimitives";

/** Metres of relief that maps to the darkest tint. Taller ground stays at that colour. */
const RELIEF_SPAN_METERS = 40;

export function reliefShade(elevation: number): { fill: string; opacity: string } | null {
  if (!Number.isFinite(elevation)) return null;
  const t = Math.max(0, Math.min(1, (elevation - 1) / RELIEF_SPAN_METERS));
  if (t < 0.02) return null;
  const channel = (low: number, high: number) =>
    Math.round(low + (high - low) * t)
      .toString(16)
      .padStart(2, "0");
  return {
    fill: `#${channel(0xd5, 0x6e)}${channel(0xe0, 0x58)}${channel(0xb8, 0x40)}`,
    opacity: (0.18 + 0.55 * t).toFixed(2)
  };
}

export function renderCellReliefOverlay(mesh: Mesh): SVGGElement | null {
  const group = element("g", { class: "ce-cell-relief", "pointer-events": "none" });
  let drawn = 0;
  for (const face of Object.values(mesh.faces)) {
    const path = reliefPath(mesh, face);
    if (!path) continue;
    group.appendChild(path);
    drawn += 1;
  }
  return drawn ? group : null;
}

/** Keep one land cell's tint in step with a brush stroke. Creates the overlay group if needed. */
export function syncCellReliefFace(svg: SVGSVGElement, mesh: Mesh, face: Face): void {
  const next = face.properties.water === "land" ? reliefPath(mesh, face) : null;
  const existing = svg.querySelector(`[data-relief-face="${face.id}"]`);
  if (!next) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.setAttribute("d", next.getAttribute("d") ?? "");
    existing.setAttribute("fill", next.getAttribute("fill") ?? "");
    existing.setAttribute("fill-opacity", next.getAttribute("fill-opacity") ?? "");
    return;
  }
  let group = svg.querySelector(".ce-cell-relief");
  if (!group) {
    group = element("g", { class: "ce-cell-relief", "pointer-events": "none" });
    const cells = svg.querySelector(".ce-cells");
    if (cells) cells.insertAdjacentElement("afterend", group);
    else svg.appendChild(group);
  }
  group.appendChild(next);
}

function reliefPath(mesh: Mesh, face: Face): SVGPathElement | null {
  if (face.properties.water !== "land") return null;
  const shade = reliefShade(face.properties.elevation);
  if (!shade) return null;
  return element("path", {
    d: polygon(facePoints(mesh, face)),
    fill: shade.fill,
    "fill-opacity": shade.opacity,
    stroke: "none",
    "data-relief-face": face.id
  }) as SVGPathElement;
}
