import { polygonArea } from "../generators/geom";
import { convexInfillParts } from "../generators/lotGeometry";
import { facePoints } from "../generators/mesh";
import { corridor, intersectConvex, subtractConvex } from "../generators/parcelGeometry";
import { waterPolygons } from "../generators/waterGeometry";
import type { Point } from "../types/primitives";
import type { LandscapeKeepOut } from "./landscape";
import type { RenderContext } from "./renderContext";
import { element, polygon } from "./svgPrimitives";

/** Natural ocean shore: beach band and scrub, which also reserve ground the landscape must keep clear. */
export function renderCoastalShore(ctx: RenderContext, svg: SVGSVGElement, landscapeKeepOut: LandscapeKeepOut) {
  const { document, town } = ctx;
  if (town && document.coastalOceanFaceIds?.length) {
    const shore = element("g", { class: "ce-natural-shore", "pointer-events": "none" });
    const ocean = new Set(document.coastalOceanFaceIds);
    const wetParts = waterPolygons(document).flatMap(convexInfillParts);
    const dryShoreParts = (outline: Point[]) => {
      let parts = convexInfillParts(outline);
      for (const wet of wetParts) parts = parts.flatMap(part => subtractConvex(part, wet, 1));
      return parts;
    };
    for (const edge of Object.values(document.mesh.edges)) {
      const left = document.mesh.faces[edge.leftFace ?? ""];
      const right = document.mesh.faces[edge.rightFace ?? ""];
      const land =
        left?.properties.water === "land" && right?.properties.water === "sea" && ocean.has(right.id)
          ? left
          : right?.properties.water === "land" && left?.properties.water === "sea" && ocean.has(left.id)
            ? right
            : null;
      if (!land || land.properties.ward === "harbor") continue;
      const a = document.mesh.vertices[edge.a].point,
        b = document.mesh.vertices[edge.b].point;
      const fortified = land.properties.ward === "castle";
      const builtShore =
        fortified ||
        (land.properties.settlement === "core" &&
          !["park", "farm", "cemetery", "empty"].includes(land.properties.ward ?? ""));
      if (builtShore) {
        const revetment = corridor(a, b, fortified ? 22 : 14, 8);
        for (const part of dryShoreParts(facePoints(document.mesh, land))) {
          const bank = intersectConvex(part, revetment);
          if (bank.length < 3 || Math.abs(polygonArea(bank)) < 1) continue;
          shore.appendChild(
            element("path", {
              d: polygon(bank),
              fill: fortified ? "#99988c" : "#ada99a",
              stroke: "none",
              "data-coast-face": land.id,
              "data-shore-kind": fortified ? "fortified" : "revetment"
            })
          );
        }
        continue;
      }
      const beachBand = corridor(a, b, 34, 8);
      const scrubBand = corridor(a, b, 70, 8);
      landscapeKeepOut.polygons.push(beachBand);
      for (const part of dryShoreParts(facePoints(document.mesh, land))) {
        const scrub = intersectConvex(part, scrubBand);
        for (const polygonPart of scrub.length >= 3 ? subtractConvex(scrub, beachBand, 1) : []) {
          shore.appendChild(
            element("path", {
              d: polygon(polygonPart),
              fill: "#b9bc9d",
              stroke: "none",
              "data-coast-face": land.id
            })
          );
        }
        const beach = intersectConvex(part, beachBand);
        if (beach.length < 3 || Math.abs(polygonArea(beach)) < 1) continue;
        shore.appendChild(
          element("path", {
            d: polygon(beach),
            fill: "#d7c9a6",
            stroke: "none",
            "data-coast-face": land.id,
            "data-shore-kind": "beach"
          })
        );
      }
    }
    svg.appendChild(shore);
  }
}
