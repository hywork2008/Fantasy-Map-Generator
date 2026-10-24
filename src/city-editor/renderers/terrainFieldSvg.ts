import { terrainFieldForDocument } from "../generators/terrainField/build";
import { fieldContours, fieldHachures } from "../generators/terrainField/contours";
import { offsetPolyline } from "../generators/terrainField/corridor";
import { sampleField } from "../generators/terrainField/sample";
import type { CityDocument } from "../types/document";
import type { TerrainField } from "../types/terrain";
import { element, line } from "./svgPrimitives";

/** Hillshade, contours, and cliff hachures for a saved height-field recipe. */
export function renderTerrainFieldOverlay(document: CityDocument): SVGElement {
  const group = element("g", { class: "ce-terrain-field", "pointer-events": "none" });
  const field = document.terrain?.field ? terrainFieldForDocument(document) : null;
  if (!field) return group;
  const shade = hillshade(field);
  if (shade) group.appendChild(shade);
  for (const contour of fieldContours(field))
    group.appendChild(
      element("path", {
        d: line(contour.points),
        class: "ce-contour",
        fill: "none",
        stroke: "rgba(90, 78, 62, 0.45)",
        "stroke-width": "0.6",
        "vector-effect": "non-scaling-stroke"
      })
    );
  for (const [a, b] of fieldHachures(field))
    group.appendChild(
      element("path", {
        d: line([a, b]),
        class: "ce-hachure",
        fill: "none",
        stroke: "rgba(70, 62, 52, 0.55)",
        "stroke-width": "0.8",
        "vector-effect": "non-scaling-stroke"
      })
    );
  for (const feature of document.terrain?.features ?? []) {
    if (feature.kind !== "riverCorridor" || feature.bank.kind !== "quay") continue;
    const half = Math.max(...feature.widthsMeters) / 2;
    for (const side of [half, -half])
      group.appendChild(
        element("path", {
          d: line(offsetPolyline(feature.centerline, side)),
          class: "ce-quay",
          fill: "none",
          stroke: "rgba(70, 64, 56, 0.85)",
          "stroke-width": "1.1",
          "vector-effect": "non-scaling-stroke"
        })
      );
  }
  return group;
}

function hillshade(field: TerrainField): SVGElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  const pixels = 192;
  canvas.width = pixels;
  canvas.height = pixels;
  const spanX = (field.columns - 1) * field.sampleMeters;
  const spanY = (field.rows - 1) * field.sampleMeters;
  const image = context.createImageData(pixels, pixels);
  const azimuth = (315 * Math.PI) / 180;
  const altitude = (45 * Math.PI) / 180;
  const step = Math.max(field.sampleMeters, spanX / pixels);
  for (let row = 0; row < pixels; row++)
    for (let column = 0; column < pixels; column++) {
      const x = field.origin[0] + (column / (pixels - 1)) * spanX;
      const y = field.origin[1] + ((pixels - 1 - row) / (pixels - 1)) * spanY;
      const zx = (sampleField(field, [x + step, y]) - sampleField(field, [x - step, y])) / (2 * step);
      const zy = (sampleField(field, [x, y + step]) - sampleField(field, [x, y - step])) / (2 * step);
      const slope = Math.atan(Math.hypot(zx, zy));
      const aspect = Math.atan2(zy, -zx);
      const light = Math.max(
        0,
        Math.cos(altitude) * Math.cos(slope) + Math.sin(altitude) * Math.sin(slope) * Math.cos(azimuth - aspect)
      );
      const tone = Math.round(48 + light * 170);
      const index = (row * pixels + column) * 4;
      image.data[index] = tone;
      image.data[index + 1] = Math.max(0, tone - 8);
      image.data[index + 2] = Math.max(0, tone - 16);
      image.data[index + 3] = 80;
    }
  context.putImageData(image, 0, 0);
  return element("image", {
    href: canvas.toDataURL(),
    x: String(field.origin[0]),
    y: String(-(field.origin[1] + spanY)),
    width: String(spanX),
    height: String(spanY)
  });
}
