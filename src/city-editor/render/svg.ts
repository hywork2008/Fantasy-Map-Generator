import { bridgeDecks, riverRibbons, roadRunsOutsideRivers } from "../core/bridgeDeck";
import { clipPolylineToExterior, outerWallRing } from "../core/concealStreets";
import { featureGroupVertices } from "../core/features";
import { currentFixedCrossingApproaches } from "../core/fixedApproachAdoption";
import {
  boundaryEdges,
  boundaryRings,
  castleWallIds,
  circuitRing,
  reservedCastleFaces,
  wallRunsOutsideGates
} from "../core/fortifications";
import { frameRoadTownConnection } from "../core/frameRoadConnection";
import {
  approachBeyondAnchor,
  approachBeyondLabel,
  externalRoadLabels,
  normalizeApproachBeyond
} from "../core/gen/approachBeyond";
import { buildBlockFabric } from "../core/gen/blockInfill";
import { buildCityBuildings } from "../core/gen/buildingLots";
import { computeCemeteryBoundary, layoutCemetery } from "../core/gen/cemeteryLayout";
import { farmSheds } from "../core/gen/farmSheds";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "../core/gen/geom";
import type { GridEvolutionStage } from "../core/gen/gridEvolution";
import { templeFootprintMeters } from "../core/gen/housing";
import { convexInfillParts, insetConvexKernel } from "../core/gen/lotGeometry";
import { bounds, corridor, intersectConvex, subtractConvex } from "../core/gen/parcelGeometry";
import { buildParkLawns } from "../core/gen/parkFabric";
import { riverPortShore } from "../core/gen/riverPortShore";
import { defaultRoadWidthMeters, townExtentMeters } from "../core/gen/settlementExtent";
import { buildWatermillPlan } from "../core/gen/watermillFabric";
import { type GenerationObserver, generationTimer } from "../core/generationDiagnostics";
import { accessCorridor, transformLandmarkPolygons } from "../core/landmarks";
import { edgeEnd, faceNeighbors, facePoints, faceVertices } from "../core/mesh";
import { MoatReservation } from "../core/moats";
import { GATE_TOWER_SCALE, gateCrossingFrame, gatePlazaRadiusMeters, gateRoadDeviationDegrees } from "../core/passages";
import type {
  CityDocument,
  CityElement,
  CityGate,
  EdgeRef,
  Face,
  FeatureGroup,
  Id,
  Mesh,
  Point,
  Tool
} from "../core/types";
import { dryRuns, lineHitsDocumentWater, waterPolygons } from "../core/waterGeometry";
import { fixedDocumentGeometry, fixedDocumentLayers, fixedRoadIsDry } from "./fixedDocumentGeometry";
import { openSpaceBoundary } from "./openSpaceBoundary";
import { renderPreviewSymbols } from "./previewSymbols";
import { renderRegionalSettlements } from "./regionalSvg";
import { renderRiverWallSvg } from "./riverWallSvg";
import { renderShipRotationHandle, renderShipSvg } from "./shipSvg";
import { renderTempleSvg } from "./templeSvg";

export type RenderQuality = "auto" | "detailed" | "light" | "minimal";

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
  hideStreetLines = false,
  quality: RenderQuality = "detailed",
  preview = false,
  sceneVisibility: { core: boolean; regional: boolean } = { core: true, regional: true }
): SVGSVGElement {
  const fixedMode = document.importedFixedCrossings !== undefined;
  const fixedGeometry = fixedDocumentGeometry(document);
  const fixedLayers = fixedGeometry ? fixedDocumentLayers(fixedGeometry) : null;
  const fixedEpoch = JSON.stringify([document.importedFixedCrossings, document.frame]);
  const mark = generationTimer(observer);
  const town =
    document.appearance === "town" && tool === "select" && !showBlockMesh && !gridOverlay && !showSelectionLabels;
  const effectiveQuality =
    quality === "auto" ? (townExtentMeters(document.frame) >= 3600 ? "light" : "detailed") : quality;
  // Mesh editing always keeps individual handles and full picking metadata.
  const lightweight = town && effectiveQuality !== "detailed";
  const minimal = lightweight && effectiveQuality === "minimal";
  const classes = ["ce-svg"];
  if (town) classes.push("ce-svg--town");
  if (showGridLines) classes.push("ce-svg--show-grid");
  const svg = element("svg", {
    viewBox,
    class: classes.join(" "),
    "aria-label": "City editor canvas",
    "data-render-quality": town ? effectiveQuality : "detailed",
    ...(fixedMode ? { "data-fixed-geometry-status": fixedGeometry ? "ready" : "invalid" } : {})
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
  if (document.sceneRegions) {
    const waterCells = element("g", { class: "ce-regional-water-cells", "data-scene-region": "shared" });
    for (const face of Object.values(document.mesh.faces)) {
      if (face.properties.water === "land") continue;
      const path = cells.querySelector(`[data-face="${face.id}"]`);
      if (path) waterCells.appendChild(path);
    }
    svg.appendChild(waterCells);
  }
  svg.appendChild(cells);
  const continuousWater = element("g", { class: "ce-continuous-water", "pointer-events": "none" });
  for (const [index, ring] of (fixedMode ? [] : waterPolygons(document)).entries()) {
    continuousWater.appendChild(
      element("path", { d: polygon(ring), class: "ce-face ce-face--sea", "data-water-area": String(index) })
    );
  }
  svg.appendChild(continuousWater);
  if (fixedLayers) svg.appendChild(fixedLayers.water);

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

  if (document.sceneRegions) {
    const regional = element("g", { class: "ce-regional-layer", "data-scene-region": "regional" });
    appendFrameRoads(regional, document, town);
    regional.appendChild(renderRegionalSettlements(document));
    svg.appendChild(regional);
  }

  if (preview && town) svg.appendChild(renderPreviewSymbols(document));

  let townHarbor: import("../core/gen/harborFabric").HarborPlan | undefined;
  let townParkLawns: import("../core/gen/parkFabric").ParkLawn[] = [];
  let townWatermills: import("../core/gen/watermillFabric").WatermillPlan | undefined;
  if (town && !preview) {
    const buildings = element("g", {
      class: "ce-buildings",
      "pointer-events": tool === "select" ? "all" : "none"
    });
    mark("svg-base");
    const fabric =
      document.buildingPattern === "medieval" ||
      document.fabric?.version === 5 ||
      document.gridKind === "evolution" ||
      document.layout === "circulade" ||
      document.layout === "bram" ||
      document.layout === "classic"
        ? buildBlockFabric(document)
        : null;
    townHarbor = fabric?.harbor;
    const lots = fabric?.buildings ?? buildCityBuildings(document);
    townWatermills = fabric?.watermills ?? buildWatermillPlan(document, lots.length);
    for (const settlement of ["core", "outskirts"] as const) {
      svg.setAttribute(
        `data-${settlement}-buildings`,
        String(
          hideBuildings
            ? 0
            : lots.filter(lot => document.mesh.faces[lot.faceId]?.properties.settlement === settlement).length
        )
      );
    }
    if (fabric) {
      const farms = element("g", { class: "ce-farms", "pointer-events": "none" });
      fabric.farms.forEach((farm, index) => {
        const tone = Math.abs(Math.round(farm.polygon[0][0] / 17) + Math.round(farm.polygon[0][1] / 13) + index) % 2;
        const garden = farm.kind === "kitchen-garden";
        farms.appendChild(
          element("path", {
            d: roundedFarmPolygon(farm.polygon),
            fill: garden ? (tone ? "#bccd9c" : "#aec392") : tone ? "#d4ceb2" : "#c4bf9a",
            stroke: garden ? "#536c45" : "#8f8a74",
            "stroke-width": garden ? "1.8" : "0.6",
            "stroke-dasharray": garden ? "3 1.2" : "none",
            class: garden ? "ce-kitchen-garden" : "ce-open-field",
            "data-farm-face": farm.faceId
          })
        );
        if (!lightweight)
          farms.appendChild(
            element("path", {
              d: farm.rows.map(row => line(row)).join(" "),
              fill: "none",
              stroke: garden ? "#617b4d" : "#5e5948",
              "stroke-width": garden ? "0.8" : "0.65",
              class: "ce-farm-rows"
            })
          );
      });
      svg.appendChild(farms);
      if (!hideBuildings && !minimal) {
        const sheds = element("g", { class: "ce-farm-sheds", "pointer-events": "none" });
        for (const shed of farmSheds(document, fabric.farms, lots)) {
          sheds.appendChild(
            element("path", {
              d: polygon(shed.polygon),
              fill: "#796b55",
              stroke: "#4a4336",
              "stroke-width": "0.6",
              class: "ce-farm-shed",
              "data-farm-face": shed.faceId
            })
          );
        }
        svg.appendChild(sheds);
      }
      if (!hideBuildings && fabric.openSpaces?.length) {
        const spaces = element("g", { class: "ce-open-spaces", "pointer-events": "none" });
        const green = new Set(["kitchen-garden", "formal-garden"]);
        for (const space of fabric.openSpaces) {
          spaces.appendChild(
            element("path", {
              d: polygon(space.polygon),
              class: `ce-open-space ce-open-space--${space.kind}`,
              fill:
                hideStreetLines && (space.kind === "quay" || space.kind === "loading-yard")
                  ? "none"
                  : green.has(space.kind)
                    ? "#c4c6aa"
                    : space.kind === "courtyard"
                      ? "#ddd6c5"
                      : space.kind === "quay"
                        ? "#b8afa0"
                        : space.kind === "loading-yard"
                          ? "#c8bfaa"
                          : "#d5cfbf",
              stroke: green.has(space.kind) ? "#a0a58a" : "none",
              "stroke-width": space.kind === "quay" || space.kind === "loading-yard" ? "0.45" : "0.25",
              "data-space-kind": space.kind,
              "data-parcel": space.parcelId ?? "",
              "data-space-access": space.access
            })
          );
          // A few garden beds read at town scale without detailed roof or shadow rendering.
          if (!lightweight && green.has(space.kind) && Math.abs(polygonArea(space.polygon)) > 35 && zoom >= 0.7) {
            const c = polygonCentroid(space.polygon);
            spaces.appendChild(
              element("circle", {
                cx: String(c[0]),
                cy: String(-c[1]),
                r: "1.3",
                fill: "#87966d",
                class: "ce-garden-plant"
              })
            );
          }
        }
        const paving = fabric.openSpaces.filter(s => s.kind === "quay" || s.kind === "loading-yard");
        if (paving.length && !hideStreetLines) {
          spaces.appendChild(
            element("path", {
              d: openSpaceBoundary(paving.map(s => s.polygon))
                .map(edge => line(edge))
                .join(" "),
              class: "ce-harbor-paving-outline",
              fill: "none",
              stroke: "#5c5647",
              "stroke-width": "0.45",
              "stroke-linecap": "round"
            })
          );
        }
        for (const parcel of fabric.parcels ?? [])
          for (const access of parcel.access) {
            if (access.widthMeters < 2) continue;
            spaces.appendChild(
              element("path", {
                d: line(access.points),
                class: "ce-parcel-access",
                fill: "none",
                stroke: "#d5cfbf",
                "stroke-width": String(access.widthMeters),
                "data-parcel": parcel.id
              })
            );
          }
        svg.appendChild(spaces);
      }
      // Stage ⑩ hides the lane strokes that cut blocks apart. The houses stay;
      // the ground colour still reads as the gap between them.
      if (!hideStreetLines) {
        const lanes = element("g", { class: "ce-infill-lanes", "pointer-events": "none" });
        const trails = element("g", { class: "ce-infill-trails", "pointer-events": "none" });
        const laneBatches = new Map<number, string[]>();
        const trailBatch: string[] = [];
        for (const lane of fabric.lanes) {
          const path = line(lane.points);
          if (lightweight) {
            const paths = laneBatches.get(lane.widthMeters) ?? [];
            paths.push(path);
            laneBatches.set(lane.widthMeters, paths);
          } else
            lanes.appendChild(
              element("path", {
                d: path,
                class: "ce-infill-lane",
                ...(fixedMode ? { "stroke-linejoin": "round" } : {}),
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
          ) {
            if (lightweight) trailBatch.push(path);
            else
              trails.appendChild(
                element("path", {
                  d: path,
                  class: "ce-infill-trail",
                  ...(fixedMode ? { "stroke-linejoin": "round" } : {}),
                  fill: "none",
                  stroke: "#7b7567",
                  "stroke-width": "0.35",
                  "stroke-linecap": "round",
                  "data-infill-face": lane.faceId
                })
              );
          }
        }
        for (const [width, paths] of laneBatches) {
          lanes.appendChild(
            element("path", {
              d: paths.join(" "),
              class: "ce-infill-lane",
              ...(fixedMode ? { "stroke-linejoin": "round" } : {}),
              fill: "none",
              stroke: "#d5cfbf",
              "stroke-width": String(width),
              "stroke-linecap": "round"
            })
          );
        }
        if (trailBatch.length)
          trails.appendChild(
            element("path", {
              d: trailBatch.join(" "),
              class: "ce-infill-trail",
              ...(fixedMode ? { "stroke-linejoin": "round" } : {}),
              fill: "none",
              stroke: "#7b7567",
              "stroke-width": "0.35",
              "stroke-linecap": "round"
            })
          );
        svg.appendChild(lanes);
        svg.appendChild(trails);
      }
    }
    townParkLawns = fabric?.parks ?? buildParkLawns(document);
    if (townParkLawns.length) {
      const parks = element("g", { class: "ce-parks", "pointer-events": "none" });
      for (const park of townParkLawns) {
        for (const lawn of park.lawnPolygons) {
          parks.appendChild(
            element("path", {
              d: roundedFarmPolygon(lawn),
              class: "ce-park-lawn",
              fill: "#7ea867",
              stroke: "#4d733b",
              "stroke-width": "0.8",
              "data-park-face": park.faceId
            })
          );
        }
        for (const path of park.paths) {
          parks.appendChild(
            element("path", {
              d: line(path),
              class: "ce-park-path",
              fill: "none",
              stroke: "#d8d1bf",
              "stroke-width": "1.8",
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              "data-park-face": park.faceId
            })
          );
        }
        for (const tuft of lightweight ? [] : park.grassTufts) {
          const [tx, ty] = [tuft[0], -tuft[1]];
          parks.appendChild(
            element("path", {
              d: `M${tx - 1.2} ${ty - 2} L${tx} ${ty} L${tx + 1.2} ${ty - 2}`,
              class: "ce-park-grass",
              fill: "none",
              stroke: "#5d8249",
              "stroke-width": "0.7",
              "stroke-linecap": "round",
              "data-park-face": park.faceId
            })
          );
        }
      }
      svg.appendChild(parks);
    }
    mark("buildings", { buildings: lots.length });
    if (!hideBuildings) {
      const batches = new Map<Id, string[]>();
      const faceOrdinals = new Map<Id, number>();
      for (const lot of lots) {
        // Selected districts expand to individual buildings, retaining parcel inspection.
        if (
          lightweight &&
          !lot.landmark &&
          selection.faceId !== lot.faceId &&
          selection.inspectedId !== lot.faceId &&
          (!lot.parcelId || selection.inspectedId !== lot.parcelId) &&
          selection.inspectedId !== `bld-${lot.faceId}`
        ) {
          const ordinal = faceOrdinals.get(lot.faceId) ?? 0;
          faceOrdinals.set(lot.faceId, ordinal + 1);
          if (minimal && ordinal % 2 !== 0) continue;
          const paths = batches.get(lot.faceId) ?? [];
          paths.push(
            `${lot.polygon.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${(-p[1]).toFixed(1)}`).join(" ")} Z`
          );
          batches.set(lot.faceId, paths);
          continue;
        }
        const bldId = lot.parcelId ?? `bld-${lot.faceId}`;
        const isPickSelected = selection.inspectedId === bldId || selection.inspectedId === lot.faceId;
        const pickInfo: SvgPickInfo = {
          layer: "buildings",
          kind: "building",
          id: bldId,
          label: lot.archetype
            ? `${lot.archetype} · ${lot.role} · ${Math.round(Math.abs(polygonArea(lot.polygon)))} m²`
            : `${document.mesh.faces[lot.faceId].properties.ward} building #${lot.faceId}`,
          ...(lot.parcelId
            ? { parcelId: lot.parcelId, archetype: lot.archetype, role: lot.role, uses: lot.uses, storeys: lot.storeys }
            : {}),
          ward: document.mesh.faces[lot.faceId].properties.ward,
          faceId: lot.faceId,
          landmark: !!lot.landmark
        };
        const bldNode = element("path", {
          d: polygon(lot.polygon),
          class: `ce-building${lot.landmark ? " ce-building--landmark" : ""}${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
          "data-building-face": lot.faceId,
          ...(lot.parcelId
            ? { "data-parcel": lot.parcelId, "data-archetype": lot.archetype!, "data-building-role": lot.role! }
            : {}),
          "data-pick": encodeURIComponent(JSON.stringify(pickInfo))
        });
        if (tool === "select") bldNode.style.cursor = "pointer";
        buildings.appendChild(bldNode);
      }
      for (const [faceId, paths] of batches) {
        buildings.appendChild(
          element("path", {
            d: paths.join(" "),
            class: "ce-building ce-building-batch",
            "data-building-face": faceId,
            "data-pick": encodeURIComponent(
              JSON.stringify({
                layer: "buildings",
                kind: "building",
                id: `bld-${faceId}`,
                faceId,
                label: `街区 #${faceId}（選択すると建物の詳細を表示）`,
                buildings: faceOrdinals.get(faceId),
                displayedBuildings: paths.length
              })
            ),
            style: "cursor:pointer"
          })
        );
      }
      svg.appendChild(buildings);
    }
  }

  const edges = element("g", { class: "ce-edges" });
  for (const edge of Object.values(document.mesh.edges)) {
    // In town view these strokes are transparent; route picking uses the mesh index.
    if (
      lightweight &&
      !showGridLines &&
      selection.edgeId !== edge.id &&
      selection.inspectedId !== edge.id &&
      selection.inspectedId !== `edge-${edge.id}`
    )
      continue;
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

  svg.appendChild(renderMoats(document));
  svg.appendChild(renderCastles(document, selection.inspectedId));
  svg.appendChild(renderCemeteries(document, selection.inspectedId));
  const features = element("g", { class: "ce-features", style: "z-index: 2;" });
  const order = { wall: 0, river: 1, road: 2, plank: 3 };
  const renderGroups = town
    ? [...document.featureGroups].sort((a, b) => order[a.kind] - order[b.kind])
    : document.featureGroups;
  // One ring for the whole pass. Roads inside it are the centre-to-wall streets.
  const concealWall = town && hideStreetLines ? outerWallRing(document) : null;
  const ribbons = town ? riverRibbons(document) : [];
  const moatReservations = new Map<number, MoatReservation>();
  const moatDecks: Array<{ points: Point[]; width: number }> = [];
  for (const group of renderGroups) {
    if (fixedMode && (group.kind === "river" || (group.kind === "road" && group.id.startsWith("gc:bridge-")))) continue;
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
    if (group.kind === "road" || group.kind === "wall")
      runs = runs.flatMap(run => dryRuns(run, waterPolygons(document)));
    if (group.kind === "road") {
      const width = group.style.widthMeters;
      let moat = moatReservations.get(width);
      if (!moat) {
        moat = new MoatReservation(document, width / 2 + 1);
        moatReservations.set(width, moat);
      }
      runs = runs.flatMap(run => {
        const parts = moat.roadParts(run);
        moatDecks.push(...parts.bridges.map(points => ({ points, width })));
        return parts.dry;
      });
    }
    if (fixedMode && group.kind === "road")
      runs = fixedGeometry ? runs.filter(run => fixedRoadIsDry(run, group.style.widthMeters, fixedGeometry)) : [];
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
                ? "#527f8b"
                : "#292a26"
            : group.style.color,
          "stroke-width": String(group.style.widthMeters),
          ...(fixedMode && group.kind === "road" ? { "stroke-linejoin": "round", "stroke-linecap": "butt" } : {}),
          "data-group": group.id,
          "data-pick": encodeURIComponent(JSON.stringify(pickInfo)),
          "pointer-events": "stroke"
        })
      );
    }
  }
  for (const deck of fixedMode ? [] : moatDecks) {
    const gate = drawbridgeGate(document, deck.points, deck.width);
    if (gate) {
      const at = document.mesh.vertices[gate.vertexId].point;
      const startDistance = Math.hypot(deck.points[0][0] - at[0], deck.points[0][1] - at[1]);
      const endDistance = Math.hypot(deck.points.at(-1)![0] - at[0], deck.points.at(-1)![1] - at[1]);
      const points = startDistance <= endDistance ? deck.points : [...deck.points].reverse();
      features.appendChild(renderDrawbridge(document, points, deck.width, gate.id, "ce-moat-road-bridge"));
      continue;
    }
    features.appendChild(
      element("path", {
        d: line(deck.points),
        class: "ce-moat-road-bridge",
        fill: "none",
        stroke: "#57534b",
        "stroke-width": String(deck.width + 1.4)
      })
    );
    features.appendChild(
      element("path", { d: line(deck.points), fill: "none", stroke: "#d5cfbf", "stroke-width": String(deck.width) })
    );
  }
  for (const connection of fixedMode ? [] : (document.riverConnections ?? [])) {
    const width = defaultRoadWidthMeters(townExtentMeters(document.frame));
    const group = document.featureGroups.find(g => g.kind === "road" && g.sourceRoad?.index === connection.sourceIndex);
    const vertex = group ? document.mesh.vertices[featureGroupVertices(document, group)[0]]?.point : undefined;
    const townRoad = vertex ? [vertex, ...connection.townRoad] : connection.townRoad;
    for (const points of [connection.farRoad, ...dryRuns(townRoad, waterPolygons(document))])
      features.appendChild(
        element("path", {
          d: line(points),
          class: "ce-river-connection-road",
          "data-source-index": String(connection.sourceIndex),
          fill: "none",
          stroke: town ? "#d5cfbf" : "#735238",
          "stroke-width": String(width)
        })
      );
    const bridge = ["fixedBridge", "movableBridge"].includes(connection.crossing.kind);
    if (bridge) {
      features.appendChild(
        element("path", {
          d: line(connection.banks),
          class: "ce-bridge-outline",
          fill: "none",
          stroke: "#1A1917",
          "stroke-width": String(width + 1.4)
        })
      );
      features.appendChild(
        element("path", {
          d: line(connection.banks),
          class: connection.crossing.kind === "movableBridge" ? "ce-bridge-deck ce-movable-bridge" : "ce-bridge-deck",
          "data-crossing-kind": connection.crossing.kind,
          fill: "none",
          stroke: "#d5cfbf",
          "stroke-width": String(width)
        })
      );
    } else {
      features.appendChild(
        element("path", {
          d: line(connection.banks),
          class: "ce-ferry-route",
          "data-crossing-kind": connection.crossing.kind,
          fill: "none",
          stroke: "#c8beaa",
          "stroke-width": "1.5",
          "stroke-dasharray": "5 5"
        })
      );
      for (const p of connection.banks)
        features.appendChild(
          element("circle", {
            cx: String(p[0]),
            cy: String(-p[1]),
            r: "5",
            class: "ce-ferry-landing",
            fill: "#c8beaa",
            stroke: "#4a463c"
          })
        );
    }
  }
  if (!document.sceneRegions) appendFrameRoads(features, document, town);
  features.appendChild(renderApproachLabels(document, zoom));
  if (town && !fixedMode) {
    for (const deck of bridgeDecks(document)) {
      const crossing = document.featureGroups.find(g => g.id === deck.groupId)?.crossing;
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
          class: crossing?.kind === "movableBridge" ? "ce-bridge-deck ce-movable-bridge" : "ce-bridge-deck",
          "data-crossing-kind": crossing?.kind ?? "fixedBridge",
          fill: "none",
          stroke: "#d5cfbf",
          "stroke-width": String(deck.widthMeters),
          "stroke-linecap": "butt",
          "data-group": deck.groupId,
          "data-pick": encoded,
          "pointer-events": "stroke"
        })
      );
      if (crossing?.kind === "movableBridge" && deck.points.length >= 2) {
        const first = deck.points[0],
          last = deck.points.at(-1)!;
        const dx = last[0] - first[0],
          dy = last[1] - first[1];
        const length = Math.hypot(dx, dy);
        if (length > 0) {
          const center: Point = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
          const half = Math.min(length * 0.4, crossing.openingMeters / 2);
          for (const sign of [-1, 1]) {
            const hinge: Point = [center[0] + ((sign * dx) / length) * half, center[1] + ((sign * dy) / length) * half];
            const w = deck.widthMeters / 2;
            features.appendChild(
              element("path", {
                d: line([
                  [hinge[0] - (dy / length) * w, hinge[1] + (dx / length) * w],
                  [hinge[0] + (dy / length) * w, hinge[1] - (dx / length) * w]
                ]),
                class: "ce-movable-bridge-hinge",
                stroke: "#493b30",
                "stroke-width": "1.5",
                "pointer-events": "none"
              })
            );
          }
        }
      }
    }
  }
  svg.appendChild(features);
  if (fixedLayers) {
    const currentApproaches = currentFixedCrossingApproaches(document);
    const sameEpoch = fixedEpoch === JSON.stringify([document.importedFixedCrossings, document.frame]);
    const approaches = sameEpoch ? currentApproaches : null;
    if (!sameEpoch) {
      fixedLayers.water.remove();
      svg.setAttribute("data-fixed-geometry-status", "invalid");
    }
    svg.setAttribute("data-fixed-approach-status", approaches ? "ready" : "unvalidated");
    if (approaches)
      for (const approach of approaches) {
        const p = approach.corridor.pieces;
        const d = p
          .map(
            (piece, i) =>
              `${i ? "" : `M${piece.start[0]} ${-piece.start[1]}`} ${piece.kind === "line" ? `L${piece.end[0]} ${-piece.end[1]}` : `A${piece.radiusMeters} ${piece.radiusMeters} 0 ${Math.abs(piece.sweep) > Math.PI ? 1 : 0} ${piece.sweep < 0 ? 1 : 0} ${piece.end[0]} ${-piece.end[1]}`}`
          )
          .join(" ");
        svg.appendChild(
          element("path", {
            d,
            fill: "none",
            stroke: "#b6ac99",
            "stroke-width": String(document.importedFixedCrossings!.roadWidthMeters),
            "stroke-linecap": "butt",
            "data-fixed-approach-id": approach.id
          })
        );
      }
    if (sameEpoch) svg.appendChild(fixedLayers.crossings);
  }
  svg.appendChild(renderRiverWallSvg(document));
  if (town) {
    if (!preview) {
      svg.appendChild(renderTownQuays(document, townHarbor));
      svg.appendChild(renderTownWatermills(document, townWatermills, tool, selection.inspectedId));
    }
    svg.appendChild(renderTownFortifications(document, tool, selection.inspectedId));
    if (townParkLawns.length) {
      const parkTreesLayer = element("g", {
        class: "ce-park-trees",
        style: "z-index: 5;",
        "pointer-events": "none"
      });
      for (const park of townParkLawns) {
        for (const [treeIndex, tr] of park.trees.entries()) {
          if (minimal && treeIndex % 3 !== 0) continue;
          if (lightweight) {
            parkTreesLayer.appendChild(
              element("circle", {
                cx: String(tr.center[0]),
                cy: String(-tr.center[1]),
                r: String(tr.radius),
                class: "ce-park-tree",
                fill: "#557849",
                stroke: "#385230",
                "stroke-width": "0.6"
              })
            );
            continue;
          }
          const treeGroup = element("g", { class: "ce-park-tree", style: "z-index: 5;" });
          const [cx, cy] = [tr.center[0], -tr.center[1]];
          for (const sub of tr.subCircles) {
            treeGroup.appendChild(
              element("circle", {
                cx: String(cx + sub.offset[0]),
                cy: String(cy - sub.offset[1]),
                r: String(sub.radius),
                class: "ce-park-canopy-lobe",
                fill: "#557849",
                stroke: "#385230",
                "stroke-width": "0.6"
              })
            );
          }
          treeGroup.appendChild(
            element("circle", {
              cx: String(cx),
              cy: String(cy),
              r: String(tr.radius),
              class: "ce-park-canopy-main",
              fill: "#557849",
              stroke: "#385230",
              "stroke-width": "0.6"
            })
          );
          treeGroup.appendChild(
            element("circle", {
              cx: String(cx),
              cy: String(cy),
              r: String(tr.radius * 0.55),
              class: "ce-park-canopy-highlight",
              fill: "#688e5b",
              stroke: "none",
              opacity: "0.85"
            })
          );
          parkTreesLayer.appendChild(treeGroup);
        }
      }
      svg.appendChild(parkTreesLayer);
    }
  }
  svg.appendChild(element("g", { class: "ce-route-preview-layer", "pointer-events": "none" }));

  const castleFaces = !town ? reservedCastleFaces(document) : new Set<Id>();
  const wardLandmarks = element("g", { class: "ce-ward-landmarks", "pointer-events": "none" });
  if (!town) {
    for (const face of Object.values(document.mesh.faces)) {
      if (castleFaces.has(face.id)) continue;
      const marker = renderFaceWardLandmark(document.mesh, face, document);
      if (marker) wardLandmarks.appendChild(marker);
    }
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
    if (cityElement.kind === "ship") {
      const shipNode = renderShipSvg({
        type: cityElement.shipType ?? "small",
        point: p,
        sizeMeters: cityElement.sizeMeters,
        rotation: cityElement.rotation,
        id: cityElement.id,
        className: isPickSelected ? "ce-is-selected cg-is-selected" : ""
      });
      shipNode.setAttribute("data-pick", encodeURIComponent(JSON.stringify(pickInfo)));
      if (tool === "select") {
        shipNode.style.pointerEvents = "all";
        shipNode.style.cursor = "move";
      }
      elements.appendChild(shipNode);

      if (tool === "select" && isPickSelected) {
        const handleNode = renderShipRotationHandle({
          id: cityElement.id,
          point: p,
          sizeMeters: cityElement.sizeMeters,
          rotation: cityElement.rotation
        });
        elements.appendChild(handleNode);
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
    if (town && (cityElement.id.startsWith("gc:") || cityElement.kind === "temple" || cityElement.kind === "plaza")) {
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
        const footprint = templeFootprintMeters(townExtentMeters(document.frame));
        const length = cityElement.sizeMeters && cityElement.sizeMeters > 0 ? cityElement.sizeMeters : footprint.length;
        const width = length * (footprint.width / footprint.length);
        const templeNode = renderTempleSvg({
          point: p,
          length,
          width,
          rotation: cityElement.rotation,
          id: cityElement.id,
          className: isPickSelected ? "ce-is-selected cg-is-selected" : "",
          isPickSelected,
          templeType: cityElement.templeType
        });
        templeNode.setAttribute("data-pick", encodeURIComponent(JSON.stringify(pickInfo)));
        templeNode.setAttribute("pointer-events", tool === "select" ? "all" : "none");
        if (tool === "select") templeNode.style.cursor = "pointer";
        elements.appendChild(templeNode);
      }
      continue;
    }
    if (!town && elementHasDuplicateWardLandmark(document, castleFaces, cityElement)) {
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
  if (document.landmarks?.length) {
    const landmarks = element("g", {
      class: "ce-historic-landmarks",
      "pointer-events": tool === "select" ? "all" : "none"
    });
    for (const instance of document.landmarks) {
      const asset = document.landmarkAssets?.find(
        a => a.id === instance.assetId && a.revision === instance.assetRevision
      );
      const pick = encodeURIComponent(
        JSON.stringify({
          layer: "landmarks",
          kind: "landmark",
          id: instance.id,
          label: asset?.name ?? `Missing landmark asset ${instance.assetId}`,
          assetId: instance.assetId,
          rotation: instance.rotation,
          scale: instance.scale
        })
      );
      const marker = element("g", { "data-pick": pick, "data-landmark": instance.id });
      if (selection.inspectedId === instance.id) marker.classList.add("ce-is-selected");
      for (const access of instance.accesses) {
        for (const part of accessCorridor(access.points, access.widthMeters)) {
          marker.appendChild(
            element("path", {
              d: polygon(part.outer),
              fill: "#b2a78e",
              stroke: "#675f50",
              "stroke-width": "0.6"
            })
          );
        }
      }
      for (const part of instance.site) {
        marker.appendChild(
          element("path", {
            d: [polygon(part.outer), ...part.holes.map(polygon)].join(" "),
            "fill-rule": "evenodd",
            fill: "#c5b99d",
            stroke: "#746a5c",
            "stroke-width": "0.8"
          })
        );
      }
      for (const part of asset ? transformLandmarkPolygons(asset.footprint, instance) : []) {
        marker.appendChild(
          element("path", {
            d: [polygon(part.outer), ...part.holes.map(polygon)].join(" "),
            "fill-rule": "evenodd",
            fill: "#968a76",
            stroke: "#39372f",
            "stroke-width": "1.2"
          })
        );
      }
      if (asset) {
        const art = renderNormalizedLandmarkSvg(asset.renderSvg);
        const c = Math.cos(instance.rotation) * instance.scale;
        const s = Math.sin(instance.rotation) * instance.scale;
        art.setAttribute(
          "transform",
          `matrix(${c} ${-s} ${-s} ${-c} ${instance.position[0]} ${-instance.position[1]})`
        );
        marker.appendChild(art);
      }
      landmarks.appendChild(marker);
    }
    svg.appendChild(landmarks);
  }

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
  if (document.sceneRegions) {
    const shared = new Set([
      "ce-continuous-water",
      "ce-fixed-river-water",
      "ce-fixed-crossings",
      "ce-regional-water-cells"
    ]);
    const crossings = element("g", { class: "ce-regional-crossings" });
    for (const node of Array.from(
      features.querySelectorAll(".ce-bridge-outline, .ce-bridge-deck, .ce-movable-bridge-hinge")
    ))
      crossings.appendChild(node);
    crossings.setAttribute("data-scene-region", "shared");
    svg.appendChild(crossings);
    shared.add("ce-regional-crossings");
    for (const child of Array.from(svg.children)) {
      if (shared.has(child.getAttribute("class") ?? "") || child.hasAttribute("data-fixed-approach-id")) {
        child.setAttribute("data-scene-region", "shared");
        continue;
      }
      const regional = child.getAttribute("data-scene-region") === "regional";
      child.setAttribute("data-scene-region", regional ? "regional" : "core");
      if (!(regional ? sceneVisibility.regional : sceneVisibility.core)) child.setAttribute("display", "none");
    }
  }
  mark("svg-details");
  return svg;
}

export function renderApproachLabels(document: CityDocument, zoom: number): SVGGElement {
  const labels = element("g", { class: "ce-approach-labels" }) as SVGGElement;
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
    labels.appendChild(label);
  }
  return labels;
}

function renderTownQuays(document: CityDocument, harbor?: import("../core/gen/harborFabric").HarborPlan): SVGGElement {
  const layer = element("g", { class: "ce-quays", "pointer-events": "none" }) as SVGGElement;
  if (harbor) {
    for (const pier of harbor.piers)
      layer.appendChild(
        element("path", {
          d: polygon(pier.polygon),
          class: "ce-pier",
          "data-water-face": pier.waterFaceId,
          "data-depth-m": String(pier.depth),
          fill: "#c8beaa",
          stroke: "#4a463c",
          "stroke-width": "0.6"
        })
      );

    // Cargo piles along the harbor
    if (harbor.cargoPiles?.length) {
      const cargoLayer = element("g", { class: "ce-cargo-layer" });
      for (const pile of harbor.cargoPiles) {
        const [cx, cy] = [pile.point[0], -pile.point[1]];
        const rot = -(pile.rotation * 180) / Math.PI;
        const g = element("g", {
          class: `ce-cargo-pile ce-cargo-pile--${pile.kind}`,
          transform: `translate(${cx.toFixed(2)},${cy.toFixed(2)}) rotate(${rot.toFixed(1)})`
        });
        const hw = pile.widthMeters / 2;
        const hh = pile.heightMeters / 2;
        if (pile.kind === "barrels") {
          const r = 0.55;
          const coords = [
            [-hw + r, -hh + r],
            [0, -hh + r],
            [hw - r, -hh + r],
            [-hw * 0.5, hh - r],
            [hw * 0.5, hh - r]
          ];
          for (const [bx, by] of coords) {
            g.appendChild(
              element("circle", {
                cx: bx.toFixed(2),
                cy: by.toFixed(2),
                r: String(r),
                fill: "#7a6245",
                stroke: "#3d2e1c",
                "stroke-width": "0.3"
              })
            );
          }
        } else if (pile.kind === "crates") {
          g.appendChild(
            element("rect", {
              x: (-hw).toFixed(2),
              y: (-hh).toFixed(2),
              width: (pile.widthMeters * 0.6).toFixed(2),
              height: pile.heightMeters.toFixed(2),
              fill: "#968163",
              stroke: "#4a3c2b",
              "stroke-width": "0.35"
            })
          );
          g.appendChild(
            element("rect", {
              x: (-hw + pile.widthMeters * 0.45).toFixed(2),
              y: (-hh * 0.8).toFixed(2),
              width: (pile.widthMeters * 0.55).toFixed(2),
              height: (pile.heightMeters * 0.85).toFixed(2),
              fill: "#887458",
              stroke: "#4a3c2b",
              "stroke-width": "0.35"
            })
          );
        }
        cargoLayer.appendChild(g);
      }
      layer.appendChild(cargoLayer);
    }

    // Historical harbor cranes (treadwheel cranes, Roman Magna Rota, derricks)
    if (harbor.cranes?.length) {
      const cranesLayer = element("g", { class: "ce-harbor-cranes" });
      for (const crane of harbor.cranes) {
        const [cx, cy] = [crane.point[0], -crane.point[1]];
        const armAngleDeg = (-crane.armAngleRad * 180) / Math.PI;
        const g = element("g", {
          class: `ce-crane ce-crane--${crane.kind}`,
          transform: `translate(${cx.toFixed(2)},${cy.toFixed(2)})`
        });

        // Crane house or base
        if (crane.kind === "treadwheel") {
          g.appendChild(
            element("circle", {
              cx: "0",
              cy: "0",
              r: String(crane.radiusMeters),
              fill: "#6d5b45",
              stroke: "#362a1c",
              "stroke-width": "0.6"
            })
          );
          g.appendChild(
            element("circle", {
              cx: "0",
              cy: "0",
              r: String(crane.radiusMeters * 0.45),
              fill: "#4f4030",
              stroke: "#291e13",
              "stroke-width": "0.4"
            })
          );
        } else {
          g.appendChild(
            element("circle", {
              cx: "0",
              cy: "0",
              r: String(crane.radiusMeters),
              fill: "#786d5e",
              stroke: "#3d362d",
              "stroke-width": "0.5"
            })
          );
        }

        // Crane Jib Arm toward water
        const armGroup = element("g", {
          transform: `rotate(${armAngleDeg.toFixed(1)})`
        });
        armGroup.appendChild(
          element("path", {
            d: `M0 0 L${crane.armLengthMeters.toFixed(2)} 0`,
            stroke: "#362a1c",
            "stroke-width": "1.0",
            "stroke-linecap": "round"
          })
        );
        armGroup.appendChild(
          element("path", {
            d: `M${(crane.armLengthMeters * 0.3).toFixed(2)} -0.7 L${(crane.armLengthMeters * 0.7).toFixed(2)} 0 L${(crane.armLengthMeters * 0.3).toFixed(2)} 0.7`,
            fill: "none",
            stroke: "#4a3b2b",
            "stroke-width": "0.5"
          })
        );
        armGroup.appendChild(
          element("circle", {
            cx: crane.armLengthMeters.toFixed(2),
            cy: "0",
            r: "0.5",
            fill: "#221c15"
          })
        );
        armGroup.appendChild(
          element("rect", {
            x: (crane.armLengthMeters + 0.3).toFixed(2),
            y: "-0.6",
            width: "1.2",
            height: "1.2",
            fill: "#8c7657",
            stroke: "#3a2f21",
            "stroke-width": "0.3"
          })
        );

        g.appendChild(armGroup);
        cranesLayer.appendChild(g);
      }
      layer.appendChild(cranesLayer);
    }

    if (harbor.piers.length > 0) {
      return layer;
    }
  }
  // One shoreline per sea cell; a manually assigned ward needs no landmark.
  const shores = new Map<Id, { a: Point; b: Point; ring: Point[]; length: number; depth: number; inward?: Point }>();
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
    const physical = riverPortShore(document, land.id);
    const a = physical?.a ?? document.mesh.vertices[edge.a].point;
    const b = physical?.b ?? document.mesh.vertices[edge.b].point;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 10 || length <= (shores.get(water.id)?.length ?? 0)) continue;
    shores.set(water.id, {
      a,
      b,
      ring: physical?.water ?? facePoints(document.mesh, water),
      length,
      depth,
      inward: physical?.inward
    });
  }
  for (const [waterId, { a, b, ring, length, depth, inward }] of shores) {
    const center = polygonCentroid(ring);
    const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    let normal: Point = inward ? [-inward[0], -inward[1]] : [-tangent[1], tangent[0]];
    if (!inward && (center[0] - a[0]) * normal[0] + (center[1] - a[1]) * normal[1] < 0)
      normal = [-normal[0], -normal[1]];
    const isExploration = [
      "ageOfExploration",
      "maritimeEra",
      "preIndustrialEra",
      "steamEra",
      "industrialChemistryEra",
      "petroleumEra",
      "rocketryEra"
    ].includes(document.historicalPeriod ?? "ageOfExploration");
    const count = length >= 50 ? 2 : 1;
    const width = Math.min(isExploration ? 6.2 : 5.2, Math.max(isExploration ? 4.8 : 4.0, length * 0.16));
    const fractions = count === 2 ? [0.28, 0.72] : [0.5];
    for (let i = 0; i < count; i++) {
      const t = fractions[i];
      const start: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      // Stop within the receiving cell, so a pier never becomes a bridge.
      let reach = 0;
      const maxReachLimit = isExploration ? 42 : 28;
      const desired = Math.min(maxReachLimit, Math.max(isExploration ? 32 : 22, length * (isExploration ? 0.75 : 0.5)));
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

function renderTownWatermills(
  _document: CityDocument,
  plan?: import("../core/gen/watermillFabric").WatermillPlan,
  tool: Tool = "select",
  inspectedId: number | string | null = null
): SVGGElement {
  const layer = element("g", {
    class: "ce-watermills",
    "pointer-events": tool === "select" ? "all" : "none"
  }) as SVGGElement;

  if (!plan?.mills?.length) return layer;

  // 1. Weirs and water rapids/foam (堰と白波)
  const weirsLayer = element("g", { class: "ce-watermill-weirs", "pointer-events": "none" });
  for (const mill of plan.mills) {
    if (mill.weir) {
      const g = element("g", { class: "ce-watermill-weir" });
      // Weir beam / crest (timber piles / masonry weir)
      g.appendChild(
        element("path", {
          d: line(mill.weir.points),
          class: "ce-weir-crest",
          fill: "none",
          stroke: "#3d342a",
          "stroke-width": String(mill.weir.crestWidth),
          "stroke-linecap": "round"
        })
      );
      // Small timber post markers along weir
      const [w0, w1] = mill.weir.points;
      const wlen = Math.hypot(w1[0] - w0[0], w1[1] - w0[1]);
      const posts = Math.max(2, Math.floor(wlen / 2.5));
      for (let p = 0; p <= posts; p++) {
        const frac = p / posts;
        const postX = w0[0] + (w1[0] - w0[0]) * frac;
        const postY = -(w0[1] + (w1[1] - w0[1]) * frac);
        g.appendChild(
          element("circle", {
            cx: postX.toFixed(2),
            cy: postY.toFixed(2),
            r: "0.45",
            fill: "#262019"
          })
        );
      }
      // Weir overflow foam / white water
      if (mill.weir.foamPoints?.length >= 2) {
        g.appendChild(
          element("path", {
            d: line(mill.weir.foamPoints),
            class: "ce-weir-foam",
            fill: "none",
            stroke: "#eef5f7",
            "stroke-width": "1.6",
            "stroke-dasharray": "2.5 1.5",
            opacity: "0.85"
          })
        );
      }
      weirsLayer.appendChild(g);
    }

    // Wake / Tailrace ripples downstream of waterwheel
    if (mill.wakePolyline?.length >= 2) {
      weirsLayer.appendChild(
        element("path", {
          d: line(mill.wakePolyline),
          class: "ce-wheel-wake",
          fill: "none",
          stroke: "#e8f2f5",
          "stroke-width": "1.2",
          "stroke-dasharray": "1.8 1.4",
          opacity: "0.8"
        })
      );
    }
  }
  layer.appendChild(weirsLayer);

  // 2. Millhouses (水車小屋建物)
  const housesLayer = element("g", { class: "ce-millhouses" });
  for (const mill of plan.mills) {
    const isSelected = inspectedId === mill.id || inspectedId === `millhouse-${mill.id}`;
    const pickInfo = {
      layer: "buildings",
      kind: "watermill",
      id: mill.id,
      label: `${mill.name}（${mill.kind === "gristmill" ? "製粉水車" : mill.kind === "fulling" ? "縮絨水車" : "鍛冶水車"}）`,
      millKind: mill.kind,
      bankSide: mill.bankSide,
      riverId: mill.riverId
    };

    const g = element("g", {
      class: `ce-millhouse-group${isSelected ? " ce-is-selected cg-is-selected" : ""}`,
      "data-pick": encodeURIComponent(JSON.stringify(pickInfo)),
      style: tool === "select" ? "cursor:pointer" : ""
    });

    // Base building perimeter
    g.appendChild(
      element("path", {
        d: polygon(mill.millhousePolygon),
        class: "ce-millhouse-base ce-building",
        fill: "#b5ab96",
        stroke: "#292a26",
        "stroke-width": "0.45"
      })
    );

    // Roof slopes (river-side slope and land-side slope with subtle shading)
    g.appendChild(
      element("path", {
        d: polygon(mill.riverSideRoof),
        class: "ce-millhouse-roof-riverside",
        fill: "#a89d87",
        stroke: "none",
        opacity: "0.7"
      })
    );
    g.appendChild(
      element("path", {
        d: polygon(mill.landSideRoof),
        class: "ce-millhouse-roof-landside",
        fill: "#c4baa6",
        stroke: "none",
        opacity: "0.7"
      })
    );

    // Gable ridge line (棟木)
    g.appendChild(
      element("path", {
        d: line(mill.millhouseRidge),
        class: "ce-millhouse-ridge",
        fill: "none",
        stroke: "#423d33",
        "stroke-width": "0.55"
      })
    );

    housesLayer.appendChild(g);
  }
  layer.appendChild(housesLayer);

  // 3. Waterwheels (水車輪とパドル・車軸)
  const wheelsLayer = element("g", { class: "ce-waterwheels" });
  for (const mill of plan.mills) {
    const isSelected = inspectedId === mill.id || inspectedId === `waterwheel-${mill.id}`;
    const pickInfo = {
      layer: "features",
      kind: "waterwheel",
      id: `wheel-${mill.id}`,
      label: `${mill.name}の水車輪`,
      millId: mill.id
    };

    const [cx, cy] = [mill.wheel.center[0], -mill.wheel.center[1]];
    const rotDeg = (-mill.wheel.angleRad * 180) / Math.PI;

    const g = element("g", {
      class: `ce-waterwheel-unit${isSelected ? " ce-is-selected cg-is-selected" : ""}`,
      transform: `translate(${cx.toFixed(2)},${cy.toFixed(2)}) rotate(${rotDeg.toFixed(1)})`,
      "data-pick": encodeURIComponent(JSON.stringify(pickInfo)),
      style: tool === "select" ? "cursor:pointer" : ""
    });

    const hw = mill.wheel.width / 2;
    const hr = mill.wheel.radius;

    // Wheel frame outer box
    g.appendChild(
      element("rect", {
        x: (-hr).toFixed(2),
        y: (-hw).toFixed(2),
        width: (hr * 2).toFixed(2),
        height: (hw * 2).toFixed(2),
        rx: "0.3",
        ry: "0.3",
        fill: "#3b2a1a",
        stroke: "#1c140d",
        "stroke-width": "0.35"
      })
    );

    // Wheel inner rim
    const innerHw = hw * 0.65;
    g.appendChild(
      element("rect", {
        x: (-hr * 0.85).toFixed(2),
        y: (-innerHw).toFixed(2),
        width: (hr * 1.7).toFixed(2),
        height: (innerHw * 2).toFixed(2),
        fill: "#2e2014",
        stroke: "#140e09",
        "stroke-width": "0.2"
      })
    );

    // Wheel paddles (blades)
    const bladeCount = mill.wheel.bladeCount;
    for (let b = 0; b < bladeCount; b++) {
      const bx = -hr + (hr * 2 * (b + 0.5)) / bladeCount;
      g.appendChild(
        element("line", {
          x1: bx.toFixed(2),
          y1: (-hw).toFixed(2),
          x2: bx.toFixed(2),
          y2: hw.toFixed(2),
          stroke: "#543e29",
          "stroke-width": "0.3"
        })
      );
    }

    // Axle shaft
    g.appendChild(
      element("circle", {
        cx: "0",
        cy: "0",
        r: "0.5",
        fill: "#1f150e",
        stroke: "#0a0704",
        "stroke-width": "0.2"
      })
    );

    // Splash highlights on sides of wheel
    g.appendChild(
      element("circle", {
        cx: (-hr * 0.7).toFixed(2),
        cy: (-hw - 0.4).toFixed(2),
        r: "0.35",
        fill: "#eef5f7",
        opacity: "0.7"
      })
    );
    g.appendChild(
      element("circle", {
        cx: (hr * 0.7).toFixed(2),
        cy: (-hw - 0.4).toFixed(2),
        r: "0.35",
        fill: "#eef5f7",
        opacity: "0.7"
      })
    );

    wheelsLayer.appendChild(g);
  }
  layer.appendChild(wheelsLayer);

  return layer;
}

function gateHasMoat(document: CityDocument, gate: CityGate): boolean {
  return (document.defenseCircuits ?? []).some(
    circuit =>
      (gate.ownerCastleId
        ? circuit.scope === "castle" && circuit.ownerCastleId === gate.ownerCastleId
        : circuit.scope === "town") &&
      circuit.moat?.enabled &&
      document.featureGroups.some(
        group =>
          group.kind === "wall" &&
          circuit.wallGroupIds.includes(group.id) &&
          group.segments.some(ref => {
            const edge = document.mesh.edges[ref.edgeId];
            return edge && (edge.a === gate.vertexId || edge.b === gate.vertexId);
          })
      )
  );
}

function drawbridgeGate(document: CityDocument, points: Point[], width: number): CityGate | undefined {
  return document.gates
    .filter(gate => gateHasMoat(document, gate))
    .map(gate => ({ gate, distance: nearestOnPolyline(document.mesh.vertices[gate.vertexId].point, points).dist }))
    .filter(candidate => candidate.distance <= Math.max(width, candidate.gate.passageWidthMeters ?? 8))
    .sort((a, b) => a.distance - b.distance)[0]?.gate;
}

/** A short lowered timber leaf at the gate meets the fixed bridge from the far bank. */
function renderDrawbridge(
  document: CityDocument,
  points: Point[],
  width: number,
  gateId: Id,
  bridgeClass: string
): SVGGElement {
  const gate = document.gates.find(g => g.id === gateId)!;
  const wall = document.featureGroups.find(
    g => g.kind === "wall" && featureGroupVertices(document, g).includes(gate.vertexId)
  );
  const bridge = element("g", {
    class: `${bridgeClass} ce-drawbridge`,
    "data-gate-id": gateId,
    "pointer-events": "none"
  }) as SVGGElement;
  const leaf: Point[] = [points[0]];
  const fixed: Point[] = [];
  // Include the part under the gate so four metres remain visible outside.
  let remaining = 4 + (wall?.style.widthMeters ?? 0) / 2;
  for (let i = 1; i < points.length; i++) {
    if (fixed.length) {
      fixed.push(points[i]);
      continue;
    }
    const a = points[i - 1],
      b = points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length <= remaining) {
      leaf.push(b);
      remaining -= length;
      continue;
    }
    const t = remaining / length;
    const joint: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    leaf.push(joint);
    fixed.push(joint, b);
  }
  if (fixed.length > 1) {
    bridge.appendChild(
      element("path", {
        d: line(fixed),
        class: "ce-moat-fixed-bridge-outline",
        fill: "none",
        stroke: "#57534b",
        "stroke-width": String(width + 1.2),
        "stroke-linecap": "butt",
        "stroke-linejoin": "round"
      })
    );
    bridge.appendChild(
      element("path", {
        d: line(fixed),
        class: "ce-moat-fixed-bridge-deck",
        fill: "none",
        stroke: "#bcb6a5",
        "stroke-width": String(width),
        "stroke-linecap": "butt",
        "stroke-linejoin": "round"
      })
    );
  }
  points = leaf;
  bridge.appendChild(
    element("path", {
      d: line(points),
      class: "ce-drawbridge-outline",
      fill: "none",
      stroke: "#44372a",
      "stroke-width": String(width + 1.2),
      "stroke-linecap": "butt",
      "stroke-linejoin": "round"
    })
  );
  bridge.appendChild(
    element("path", {
      d: line(points),
      class: "ce-drawbridge-deck",
      fill: "none",
      stroke: "#b18a5b",
      "stroke-width": String(width),
      "stroke-linecap": "butt",
      "stroke-linejoin": "round"
    })
  );
  let travelled = 0;
  let nextBoard = 0.8;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.001) continue;
    const nx = -(b[1] - a[1]) / length,
      ny = (b[0] - a[0]) / length;
    while (nextBoard < travelled + length) {
      const t = (nextBoard - travelled) / length;
      const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      bridge.appendChild(
        element("path", {
          d: line([
            [p[0] - (nx * width) / 2, p[1] - (ny * width) / 2],
            [p[0] + (nx * width) / 2, p[1] + (ny * width) / 2]
          ]),
          class: "ce-drawbridge-plank",
          fill: "none",
          stroke: "#725436",
          "stroke-width": "0.3"
        })
      );
      nextBoard += 1;
    }
    travelled += length;
  }
  const start = points[0],
    end = points[points.length - 1];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  if (length > 0.001) {
    const nx = -(end[1] - start[1]) / length,
      ny = (end[0] - start[0]) / length;
    for (const side of [-1, 1]) {
      const from: Point = [start[0] + nx * side * (width / 2 + 0.5), start[1] + ny * side * (width / 2 + 0.5)];
      const to: Point = [end[0] + nx * side * (width / 2 - 0.5), end[1] + ny * side * (width / 2 - 0.5)];
      bridge.appendChild(
        element("path", {
          d: line([from, to]),
          class: "ce-drawbridge-chain",
          fill: "none",
          stroke: "#3e4140",
          "stroke-width": "0.45",
          "stroke-dasharray": "0.65 0.4"
        })
      );
    }
    bridge.appendChild(
      element("path", {
        d: line([
          [start[0] - (nx * width) / 2, start[1] - (ny * width) / 2],
          [start[0] + (nx * width) / 2, start[1] + (ny * width) / 2]
        ]),
        class: "ce-drawbridge-hinge",
        fill: "none",
        stroke: "#343432",
        "stroke-width": "0.9"
      })
    );
  }
  return bridge;
}

/** Exterior-only strokes keep the water against the curtain without changing mesh cells. */
export function renderMoats(document: CityDocument): SVGGElement {
  const layer = element("g", { class: "ce-moats", "pointer-events": "none" }) as SVGGElement;
  const claimed = new Set<Id>();
  const circuits = [...(document.defenseCircuits ?? [])].sort(
    (a, b) => (a.scope === "town" ? 0 : 1) - (b.scope === "town" ? 0 : 1)
  );
  for (const [index, circuit] of circuits.entries()) {
    if (!circuit.moat?.enabled || !(circuit.moat.widthMeters > 0)) continue;
    const regions = circuit.areaFaceIds.flatMap(id =>
      document.mesh.faces[id] ? [facePoints(document.mesh, document.mesh.faces[id])] : []
    );
    if (!regions.length) continue;
    const maskId = `ce-moat-exterior-${index}`;
    const extent = document.frame.extentMeters;
    const mask = element("mask", {
      id: maskId,
      maskUnits: "userSpaceOnUse",
      x: String(-extent),
      y: String(-extent),
      width: String(extent * 2),
      height: String(extent * 2),
      "mask-type": "luminance"
    });
    mask.appendChild(
      element("rect", {
        x: String(-extent),
        y: String(-extent),
        width: String(extent * 2),
        height: String(extent * 2),
        fill: "white"
      })
    );
    for (const region of regions)
      mask.appendChild(element("path", { d: polygon(region), fill: "black", stroke: "black", "stroke-width": "0.05" }));
    // Existing water supplies the moat on waterfronts; do not repaint it.
    for (const face of Object.values(document.mesh.faces)) {
      if (face.properties.water !== "land")
        mask.appendChild(element("path", { d: polygon(facePoints(document.mesh, face)), fill: "black" }));
    }
    for (const river of document.featureGroups) {
      if (river.kind !== "river") continue;
      const points = river.vertices.map(id => document.mesh.vertices[id]?.point).filter(isPoint);
      if (points.length > 1)
        mask.appendChild(
          element("path", {
            d: line(points),
            fill: "none",
            stroke: "black",
            "stroke-width": String(river.style.widthMeters),
            "stroke-linejoin": "round",
            "stroke-linecap": "round"
          })
        );
    }
    const defs = element("defs", {});
    defs.appendChild(mask);
    layer.appendChild(defs);
    const ribbon = element("g", { "data-circuit": circuit.id, mask: `url(#${maskId})` });
    const boundary = new Set(boundaryEdges(document.mesh, circuit.areaFaceIds).map(r => r.edgeId));
    const moatEdges = new Set<Id>();
    let maxWallWidth = 0;
    for (const group of document.featureGroups) {
      if (group.kind !== "wall" || !circuit.wallGroupIds.includes(group.id)) continue;
      const refs = new Set(group.segments.filter(ref => boundary.has(ref.edgeId) && !claimed.has(ref.edgeId)));
      // Preserve contiguous runs so joins do not leave gaps at corners.
      let run: EdgeRef[] = [];
      const flush = () => {
        if (!run.length) return;
        ribbon.appendChild(
          element("path", {
            d: line(edgeGroupPoints(document, run)),
            class: "ce-moat-water",
            fill: "none",
            stroke: "#91c8d3",
            "stroke-width": String(group.style.widthMeters + circuit.moat!.widthMeters * 2),
            "stroke-linejoin": "round",
            "stroke-linecap": "round"
          })
        );
        run = [];
      };
      for (const ref of group.segments) {
        if (!refs.has(ref)) {
          flush();
          continue;
        }
        run.push(ref);
        moatEdges.add(ref.edgeId);
        claimed.add(ref.edgeId);
        maxWallWidth = Math.max(maxWallWidth, group.style.widthMeters);
      }
      flush();
    }
    for (const gate of document.gates ?? []) {
      if (circuit.scope === "castle" ? gate.ownerCastleId !== circuit.ownerCastleId : !!gate.ownerCastleId) continue;
      const touches = [...moatEdges].some(id => {
        const e = document.mesh.edges[id];
        return e.a === gate.vertexId || e.b === gate.vertexId;
      });
      if (!touches) continue;
      // Connected roads supply a deck aligned with their actual crossing below.
      if (
        document.featureGroups.some(g => g.kind === "road" && featureGroupVertices(document, g).includes(gate.vertexId))
      )
        continue;
      const frame = gateCrossingFrame(document, gate.vertexId);
      if (!frame) continue;
      const length = circuit.moat.widthMeters + maxWallWidth / 2 + 2;
      const end: Point = [frame.point[0] - frame.inward[0] * length, frame.point[1] - frame.inward[1] * length];
      ribbon.appendChild(
        renderDrawbridge(document, [frame.point, end], gate.passageWidthMeters ?? 8, gate.id, "ce-moat-bridge")
      );
    }
    layer.appendChild(ribbon);
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
    let roadWidth = defaultRoadWidthMeters(townExtentMeters(document.frame));
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
    const drawbridge = gateHasMoat(document, gate);
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
    for (const sweep of gate.ownerCastleId ? [] : drawbridge ? [0] : [1, 0])
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
        y: String(drawbridge ? -width / 2 : -side / 2),
        width: String(opening),
        height: String(drawbridge ? (side + width) / 2 : side),
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

/** Soften field corners without moving the underlying parcel or its furrows. */
function roundedFarmPolygon(points: Point[]): string {
  if (points.length < 3) return polygon(points);
  const corners = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const before = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    const after = Math.hypot(next[0] - point[0], next[1] - point[1]);
    const radius = Math.min(3, before * 0.18, after * 0.18);
    const entry: Point = before
      ? [
          point[0] + ((previous[0] - point[0]) * radius) / before,
          point[1] + ((previous[1] - point[1]) * radius) / before
        ]
      : point;
    const exit: Point = after
      ? [point[0] + ((next[0] - point[0]) * radius) / after, point[1] + ((next[1] - point[1]) * radius) / after]
      : point;
    return { point, entry, exit };
  });
  const start = corners[0].entry;
  return `M${start[0]} ${-start[1]} ${corners
    .map(({ point, exit }, index) => {
      return `Q${point[0]} ${-point[1]} ${exit[0]} ${-exit[1]} L${corners[(index + 1) % corners.length].entry[0]} ${-corners[(index + 1) % corners.length].entry[1]}`;
    })
    .join(" ")} Z`;
}

function line(points: Point[]): string {
  return points.map((point, index) => `${index ? "L" : "M"}${point[0]} ${-point[1]}`).join(" ");
}

/** Continue an imported road from the outermost mesh vertex when that stub stays dry. */
function appendFrameRoads(parent: SVGElement, document: CityDocument, town: boolean): void {
  const legs = document.frameRoads;
  if (!legs?.length) return;
  const width = String(defaultRoadWidthMeters(townExtentMeters(document.frame)));
  const casing = (points: Point[]) => {
    if (!town) return;
    parent.appendChild(
      element("path", {
        d: line(points),
        class: "ce-frame-road-casing",
        fill: "none",
        stroke: "#57534b",
        "stroke-width": String(Number(width) + 1.4),
        "stroke-linecap": "butt",
        "stroke-linejoin": "round",
        "pointer-events": "none"
      })
    );
  };
  for (const leg of legs) {
    const connection = frameRoadTownConnection(document, leg);
    if (connection && Math.hypot(connection[0][0] - connection[1][0], connection[0][1] - connection[1][1]) > 1e-5) {
      casing(connection);
      parent.appendChild(
        element("path", {
          d: line(connection),
          class: "ce-frame-road",
          "data-frame-road": String(leg.routeId),
          "data-source-index": String(leg.sourceIndex),
          "data-route-id": String(leg.routeId),
          "data-frame-connection": "true",
          fill: "none",
          stroke: town ? "#d5cfbf" : "#735238",
          "stroke-width": width,
          "stroke-linecap": "butt",
          "pointer-events": "none"
        })
      );
    }
    for (const piece of leg.pieces) {
      const points = piece.points;
      if (points.length < 2) continue;
      if (
        document.sceneRegions &&
        (piece.kind === "bridge" || lineHitsDocumentWater(document, points, Number(width), true))
      )
        continue;
      const identity = {
        "data-source-index": String(leg.sourceIndex),
        "data-route-id": String(leg.routeId),
        "pointer-events": document.sceneRegions ? "stroke" : "none",
        ...(document.sceneRegions
          ? {
              "data-pick": encodeURIComponent(
                JSON.stringify({
                  layer: "regional",
                  kind: "road-reference",
                  id: `regional-road-${leg.routeId}-${leg.branchIndex ?? 0}`,
                  label: `街道 #${leg.routeId}`,
                  routeId: leg.routeId,
                  branchId: leg.branchIndex ?? 0
                })
              )
            }
          : {})
      };
      if (piece.kind === "bridge") {
        parent.appendChild(
          element("path", {
            d: line(points),
            class: "ce-bridge-outline",
            fill: "none",
            stroke: "#1A1917",
            "stroke-width": String(Number(width) + 1.4),
            "stroke-linecap": "butt",
            ...identity
          })
        );
        parent.appendChild(
          element("path", {
            d: line(points),
            class: piece.bridgeKind === "movableBridge" ? "ce-bridge-deck ce-movable-bridge" : "ce-bridge-deck",
            "data-frame-bridge": piece.bridgeKind ?? "fixedBridge",
            fill: "none",
            stroke: "#d5cfbf",
            "stroke-width": width,
            "stroke-linecap": "butt",
            ...identity
          })
        );
        continue;
      }
      casing(points);
      parent.appendChild(
        element("path", {
          d: line(points),
          class: "ce-frame-road",
          "data-frame-road": String(leg.routeId),
          fill: "none",
          stroke: town ? "#d5cfbf" : "#735238",
          "stroke-width": width,
          "stroke-linecap": "butt",
          ...identity
        })
      );
    }
  }
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

/** Rebuild only static geometry from the embedded plan; never adopt source DOM nodes or links. */
function renderNormalizedLandmarkSvg(markup: string): SVGGElement {
  const output = element("g", { class: "ce-landmark-art", "pointer-events": "none" }) as SVGGElement;
  if (typeof DOMParser === "undefined" || markup.length > 100_000) return output;
  const source = new DOMParser().parseFromString(markup, "image/svg+xml");
  if (source.querySelector("parsererror") || source.documentElement.localName !== "svg") return output;
  const tags = new Set(["g", "path", "circle", "rect", "ellipse", "polygon", "polyline", "line"]);
  const attrs = new Set([
    "d",
    "points",
    "x",
    "y",
    "x1",
    "x2",
    "y1",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "width",
    "height",
    "fill",
    "fill-rule",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "opacity",
    "fill-opacity",
    "stroke-opacity",
    "transform"
  ]);
  let count = 0;
  const append = (sourceParent: Element, target: SVGElement): void => {
    for (const child of Array.from(sourceParent.children)) {
      if (++count > 1_000) return;
      if (!tags.has(child.localName)) continue;
      const node = element(child.localName, {});
      for (const attribute of Array.from(child.attributes)) {
        if (!attrs.has(attribute.localName) || attribute.namespaceURI) continue;
        if (/url\s*\(|[<>]|javascript:|data:/i.test(attribute.value)) continue;
        if (attribute.localName === "transform" && /[^\d\s.,+\-eE()a-z]/.test(attribute.value)) continue;
        node.setAttribute(attribute.localName, attribute.value);
      }
      target.appendChild(node);
      if (child.localName === "g") append(child, node);
    }
  };
  append(source.documentElement, output);
  return output;
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

function faceRendersWardLandmarkKind(castleFaces: Set<Id>, face: Face, kind: string): boolean {
  if (castleFaces.has(face.id) || face.properties.water !== "land") return false;
  return wardLandmarkKind(face.properties.ward) === kind;
}

function elementHasDuplicateWardLandmark(
  document: CityDocument,
  castleFaces: Set<Id>,
  cityElement: CityElement
): boolean {
  const kind = cityElement.kind;
  if (kind !== "harbor" && kind !== "plaza" && kind !== "citadel") {
    return false;
  }
  if (cityElement.faceIds?.length) {
    for (const fid of cityElement.faceIds) {
      const face = document.mesh.faces[fid];
      if (face && faceRendersWardLandmarkKind(castleFaces, face, kind)) {
        return true;
      }
    }
  }
  if (cityElement.point) {
    for (const face of Object.values(document.mesh.faces)) {
      if (!faceRendersWardLandmarkKind(castleFaces, face, kind)) continue;
      const poly = facePoints(document.mesh, face);
      if (pointInPolygon(cityElement.point, poly)) {
        return true;
      }
    }
  }
  return false;
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
export function renderFaceWardLandmark(mesh: Mesh, face: Face, source?: CityDocument): SVGElement | null {
  const kind = wardLandmarkKind(face.properties.ward);
  if (!kind || face.properties.water !== "land") return null;
  const outline = facePoints(mesh, face);
  if (!source || !waterPolygons(source).length) return cityElementMarker(centroid(outline), kind, `ward-${face.id}`);
  let dry = convexInfillParts(outline);
  for (const water of waterPolygons(source))
    for (const wet of convexInfillParts(water)) dry = dry.flatMap(part => subtractConvex(part, wet, 1));
  const safe = dry
    .map(part =>
      insetConvexKernel(
        part,
        part.map(() => 8)
      )
    )
    .filter(part => part.length >= 3)
    .sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))[0];
  return safe ? cityElementMarker(polygonCentroid(safe), kind, `ward-${face.id}`) : null;
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
  .ce-features { z-index: 2; }
  .ce-park-trees, .ce-park-tree { z-index: 5; }
  .ce-park-lawn { fill: #7ea867; stroke: #4d733b; stroke-width: 0.8px; }
  .ce-park-path { fill: none; stroke: #d8d1bf; stroke-width: 1.8px; stroke-linecap: round; stroke-linejoin: round; }
  .ce-park-grass { fill: none; stroke: #5d8249; stroke-width: 0.7px; stroke-linecap: round; }
  .ce-park-canopy-lobe, .ce-park-canopy-main { fill: #557849; stroke: #385230; stroke-width: 0.6px; }
  .ce-park-canopy-highlight { fill: #688e5b; opacity: 0.85; }
  .ce-millhouse-base { fill: #b8ad98; stroke: #332f28; stroke-width: 0.45px; }
  .ce-weir-crest { stroke-linecap: round; }
  .ce-waterwheel-unit:hover { filter: drop-shadow(0 0 2px rgba(255,200,80,0.8)); }
  .ce-svg--town .ce-face--sea, .ce-svg--town .ce-face--openWater { fill: #456d7f; }
  .ce-svg--town .ce-face--lake { fill: #527f8b; }
  .ce-svg--town .ce-moat-water { stroke: #527f8b; }
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
  .ce-face--land.ce-face--ward-patriciate { fill: #cab4d3; }
  .ce-face--land.ce-face--ward-craftsmen { fill: #d1a46e; }
  .ce-face--land.ce-face--ward-harbor { fill: #e3b66d; }
  .ce-face--land.ce-face--ward-park { fill: #99c187; }
  .ce-face--land.ce-face--ward-farm { fill: #c6c19f; }
  .ce-face--land.ce-face--ward-cemetery { fill: #99c187; }
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
  .ce-pier { fill: #c8beaa; stroke: #4a463c; stroke-width: 0.6px; }
  .ce-crane { filter: drop-shadow(0 0 1px #332b22); }
  .ce-cargo-pile { opacity: 0.95; }
  .ce-ship { cursor: pointer; }
  .ce-ship-shadow { fill: rgba(18, 30, 38, 0.32); }
  .ce-ship-hull-outer { fill: #382c20; stroke: #221a13; }
  .ce-ship-deck { fill: #c8b99c; stroke: #423527; }
  .ce-ship-deck-step { fill: #ab9b7e; stroke: #382a1d; }
  .ce-ship-hatch { fill: #5a4834; stroke: #31261a; }
  .ce-ship-grating { stroke: #31261a; }
  .ce-ship-mast { fill: #5a4531; stroke: #22170e; }
  .ce-ship-crowsnest { fill: #38281a; stroke: #1e150d; }
  .ce-ship-yard { stroke: #3e3020; }
  .ce-ship-furled-sail { fill: #e8e0ce; stroke: #7d7260; }
  .ce-ship-rigging { stroke: #2b2218; opacity: 0.75; }
  .ce-ship-boat { fill: #b8a88a; stroke: #382a1d; }
  .ce-ship-lantern { fill: #c49a45; stroke: #523e16; }
  .ce-ship-rotate-knob { transition: r 0.15s ease; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.35)); }
  .ce-ship-rotate-knob:hover { r: 6px; fill: #e8f4fc; }
  .ce-temple { cursor: pointer; }
  .ce-temple-shadow { fill: rgba(18, 22, 25, 0.28); }
  .ce-temple-base { fill: #b8b5ad; stroke: #38352e; stroke-width: 0.7px; stroke-linejoin: round; }
  .ce-temple-buttresses { fill: #9e9b93; stroke: #38352e; stroke-width: 0.5px; }
  .ce-temple-nave, .ce-temple-transept, .ce-temple-apse, .ce-temple-crossing, .ce-temple-westwork, .ce-temple-chancel, .ce-temple-porch, .ce-temple-roof { stroke-linejoin: round; }
  .ce-temple-spire-diagonal { stroke-linecap: round; }
  .ce-megalith-stone, .ce-megalith-portal { stroke-linejoin: round; }
`;

export function renderStandaloneCitySvg(
  document: CityDocument,
  preview = false,
  observer?: GenerationObserver
): SVGSVGElement {
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
    false,
    observer,
    false,
    false,
    "detailed",
    preview
  );
  if (preview) {
    svg.setAttribute("data-render-quality", "preview");
    svg.setAttribute("data-preview-symbols", String(svg.querySelectorAll("[data-preview-block]").length));
    for (const face of Object.values(document.mesh.faces)) {
      if (!face.properties.buildable || face.properties.water !== "land") continue;
      const path = svg.querySelector(`[data-face="${face.id}"]`);
      path?.setAttribute("style", "fill: #beb5a1");
    }
  }

  svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns", NS);
  svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");
  svg.setAttribute("version", "1.1");
  svg.setAttribute("width", String(extent));
  svg.setAttribute("height", String(extent));

  let defs = [...svg.children].find(child => child.localName === "defs") as SVGDefsElement | undefined;
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

export function serializeCitySvg(document: CityDocument, observer?: GenerationObserver): string {
  const svg = renderStandaloneCitySvg(document, false, observer);
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

export function renderCemeteries(document: CityDocument, inspectedId?: string | number | null): SVGGElement {
  const layer = element("g", { class: "ce-cemeteries" }) as SVGGElement;
  let plans = document.cemeteries;
  if (!plans) {
    const generated: import("../core/types").CemeteryPlan[] = [];
    for (const face of Object.values(document.mesh.faces)) {
      if (face.properties.ward === "cemetery") {
        const boundary = computeCemeteryBoundary(document, face);
        const area = Math.abs(polygonArea(boundary));
        const period = document.historicalPeriod;
        const isModern = period === "preIndustrialEra" || period === "steamEra" || period === "industrialChemistryEra";
        const form: import("../core/types").CemeteryPlan["form"] = isModern || area < 750 ? "field" : "churchyard";
        const plan: import("../core/types").CemeteryPlan = {
          id: `cemetery:${face.id}`,
          version: 1,
          seed: `cemetery-${face.id}`,
          form,
          faceId: face.id,
          boundary,
          courtyards: [],
          parts: [],
          accesses: [],
          trees: [],
          provenance: "generated",
          locked: false
        };
        const layout = layoutCemetery(document, plan);
        if (layout) generated.push(layout);
      }
    }
    plans = generated;
  }
  for (const cemetery of plans) {
    const pick = {
      layer: "cemetery",
      kind: "cemetery",
      id: cemetery.id,
      label: `墓地 (${cemetery.form})`,
      locked: cemetery.locked
    };
    const group = element("g", {
      "data-pick": encodeURIComponent(JSON.stringify(pick)),
      class: inspectedId === cemetery.id ? "ce-is-selected cg-is-selected" : "",
      style: "cursor:pointer"
    });

    // 1. Outer precinct stone wall
    if (cemetery.boundary.length >= 3) {
      group.appendChild(
        element("path", {
          d: polygon(cemetery.boundary),
          fill: "none",
          stroke: "#49483f",
          "stroke-width": "1.0"
        })
      );
    }

    // 2. Courtyards / lawns (vibrant grass matching park lawns)
    for (const court of cemetery.courtyards) {
      group.appendChild(
        element("path", {
          d: polygon(court),
          fill: "#7ea867",
          stroke: "#4d733b",
          "stroke-width": "0.8"
        })
      );
    }

    // 3. Pathways (clean gravel paths matching park walks)
    for (const access of cemetery.accesses) {
      group.appendChild(
        element("path", {
          d: line(access.points),
          fill: "none",
          stroke: "#d8d1bf",
          "stroke-width": String(access.widthMeters),
          "stroke-linecap": "round",
          "stroke-linejoin": "round"
        })
      );
    }

    // 4. Parts: buildings, calvary cross, graves
    for (const part of cemetery.parts) {
      if (part.role === "calvary") {
        group.appendChild(
          element("path", {
            d: polygon(part.footprint),
            fill: "#edeae2",
            stroke: "#5d584e",
            "stroke-width": "0.8"
          })
        );
        const center = polygonCentroid(part.footprint);
        const crossSize = 1.8;
        group.appendChild(
          element("line", {
            x1: String(center[0]),
            y1: String(-center[1] - crossSize),
            x2: String(center[0]),
            y2: String(-center[1] + crossSize),
            stroke: "#3d3932",
            "stroke-width": "1.0",
            "stroke-linecap": "round"
          })
        );
        group.appendChild(
          element("line", {
            x1: String(center[0] - crossSize * 0.7),
            y1: String(-center[1] - crossSize * 0.3),
            x2: String(center[0] + crossSize * 0.7),
            y2: String(-center[1] - crossSize * 0.3),
            stroke: "#3d3932",
            "stroke-width": "1.0",
            "stroke-linecap": "round"
          })
        );
      } else if (part.role === "graves") {
        // Individual stone headstones and grave slabs dotted neatly over the green lawn
        const [minX, minY, maxX, maxY] = bounds(part.footprint);
        const stepX = 2.2;
        const stepY = 2.4;
        const calvaryPart = cemetery.parts.find(p => p.role === "calvary");
        const calvaryCenter = calvaryPart ? polygonCentroid(calvaryPart.footprint) : null;

        let plotIndex = 0;
        for (let gx = minX + 1.2; gx <= maxX - 1.2; gx += stepX) {
          for (let gy = minY + 1.0; gy <= maxY - 1.0; gy += stepY) {
            plotIndex++;
            const p: Point = [gx, gy];
            if (!pointInPolygon(p, part.footprint)) continue;

            // Keep graves off paths / accesses
            let hitsPath = false;
            for (const acc of cemetery.accesses) {
              const halfW = (acc.widthMeters ?? 1.8) / 2 + 0.45;
              if (nearestOnPolyline(p, acc.points).dist < halfW) {
                hitsPath = true;
                break;
              }
            }
            if (hitsPath) continue;

            // Keep off calvary monument
            if (calvaryCenter && Math.hypot(gx - calvaryCenter[0], gy - calvaryCenter[1]) < 2.0) {
              continue;
            }

            // Keep off tree canopies
            if (cemetery.trees.some(tp => Math.hypot(gx - tp[0], gy - tp[1]) < 2.2)) {
              continue;
            }

            // Authentic European burial field:
            // Every plot has an upright headstone.
            // Alternating plots feature flat stone slabs (ledger stones) or kerb borders.
            const hasSlab = plotIndex % 3 !== 0;

            if (hasSlab) {
              // 1. Flat horizontal grave slab / stone kerb
              group.appendChild(
                element("rect", {
                  x: String(gx - 0.28),
                  y: String(-gy - 0.5),
                  width: "0.56",
                  height: "1.05",
                  rx: "0.12",
                  fill: "#ded9cd",
                  stroke: "#666157",
                  "stroke-width": "0.3"
                })
              );
            }

            // 2. Upright headstone at the head of the plot (facing east/pathway)
            group.appendChild(
              element("rect", {
                x: String(gx - 0.32),
                y: String(-gy + 0.38),
                width: "0.64",
                height: "0.26",
                rx: "0.08",
                fill: "#edeae2",
                stroke: "#49453c",
                "stroke-width": "0.35"
              })
            );

            // Optional carved cross relief on select headstones
            if (plotIndex % 2 === 0) {
              group.appendChild(
                element("line", {
                  x1: String(gx),
                  y1: String(-gy + 0.41),
                  x2: String(gx),
                  y2: String(-gy + 0.61),
                  stroke: "#787265",
                  "stroke-width": "0.2"
                })
              );
              group.appendChild(
                element("line", {
                  x1: String(gx - 0.12),
                  y1: String(-gy + 0.47),
                  x2: String(gx + 0.12),
                  y2: String(-gy + 0.47),
                  stroke: "#787265",
                  "stroke-width": "0.2"
                })
              );
            }
          }
        }
      } else {
        // Stone buildings: slate / limestone masonry
        const isChapel = part.role === "chapel";
        group.appendChild(
          element("path", {
            d: polygon(part.footprint),
            fill: isChapel ? "#726b5f" : part.role === "ossuary" ? "#888072" : "#989082",
            stroke: "#3d3932",
            "stroke-width": isChapel ? "1.4" : "1.0"
          })
        );
        for (const entrance of part.entrances) {
          group.appendChild(
            element("circle", {
              cx: String(entrance[0]),
              cy: String(-entrance[1]),
              r: "1.2",
              fill: "#f3efe4"
            })
          );
        }
      }
    }

    // 5. Yew Trees: fluffy multi-circle tree canopy matching park foliage
    for (const tree of cemetery.trees) {
      const treeGroup = element("g", { class: "ce-cemetery-tree" });
      const cx = tree[0];
      const cy = -tree[1];
      const radius = 3.2;

      // 6 surrounding canopy lobes
      const lobeCount = 6;
      for (let i = 0; i < lobeCount; i++) {
        const angle = (i * 2 * Math.PI) / lobeCount;
        const ox = Math.cos(angle) * (radius * 0.45);
        const oy = Math.sin(angle) * (radius * 0.45);
        treeGroup.appendChild(
          element("circle", {
            cx: String(cx + ox),
            cy: String(cy + oy),
            r: String(radius * 0.55),
            fill: "#557849",
            stroke: "#385230",
            "stroke-width": "0.6"
          })
        );
      }

      // Main center canopy
      treeGroup.appendChild(
        element("circle", {
          cx: String(cx),
          cy: String(cy),
          r: String(radius),
          fill: "#557849",
          stroke: "#385230",
          "stroke-width": "0.6"
        })
      );

      // Top highlight
      treeGroup.appendChild(
        element("circle", {
          cx: String(cx),
          cy: String(cy),
          r: String(radius * 0.55),
          fill: "#688e5b",
          stroke: "none",
          opacity: "0.85"
        })
      );

      group.appendChild(treeGroup);
    }

    layer.appendChild(group);
  }
  return layer;
}
