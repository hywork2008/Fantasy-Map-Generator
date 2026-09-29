import { bridgeDecks, riverRibbons, roadRunsOutsideRivers } from "../core/bridgeDeck";
import { clipPolylineToExterior, outerWallRing } from "../core/concealStreets";
import { featureGroupVertices } from "../core/features";
import {
  boundaryEdges,
  boundaryRings,
  castleWallIds,
  circuitRing,
  reservedCastleFaces,
  wallRunsOutsideGates
} from "../core/fortifications";
import {
  approachBeyondAnchor,
  approachBeyondLabel,
  externalRoadLabels,
  normalizeApproachBeyond
} from "../core/gen/approachBeyond";
import { buildBlockFabric } from "../core/gen/blockInfill";
import { buildCityBuildings } from "../core/gen/buildingLots";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "../core/gen/geom";
import type { GridEvolutionStage } from "../core/gen/gridEvolution";
import { templeFootprintMeters } from "../core/gen/housing";
import { defaultRoadWidthMeters } from "../core/gen/settlementExtent";
import { type GenerationObserver, generationTimer } from "../core/generationDiagnostics";
import { edgeEnd, faceNeighbors, facePoints, faceVertices } from "../core/mesh";
import { GATE_TOWER_SCALE, gateCrossingFrame, gatePlazaRadiusMeters, gateRoadDeviationDegrees } from "../core/passages";
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
  showGridLines = false,
  observer?: GenerationObserver,
  hideBuildings = false,
  /** Stage ⑩. Drop roads inside the outer wall, and the lanes that divide blocks. */
  hideStreetLines = false
): SVGSVGElement {
  const mark = generationTimer(observer);
  const town =
    document.appearance === "town" && tool === "select" && !showBlockMesh && !gridOverlay && !showSelectionLabels;
  const classes = ["ce-svg"];
  if (town) classes.push("ce-svg--town");
  if (showGridLines) classes.push("ce-svg--show-grid");
  const svg = element("svg", {
    viewBox,
    class: classes.join(" "),
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
    const fabric =
      document.gridKind === "evolution" ||
      document.layout === "circulade" ||
      document.layout === "bram" ||
      document.layout === "classic"
        ? buildBlockFabric(document)
        : null;
    const lots = fabric?.buildings ?? buildCityBuildings(document);
    if (fabric) {
      const farms = element("g", { class: "ce-farms", "pointer-events": "none" });
      fabric.farms.forEach((farm, index) => {
        const tone = Math.abs(Math.round(farm.polygon[0][0] / 17) + Math.round(farm.polygon[0][1] / 13) + index) % 2;
        farms.appendChild(
          element("path", {
            d: polygon(farm.polygon),
            fill: tone ? "#d4ceb2" : "#c4bf9a",
            stroke: "#8f8a74",
            "stroke-width": "0.6",
            "data-farm-face": farm.faceId
          })
        );
        farms.appendChild(
          element("path", {
            d: farm.rows.map(row => line(row)).join(" "),
            fill: "none",
            stroke: "#5e5948",
            "stroke-width": "0.65",
            class: "ce-farm-rows"
          })
        );
      });
      svg.appendChild(farms);
      // Stage ⑩ hides the lane strokes that cut blocks apart. The houses stay;
      // the ground colour still reads as the gap between them.
      if (!hideStreetLines) {
        const lanes = element("g", { class: "ce-infill-lanes", "pointer-events": "none" });
        const trails = element("g", { class: "ce-infill-trails", "pointer-events": "none" });
        for (const lane of fabric.lanes) {
          lanes.appendChild(
            element("path", {
              d: line(lane.points),
              class: "ce-infill-lane",
              fill: "none",
              stroke: "#d5cfbf",
              "stroke-width": String(lane.widthMeters),
              "stroke-linecap": "round",
              "data-infill-face": lane.faceId
            })
          );
          // Outside the core, expose the access network even where a house has
          // not been placed. This is a thin trail centreline, not a building shadow.
          // For classic and organic layouts, also expose the interior core lanes as trails.
          // When buildings are hidden (e.g. stage 8 "Blocks and lanes"), expose lanes as trails as well.
          if (
            document.mesh.faces[lane.faceId]?.properties.settlement === "outskirts" ||
            document.layout === "classic" ||
            document.layout === "organic" ||
            hideBuildings
          )
            trails.appendChild(
              element("path", {
                d: line(lane.points),
                class: "ce-infill-trail",
                fill: "none",
                stroke: "#7b7567",
                "stroke-width": "0.35",
                "stroke-linecap": "round",
                "data-infill-face": lane.faceId
              })
            );
        }
        svg.appendChild(lanes);
        svg.appendChild(trails);
      }
    }
    mark("buildings", { buildings: lots.length });
    if (!hideBuildings) {
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

  svg.appendChild(renderCastles(document, selection.inspectedId));
  const features = element("g", { class: "ce-features" });
  const order = { wall: 0, river: 1, road: 2, plank: 3 };
  const renderGroups = town
    ? [...document.featureGroups].sort((a, b) => order[a.kind] - order[b.kind])
    : document.featureGroups;
  // One ring for the whole pass. Roads inside it are the centre-to-wall streets.
  const concealWall = town && hideStreetLines ? outerWallRing(document) : null;
  const ribbons = town ? riverRibbons(document) : [];
  for (const group of renderGroups) {
    const active = selection.groupId === group.id;
    const isPickSelected = selection.inspectedId === group.id || selection.inspectedId === `feature-${group.id}`;
    const points =
      group.kind === "river"
        ? group.vertices.map(id => document.mesh.vertices[id]?.point).filter(isPoint)
        : edgeGroupPoints(document, group.segments);
    if (points.length < 2) continue;
    // A generated bridge group is only the mesh span. Town view replaces it
    // with a deck as long as the river. Other roads stop at the bank.
    let runs = group.kind === "wall" ? wallRunsOutsideGates(document, points) : [points];
    if (town && group.kind === "road") {
      if (group.id.startsWith("gc:bridge-")) runs = [];
      else {
        runs = ribbons.length ? roadRunsOutsideRivers(points, ribbons, group.style.widthMeters) : [points];
        if (concealWall) runs = runs.flatMap(run => clipPolylineToExterior(run, concealWall));
      }
    }
    const beyondLabel = group.kind === "road" ? approachBeyondLabel(group.beyond) : null;
    const pickInfo: SvgPickInfo = {
      layer: "features",
      kind: group.kind,
      id: group.id,
      label: beyondLabel ? `${group.kind} (${group.name} · ${beyondLabel})` : `${group.kind} (${group.name})`,
      name: group.name,
      locked: group.locked,
      widthMeters: group.style.widthMeters,
      color: group.style.color,
      segmentCount: group.kind === "river" ? group.vertices.length : group.segments.length,
      ...(beyondLabel ? { beyond: group.kind === "road" ? group.beyond : undefined, beyondLabel } : {})
    };
    for (const run of runs) {
      if (run.length < 2) continue;
      if (town && group.kind === "road") {
        features.appendChild(
          element("path", {
            d: line(run),
            class: "ce-road-casing",
            fill: "none",
            stroke: "#57534b",
            "stroke-width": String(group.style.widthMeters + 1.4),
            "pointer-events": "none"
          })
        );
      }
      features.appendChild(
        element("path", {
          d: line(run),
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
  }
  const beyondFont = selectionLabelFontSize(document.frame.extentMeters, zoom);
  for (const exit of externalRoadLabels(document)) {
    const road = exit.destinations[0];
    const beyondLabel = approachBeyondLabel(road.group.beyond);
    const norm = normalizeApproachBeyond(road.group.beyond);
    if (!beyondLabel || !norm) continue;
    const at = approachBeyondAnchor(road.outward, document.frame.extentMeters / 2);
    const label = element(
      "text",
      {
        class: "ce-approach-beyond",
        x: String(at[0]),
        y: String(-at[1]),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": String(beyondFont),
        fill: norm.realm.relation === "Enemy" ? "#7e2217" : norm.realm.relation === "Ally" ? "#1e5c22" : "#2c261f",
        stroke: "#f4f0e6",
        "stroke-width": String(beyondFont / 8),
        "paint-order": "stroke",
        "pointer-events": "none",
        "data-group": road.group.id,
        "data-groups": exit.roads.map(item => item.group.id).join(" "),
        "data-beyond": typeof road.group.beyond === "string" ? road.group.beyond : norm.realm.relation,
        "data-beyond-relation": norm.realm.relation,
        "data-beyond-scale": norm.settlement.scale,
        "data-beyond-role": norm.settlement.role ?? "generic"
      },
      exit.destinations.length === 1 ? beyondLabel : undefined
    );
    if (exit.destinations.length > 1) {
      const lines = ["街道の先で分岐", ...exit.destinations.map(item => approachBeyondLabel(item.group.beyond)!)];
      const step = beyondFont * 1.3;
      const top = Math.max(
        -document.frame.extentMeters / 2 + step,
        Math.min(document.frame.extentMeters / 2 - lines.length * step, -at[1] - ((lines.length - 1) * step) / 2)
      );
      for (let i = 0; i < lines.length; i++) {
        const value = i ? normalizeApproachBeyond(exit.destinations[i - 1].group.beyond) : undefined;
        label.appendChild(
          element(
            "tspan",
            {
              x: String(at[0]),
              y: String(top + i * step),
              fill:
                value?.realm.relation === "Enemy" ? "#7e2217" : value?.realm.relation === "Ally" ? "#1e5c22" : "#2c261f"
            },
            lines[i]
          )
        );
      }
    }
    features.appendChild(label);
  }
  if (town) {
    for (const deck of bridgeDecks(document)) {
      const pickInfo: SvgPickInfo = {
        layer: "features",
        kind: "road",
        id: deck.groupId,
        label: `bridge (${deck.name})`,
        name: deck.name,
        widthMeters: deck.widthMeters,
        segmentCount: 2
      };
      const encoded = encodeURIComponent(JSON.stringify(pickInfo));
      features.appendChild(
        element("path", {
          d: line(deck.points),
          class: "ce-bridge-outline",
          fill: "none",
          stroke: "#1A1917",
          "stroke-width": String(deck.widthMeters + 1.4),
          "stroke-linecap": "butt",
          "pointer-events": "none"
        })
      );
      features.appendChild(
        element("path", {
          d: line(deck.points),
          class: "ce-bridge-deck",
          fill: "none",
          stroke: "#d5cfbf",
          "stroke-width": String(deck.widthMeters),
          "stroke-linecap": "butt",
          "data-group": deck.groupId,
          "data-pick": encoded,
          "pointer-events": "stroke"
        })
      );
    }
  }
  svg.appendChild(features);
  if (town) {
    svg.appendChild(renderTownQuays(document));
    svg.appendChild(renderTownFortifications(document, tool, selection.inspectedId));
  }
  svg.appendChild(element("g", { class: "ce-route-preview-layer", "pointer-events": "none" }));

  const wardLandmarks = element("g", { class: "ce-ward-landmarks", "pointer-events": "none" });
  for (const face of Object.values(document.mesh.faces)) {
    if (reservedCastleFaces(document).has(face.id)) continue;
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
        const footprint = templeFootprintMeters(document.frame.extentMeters);
        const length = cityElement.sizeMeters && cityElement.sizeMeters > 0 ? cityElement.sizeMeters : footprint.length;
        const width = length * (footprint.width / footprint.length);
        const deg = (-(cityElement.rotation ?? 0) * 180) / Math.PI;
        const templeRect = element("rect", {
          x: String(-length / 2),
          y: String(-width / 2),
          width: String(length),
          height: String(width),
          fill: "#292a26",
          transform: `translate(${p[0]} ${-p[1]}) rotate(${deg})`,
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
  svg.appendChild(element("g", { class: "ce-measure-layer", "pointer-events": "none" }));
  mark("svg-details");
  return svg;
}

function renderTownQuays(document: CityDocument): SVGGElement {
  const layer = element("g", { class: "ce-quays", "pointer-events": "none" }) as SVGGElement;
  // One shoreline per sea cell; a manually assigned ward needs no landmark.
  const shores = new Map<Id, { a: Point; b: Point; ring: Point[]; length: number; depth: number }>();
  for (const edge of Object.values(document.mesh.edges)) {
    const left = edge.leftFace ? document.mesh.faces[edge.leftFace] : null;
    const right = edge.rightFace ? document.mesh.faces[edge.rightFace] : null;
    if (!left || !right) continue;
    const land = left.properties.water === "land" ? left : right;
    const water = land === left ? right : left;
    if (land.properties.water !== "land" || land.properties.ward !== "harbor" || water.properties.water !== "sea")
      continue;
    const depth = water.properties.depth ?? 3;
    if (!Number.isFinite(depth) || depth < 3) continue;
    const a = document.mesh.vertices[edge.a].point;
    const b = document.mesh.vertices[edge.b].point;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 10 || length <= (shores.get(water.id)?.length ?? 0)) continue;
    shores.set(water.id, { a, b, ring: facePoints(document.mesh, water), length, depth });
  }
  for (const [waterId, { a, b, ring, length, depth }] of shores) {
    const center = polygonCentroid(ring);
    const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    let normal: Point = [-tangent[1], tangent[0]];
    if ((center[0] - a[0]) * normal[0] + (center[1] - a[1]) * normal[1] < 0) normal = [-normal[0], -normal[1]];
    const count = length >= 35 ? 3 : 2;
    const width = Math.min(3, length / (count * 5));
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);
      const start: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      // Stop within the receiving cell, so a pier never becomes a bridge.
      let reach = 0;
      const desired = Math.min(26, length * (0.4 + (i % 2) * 0.06));
      for (let d = 0.5; d <= desired; d += 0.5) {
        if (
          ![-1, 0, 1].every(side =>
            pointInPolygon(
              [
                start[0] + normal[0] * d + (tangent[0] * width * side) / 2,
                start[1] + normal[1] * d + (tangent[1] * width * side) / 2
              ],
              ring
            )
          )
        )
          break;
        reach = d;
      }
      if (reach < 3) continue;
      const deck = (along: number, side: number): Point => [
        start[0] + normal[0] * along + (tangent[0] * width * side) / 2,
        start[1] + normal[1] * along + (tangent[1] * width * side) / 2
      ];
      layer.appendChild(
        element("path", {
          d: polygon([deck(0, -1), deck(reach, -1), deck(reach, 1), deck(0, 1)]),
          class: "ce-pier",
          "data-water-face": waterId,
          "data-depth-m": String(depth),
          fill: "#d5cfbf",
          stroke: "#514f45",
          "stroke-width": "0.6"
        })
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
  const cornerTowers: Point[] = [];
  const cornerIds = new Set<Id>();
  for (const circuit of document.defenseCircuits ?? []) {
    if (circuit.scope !== "castle") continue;
    const refs = boundaryRings(document.mesh, boundaryEdges(document.mesh, circuit.areaFaceIds))[0] ?? [];
    const points = refs.map(
      ref =>
        document.mesh.vertices[ref.forward ? document.mesh.edges[ref.edgeId].a : document.mesh.edges[ref.edgeId].b]
          .point
    );
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i],
        edge = document.mesh.edges[ref.edgeId],
        id = ref.forward ? edge.a : edge.b;
      if (cornerIds.has(id)) continue;
      const p = points[i],
        a = points[(i + points.length - 1) % points.length],
        b = points[(i + 1) % points.length];
      const u: Point = [p[0] - a[0], p[1] - a[1]],
        v: Point = [b[0] - p[0], b[1] - p[1]];
      const turn = Math.acos(
        Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))
      );
      if (
        turn < Math.PI / 6 ||
        document.gates.some(
          g =>
            Math.hypot(
              document.mesh.vertices[g.vertexId].point[0] - p[0],
              document.mesh.vertices[g.vertexId].point[1] - p[1]
            ) < 14
        )
      )
        continue;
      if (cornerTowers.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 12)) continue;
      const wall = document.featureGroups.find(g => g.kind === "wall" && g.segments.some(r => r.edgeId === ref.edgeId));
      if (!wall) continue;
      const towerId = `castle-tower-${id}`,
        pick = { layer: "fortifications", kind: "tower", id: towerId, label: "城の隅塔", wallId: wall.id, point: p };
      layer.appendChild(
        element("circle", {
          cx: String(p[0]),
          cy: String(-p[1]),
          r: String(wall.style.widthMeters * 1.05),
          fill: "#292a26",
          class: inspectedId === towerId ? "ce-is-selected cg-is-selected" : "",
          "data-pick": encodeURIComponent(JSON.stringify(pick))
        })
      );
      cornerIds.add(id);
      cornerTowers.push(p);
    }
  }
  for (const group of document.featureGroups) {
    if (group.kind !== "wall") continue;
    const points = edgeGroupPoints(document, group.segments);
    const spacing = castleWallIds(document).has(group.id) ? 32 : Math.max(45, document.frame.blockSizeMeters * 1.4);
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
        if (cornerTowers.some(p => Math.hypot(p[0] - position[0], p[1] - position[1]) < 16)) {
          untilTower += spacing;
          continue;
        }
        const gateClear = group.style.widthMeters * 3;
        if (
          (document.gates ?? []).some(gate => {
            const gatePoint = document.mesh.vertices[gate.vertexId]?.point;
            return gatePoint && Math.hypot(gatePoint[0] - position[0], gatePoint[1] - position[1]) < gateClear;
          })
        ) {
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
    const frame = gateCrossingFrame(document, gate.vertexId);
    if (!frame) continue;
    const wall = document.featureGroups.find(
      g => g.kind === "wall" && featureGroupVertices(document, g).includes(gate.vertexId)
    );
    if (wall?.kind !== "wall") continue;
    const width = wall.style.widthMeters;
    let roadWidth = defaultRoadWidthMeters(document.frame.extentMeters);
    for (const group of document.featureGroups) {
      if (group.kind === "road" && featureGroupVertices(document, group).includes(gate.vertexId))
        roadWidth = Math.max(roadWidth, group.style.widthMeters);
    }
    // Square flank towers match the round curtain towers (diameter = 1.6 × wall).
    // The opening clears the road. A semicircular plaza sits on both sides of the gate.
    const side = width * GATE_TOWER_SCALE;
    const deviation = gateRoadDeviationDegrees(document, gate.vertexId) ?? 0;
    const slant = Math.tan((Math.min(deviation, 20) * Math.PI) / 180);
    const opening = gate.passageWidthMeters ?? Math.max(roadWidth + 2.2, width * 0.9) + side * slant;
    const plazaRadius = gatePlazaRadiusMeters(width);
    const isPickSelected = inspectedId === gate.id;
    const gatePickInfo: SvgPickInfo = {
      layer: "gates",
      kind: "gate",
      id: gate.id,
      label: `gate #${gate.id}`,
      vertexId: gate.vertexId,
      wallId: wall.id,
      point: frame.point
    };
    const [tx, ty] = frame.tangent;
    const [ix, iy] = frame.inward;
    const marker = element("g", {
      class: `ce-town-gate${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
      transform: `matrix(${tx} ${-ty} ${ix} ${-iy} ${frame.point[0]} ${-frame.point[1]})`,
      "data-pick": encodeURIComponent(JSON.stringify(gatePickInfo))
    });
    if (tool === "select") marker.style.cursor = "pointer";
    for (const sweep of gate.ownerCastleId ? [] : [1, 0])
      marker.appendChild(
        element("path", {
          d: `M ${-plazaRadius} 0 A ${plazaRadius} ${plazaRadius} 0 0 ${sweep} ${plazaRadius} 0 Z`,
          class: "ce-gate-plaza",
          fill: "#d5cfbf",
          "pointer-events": "none"
        })
      );
    marker.appendChild(
      element("rect", {
        x: String(-opening / 2),
        y: String(-side / 2),
        width: String(opening),
        height: String(side),
        fill: "#d5cfbf",
        "pointer-events": "none"
      })
    );
    for (const sign of [-1, 1])
      marker.appendChild(
        element("rect", {
          x: String(sign < 0 ? -opening / 2 - side : opening / 2),
          y: String(-side / 2),
          width: String(side),
          height: String(side),
          class: "ce-gate-tower",
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
  marker.appendChild(element("circle", { r: "7.5", class: "ce-element-halo" }));
  const common = { class: "ce-element-mark", fill: "none", stroke: "currentColor", "stroke-width": "1.2" };

  switch (kind) {
    case "plaza":
      marker.appendChild(element("rect", { ...common, x: "-4", y: "-4", width: "8", height: "8", rx: "0.5" }));
      break;
    case "citadel":
      marker.appendChild(element("path", { ...common, d: "M-5 4.5V-4H-3V-6H-1V-4H1V-6H3V-4H5V4.5ZM-5 0.5H5" }));
      break;
    case "temple":
      marker.appendChild(element("path", { ...common, d: "M0-6V6M-3-3H3M-4.5 5H4.5" }));
      break;
    case "harbor":
      marker.append(
        element("circle", { ...common, cx: "0", cy: "-3.5", r: "1.5" }),
        element("path", { ...common, d: "M0-2V4M-4 1H4M-5.5 4C-3.5 7.5 3.5 7.5 5.5 4M-5.5 4L-3.5 6M5.5 4L3.5 6" })
      );
      break;
    case "park":
      marker.append(
        element("circle", { ...common, cx: "-2.5", cy: "-1", r: "2.5" }),
        element("circle", { ...common, cx: "2.5", cy: "-1", r: "2.5" }),
        element("path", { ...common, d: "M0 0.5V5.5M-4 5.5H4" })
      );
      break;
    case "gate":
      marker.appendChild(element("path", { ...common, d: "M-5 5V0A5 5 0 0 1 5 0V5M-6.5 5H6.5" }));
      break;
    case "tower":
      marker.appendChild(
        element("path", { ...common, d: "M-3.5 5.5V-4.5H-2V-6H-0.5V-4.5H0.5V-6H2V-4.5H3.5V5.5ZM-5 5.5H5" })
      );
      break;
    default:
      marker.appendChild(element("circle", { ...common, r: "3.5" }));
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

export const STANDALONE_SVG_STYLE = `
  .ce-svg { background: transparent; }
  .ce-reference-image { opacity: 0.82; }
  .ce-svg--town { background: #d5cfbf; }
  .ce-svg.ce-svg--town .ce-face--land { fill: #d5cfbf; }
  .ce-svg--town .ce-face--sea, .ce-svg--town .ce-face--lake, .ce-svg--town .ce-face--openWater { fill: #85857d; }
  .ce-svg--town .ce-edge { stroke: transparent; }
  .ce-svg--town .ce-feature { opacity: 1; }
  .ce-svg--town .ce-feature--wall { stroke-dasharray: none; }
  .ce-building { fill: #b2afa2; stroke: #49483f; stroke-width: 0.35px; stroke-linejoin: miter; stroke-miterlimit: 2; }
  .ce-building--landmark { fill: #373831; }
  .ce-road-casing { stroke-linecap: round; stroke-linejoin: round; }
  .ce-bridge-outline, .ce-bridge-deck { fill: none; stroke-linecap: butt; }
  .ce-face { stroke: none; fill: #e1dfd4; }
  .ce-face--sea, .ce-face--lake, .ce-face--openWater { fill: #91c8d3; }
  .ce-face--land.ce-face--ward-unassigned { fill: #e1dfd4; }
  .ce-face--land.ce-face--ward-market { fill: #edcf7a; }
  .ce-face--land.ce-face--ward-castle { fill: #bca7ce; }
  .ce-face--land.ce-face--ward-merchant { fill: #dfa184; }
  .ce-face--land.ce-face--ward-craftsmen { fill: #d1a46e; }
  .ce-face--land.ce-face--ward-harbor { fill: #e3b66d; }
  .ce-face--land.ce-face--ward-park { fill: #99c187; }
  .ce-face--land.ce-face--ward-farm { fill: #c6c19f; }
  .ce-face--land.ce-face--ward-empty { fill: #f2ead2; }
  .ce-face--land.ce-face--urban-step { fill: #d9662b; }
  .ce-edge { fill: none; stroke: #738083; stroke-width: 1px; }
  .ce-feature { fill: none; stroke-linecap: round; stroke-linejoin: round; opacity: 0.9; }
  .ce-feature--wall { stroke-dasharray: 2 2; }
  .ce-feature--plank { filter: drop-shadow(0 0 1px #332b22); }
  .ce-element { color: #263c42; }
  .ce-element-halo { fill: rgb(255 253 244 / 82%); stroke: #d0d6ce; stroke-width: 1px; }
  .ce-element-mark { stroke-linecap: round; stroke-linejoin: round; }
  .ce-element--harbor { color: #0e6f83; }
  .ce-element--citadel { color: #5f4b70; }
  .ce-element--temple { color: #79572c; }
  .ce-tree-crown { fill: #697d64; stroke: #394b40; stroke-width: 1px; }
  .ce-tree-trunk { fill: none; stroke: #514538; stroke-linecap: round; }
`;

export function renderStandaloneCitySvg(document: CityDocument): SVGSVGElement {
  const extent = document.frame.extentMeters;
  const viewBox = `${-extent / 2} ${-extent / 2} ${extent} ${extent}`;
  const emptySel: RenderSelection = {
    faceId: null,
    edgeId: null,
    vertexId: null,
    groupId: null,
    inspectedId: null,
    hoverGroupId: null,
    hoverVertexId: null,
    hoverEdgeId: null
  };
  const svg = renderEditorSvg(
    document,
    "select",
    emptySel,
    viewBox,
    1,
    false,
    document.referenceImage ?? null,
    null,
    null,
    null,
    false,
    false
  );

  svg.setAttribute("xmlns", NS);
  svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  svg.setAttribute("version", "1.1");
  svg.setAttribute("width", String(extent));
  svg.setAttribute("height", String(extent));

  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = element("defs", {}) as SVGDefsElement;
    svg.insertBefore(defs, svg.firstChild);
  }
  const style = element("style", { type: "text/css" }, STANDALONE_SVG_STYLE);
  defs.appendChild(style);

  const bgColor = document.appearance === "town" ? "#d5cfbf" : "#e1dfd4";
  const bgRect = element("rect", {
    x: String(-extent / 2),
    y: String(-extent / 2),
    width: String(extent),
    height: String(extent),
    fill: bgColor,
    class: "ce-background"
  });
  if (defs.nextSibling) {
    svg.insertBefore(bgRect, defs.nextSibling);
  } else {
    svg.appendChild(bgRect);
  }

  for (const img of svg.querySelectorAll("image")) {
    const href = img.getAttribute("href");
    if (href && !img.hasAttribute("xlink:href")) {
      img.setAttribute("xlink:href", href);
    }
  }

  for (const layer of svg.querySelectorAll(".ce-hover-layer, .ce-measure-layer, .ce-route-preview-layer")) {
    layer.remove();
  }
  for (const el of svg.querySelectorAll("[data-pick]")) {
    el.removeAttribute("data-pick");
  }
  for (const el of svg.querySelectorAll<SVGElement>("[style*='cursor']")) {
    el.style.removeProperty("cursor");
  }

  return svg;
}

export function serializeCitySvg(document: CityDocument): string {
  const svg = renderStandaloneCitySvg(document);
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

function renderCastles(document: CityDocument, inspectedId?: string | number | null): SVGGElement {
  const layer = element("g", { class: "ce-castles" }) as SVGGElement;
  for (const castle of document.castles ?? []) {
    const circuit = document.defenseCircuits?.find(c => c.id === castle.circuitId);
    if (!circuit) continue;
    const pick = {
      layer: "fortifications",
      kind: "castle",
      id: castle.id,
      label: `城 (${castle.form})`,
      locked: castle.locked
    };
    const group = element("g", {
      "data-pick": encodeURIComponent(JSON.stringify(pick)),
      class: inspectedId === castle.id ? "ce-is-selected cg-is-selected" : "",
      style: "cursor:pointer"
    });
    group.appendChild(
      element("path", {
        d: polygon(circuitRing(document, circuit)),
        fill: "#d5cfbf",
        "fill-opacity": "0.25",
        stroke: "none"
      })
    );
    for (const court of castle.courtyards)
      group.appendChild(
        element("path", { d: polygon(court), fill: "#d8cdb6", stroke: "#a7977f", "stroke-width": "0.6" })
      );
    for (const access of castle.accesses)
      group.appendChild(
        element("path", {
          d: line(access.points),
          fill: "none",
          stroke: "#b7a78e",
          "stroke-width": String(access.widthMeters),
          "stroke-linejoin": "round"
        })
      );
    for (const part of castle.parts) {
      group.appendChild(
        element("path", {
          d: polygon(part.footprint),
          fill: part.role === "keep" ? "#827364" : "#a49380",
          stroke: "#4f463c",
          "stroke-width": part.role === "keep" ? "2" : "1"
        })
      );
      for (const entrance of part.entrances)
        group.appendChild(
          element("circle", { cx: String(entrance[0]), cy: String(-entrance[1]), r: "1.4", fill: "#e2d5be" })
        );
    }
    layer.appendChild(group);
  }
  return layer;
}
