import { editorText } from "../../i18n/editorMessages";
import { riverConnectionFacts } from "../generators/approachFacts";
import { riverRibbons, roadRunsOutsideRivers } from "../generators/bridgeDeck";
import { clipPolylineToExterior, outerWallRing } from "../generators/concealStreets";
import { wallRunsOutsideGates } from "../generators/fortifications";
import { MoatRoadSplitter } from "../generators/moatRoadFacts";
import { type PhysicalRoadRun, physicalRoadRuns } from "../generators/roadNetwork";
import { cobbledApproach, cobbledWidthMeters, roadUse } from "../generators/roadTraffic";
import { defaultRoadWidthMeters, townExtentMeters } from "../generators/settlementExtent";
import { dryRuns, waterPolygons } from "../generators/waterGeometry";
import type { FeatureGroup, Point } from "../types/document";
import type { SvgPickInfo } from "../types/selection";
import { renderApproachLabels } from "./approachLabelSvg";
import { isNewStyleCastleWall } from "./castleStyle";
import { fixedRoadIsDry } from "./fixedDocumentGeometry";
import { appendCobble, appendFrameRoads } from "./frameRoadSvg";
import { drawbridgeGate, renderDrawbridge } from "./moatSvg";
import { modularFortressOwnsWall } from "./modularFortress";
import { featureGroupPickInfo } from "./pickInfo";
import type { RenderContext } from "./renderContext";
import { edgeGroupPoints, element, isPoint, line } from "./svgPrimitives";
import { drawableBridgeDecks } from "./townFacts";
import { renderWallStructure } from "./wallSvg";

/** Road, river, wall and bridge feature groups, river-connection roads and ferries, approach labels. */
export function renderFeatureLayer(ctx: RenderContext, svg: SVGSVGElement): SVGGElement {
  const { document, selection, zoom, town, fixedMode, fixedGeometry, hideStreetLines } = ctx;
  const features = element("g", { class: "ce-features", style: "z-index: 2;" });
  const order = { wall: 0, river: 1, road: 2, plank: 3 };
  const renderGroups = town
    ? [...document.featureGroups].sort((a, b) => order[a.kind] - order[b.kind])
    : document.featureGroups;
  // One ring for the whole pass. Roads inside it are the centre-to-wall streets.
  const concealWall = town && hideStreetLines ? outerWallRing(document) : null;
  const approachWall = town ? (concealWall ?? outerWallRing(document)) : null;
  const ribbons = town ? riverRibbons(document) : [];
  const moatSplitter = new MoatRoadSplitter(document);
  const groupById = new Map(document.featureGroups.map(group => [group.id, group]));
  const physical = new Map<string, PhysicalRoadRun[]>();
  for (const run of physicalRoadRuns(document, group => !((town || fixedMode) && group.id.startsWith("gc:bridge-")))) {
    if (!physical.has(run.group.id)) physical.set(run.group.id, []);
    physical.get(run.group.id)!.push(run);
  }
  const entries = renderGroups.flatMap((group): { group: FeatureGroup; routeIds: string[] }[] =>
    group.kind === "road"
      ? (physical.get(group.id) ?? []).map(run => ({
          group: { ...group, segments: run.segments },
          routeIds: run.routeIds
        }))
      : [{ group, routeIds: [group.id] }]
  );
  for (const { group, routeIds } of entries) {
    if (fixedMode && (group.kind === "river" || (group.kind === "road" && group.id.startsWith("gc:bridge-")))) continue;
    const active = !!selection.groupId && routeIds.includes(selection.groupId);
    const pickGroupId = active ? selection.groupId! : group.id;
    const pickGroup = groupById.get(pickGroupId)!;
    const isPickSelected = routeIds.some(
      id => selection.inspectedId === id || selection.inspectedId === `feature-${id}`
    );
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
      runs = moatSplitter.dryRuns(runs, width);
    }
    if (fixedMode && group.kind === "road")
      runs = fixedGeometry ? runs.filter(run => fixedRoadIsDry(run, group.style.widthMeters, fixedGeometry)) : [];
    const wallMaterial = group.kind === "wall" ? (group.wallMaterial ?? "stone") : undefined;
    const wallStrokeColor = wallMaterial === "wood" ? "#634327" : "#292a26";
    const pickInfo: SvgPickInfo = featureGroupPickInfo(pickGroup, {
      layer: "features",
      kind: group.kind,
      ...(group.kind === "road" ? { routeIds } : {}),
      label: group.name,
      widthMeters: group.style.widthMeters,
      color: group.style.color,
      segmentCount: group.kind === "river" ? group.vertices.length : group.segments.length,
      ...(wallMaterial ? { wallMaterial } : {})
    });
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
      if (
        group.kind === "wall" &&
        (isNewStyleCastleWall(document, group.id) || modularFortressOwnsWall(document, group.id))
      ) {
        continue;
      }
      features.appendChild(
        element("path", {
          d: line(run),
          class: `ce-feature ce-feature--${group.kind}${group.kind === "wall" ? ` ce-feature--wall-${wallMaterial}` : ""}${active ? " ce-active-group" : ""}${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
          stroke: town
            ? group.kind === "road"
              ? "#d5cfbf"
              : group.kind === "river"
                ? "#527f8b"
                : wallStrokeColor
            : group.style.color,
          "stroke-width": String(group.style.widthMeters),
          ...(fixedMode && group.kind === "road" ? { "stroke-linejoin": "round", "stroke-linecap": "butt" } : {}),
          "data-group": pickGroupId,
          ...(group.kind === "road"
            ? { "data-road-routes": JSON.stringify(routeIds), "data-road-owner": group.id }
            : {}),
          "data-pick": encodeURIComponent(JSON.stringify(pickInfo)),
          "pointer-events": "stroke"
        })
      );
      if (town && group.kind === "road" && approachWall) {
        const use = roadUse(document, group.sourceRoad?.index, group.sourceRoad?.routeId);
        if (cobbledApproach(use))
          appendCobble(
            features,
            clipPolylineToExterior(run, approachWall),
            cobbledWidthMeters(group.style.widthMeters)
          );
      }
      if (town && group.kind === "wall") {
        features.appendChild(renderWallStructure(document, group, run, element));
      }
    }
  }
  for (const deck of fixedMode ? [] : moatSplitter.decks) {
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
  // Fixed crossings draw their own bridges; a ferry has no fixed geometry.
  for (const { connection, townRoad, farRoad, ferry } of riverConnectionFacts(document, fixedMode)) {
    const width = defaultRoadWidthMeters(townExtentMeters(document.frame));
    for (const points of [farRoad, ...dryRuns(townRoad, waterPolygons(document))]) {
      if (points.length < 2) continue;
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
    }
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
      // Each crossing heads square across and drifts downstream; the boat is
      // then hauled up the far bank to its landing (see FerryPlan).
      const crossings = ferry ? [ferry.outbound, ferry.inbound] : [connection.banks];
      for (const points of crossings)
        features.appendChild(
          element("path", {
            d: line(points),
            class: "ce-ferry-route",
            "data-crossing-kind": connection.crossing.kind,
            fill: "none",
            stroke: "#c8beaa",
            "stroke-width": "1.5",
            "stroke-dasharray": "5 5"
          })
        );
      for (const tow of ferry ? (ferry.farInFrame ? [ferry.townTow, ferry.farTow] : [ferry.townTow]) : [])
        features.appendChild(
          element("path", {
            d: line(tow),
            class: "ce-ferry-tow",
            fill: "none",
            stroke: "#c8beaa",
            "stroke-width": "1",
            "stroke-dasharray": "1.5 2.5"
          })
        );
      // Each landing gets a short plank jetty out into the river. A route
      // whose far landing lies beyond the frame draws only the town landing.
      const landings: Array<[Point, Point]> = ferry
        ? [
            [ferry.landing, ferry.across],
            ...(ferry.farInFrame ? [[ferry.farLanding, [-ferry.across[0], -ferry.across[1]]] as [Point, Point]] : [])
          ]
        : (connection.farRoad.length ? connection.banks : [connection.banks[0]]).map((p, i) => {
            const q = connection.banks[1 - i];
            const span = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
            return [p, [(q[0] - p[0]) / span, (q[1] - p[1]) / span]] as [Point, Point];
          });
      for (const [p, out] of landings)
        features.appendChild(
          element("path", {
            d: line([p, [p[0] + out[0] * 12, p[1] + out[1] * 12]]),
            class: "ce-ferry-jetty",
            fill: "none",
            stroke: "#8a7356",
            "stroke-width": "4",
            "stroke-linecap": "butt"
          })
        );
      for (const [p] of landings)
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
    for (const deck of drawableBridgeDecks(document)) {
      const crossing = document.featureGroups.find(g => g.id === deck.groupId)?.crossing;
      const pickInfo: SvgPickInfo = {
        layer: "features",
        kind: "road",
        id: deck.groupId,
        label: editorText("cityEditor.messages.bridge", { value0: deck.name }),
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
  return features as SVGGElement;
}
