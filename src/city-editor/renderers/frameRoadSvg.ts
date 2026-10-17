import { editorText } from "../../i18n/editorMessages";
import { frameRoadLegFacts } from "../generators/approachFacts";
import { cobbledApproach, frameRoadWidthMeters, roadUse } from "../generators/roadTraffic";
import { defaultRoadWidthMeters, townExtentMeters } from "../generators/settlementExtent";
import { lineHitsDocumentWater } from "../generators/waterGeometry";
import type { CityDocument, Point } from "../types/document";
import { element, line } from "./svgPrimitives";
/** The shared fixed-crossing layer already draws this span (Allagospo has none, so its frame bridge must draw). */
export function fixedCrossingCovers(document: CityDocument, deck: Point[]): boolean {
  const near = (a: Point, b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 25;
  return (document.importedFixedCrossings?.crossings ?? []).some(
    c =>
      (near(deck[0], c.deckA) && near(deck.at(-1)!, c.deckB)) || (near(deck[0], c.deckB) && near(deck.at(-1)!, c.deckA))
  );
}

export function appendCobble(
  parent: SVGElement,
  runs: Point[][],
  width: number,
  surface: Record<string, string> = {}
): void {
  const { class: surfaceClass, ...surfaceAttrs } = surface;
  for (const run of runs) {
    if (run.length < 2) continue;
    const path = line(run);
    parent.appendChild(
      element("path", {
        d: path,
        class: "ce-road-cobble-casing",
        fill: "none",
        stroke: "#6e685c",
        "stroke-width": String(width + 1.4),
        "stroke-linecap": "butt",
        "stroke-linejoin": "round",
        "pointer-events": "none"
      })
    );
    parent.appendChild(
      element("path", {
        d: path,
        fill: "none",
        stroke: "#c8c2b4",
        "stroke-width": String(width),
        "stroke-linecap": "butt",
        "stroke-linejoin": "round",
        "pointer-events": "none",
        ...surfaceAttrs,
        class: surfaceClass ? `ce-road--cobble ${surfaceClass}` : "ce-road--cobble"
      })
    );
    parent.appendChild(
      element("path", {
        d: path,
        class: "ce-road-cobble-joints",
        fill: "none",
        stroke: "#7d786c",
        "stroke-width": String(Math.max(0.6, width * 0.18)),
        "stroke-dasharray": "0.7 2.1",
        "stroke-linecap": "butt",
        "pointer-events": "none"
      })
    );
  }
}

/** Continue an imported road from the outermost mesh vertex when that stub stays dry. */
export function appendFrameRoads(parent: SVGElement, document: CityDocument, town: boolean): void {
  const legs = document.frameRoads;
  if (!legs?.length) return;
  const baseWidth = defaultRoadWidthMeters(townExtentMeters(document.frame));
  const casing = (points: Point[], width: number) => {
    if (!town) return;
    parent.appendChild(
      element("path", {
        d: line(points),
        class: "ce-frame-road-casing",
        fill: "none",
        stroke: "#57534b",
        "stroke-width": String(width + 1.4),
        "stroke-linecap": "butt",
        "stroke-linejoin": "round",
        "pointer-events": "none"
      })
    );
  };
  for (const { leg, connection } of frameRoadLegFacts(document)) {
    const cobble = town && cobbledApproach(roadUse(document, leg.sourceIndex, leg.routeId));
    const roadWidth = frameRoadWidthMeters(document, leg.sourceIndex, leg.routeId, town);
    const width = String(roadWidth);
    if (connection && Math.hypot(connection[0][0] - connection[1][0], connection[0][1] - connection[1][1]) > 1e-5) {
      if (cobble)
        appendCobble(parent, [connection], roadWidth, {
          class: "ce-frame-road ce-frame-road--cobble",
          "data-frame-road": String(leg.routeId),
          "data-source-index": String(leg.sourceIndex),
          "data-route-id": String(leg.routeId),
          "data-frame-connection": "true"
        });
      else {
        casing(connection, roadWidth);
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
    }
    // A leg the frame planner bridged already runs its approaches along the
    // bank to a square crossing; grazing that bank is not a water crossing.
    const plannedCrossing = leg.pieces.some(piece => piece.kind === "bridge");
    for (const piece of leg.pieces) {
      const points = piece.points;
      if (points.length < 2) continue;
      if (
        document.sceneRegions &&
        (piece.kind === "bridge"
          ? fixedCrossingCovers(document, points)
          : !plannedCrossing && lineHitsDocumentWater(document, points, baseWidth, true))
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
                  label: cobble
                    ? editorText("cityEditor.messages.roadPaved", { value0: leg.routeId })
                    : editorText("cityEditor.messages.road", { value0: leg.routeId }),
                  routeId: leg.routeId,
                  branchId: leg.branchIndex ?? 0
                })
              )
            }
          : {})
      };
      if (piece.kind === "bridge") {
        const deck = String(baseWidth);
        parent.appendChild(
          element("path", {
            d: line(points),
            class: "ce-bridge-outline",
            fill: "none",
            stroke: "#1A1917",
            "stroke-width": String(baseWidth + 1.4),
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
            "stroke-width": deck,
            "stroke-linecap": "butt",
            ...identity
          })
        );
        continue;
      }
      if (cobble) {
        appendCobble(parent, [points], roadWidth, {
          class: "ce-frame-road ce-frame-road--cobble",
          "data-frame-road": String(leg.routeId),
          ...identity
        });
        continue;
      }
      casing(points, roadWidth);
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
