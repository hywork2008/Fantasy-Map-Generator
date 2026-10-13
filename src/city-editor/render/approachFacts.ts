import { featureGroupVertices } from "../core/features";
import { currentFixedCrossingApproaches } from "../core/fixedApproachAdoption";
import { frameRoadTownConnection } from "../core/frameRoadConnection";
import {
  approachBeyondAnchor,
  approachBeyondLabel,
  externalRoadLabels,
  normalizeApproachBeyond
} from "../core/gen/approachBeyond";
import { type FerryPlan, ferryPlan } from "../core/gen/ferryLanding";
import type { CityDocument, Point } from "../core/types";

type RiverConnection = NonNullable<CityDocument["riverConnections"]>[number];

type Exit = ReturnType<typeof externalRoadLabels>[number];
type Beyond = NonNullable<ReturnType<typeof normalizeApproachBeyond>>;

/** What a road exit says about the land beyond the map. Read-only. */
export interface ApproachLabelFact {
  exit: Exit;
  /** Label of the first destination, shown as-is when the exit has one destination. */
  label: string;
  norm: Beyond;
  anchor: Point;
  /** Per-destination labels and relations when the exit branches; empty otherwise. */
  branches: Array<{ label: string; norm: Beyond | undefined }>;
}

export function approachLabelFacts(document: CityDocument): ApproachLabelFact[] {
  const facts: ApproachLabelFact[] = [];
  for (const exit of externalRoadLabels(document)) {
    const road = exit.destinations[0];
    const label = approachBeyondLabel(road.group.beyond);
    const norm = normalizeApproachBeyond(road.group.beyond);
    if (!label || !norm) continue;
    facts.push({
      exit,
      label,
      norm,
      anchor: approachBeyondAnchor(road.outward, document.frame.extentMeters / 2),
      branches:
        exit.destinations.length > 1
          ? exit.destinations.map(item => ({
              label: approachBeyondLabel(item.group.beyond)!,
              norm: normalizeApproachBeyond(item.group.beyond)
            }))
          : []
    });
  }
  return facts;
}

/** A river-crossing road: its town and far stubs and, for a ferry, the planned crossing. */
export interface RiverConnectionFact {
  connection: RiverConnection;
  townRoad: Point[];
  farRoad: Point[];
  ferry: FerryPlan | null;
}

/** Connections to draw. A fixed bridge or movable bridge belongs to the fixed-crossing layer. */
export function riverConnectionFacts(document: CityDocument, fixedMode: boolean): RiverConnectionFact[] {
  const connections = (document.riverConnections ?? []).filter(
    connection => !fixedMode || !["fixedBridge", "movableBridge"].includes(connection.crossing.kind)
  );
  return connections.map(connection => {
    const group = document.featureGroups.find(g => g.kind === "road" && g.sourceRoad?.index === connection.sourceIndex);
    const vertex = group ? document.mesh.vertices[featureGroupVertices(document, group)[0]]?.point : undefined;
    const ferry = ferryPlan(document, connection);
    return {
      connection,
      townRoad: vertex ? [vertex, ...connection.townRoad] : connection.townRoad,
      // A ferry's far landing sits square across the river; the far road meets it there.
      farRoad: ferry && connection.farRoad.length ? [ferry.farLanding, ...connection.farRoad] : connection.farRoad,
      ferry
    };
  });
}

export type FrameRoadLeg = NonNullable<CityDocument["frameRoads"]>[number];

/** Imported frame-road legs with the stub that joins each to the town edge. */
export function frameRoadLegFacts(
  document: CityDocument
): Array<{ leg: FrameRoadLeg; connection: ReturnType<typeof frameRoadTownConnection> }> {
  return (document.frameRoads ?? []).map(leg => ({ leg, connection: frameRoadTownConnection(document, leg) }));
}

/**
 * Fixed-crossing approaches, only while the fixed geometry is unchanged since the
 * render began (`fixedEpoch`); null when it changed, so nothing stale is drawn.
 */
export function currentFixedApproachFacts(document: CityDocument, fixedEpoch: string) {
  const approaches = currentFixedCrossingApproaches(document);
  const sameEpoch = fixedEpoch === JSON.stringify([document.importedFixedCrossings, document.frame]);
  return { sameEpoch, approaches: sameEpoch ? approaches : null };
}
