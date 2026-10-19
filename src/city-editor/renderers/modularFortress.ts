import { fortressMassing } from "../../city3d/core/fortressMassing";
import { fortressPlacement, modularCastleForWall } from "../generators/fortressPlacement";
import { type CityTerrain, cityTerrain } from "../generators/terrainElevation";
import type { StructureMassing } from "../types/contracts/structureMassing";
import type { CastlePlan, CityDocument, CityGate } from "../types/document";

export function modularFortressStructures(
  document: CityDocument,
  castle: CastlePlan,
  terrain?: CityTerrain
): StructureMassing[] | null {
  if (!castle.fortress) return null;
  const placement = fortressPlacement(document, castle);
  if (!placement) return null;
  const ground = terrain ?? cityTerrain(document);
  return fortressMassing(placement, castle.fortress.phase, ground.heightAt, ground.foundationAt).structures.map(
    part => ({ ...part, id: `castle:${castle.id}:${part.id}` })
  );
}

/** Only suppress ordinary walls if the replacement can actually be placed. */
export function modularFortressOwnsWall(document: CityDocument, wallId: string): boolean {
  const castle = modularCastleForWall(document, wallId);
  return !!castle && !!fortressPlacement(document, castle);
}

export function modularFortressOwnsCircuit(document: CityDocument, circuitId: string): boolean {
  const castle = document.castles?.find(item => item.circuitId === circuitId && item.fortress);
  return !!castle && !!fortressPlacement(document, castle);
}

export function modularFortressOwnsGate(document: CityDocument, gate: CityGate): boolean {
  return !!document.castles?.some(castle => {
    if (!castle.fortress) return false;
    const placement = fortressPlacement(document, castle);
    const point = document.mesh.vertices[gate.vertexId]?.point;
    return (
      !!placement &&
      !!point &&
      placement.gates.some(item => Math.hypot(item.point[0] - point[0], item.point[1] - point[1]) < 0.1)
    );
  });
}

export function renderModularFortress(document: CityDocument, castle: CastlePlan): SVGGElement | null {
  const structures = modularFortressStructures(document, castle);
  if (!structures) return null;
  const ns = "http://www.w3.org/2000/svg";
  const group = window.document.createElementNS(ns, "g");
  group.setAttribute("class", "ce-modular-fortress");
  group.setAttribute("data-model", castle.fortress!.modelId);
  group.setAttribute("data-phase", castle.fortress!.phase);
  const line = (ring: NonNullable<StructureMassing["footprint"]>) =>
    `${ring.map(([x, y], i) => `${i ? "L" : "M"}${x},${-y}`).join(" ")} Z`;
  for (const part of [...structures].sort(
    (a, b) => a.baseElevationMeters + a.heightMeters - b.baseElevationMeters - b.heightMeters
  )) {
    if (!part.footprint?.length) continue;
    const path = window.document.createElementNS(ns, "path");
    path.setAttribute("d", [line(part.footprint), ...(part.holes ?? []).map(line)].join(" "));
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute(
      "fill",
      part.color
        ? "#456d7f"
        : part.id.includes("terrace")
          ? "#d5cfbf"
          : part.id.includes("talus")
            ? "#aaa28e"
            : "#c1b8a2"
    );
    path.setAttribute("stroke", "#4a463c");
    path.setAttribute("stroke-width", "0.6");
    path.setAttribute("data-part", part.id);
    group.append(path);
  }
  return group;
}
