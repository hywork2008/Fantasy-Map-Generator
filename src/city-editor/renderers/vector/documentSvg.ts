import { evaluatePresetPiece, presetPieces } from "../../generators/vector/geometry/presets";
import { pathSurface } from "../../generators/vector/geometry/surfaces";
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
  const source = path.source,
    pieces = presetPieces(source);
  const start = evaluatePresetPiece(source, pieces[0], 0);
  return `M${start[0]} ${-start[1]} ${pieces
    .map(piece => {
      const p = evaluatePresetPiece(source, piece, 1);
      return piece.kind === "line"
        ? `L${p[0]} ${-p[1]}`
        : `A${piece.axes![0]} ${piece.axes![1]} ${source.bearingDegrees - 90} 0 0 ${p[0]} ${-p[1]}`;
    })
    .join(" ")} Z`;
}

export function renderVectorDocument(
  document: VectorCityDocument,
  selectedId?: string,
  selectedSegmentId?: string
): SVGSVGElement {
  assertVectorDocument(document);
  const rings = Object.values(document.paths).map(path => pathSurface(path).outer);
  let extent = document.frame.extentMeters,
    centerX = 0,
    centerY = 0;
  if (rings.length) {
    let minX = -extent / 2,
      maxX = extent / 2,
      minY = -extent / 2,
      maxY = extent / 2;
    for (const ring of rings)
      for (const p of ring) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]);
        maxY = Math.max(maxY, p[1]);
      }
    centerX = (minX + maxX) / 2;
    centerY = (minY + maxY) / 2;
    extent = Math.max(maxX - minX, maxY - minY) * 1.05;
  }
  const svg = element("svg", {
    class: "ce-svg ce-vector-svg",
    viewBox: `${centerX - extent / 2} ${-centerY - extent / 2} ${extent} ${extent}`,
    role: "img"
  }) as SVGSVGElement;
  svg.append(
    element("rect", {
      x: String(centerX - extent / 2),
      y: String(-centerY - extent / 2),
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
  for (const path of Object.values(document.paths).sort(
    (a, b) => Number(a.role === "river") - Number(b.role === "river")
  )) {
    const surface = pathSurface(path);
    svg.append(
      element("path", {
        d: [surface.outer, ...surface.holes].map(polygon).join(" "),
        "fill-rule": "evenodd",
        fill: path.role === "river" ? "#71abc4" : path.role === "wall" ? "#655b53" : "#c7ae84",
        "data-vector-surface": path.id,
        "data-vector-role": path.role
      })
    );
    svg.append(
      element("path", {
        d: vectorPathSvg(path),
        fill: "none",
        stroke: path.id === selectedId ? "#db573b" : "#6a6257",
        "stroke-width": path.id === selectedId ? "1.5" : "0.5",
        "vector-effect": "non-scaling-stroke",
        "data-vector-path": path.id
      })
    );
  }
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
  const selected = selectedId ? document.paths[selectedId] : undefined;
  if (selected?.source.kind === "curve" && selected.editPolicy === "editable") {
    const radius = extent / 220;
    const source = selected.source;
    source.segments.forEach((segment, index) => {
      const active = segment.id === (selectedSegmentId ?? source.segments[0].id);
      if (segment.kind === "cubic" && active)
        for (const key of ["control1", "control2"] as const) {
          const p = segment[key],
            end = key === "control1" ? segment.from : segment.to;
          svg.append(
            element("path", {
              d: `M${end[0]} ${-end[1]} L${p[0]} ${-p[1]}`,
              stroke: "#4584ad",
              "stroke-width": "1",
              "vector-effect": "non-scaling-stroke",
              "pointer-events": "none"
            })
          );
          svg.append(
            element("circle", {
              cx: String(p[0]),
              cy: String(-p[1]),
              r: String(radius * 0.7),
              fill: "#70b8e0",
              "data-handle": key,
              "data-segment": String(index)
            })
          );
        }
      for (const key of ["from", "to"] as const) {
        if (key === "to" && (index < source.segments.length - 1 || source.closed)) continue;
        const p = segment[key];
        svg.append(
          element("circle", {
            cx: String(p[0]),
            cy: String(-p[1]),
            r: String(radius * (active ? 1 : 0.25)),
            fill: "#fff",
            stroke: "#db573b",
            "data-handle": key,
            "data-segment": String(index)
          })
        );
      }
    });
  }
  return svg;
}
