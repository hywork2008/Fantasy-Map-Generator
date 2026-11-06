import { bridgeGeometry, gateOpening, junctionSurface } from "../../generators/vector/geometry/network";
import { evaluatePresetPiece, presetPieces } from "../../generators/vector/geometry/presets";
import { pathSurface } from "../../generators/vector/geometry/surfaces";
import { vectorWaterSurfaces } from "../../generators/vector/geometry/water";
import { assertVectorDocument } from "../../generators/vector/validation/document";
import type { VectorCityDocument, VectorPath } from "../../types/vector/document";
import { element, polygon } from "../svgPrimitives";

let vectorSceneId = 0;

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
  selectedSegmentId?: string,
  stage: "inputs" | "skeleton" | "regions" = "regions"
): SVGSVGElement {
  assertVectorDocument(document);
  const hidden = new Set(stage === "inputs" ? Object.keys(document.generation?.pathRevisions ?? {}) : []);
  const rings = Object.values(document.paths).map(path => pathSurface(path).outer);
  let extent = document.frame.extentMeters,
    centerX = document.site?.center[0] ?? 0,
    centerY = document.site?.center[1] ?? 0;
  if (rings.length && !document.site) {
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
  for (const node of Object.values(document.connections.nodes)) {
    if (node.anchors.every(a => hidden.has(a.pathId))) continue;
    const junction = junctionSurface(document, node.id);
    if (junction)
      svg.append(element("path", { d: polygon(junction.outer), fill: "#c7ae84", "data-vector-junction": node.id }));
  }
  if (stage === "regions" && document.generation?.inputRevision === document.revision)
    for (const block of document.generation.blocks)
      svg.append(
        element("path", {
          d: [block.outer, ...block.holes].map(polygon).join(" "),
          "fill-rule": "evenodd",
          fill: block.reachable ? "#d5d1a9" : "#d9c9b9",
          stroke: "#b6ae90",
          "stroke-width": ".2",
          "data-vector-block": block.id
        })
      );
  const priority = { road: 0, river: 1, wall: 2 };
  let maskIndex = 0;
  const sceneId = ++vectorSceneId;
  let surveyedDrawn = false;
  for (const path of Object.values(document.paths).sort((a, b) => priority[a.role] - priority[b.role])) {
    if (hidden.has(path.id)) continue;
    if (path.role !== "road" && !surveyedDrawn) {
      surveyedDrawn = true;
      for (const water of document.site?.water ?? [])
        for (const polygonShape of water.polygons)
          svg.append(
            element("path", {
              d: [polygonShape.outer, ...polygonShape.holes].map(polygon).join(" "),
              "fill-rule": "evenodd",
              fill: "#71abc4",
              "data-vector-surveyed-water": water.id
            })
          );
    }
    const surface = pathSurface(path),
      layer = element("g", {});
    svg.append(layer);
    const gates = Object.values(document.connections.gates).filter(g => g.wallPathId === path.id);
    if (gates.length) {
      const id = `ce-vector-gate-mask-${sceneId}-${++maskIndex}`,
        mask = element("mask", {
          id,
          maskUnits: "userSpaceOnUse",
          x: String(centerX - extent / 2),
          y: String(-centerY - extent / 2),
          width: String(extent),
          height: String(extent)
        });
      mask.append(
        element("rect", {
          x: String(centerX - extent / 2),
          y: String(-centerY - extent / 2),
          width: String(extent),
          height: String(extent),
          fill: "white"
        })
      );
      for (const gate of gates)
        mask.append(
          element("path", { d: polygon(gateOpening(document, gate)), fill: "black", "data-vector-gate": gate.id })
        );
      const defs = element("defs", {});
      defs.append(mask);
      svg.append(defs);
      layer.setAttribute("mask", `url(#${id})`);
    }
    if (!document.site?.water.some(w => w.riverPathId === path.id))
      layer.append(
        element("path", {
          d: [surface.outer, ...surface.holes].map(polygon).join(" "),
          "fill-rule": "evenodd",
          fill: path.role === "river" ? "#71abc4" : path.role === "wall" ? "#655b53" : "#c7ae84",
          "data-vector-surface": path.id,
          "data-vector-role": path.role
        })
      );
    layer.append(
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
  if (!surveyedDrawn)
    for (const water of document.site?.water ?? [])
      for (const shape of water.polygons)
        svg.append(
          element("path", {
            d: [shape.outer, ...shape.holes].map(polygon).join(" "),
            "fill-rule": "evenodd",
            fill: "#71abc4",
            "data-vector-surveyed-water": water.id
          })
        );
  const waters = vectorWaterSurfaces(document);
  for (const bridge of Object.values(document.connections.bridges)) {
    if (hidden.has(bridge.roadPathId)) continue;
    const geometry = bridgeGeometry(document, bridge, waters);
    svg.append(
      element("path", {
        d: polygon(geometry.deck),
        fill: bridge.structure === "stone" ? "#a69d8c" : "#a98050",
        stroke: "#584a3d",
        "stroke-width": ".5",
        "data-vector-bridge": bridge.id
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
  const visibleNodes =
    stage === "inputs" && document.generation?.inputRevision === document.revision
      ? document.generation.inputNodes
      : Object.values(document.connections.nodes).filter(n => !n.anchors.every(a => hidden.has(a.pathId)));
  for (const node of visibleNodes)
    svg.append(
      element("circle", {
        cx: String(node.position[0]),
        cy: String(-node.position[1]),
        r: String(extent / 320),
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
  const frameClipId = `ce-vector-frame-${sceneId}`,
    defs = element("defs", {}),
    clip = element("clipPath", { id: frameClipId });
  clip.append(
    element("rect", {
      x: String(centerX - extent / 2),
      y: String(-centerY - extent / 2),
      width: String(extent),
      height: String(extent)
    })
  );
  defs.append(clip);
  const content = element("g", { "clip-path": `url(#${frameClipId})`, "data-vector-frame": "true" });
  for (const child of Array.from(svg.children)) if (child.tagName.toLowerCase() !== "defs") content.append(child);
  svg.append(defs, content);
  return svg;
}
