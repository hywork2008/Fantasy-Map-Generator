import { buildCityBuildings } from "../core/gen/buildingLots";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "../core/gen/geom";
import type { GridEvolutionStage } from "../core/gen/gridEvolution";
import { type GenerationObserver, generationTimer } from "../core/generationDiagnostics";
import { edgeEnd, faceNeighbors, facePoints, faceVertices } from "../core/mesh";
import type { CityDocument, EdgeRef, Face, FeatureGroup, Id, Mesh, Point, Tool } from "../core/types";

const NS = "http://www.w3.org/2000/svg";

/** A "Grid evolution" step drawn as a translucent overlay above the mesh while
 * the Document panel scrubs `buildGridEvolution` (Phase G1). Not part of the
 * document — a transient view of one algorithm iteration. */
export interface GridOverlay {
  stage: Pick<GridEvolutionStage, "sites" | "delaunay" | "cells">;
  showCells: boolean;
  showDelaunay: boolean;
  showSites: boolean;
}
const REFERENCE_LABEL_EXTENT_METERS = 1200;
const REFERENCE_LABEL_FONT_SIZE = 14;

export interface SvgPickInfo {
  layer: string;
  kind: string;
  id?: number | string;
  label: string;
  [key: string]: unknown;
}

export function parsePickInfo(raw: string | null): SvgPickInfo | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as SvgPickInfo;
  } catch {
    return null;
  }
}

export interface RenderSelection {
  faceId: Id | null;
  edgeId: Id | null;
  vertexId: Id | null;
  groupId: Id | null;
  inspectedId?: number | string | null;
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
  urbanCoreHighlight: ReadonlySet<Id> | null = null,
  /** Raw graph-walk polylines (one per river for ②; a single one for ①) to draw
   * as a growing dotted trail — the ①/② step-by-step debug view
   * (docs/city-generator/towngen-comparison.md): those two processes are a
   * walk, not a set of cells, so there is nothing on the document itself to
   * highlight while scrubbing partway through one. Each entry is its own SVG
   * subpath so unrelated walks never draw a connecting line between them. */
  stepWalkPaths: readonly (readonly Point[])[] | null = null,
  /** Document panel "Grid evolution" scrub overlay (Phase G1). */
  gridOverlay: GridOverlay | null = null,
  showBlockMesh = false,
  observer?: GenerationObserver
): SVGSVGElement {
  const mark = generationTimer(observer);
  const town =
    document.appearance === "town" && tool === "select" && !showBlockMesh && !gridOverlay && !showSelectionLabels;
  const svg = element("svg", {
    viewBox,
    class: `ce-svg${town ? " ce-svg--town" : ""}`,
    "aria-label": "City editor canvas"
  }) as SVGSVGElement;
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
    const isSelected = selection.faceId === face.id;
    const isPickSelected = selection.inspectedId === face.id || selection.inspectedId === `cell-${face.id}`;
    const pickInfo: SvgPickInfo = {
      layer: "cells",
      kind: "cell",
      id: face.id,
      label: `cell #${face.id}`,
      water: face.properties.water,
      elevation: face.properties.elevation,
      ward: face.properties.ward ?? null,
      site: face.site,
      center: polygonCentroid(facePoints(document.mesh, face)),
      neighbors: faceNeighbors(document.mesh, face.id),
      vertices: faceVertices(document.mesh, face)
    };
    cells.appendChild(
      element("path", {
        d: polygon(facePoints(document.mesh, face)),
        class: `${faceClassName(face, isSelected, urbanCoreHighlight?.has(face.id) ?? false)}${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
        "data-face": face.id,
        "data-pick": encodeURIComponent(JSON.stringify(pickInfo))
      })
    );
  }
  svg.appendChild(cells);

  if (town) {
    const buildings = element("g", {
      class: "ce-buildings",
      "pointer-events": tool === "select" ? "all" : "none"
    });
    mark("svg-base");
    const lots = buildCityBuildings(document);
    mark("buildings", { buildings: lots.length });
    for (const lot of lots) {
      const bldId = `bld-${lot.faceId}`;
      const isPickSelected = selection.inspectedId === bldId || selection.inspectedId === lot.faceId;
      const pickInfo: SvgPickInfo = {
        layer: "buildings",
        kind: "building",
        id: bldId,
        label: `${document.mesh.faces[lot.faceId].properties.ward} building #${lot.faceId}`,
        ward: document.mesh.faces[lot.faceId].properties.ward,
        faceId: lot.faceId,
        landmark: !!lot.landmark
      };
      const bldNode = element("path", {
        d: polygon(lot.polygon),
        class: `ce-building${lot.landmark ? " ce-building--landmark" : ""}${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
        "data-building-face": lot.faceId,
        "data-pick": encodeURIComponent(JSON.stringify(pickInfo))
      });
      if (tool === "select") bldNode.style.cursor = "pointer";
      buildings.appendChild(bldNode);
    }
    svg.appendChild(buildings);
  }

  const edges = element("g", { class: "ce-edges" });
  for (const edge of Object.values(document.mesh.edges)) {
    const [a, b] = [document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point];
    const isSelected = selection.edgeId === edge.id;
    const isPickSelected = selection.inspectedId === edge.id || selection.inspectedId === `edge-${edge.id}`;
    const pickInfo: SvgPickInfo = {
      layer: "edges",
      kind: "edge",
      id: edge.id,
      label: `edge #${edge.id}`,
      a: edge.a,
      b: edge.b,
      faces: [edge.leftFace, edge.rightFace].filter((f): f is Id => f != null)
    };
    edges.appendChild(
      element("path", {
        d: line([a, b]),
        class: `ce-edge${isSelected ? " ce-selected" : ""}${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
        "data-edge": edge.id,
        "data-pick": encodeURIComponent(JSON.stringify(pickInfo))
      })
    );
  }
  svg.appendChild(edges);

  const features = element("g", { class: "ce-features" });
  const order = { wall: 0, river: 1, road: 2, plank: 3 };
  const renderGroups = town
    ? [...document.featureGroups].sort((a, b) => order[a.kind] - order[b.kind])
    : document.featureGroups;
  for (const group of renderGroups) {
    const active = selection.groupId === group.id;
    const isPickSelected = selection.inspectedId === group.id || selection.inspectedId === `feature-${group.id}`;
    const points =
      group.kind === "river"
        ? group.vertices.map(id => document.mesh.vertices[id]?.point).filter(isPoint)
        : edgeGroupPoints(document, group.segments);
    if (points.length < 2) continue;
    if (town && group.kind === "road") {
      features.appendChild(
        element("path", {
          d: line(points),
          class: "ce-road-casing",
          fill: "none",
          stroke: "#57534b",
          "stroke-width": String(group.style.widthMeters + 1.4),
          "pointer-events": "none"
        })
      );
    }
    const pickInfo: SvgPickInfo = {
      layer: "features",
      kind: group.kind,
      id: group.id,
      label: `${group.kind} (${group.name})`,
      name: group.name,
      locked: group.locked,
      widthMeters: group.style.widthMeters,
      color: group.style.color,
      segmentCount: group.kind === "river" ? group.vertices.length : group.segments.length
    };
    features.appendChild(
      element("path", {
        d: line(points),
        class: `ce-feature ce-feature--${group.kind}${active ? " ce-active-group" : ""}${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
        stroke: town
          ? group.kind === "road"
            ? "#d5cfbf"
            : group.kind === "river"
              ? "#85857d"
              : "#292a26"
          : group.style.color,
        "stroke-width": String(group.style.widthMeters),
        "data-group": group.id,
        "data-pick": encodeURIComponent(JSON.stringify(pickInfo)),
        "pointer-events": "stroke"
      })
    );
  }
  svg.appendChild(features);
  if (town) {
    svg.appendChild(renderTownQuays(document));
    svg.appendChild(renderTownFortifications(document, tool, selection.inspectedId));
  }
  svg.appendChild(element("g", { class: "ce-route-preview-layer", "pointer-events": "none" }));

  const wardLandmarks = element("g", { class: "ce-ward-landmarks", "pointer-events": "none" });
  for (const face of Object.values(document.mesh.faces)) {
    const marker = renderFaceWardLandmark(document.mesh, face);
    if (marker && !town) wardLandmarks.appendChild(marker);
  }
  svg.appendChild(wardLandmarks);

  const gates = element("g", { class: "ce-gates", "pointer-events": tool === "select" ? "all" : "none" });
  for (const gate of document.gates ?? []) {
    const point = document.mesh.vertices[gate.vertexId]?.point;
    if (point && !town) {
      const isPickSelected = selection.inspectedId === gate.id;
      const pickInfo: SvgPickInfo = {
        layer: "gates",
        kind: "gate",
        id: gate.id,
        label: `gate #${gate.id}`,
        vertexId: gate.vertexId,
        point
      };
      const marker = cityElementMarker(point, "gate", gate.id);
      marker.setAttribute("data-pick", encodeURIComponent(JSON.stringify(pickInfo)));
      if (isPickSelected) marker.classList.add("ce-is-selected", "cg-is-selected");
      if (tool === "select") {
        marker.style.pointerEvents = "all";
        marker.style.cursor = "pointer";
      }
      gates.appendChild(marker);
    }
  }
  svg.appendChild(gates);

  const elements = element("g", { class: "ce-elements" });
  for (const cityElement of document.elements) {
    // Cell landmarks are determined by Ward. Keep only point decorations from
    // imported data here so the document has one source of truth per cell.
    if (!cityElement.point) continue;
    const p = cityElement.point;
    const isPickSelected = selection.inspectedId === cityElement.id;
    const pickInfo: SvgPickInfo = {
      layer: "elements",
      kind: cityElement.kind,
      id: cityElement.id,
      label: `${cityElement.kind} element #${cityElement.id}`,
      point: p,
      sizeMeters: cityElement.sizeMeters ?? 8
    };
    if (town && cityElement.id.startsWith("gc:")) {
      if (cityElement.kind === "plaza") {
        const plazaCircle = element("circle", {
          cx: String(p[0]),
          cy: String(-p[1]),
          r: "2.5",
          fill: "#292a26",
          class: isPickSelected ? "ce-is-selected cg-is-selected" : "",
          "data-element": cityElement.id,
          "data-pick": encodeURIComponent(JSON.stringify(pickInfo)),
          "pointer-events": tool === "select" ? "all" : "none"
        });
        if (tool === "select") plazaCircle.style.cursor = "pointer";
        elements.appendChild(plazaCircle);
      }
      if (cityElement.kind === "temple") {
        const templeRect = element("rect", {
          x: String(p[0] - 9),
          y: String(-p[1] - 6),
          width: "18",
          height: "12",
          fill: "#292a26",
          class: isPickSelected ? "ce-is-selected cg-is-selected" : "",
          "data-element": cityElement.id,
          "data-pick": encodeURIComponent(JSON.stringify(pickInfo)),
          "pointer-events": tool === "select" ? "all" : "none"
        });
        if (tool === "select") templeRect.style.cursor = "pointer";
        elements.appendChild(templeRect);
      }
      continue;
    }
    if (cityElement.kind === "tree") {
      const treeNode = tree(p, cityElement.sizeMeters ?? 8, cityElement.id);
      treeNode.setAttribute("data-pick", encodeURIComponent(JSON.stringify(pickInfo)));
      if (isPickSelected) treeNode.classList.add("ce-is-selected", "cg-is-selected");
      if (tool === "select") {
        treeNode.style.pointerEvents = "all";
        treeNode.style.cursor = "pointer";
      }
      elements.appendChild(treeNode);
      continue;
    }
    const elemMarker = cityElementMarker(p, cityElement.kind, cityElement.id);
    elemMarker.setAttribute("data-pick", encodeURIComponent(JSON.stringify(pickInfo)));
    if (isPickSelected) elemMarker.classList.add("ce-is-selected", "cg-is-selected");
    if (tool === "select") {
      elemMarker.style.pointerEvents = "all";
      elemMarker.style.cursor = "pointer";
    }
    elements.appendChild(elemMarker);
  }
  svg.appendChild(elements);

  if (showSelectionLabels && selection.faceId) appendFaceSelectionLabels(svg, document, selection.faceId, zoom);

  const showAllVertices = tool === "vertex" || tool === "river";
  const visibleVertexIds = new Set([selection.vertexId].filter((id): id is Id => !!id));
  if (showAllVertices || visibleVertexIds.size) {
    const vertices = element("g", { class: "ce-vertices" });
    for (const vertex of Object.values(document.mesh.vertices)) {
      if (!showAllVertices && !visibleVertexIds.has(vertex.id)) continue;
      const isSelected = selection.vertexId === vertex.id;
      const isPickSelected = selection.inspectedId === vertex.id || selection.inspectedId === `vertex-${vertex.id}`;
      const pickInfo: SvgPickInfo = {
        layer: "vertices",
        kind: "vertex",
        id: vertex.id,
        label: `vertex #${vertex.id}`,
        point: vertex.point
      };
      vertices.appendChild(
        element("circle", {
          cx: String(vertex.point[0]),
          cy: String(-vertex.point[1]),
          r: String(vertexHandleRadius(zoom)),
          class: `ce-vertex${isSelected ? " ce-selected" : ""}${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
          "data-vertex": vertex.id,
          "data-pick": encodeURIComponent(JSON.stringify(pickInfo))
        })
      );
    }
    svg.appendChild(vertices);
  }

  const nonEmptyWalks = stepWalkPaths?.filter(p => p.length) ?? [];
  if (nonEmptyWalks.length) {
    const walk = element("g", { class: "ce-generate-step-path", "pointer-events": "none" });
    const lastPath = nonEmptyWalks[nonEmptyWalks.length - 1];
    for (const path of nonEmptyWalks) {
      if (path.length >= 2) walk.appendChild(element("path", { d: line(path as Point[]), class: "ce-step-path-line" }));
      path.forEach((p, i) => {
        const current = path === lastPath && i === path.length - 1;
        walk.appendChild(
          element("circle", {
            cx: String(p[0]),
            cy: String(-p[1]),
            r: current ? "4.5" : "2.5",
            class: `ce-step-path-point${current ? " ce-step-path-point--current" : ""}`
          })
        );
      });
    }
    svg.appendChild(walk);
  }

  if (gridOverlay) svg.appendChild(renderGridOverlay(gridOverlay));

  // Hover feedback lives in its own thin layer so the editor can repaint it on
  // pointermove without rebuilding every cell/edge/vertex node. Populated by
  // renderHoverOverlay(); see the ce-route-preview-layer for the same pattern.
  svg.appendChild(element("g", { class: "ce-hover-layer", "pointer-events": "none" }));
  mark("svg-details");
  return svg;
}

function renderTownQuays(document: CityDocument): SVGGElement {
  const layer = element("g", { class: "ce-quays", "pointer-events": "none" }) as SVGGElement;
  if (!document.elements.some(e => e.kind === "harbor")) return layer;
  for (const edge of Object.values(document.mesh.edges)) {
    const left = edge.leftFace ? document.mesh.faces[edge.leftFace] : null;
    const right = edge.rightFace ? document.mesh.faces[edge.rightFace] : null;
    if (!left || !right || (left.properties.water === "land") === (right.properties.water === "land")) continue;
    const land = left.properties.water === "land" ? left : right;
    const water = land === left ? right : left;
    if (!land.properties.buildable) continue;
    const a = document.mesh.vertices[edge.a].point;
    const b = document.mesh.vertices[edge.b].point;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ring = facePoints(document.mesh, water);
    const center = polygonCentroid(ring);
    let normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    if ((center[0] - a[0]) * normal[0] + (center[1] - a[1]) * normal[1] < 0) normal = [-normal[0], -normal[1]];
    for (let distance = 12; distance < length - 4; distance += 24) {
      const start: Point = [a[0] + ((b[0] - a[0]) * distance) / length, a[1] + ((b[1] - a[1]) * distance) / length];
      const end: Point = [start[0] + normal[0] * 18, start[1] + normal[1] * 18];
      if (!pointInPolygon(end, ring)) continue;
      layer.appendChild(
        element("path", { d: line([start, end]), fill: "none", stroke: "#514f45", "stroke-width": "4" })
      );
      layer.appendChild(
        element("path", { d: line([start, end]), fill: "none", stroke: "#c2bdad", "stroke-width": "2.5" })
      );
    }
  }
  return layer;
}

function renderTownFortifications(
  document: CityDocument,
  tool: Tool = "select",
  inspectedId: number | string | null = null
): SVGGElement {
  const layer = element("g", {
    class: "ce-fortifications",
    "pointer-events": tool === "select" ? "all" : "none"
  }) as SVGGElement;
  const rivers = document.featureGroups
    .filter(g => g.kind === "river")
    .map(g => ({
      points: g.vertices.map(id => document.mesh.vertices[id].point),
      width: g.style.widthMeters
    }));
  for (const group of document.featureGroups) {
    if (group.kind !== "wall") continue;
    const points = edgeGroupPoints(document, group.segments);
    const spacing = Math.max(45, document.frame.blockSizeMeters * 1.4);
    let untilTower = spacing / 2;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (untilTower < length) {
        const t = untilTower / length;
        const position: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if (rivers.some(r => nearestOnPolyline(position, r.points).dist < r.width / 2 + group.style.widthMeters)) {
          untilTower += spacing;
          continue;
        }
        const towerId = `tower-${group.id}-${i}-${Math.round(untilTower)}`;
        const isPickSelected = inspectedId === towerId;
        const towerPickInfo: SvgPickInfo = {
          layer: "fortifications",
          kind: "tower",
          id: towerId,
          label: `wall tower (${group.name})`,
          wallId: group.id,
          point: position
        };
        const towerNode = element("circle", {
          cx: String(a[0] + (b[0] - a[0]) * t),
          cy: String(-a[1] - (b[1] - a[1]) * t),
          r: String(group.style.widthMeters * 0.8),
          fill: "#292a26",
          class: isPickSelected ? "ce-is-selected cg-is-selected" : "",
          "data-pick": encodeURIComponent(JSON.stringify(towerPickInfo))
        });
        if (tool === "select") towerNode.style.cursor = "pointer";
        layer.appendChild(towerNode);
        untilTower += spacing;
      }
      untilTower -= length;
    }
  }
  for (const gate of document.gates) {
    const p = document.mesh.vertices[gate.vertexId]?.point;
    if (!p) continue;
    const wall = document.featureGroups.find(
      g =>
        g.kind === "wall" &&
        g.segments.some(s => {
          const e = document.mesh.edges[s.edgeId];
          return e.a === gate.vertexId || e.b === gate.vertexId;
        })
    );
    if (wall?.kind !== "wall") continue;
    const ref = wall.segments.find(s => {
      const e = document.mesh.edges[s.edgeId];
      return e.a === gate.vertexId || e.b === gate.vertexId;
    })!;
    const e = document.mesh.edges[ref.edgeId];
    const q = document.mesh.vertices[e.a === gate.vertexId ? e.b : e.a].point;
    const angle = (-Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
    const width = wall.style.widthMeters;
    const opening = Math.max(9, width * 1.6);
    const isPickSelected = inspectedId === gate.id;
    const gatePickInfo: SvgPickInfo = {
      layer: "gates",
      kind: "gate",
      id: gate.id,
      label: `gate #${gate.id}`,
      vertexId: gate.vertexId,
      wallId: wall.id,
      point: p
    };
    const marker = element("g", {
      class: `ce-town-gate${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
      transform: `translate(${p[0]} ${-p[1]}) rotate(${angle})`,
      "data-pick": encodeURIComponent(JSON.stringify(gatePickInfo))
    });
    if (tool === "select") marker.style.cursor = "pointer";
    marker.appendChild(
      element("rect", {
        x: String(-opening / 2),
        y: String(-width),
        width: String(opening),
        height: String(width * 2),
        fill: "#d5cfbf"
      })
    );
    for (const sign of [-1, 1])
      marker.appendChild(
        element("rect", {
          x: String((sign * opening) / 2 - width / 2),
          y: String(-width),
          width: String(width),
          height: String(width * 2),
          fill: "#292a26"
        })
      );
    layer.appendChild(marker);
  }
  return layer;
}

/** The translucent "Grid evolution" scrub layer: Voronoi cells, Delaunay edges
 * and sites for one `buildGridEvolution` stage, drawn on top of the mesh. */
function renderGridOverlay(overlay: GridOverlay): SVGGElement {
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
