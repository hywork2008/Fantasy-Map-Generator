import type { GridEvolutionStage } from "../core/gen/gridEvolution";
import { faceNeighbors, facePoints, faceVertices } from "../core/mesh";
import type { CityDocument, FeatureGroup, Id } from "../core/types";
import type { RenderSelection } from "../types/selection";
import { selectionLabelFontSize, vertexHandleRadius, vertexLabelPoint } from "./labelLayout";
import { centroid, edgeGroupPoints, element, isPoint, line, polygon } from "./svgPrimitives";

/** Transient editor overlays: grid scrub, hover, measure, selection labels and route preview.
 * They read the document and never decide what exists in the city. */

/** A "Grid evolution" step drawn as a translucent overlay above the mesh while
 * the Document panel scrubs `buildGridEvolution` (Phase G1). Not part of the
 * document — a transient view of one algorithm iteration. */
export interface GridOverlay {
  stage: Pick<GridEvolutionStage, "sites" | "delaunay" | "cells">;
  showCells: boolean;
  showDelaunay: boolean;
  showSites: boolean;
}

/** The translucent "Grid evolution" scrub layer: Voronoi cells, Delaunay edges
 * and sites for one `buildGridEvolution` stage, drawn on top of the mesh. */
export function renderGridOverlay(overlay: GridOverlay): SVGGElement {
  const layer = element("g", { class: "ce-grid-evolution", "pointer-events": "none" }) as SVGGElement;
  if (overlay.showCells) {
    const cells = element("g", { class: "ce-grid-cells" });
    for (const cell of overlay.stage.cells) {
      if (cell.polygon.length >= 3)
        cells.appendChild(element("path", { d: polygon(cell.polygon), class: "ce-grid-cell" }));
    }
    layer.appendChild(cells);
  }
  if (overlay.showDelaunay) {
    const tris = element("g", { class: "ce-grid-delaunay" });
    for (const [a, b] of overlay.stage.delaunay) {
      tris.appendChild(element("path", { d: line([a, b]), class: "ce-grid-delaunay-edge" }));
    }
    layer.appendChild(tris);
  }
  if (overlay.showSites) {
    const sites = element("g", { class: "ce-grid-sites" });
    overlay.stage.sites.forEach((p, i) => {
      sites.appendChild(
        element("circle", {
          cx: String(p[0]),
          cy: String(-p[1]),
          r: i === overlay.stage.sites.length - 1 ? "4" : "2.4",
          class: `ce-grid-site${i === overlay.stage.sites.length - 1 ? " ce-grid-site--latest" : ""}`
        })
      );
    });
    layer.appendChild(sites);
  }
  return layer;
}

/**
 * Build just the hover-highlight marks (glowing route, edge, and nearest-vertex
 * handle). The editor drops these into the `.ce-hover-layer` group on every
 * pointer move, which is far cheaper than a full renderEditorSvg() pass on a
 * Medium/Large grid.
 */
export function renderHoverOverlay(document: CityDocument, selection: RenderSelection, zoom: number): SVGElement[] {
  const nodes: SVGElement[] = [];
  if (selection.hoverGroupId) {
    const group = document.featureGroups.find(candidate => candidate.id === selection.hoverGroupId);
    if (group) {
      const points =
        group.kind === "river"
          ? group.vertices.map(id => document.mesh.vertices[id]?.point).filter(isPoint)
          : edgeGroupPoints(document, group.segments);
      if (points.length >= 2) {
        nodes.push(
          element("path", {
            d: line(points),
            class: `ce-feature ce-feature--${group.kind} ce-hover-group`,
            stroke: group.style.color,
            "stroke-width": String(group.style.widthMeters),
            "pointer-events": "none"
          })
        );
      }
    }
  }
  if (selection.hoverEdgeId) {
    const edge = document.mesh.edges[selection.hoverEdgeId];
    const a = edge ? document.mesh.vertices[edge.a]?.point : undefined;
    const b = edge ? document.mesh.vertices[edge.b]?.point : undefined;
    if (a && b) {
      nodes.push(element("path", { d: line([a, b]), class: "ce-edge ce-selected", "pointer-events": "none" }));
    }
  }
  if (selection.hoverVertexId) {
    const vertex = document.mesh.vertices[selection.hoverVertexId];
    if (vertex) {
      nodes.push(
        element("circle", {
          cx: String(vertex.point[0]),
          cy: String(-vertex.point[1]),
          r: String(vertexHandleRadius(zoom)),
          class: "ce-vertex ce-hover-vertex",
          "data-vertex": vertex.id
        })
      );
    }
  }
  return nodes;
}

/**
 * Renders the measure overlay elements:
 * - A single circle for the pending start point if only `from` is set.
 * - A straight line, start/end point circles, and distance label if both `from` and `to` are set.
 */
export function renderMeasureOverlay(
  from: [number, number] | null,
  to: [number, number] | null,
  metersPerPixel: number,
  formattedDistance?: string
): SVGElement[] {
  if (!from) return [];
  if (!to) {
    const r = String(Math.max(2, 4 * metersPerPixel));
    return [
      element("circle", {
        cx: String(from[0]),
        cy: String(-from[1]),
        r,
        class: "ce-measure-point ce-measure-point--start",
        "pointer-events": "none"
      })
    ];
  }

  const nodes: SVGElement[] = [];
  const lineEl = element("line", {
    x1: String(from[0]),
    y1: String(-from[1]),
    x2: String(to[0]),
    y2: String(-to[1]),
    class: "ce-measure-line",
    "pointer-events": "none"
  });
  nodes.push(lineEl);

  const r = String(Math.max(2, 3.5 * metersPerPixel));
  nodes.push(
    element("circle", {
      cx: String(from[0]),
      cy: String(-from[1]),
      r,
      class: "ce-measure-point",
      "pointer-events": "none"
    })
  );
  nodes.push(
    element("circle", {
      cx: String(to[0]),
      cy: String(-to[1]),
      r,
      class: "ce-measure-point",
      "pointer-events": "none"
    })
  );

  if (formattedDistance) {
    const midX = (from[0] + to[0]) / 2;
    const midY = (-from[1] + -to[1]) / 2;
    const fontSize = Math.max(8, 12 * metersPerPixel);
    const textEl = element(
      "text",
      {
        x: String(midX),
        y: String(midY),
        "font-size": String(fontSize),
        "stroke-width": String(Math.max(1, fontSize * 0.25)),
        "text-anchor": "middle",
        dy: String(-fontSize * 0.6),
        class: "ce-measure-label",
        "pointer-events": "all"
      },
      formattedDistance
    );
    nodes.push(textEl);
  }

  return nodes;
}

/** Show the IDs used by the face-editing controls while a cell is selected. */
export function appendFaceSelectionLabels(svg: SVGSVGElement, document: CityDocument, faceId: Id, zoom: number): void {
  const selectedFace = document.mesh.faces[faceId];
  if (!selectedFace) return;
  const labels = element("g", { class: "ce-selection-labels", "pointer-events": "none" });
  const fontSize = selectionLabelFontSize(document.frame.extentMeters, zoom);

  for (const vertexId of faceVertices(document.mesh, selectedFace)) {
    const vertex = document.mesh.vertices[vertexId];
    if (!vertex) continue;
    const point = vertexLabelPoint(vertex.id, document, fontSize);
    labels.appendChild(
      element(
        "text",
        {
          x: String(point[0]),
          y: String(-point[1]),
          "font-size": String(fontSize),
          "text-anchor": "middle",
          "dominant-baseline": "central",
          class: "ce-selection-label ce-selection-vertex-label"
        },
        vertex.id
      )
    );
  }

  for (const nearbyFaceId of [selectedFace.id, ...faceNeighbors(document.mesh, selectedFace.id)]) {
    const face = document.mesh.faces[nearbyFaceId];
    if (!face) continue;
    const point = centroid(facePoints(document.mesh, face));
    labels.appendChild(
      element(
        "text",
        {
          x: String(point[0]),
          y: String(-point[1]),
          "font-size": String(fontSize),
          "text-anchor": "middle",
          "dominant-baseline": "central",
          class: "ce-selection-label ce-selection-face-label"
        },
        face.id
      )
    );
  }
  svg.appendChild(labels);
}

/** Create a lightweight overlay path for an uncommitted route preview. */
export function renderRoutePreview(document: CityDocument, group: FeatureGroup, vertices: Id[]): SVGPathElement | null {
  const points = vertices.map(id => document.mesh.vertices[id]?.point).filter(isPoint);
  if (points.length < 2) return null;
  return element("path", {
    d: line(points),
    class: `ce-feature ce-route-preview ce-feature--${group.kind}`,
    stroke: "#ffd75c",
    "stroke-width": String(group.style.widthMeters),
    "pointer-events": "none"
  }) as SVGPathElement;
}

export type { RenderSelection } from "../types/selection";
export { selectionLabelFontSize, vertexHandleRadius };
