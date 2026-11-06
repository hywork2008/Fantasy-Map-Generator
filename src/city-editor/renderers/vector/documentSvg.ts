import { evaluateAnchor, pathSegmentIds } from "../../generators/vector/geometry/curves";
import { assertVectorDocument } from "../../generators/vector/validation/document";
import type { VectorCityDocument, VectorPath } from "../../types/vector/document";
import { element, polygon } from "../svgPrimitives";

/** Exact source centerlines for the document preview, not inferred road/river surfaces. */
export function vectorPathSvg(path: VectorPath): string {
  if (path.source.kind === "curve") {
    const first = path.source.segments[0].from;
    return `M${first[0]} ${-first[1]} ${path.source.segments
      .map(s =>
        s.kind === "line"
          ? `L${s.to[0]} ${-s.to[1]}`
          : `C${s.control1[0]} ${-s.control1[1]} ${s.control2[0]} ${-s.control2[1]} ${s.to[0]} ${-s.to[1]}`
      )
      .join(" ")}${path.source.closed ? " Z" : ""}`;
  }
  const ids = pathSegmentIds(path);
  const start = evaluateAnchor(path, { pathId: path.id, segmentId: ids[0], t: 0 });
  const s = path.source;
  return `M${start[0]} ${-start[1]} ${ids
    .map(segmentId => {
      const p = evaluateAnchor(path, { pathId: path.id, segmentId, t: 1 });
      return s.preset === "ellipse"
        ? `A${s.widthMeters / 2} ${s.heightMeters / 2} ${s.bearingDegrees - 90} 0 0 ${p[0]} ${-p[1]}`
        : `L${p[0]} ${-p[1]}`;
    })
    .join(" ")} Z`;
}

export function renderVectorDocument(document: VectorCityDocument): SVGSVGElement {
  assertVectorDocument(document);
  const extent = document.frame.extentMeters;
  const svg = element("svg", {
    class: "ce-svg ce-vector-svg",
    viewBox: `${-extent / 2} ${-extent / 2} ${extent} ${extent}`,
    role: "img"
  }) as SVGSVGElement;
  svg.append(
    element("rect", {
      x: String(-extent / 2),
      y: String(-extent / 2),
      width: String(extent),
      height: String(extent),
      fill: "#ece6d9"
    })
  );
  for (const region of Object.values(document.regions))
    svg.append(
      element("path", {
        d: [region.outer, ...region.holes].map(polygon).join(" "),
        "fill-rule": "evenodd",
        fill: "#bfc8ab",
        "data-vector-region": region.id
      })
    );
  for (const path of Object.values(document.paths))
    svg.append(
      element("path", {
        d: vectorPathSvg(path),
        fill: "none",
        stroke: path.role === "river" ? "#367faa" : path.role === "wall" ? "#4b4340" : "#9d7949",
        "stroke-width": "2",
        "vector-effect": "non-scaling-stroke",
        "data-vector-path": path.id,
        "data-vector-role": path.role
      })
    );
  for (const placement of Object.values(document.placements))
    svg.append(
      element("path", {
        d: [placement.site.outer, ...placement.site.holes].map(polygon).join(" "),
        "fill-rule": "evenodd",
        fill: "#99816b",
        "data-vector-placement": placement.id
      })
    );
  for (const node of Object.values(document.connections.nodes))
    svg.append(
      element("circle", {
        cx: String(node.position[0]),
        cy: String(-node.position[1]),
        r: "2",
        fill: "#be593b",
        "data-vector-node": node.id
      })
    );
  return svg;
}
