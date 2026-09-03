import { edgeEnd, faceNeighbors, facePoints, faceVertices } from "../core/mesh";
import type { CityDocument, EdgeRef, Face, FeatureGroup, Id, Mesh, Point, Tool } from "../core/types";

const NS = "http://www.w3.org/2000/svg";
const REFERENCE_LABEL_EXTENT_METERS = 1200;
const REFERENCE_LABEL_FONT_SIZE = 14;

export interface RenderSelection {
  faceId: Id | null;
  edgeId: Id | null;
  vertexId: Id | null;
  groupId: Id | null;
  hoverGroupId?: Id | null;
  hoverVertexId?: Id | null;
  hoverEdgeId?: Id | null;
}

export function renderEditorSvg(
  document: CityDocument,
  tool: Tool,
  selection: RenderSelection,
  viewBox: string,
  zoom: number,
  showSelectionLabels = false,
  /** The MFCG backdrop is held outside `document` so it never enters history;
   * fall back to the document field for a freshly parsed file. */
  referenceImage: CityDocument["referenceImage"] | null = null,
  /** Face ids to tint as the ③ urban-core debug highlight — the exact cells the
   * Generate panel's nPatches step-through / stage just marked buildable, so the
   * flood-fill is visible on the mesh (docs/city-generator/towngen-comparison.md
   * §2.1). Not part of the document — a transient view of the current step. */
  urbanCoreHighlight: ReadonlySet<Id> | null = null
): SVGSVGElement {
  const svg = element("svg", { viewBox, class: "ce-svg", "aria-label": "City editor canvas" }) as SVGSVGElement;
  const backdrop = referenceImage ?? document.referenceImage;
  if (backdrop) {
    const { href, width, height } = backdrop;
    svg.appendChild(
      element("image", {
        href,
        x: String(-width / 2),
        y: String(-height / 2),
        width: String(width),
        height: String(height),
        class: "ce-reference-image",
        "pointer-events": "none"
      })
    );
  }
  const cells = element("g", { class: "ce-cells" });
  for (const face of Object.values(document.mesh.faces)) {
    cells.appendChild(
      element("path", {
        d: polygon(facePoints(document.mesh, face)),
        class: faceClassName(face, selection.faceId === face.id, urbanCoreHighlight?.has(face.id) ?? false),
        "data-face": face.id
      })
    );
  }
  svg.appendChild(cells);

  const edges = element("g", { class: "ce-edges" });
  for (const edge of Object.values(document.mesh.edges)) {
    const [a, b] = [document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point];
    edges.appendChild(
      element("path", {
        d: line([a, b]),
        class: `ce-edge${selection.edgeId === edge.id ? " ce-selected" : ""}`,
        "data-edge": edge.id
      })
    );
  }
  svg.appendChild(edges);

  const features = element("g", { class: "ce-features" });
  for (const group of document.featureGroups) {
    const active = selection.groupId === group.id;
    const points =
      group.kind === "river"
        ? group.vertices.map(id => document.mesh.vertices[id]?.point).filter(isPoint)
        : edgeGroupPoints(document, group.segments);
    if (points.length < 2) continue;
    features.appendChild(
      element("path", {
        d: line(points),
        class: `ce-feature ce-feature--${group.kind}${active ? " ce-active-group" : ""}`,
        stroke: group.style.color,
        "stroke-width": String(group.style.widthMeters),
        "data-group": group.id,
        // Once selected, let the mesh edges below receive clicks so individual
        // route segments can be added and removed.
        "pointer-events": active ? "none" : "stroke"
      })
    );
  }
  svg.appendChild(features);
  svg.appendChild(element("g", { class: "ce-route-preview-layer", "pointer-events": "none" }));

  const wardLandmarks = element("g", { class: "ce-ward-landmarks", "pointer-events": "none" });
  for (const face of Object.values(document.mesh.faces)) {
    const marker = renderFaceWardLandmark(document.mesh, face);
    if (marker) wardLandmarks.appendChild(marker);
  }
  svg.appendChild(wardLandmarks);

  const gates = element("g", { class: "ce-gates", "pointer-events": "none" });
  for (const gate of document.gates ?? []) {
    const point = document.mesh.vertices[gate.vertexId]?.point;
    if (point) gates.appendChild(cityElementMarker(point, "gate", gate.id));
  }
  svg.appendChild(gates);

  const elements = element("g", { class: "ce-elements" });
  for (const cityElement of document.elements) {
    // Cell landmarks are determined by Ward. Keep only point decorations from
    // imported data here so the document has one source of truth per cell.
    if (!cityElement.point) continue;
    const p = cityElement.point;
    if (cityElement.kind === "tree") {
      elements.appendChild(tree(p, cityElement.sizeMeters ?? 8, cityElement.id));
      continue;
    }
    elements.appendChild(cityElementMarker(p, cityElement.kind, cityElement.id));
  }
  svg.appendChild(elements);

  if (showSelectionLabels && selection.faceId) appendFaceSelectionLabels(svg, document, selection.faceId, zoom);

  const showAllVertices = tool === "vertex" || tool === "river";
  const visibleVertexIds = new Set([selection.vertexId].filter((id): id is Id => !!id));
  if (showAllVertices || visibleVertexIds.size) {
    const vertices = element("g", { class: "ce-vertices" });
    for (const vertex of Object.values(document.mesh.vertices)) {
      if (!showAllVertices && !visibleVertexIds.has(vertex.id)) continue;
      vertices.appendChild(
        element("circle", {
          cx: String(vertex.point[0]),
          cy: String(-vertex.point[1]),
          r: String(vertexHandleRadius(zoom)),
          class: `ce-vertex${selection.vertexId === vertex.id ? " ce-selected" : ""}`,
          "data-vertex": vertex.id
        })
      );
    }
    svg.appendChild(vertices);
  }

  // Hover feedback lives in its own thin layer so the editor can repaint it on
  // pointermove without rebuilding every cell/edge/vertex node. Populated by
  // renderHoverOverlay(); see the ce-route-preview-layer for the same pattern.
  svg.appendChild(element("g", { class: "ce-hover-layer", "pointer-events": "none" }));
  return svg;
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

/** Show the IDs used by the face-editing controls while a cell is selected. */
function appendFaceSelectionLabels(svg: SVGSVGElement, document: CityDocument, faceId: Id, zoom: number): void {
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

/**
 * Label text is expressed in SVG map units. Scale it with the map extent so a
 * freshly opened large/imported map has the same screen size as a new small
 * (1200 m) map; compensate for the current zoom afterwards.
 */
export function selectionLabelFontSize(extentMeters: number, zoom: number): number {
  return (REFERENCE_LABEL_FONT_SIZE * Math.max(1, extentMeters)) / (REFERENCE_LABEL_EXTENT_METERS * Math.max(1, zoom));
}

/**
 * Keep a vertex label directly on its point unless it would cover a nearby
 * vertex. In that case, shift it away from the closest point just far enough
 * for the text to clear it.
 */
function vertexLabelPoint(vertexId: Id, document: CityDocument, fontSize: number): Point {
  const vertex = document.mesh.vertices[vertexId];
  if (!vertex) return [0, 0];
  let closest: Point | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of Object.values(document.mesh.vertices)) {
    if (candidate.id === vertexId) continue;
    const distance = Math.hypot(candidate.point[0] - vertex.point[0], candidate.point[1] - vertex.point[1]);
    if (distance < closestDistance) {
      closest = candidate.point;
      closestDistance = distance;
    }
  }

  // Approximate half the label width, with a small amount of clearance.
  const labelRadius = Math.max(fontSize * 1.25, vertexId.length * fontSize * 0.38);
  if (!closest || closestDistance > labelRadius * 1.5) return vertex.point;
  const dx = vertex.point[0] - closest[0];
  const dy = vertex.point[1] - closest[1];
  const distance = Math.hypot(dx, dy) || 1;
  const displacement = labelRadius + fontSize * 0.3;
  return [vertex.point[0] + (dx / distance) * displacement, vertex.point[1] + (dy / distance) * displacement];
}

/** Vertex handles retain a precise, constant map-space radius at every zoom. */
export function vertexHandleRadius(_zoom: number): number {
  return 2;
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

function edgeGroupPoints(document: CityDocument, segments: EdgeRef[]): Point[] {
  if (!segments.length) return [];
  const first = segments[0];
  const edge = document.mesh.edges[first.edgeId];
  if (!edge) return [];
  const start = first.forward ? edge.a : edge.b;
  return [
    document.mesh.vertices[start].point,
    ...segments.map(segment => document.mesh.vertices[edgeEnd(document.mesh, segment)].point)
  ];
}

function polygon(points: Point[]): string {
  return `${line(points)} Z`;
}

function line(points: Point[]): string {
  return points.map((point, index) => `${index ? "L" : "M"}${point[0]} ${-point[1]}`).join(" ");
}

function centroid(points: Point[]): Point {
  const total = points.reduce<Point>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [total[0] / points.length, total[1] / points.length];
}

function element(name: string, attrs: Record<string, string>, content?: string): SVGElement {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (content) node.textContent = content;
  return node;
}

function isPoint(point: Point | undefined): point is Point {
  return point !== undefined;
}

/**
 * Use simple SVG geometry rather than font or emoji glyphs. Browser emoji fonts
 * are not guaranteed to render in an SVG text node, and CSS text transforms can
 * move those nodes away from their cell. Every marker is centred at local 0,0.
 */
function cityElementMarker(point: Point, kind: string, id: Id): SVGElement {
  const marker = element("g", {
    class: `ce-element ce-element--${kind}`,
    "data-element": id,
    transform: `translate(${point[0]} ${-point[1]})`,
    "pointer-events": "none"
  });
  marker.appendChild(element("circle", { r: "15", class: "ce-element-halo" }));
  const common = { class: "ce-element-mark", fill: "none", stroke: "currentColor", "stroke-width": "2.4" };

  switch (kind) {
    case "plaza":
      marker.appendChild(element("rect", { ...common, x: "-8", y: "-8", width: "16", height: "16", rx: "1" }));
      break;
    case "citadel":
      marker.appendChild(element("path", { ...common, d: "M-10 9V-8H-6V-12H-2V-8H2V-12H6V-8H10V9ZM-10 1H10" }));
      break;
    case "temple":
      marker.appendChild(element("path", { ...common, d: "M0-12V12M-6-6H6M-9 10H9" }));
      break;
    case "harbor":
      marker.append(
        element("circle", { ...common, cx: "0", cy: "-7", r: "3" }),
        element("path", { ...common, d: "M0-4V8M-8 2H8M-11 8C-7 15 7 15 11 8M-11 8L-7 12M11 8L7 12" })
      );
      break;
    case "park":
      marker.append(
        element("circle", { ...common, cx: "-5", cy: "-2", r: "5" }),
        element("circle", { ...common, cx: "5", cy: "-2", r: "5" }),
        element("path", { ...common, d: "M0 1V11M-8 11H8" })
      );
      break;
    case "gate":
      marker.appendChild(element("path", { ...common, d: "M-10 10V0A10 10 0 0 1 10 0V10M-13 10H13" }));
      break;
    case "tower":
      marker.appendChild(element("path", { ...common, d: "M-7 11V-9H-4V-12H-1V-9H1V-12H4V-9H7V11ZM-10 11H10" }));
      break;
    default:
      marker.appendChild(element("circle", { ...common, r: "7" }));
  }
  return marker;
}

function wardLandmarkKind(ward: string | null): "plaza" | "citadel" | "harbor" | "park" | null {
  const landmarks = { market: "plaza", castle: "citadel", harbor: "harbor", park: "park" } as const;
  return landmarks[ward as keyof typeof landmarks] ?? null;
}

/**
 * The `class` attribute for one face's `<path>`, exactly as renderEditorSvg
 * assigns it in bulk. Exposed so a caller that knows precisely which faces
 * changed (ward/sea painting) can patch the existing `<path>` elements
 * in place instead of rebuilding the whole SVG — the difference between an
 * O(painted cells) and an O(mesh) repaint on a Large grid.
 */
export function faceClassName(face: Face, selected: boolean, urbanCoreHighlighted = false): string {
  return `ce-face ce-face--${face.properties.water} ce-face--ward-${face.properties.ward ?? "unassigned"}${urbanCoreHighlighted ? " ce-face--urban-step" : ""}${selected ? " ce-selected" : ""}`;
}

/**
 * Build one face's Ward landmark marker (the same rule renderEditorSvg uses
 * to populate `.ce-ward-landmarks` in bulk), or null if this face shouldn't
 * show one. Pairs with faceClassName() for patching a single changed face.
 */
export function renderFaceWardLandmark(mesh: Mesh, face: Face): SVGElement | null {
  const kind = wardLandmarkKind(face.properties.ward);
  if (!kind || face.properties.water !== "land") return null;
  return cityElementMarker(centroid(facePoints(mesh, face)), kind, `ward-${face.id}`);
}

function tree(point: Point, radius: number, id: Id): SVGElement {
  const [x, y] = [point[0], -point[1]];
  const crown = element("g", { class: "ce-tree", "data-element": id, "pointer-events": "none" });
  crown.append(
    element("path", {
      d: `M${x} ${y + radius} L${x} ${y - radius * 0.15}`,
      class: "ce-tree-trunk",
      "stroke-width": String(Math.max(1, radius * 0.22))
    }),
    element("circle", {
      cx: String(x - radius * 0.36),
      cy: String(y - radius * 0.18),
      r: String(radius * 0.48),
      class: "ce-tree-crown"
    }),
    element("circle", {
      cx: String(x + radius * 0.36),
      cy: String(y - radius * 0.18),
      r: String(radius * 0.48),
      class: "ce-tree-crown"
    }),
    element("circle", {
      cx: String(x),
      cy: String(y - radius * 0.58),
      r: String(radius * 0.52),
      class: "ce-tree-crown"
    })
  );
  return crown;
}
