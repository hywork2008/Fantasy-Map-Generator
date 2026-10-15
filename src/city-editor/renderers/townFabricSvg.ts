import { editorText } from "../../i18n/editorMessages";
import type { AerialLandmarkPlan } from "../generators/aerialLandmarks";
import { farmSheds } from "../generators/farmSheds";
import { polygonArea, polygonCentroid } from "../generators/geom";
import type { HarborPlan } from "../generators/harborFabric";
import type { ParkLawn } from "../generators/parkFabric";
import type { WatermillPlan } from "../generators/watermillFabric";
import type { Id } from "../types/document";
import type { SvgPickInfo } from "../types/selection";
import { type FallbackPier, fallbackHarborPiers, plannedHarborPiers } from "./harborPierFacts";
import { openSpaceBoundary } from "./openSpaceBoundary";
import type { RenderContext } from "./renderContext";
import { element, line, polygon } from "./svgPrimitives";
import { prepareTownFacts } from "./townFacts";
import { roundedFarmPolygon } from "./townShapes";

/** The town plans later layers draw (quays, mills, parks, aerial landmarks) and the landscape keep-out reads. */
export interface TownLayerPlans {
  harbor: HarborPlan | undefined;
  parks: ParkLawn[];
  watermills: WatermillPlan | undefined;
  aerial: AerialLandmarkPlan | undefined;
  plannedPiers: HarborPlan["piers"];
  /** Only computed when the harbor plan has no piers. */
  fallbackPiers: FallbackPier[];
}

/** Buildings, farms, parks, lanes and the occupancy `data-*` attributes of the town view. */
export function renderTownFabric(
  ctx: RenderContext,
  svg: SVGSVGElement,
  mark: (phase: string, counts?: Record<string, number>) => void
): TownLayerPlans {
  const { document, tool, selection, hideBuildings, hideStreetLines, lightweight, minimal, fixedMode, zoom } = ctx;
  const buildings = element("g", {
    class: "ce-buildings",
    "pointer-events": tool === "select" ? "all" : "none"
  });
  mark("svg-base");
  const facts = prepareTownFacts(document, mark);
  const { fabric, lots, housing } = facts;
  const clusterPeople = new Map(facts.populationClusters?.map(c => [c.id, c.assignedPopulation]) ?? []);
  if (document.populationPlan) {
    const metadata = element("metadata", {});
    metadata.textContent = JSON.stringify({
      population: document.populationPlan,
      report: facts.populationReport,
      representation: "population-housing-groups"
    });
    svg.append(metadata);
    if (facts.populationReport) svg.setAttribute("data-population-report", JSON.stringify(facts.populationReport));
  }
  if (housing) {
    svg.setAttribute("data-residential-capacity", String(housing.capacityInside + housing.capacityOutside));
    svg.setAttribute("data-assigned-outside-dwellings", String(housing.assignedOutside));
    svg.setAttribute("data-unplaced-dwellings", String(housing.unplacedDwellings));
  }
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
  // Double walls: the old-town share of the core (wallRing 0).
  svg.setAttribute(
    "data-old-town-buildings",
    String(
      hideBuildings
        ? 0
        : lots.filter(lot => {
            const properties = document.mesh.faces[lot.faceId]?.properties;
            return properties?.settlement === "core" && properties.wallRing === 0;
          }).length
    )
  );
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
  const townParkLawns = facts.parks;
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
        !lot.residentialCluster &&
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
      const bldId = lot.residentialCluster?.id ?? lot.parcelId ?? `bld-${lot.faceId}`;
      const isPickSelected = selection.inspectedId === bldId || selection.inspectedId === lot.faceId;
      const pickInfo: SvgPickInfo = {
        layer: "buildings",
        kind: "building",
        id: bldId,
        label: lot.residentialCluster
          ? editorText(
              document.populationPlan?.displayDwellings === 1
                ? "cityEditor.messages.populationBuildingTitle"
                : "cityEditor.messages.populationClusterTitle",
              {
                capacity: lot.residentialCluster.capacityDwellings,
                population: clusterPeople.get(lot.residentialCluster.id) ?? 0,
                dwellings: lot.residentialCluster.assignedDwellings,
                buildings: Object.values(lot.residentialCluster.templateCounts).reduce((a, b) => a + b, 0)
              }
            )
          : lot.archetype
            ? editorText("cityEditor.messages.buildingAreaDetails", {
                value0: lot.archetype,
                value1: lot.role,
                value2: Math.round(Math.abs(polygonArea(lot.polygon)))
              })
            : editorText("cityEditor.messages.building", {
                value0: document.mesh.faces[lot.faceId].properties.ward,
                value1: lot.faceId
              }),
        ...(lot.parcelId
          ? { parcelId: lot.parcelId, archetype: lot.archetype, role: lot.role, uses: lot.uses, storeys: lot.storeys }
          : {}),
        ...(lot.residentialCluster
          ? {
              residentialCapacity: lot.residentialCluster.capacityDwellings,
              assignedDwellings: lot.residentialCluster.assignedDwellings,
              assignedPopulation: clusterPeople.get(lot.residentialCluster.id) ?? 0,
              representedBuildings: Object.values(lot.residentialCluster.templateCounts).reduce((a, b) => a + b, 0)
            }
          : {}),
        ward: document.mesh.faces[lot.faceId].properties.ward,
        faceId: lot.faceId,
        landmark: !!lot.landmark
      };
      const bldNode = element("path", {
        d: polygon(lot.polygon),
        class: `ce-building${lot.landmark ? " ce-building--landmark" : ""}${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
        "data-building-face": lot.faceId,
        ...(lot.residentialCluster
          ? {
              "data-residential-cluster": lot.residentialCluster.id,
              "data-dwellings": String(lot.residentialCluster.assignedDwellings)
            }
          : {}),
        ...(lot.parcelId
          ? { "data-parcel": lot.parcelId, "data-archetype": lot.archetype!, "data-building-role": lot.role! }
          : {}),
        "data-pick": encodeURIComponent(JSON.stringify(pickInfo))
      });
      if (lot.residentialCluster) {
        const title = element("title", {});
        title.textContent = pickInfo.label;
        bldNode.append(title);
      }
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
              label: editorText("cityEditor.messages.blockSelectToShowBuildingDetails", { value0: faceId }),
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
  return {
    harbor: facts.fabric?.harbor,
    parks: townParkLawns,
    watermills: facts.watermills,
    aerial: facts.fabric?.aerialLandmarks,
    plannedPiers: plannedHarborPiers(document, facts.fabric?.harbor),
    fallbackPiers: facts.fabric?.harbor?.piers.length ? [] : fallbackHarborPiers(document)
  };
}
