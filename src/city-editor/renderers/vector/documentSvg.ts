import { fabricHouseInfo } from "../../generators/vector/fabric/houses";
import { gateOpening } from "../../generators/vector/geometry/network";
import { evaluatePresetPiece, presetPieces } from "../../generators/vector/geometry/presets";
import type { VectorCityDocument, VectorPath } from "../../types/vector/document";
import type { VectorStage } from "../../types/vector/urban";
import { element, polygon } from "../svgPrimitives";
import { vectorRenderData } from "./renderData";

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
  stage: VectorStage = document.urban ? "housing" : "regions",
  selectedHouseId?: string
): SVGSVGElement {
  const data = vectorRenderData(document, stage),
    extent = data.extentMeters,
    [centerX, centerY] = data.center,
    sceneId = ++vectorSceneId;
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
  for (const contour of data.contours ?? [])
    svg.append(
      element("path", {
        d: `M${contour.points.map(p => `${p[0]} ${-p[1]}`).join(" L")}`,
        fill: "none",
        stroke: "#aaa18b",
        "stroke-width": ".4",
        "data-vector-contour": String(contour.elevation)
      })
    );
  const attributes = {
    feature: "data-vector-feature",
    region: "data-vector-region",
    block: "data-vector-block",
    junction: "data-vector-junction",
    road: "data-vector-surface",
    river: "data-vector-surface",
    wall: "data-vector-surface",
    bridge: "data-vector-bridge",
    access: "data-vector-access",
    building: "data-vector-placement"
  };
  for (const surface of data.surfaces) {
    const attrs: Record<string, string> = {
      d: surface.polygons
        .flatMap(p => [p.outer, ...p.holes])
        .map(polygon)
        .join(" "),
      "fill-rule": "evenodd",
      fill: surface.color,
      // A street block's generated houses share one path; the house is resolved from the click point.
      [surface.houses ? "data-vector-fabric-cell" : attributes[surface.kind]]: surface.id
    };
    if (["road", "river", "wall"].includes(surface.kind)) attrs["data-vector-role"] = surface.kind;
    if (surface.kind === "river" && document.site?.water.some(w => w.id === surface.id))
      attrs["data-vector-surveyed-water"] = surface.id;
    if (surface.kind === "building") {
      attrs["data-vector-building-kind"] = surface.buildingKind ?? "manual";
      attrs.stroke = "#66584a";
      attrs["stroke-width"] = ".3";
      if (surface.provisional) attrs["stroke-dasharray"] = "1 1";
    }
    svg.append(element("path", attrs));
  }
  for (const path of data.paths)
    svg.append(
      element("path", {
        d: vectorPathSvg(path),
        fill: "none",
        stroke: path.role === "wall" ? "transparent" : "#6a6257",
        "stroke-width": ".5",
        "vector-effect": "non-scaling-stroke",
        "data-vector-path": path.id
      })
    );
  for (const gate of Object.values(document.connections.gates))
    if (data.paths.some(p => p.id === gate.wallPathId))
      svg.append(
        element("path", {
          d: polygon(gateOpening(document, gate)),
          fill: "none",
          stroke: "none",
          "data-vector-gate": gate.id
        })
      );
  for (const node of data.nodes)
    svg.append(
      element("circle", {
        cx: String(node.position[0]),
        cy: String(-node.position[1]),
        r: String(extent / 320),
        fill: "#be593b",
        "data-vector-node": node.id
      })
    );
  svg.dataset.vectorExtent = String(extent);
  svg.append(vectorSelectionLayer(document, extent, selectedId, selectedSegmentId, selectedHouseId));
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

/** Selection decorations live in their own layer, so changing the selection replaces only this layer:
 * no render data, validation or full SVG rebuild. Reads the document without changing it. */
export function vectorSelectionLayer(
  document: Readonly<VectorCityDocument>,
  extent: number,
  selectedId?: string,
  selectedSegmentId?: string,
  selectedHouseId?: string
): SVGGElement {
  const layer = element("g", { "data-vector-selection": "true" }) as SVGGElement;
  const house = selectedHouseId ? fabricHouseInfo(document.fabric, selectedHouseId) : undefined;
  if (house)
    layer.append(
      element("path", {
        d: polygon(house.ring),
        fill: "none",
        stroke: "#e48b32",
        "stroke-width": "2",
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "none",
        "data-vector-selected-house": house.id
      })
    );
  const selected = selectedId && Object.hasOwn(document.paths, selectedId) ? document.paths[selectedId] : undefined;
  if (!selected) return layer;
  layer.append(
    element("path", {
      d: vectorPathSvg(selected),
      fill: "none",
      stroke: "#db573b",
      "stroke-width": "1.5",
      "vector-effect": "non-scaling-stroke",
      "pointer-events": "none",
      "data-vector-selected-path": selected.id
    })
  );
  if (selected.source.kind !== "curve" || selected.editPolicy !== "editable") return layer;
  const radius = extent / 220;
  const source = selected.source;
  source.segments.forEach((segment, index) => {
    const active = segment.id === (selectedSegmentId ?? source.segments[0].id);
    if (segment.kind === "cubic" && active)
      for (const key of ["control1", "control2"] as const) {
        const p = segment[key],
          end = key === "control1" ? segment.from : segment.to;
        layer.append(
          element("path", {
            d: `M${end[0]} ${-end[1]} L${p[0]} ${-p[1]}`,
            stroke: "#4584ad",
            "stroke-width": "1",
            "vector-effect": "non-scaling-stroke",
            "pointer-events": "none"
          })
        );
        layer.append(
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
      layer.append(
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
  return layer;
}

/** Replace the selection layer of an SVG drawn by `renderVectorDocument`. False if there is none. */
export function updateVectorSelection(
  svg: SVGSVGElement,
  document: Readonly<VectorCityDocument>,
  selectedId?: string,
  selectedSegmentId?: string,
  selectedHouseId?: string
): boolean {
  const old = svg.querySelector("[data-vector-selection]"),
    extent = Number(svg.dataset.vectorExtent);
  if (!old || !Number.isFinite(extent)) return false;
  old.replaceWith(vectorSelectionLayer(document, extent, selectedId, selectedSegmentId, selectedHouseId));
  return true;
}
