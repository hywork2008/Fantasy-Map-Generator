import { harborCraneFoundationFootprint } from "../../../buildings/medieval/harborCraneDimensions";
import { defenseAccessSurface } from "../../generators/vector/defense";
import { vectorShipFootprint } from "../../generators/vector/harbor";
import type { Point } from "../../types/primitives";
import type { VectorHarborPlan } from "../../types/vector/harbor";
import type { VectorRenderSurface } from "./renderData";

export function vectorHarborSurfaces(plan: VectorHarborPlan): VectorRenderSurface[] {
  const surfaces: VectorRenderSurface[] = [];
  const add = (
    id: string,
    pieceRole: string,
    polygons: VectorRenderSurface["polygons"],
    color: string,
    elevationMeters: number,
    heightMeters = 0
  ) => {
    const s: VectorRenderSurface = {
      id,
      kind: "feature",
      featureKind: "harbor",
      pieceRole,
      polygons,
      color,
      elevationMeters,
      heightMeters
    };
    surfaces.push(s);
    return s;
  };
  for (const water of plan.navigation.depths)
    add(water.id, "harbor-water", [water.polygon], "#71abc4", water.levelMeters);
  for (const space of plan.spaces) add(space.id, space.kind, [space.polygon], "#a49b88", 0.01, 0.05);
  for (const access of plan.accesses)
    add(access.id, "harbor-access", defenseAccessSurface(access.points, access.widthMeters), "#c7ae84", 0.07, 0.02);
  for (const [i, frontage] of plan.frontages.entries())
    add(
      `${plan.id}:frontage:${i}`,
      "cargo-frontage",
      defenseAccessSurface([frontage.a, frontage.b], frontage.widthMeters),
      "#b0a084",
      0.06
    );
  for (const pier of plan.piers) add(pier.id, "pier", [pier.polygon], "#967c58", 0.02, 0.15);
  for (const crane of plan.cranes)
    add(
      crane.id,
      "crane",
      [{ outer: harborCraneFoundationFootprint(crane.point, crane.armAngleRad, 1), holes: [] }],
      "#9c784a",
      0
    ).harborCrane = crane;
  for (const pile of plan.cargoPiles) {
    const c = Math.cos(pile.rotation),
      s = Math.sin(pile.rotation);
    const outer: Point[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1]
    ].map(([a, b]) => {
      const x = (a * pile.widthMeters) / 2,
        y = (b * pile.heightMeters) / 2;
      return [pile.point[0] + x * c + y * s, pile.point[1] + x * s - y * c];
    });
    const surface = add(pile.id, "cargo-pile", [{ outer, holes: [] }], "#9c784a", 0, 1.5);
    if (pile.kind === "crates" || pile.kind === "barrels") surface.harborPile = pile;
  }
  for (const ship of plan.ships) {
    const water = plan.navigation.depths.find(w => w.id === ship.waterId)!;
    add(ship.id, "ship", [vectorShipFootprint(ship)], "#795b3e", water.levelMeters).harborShip = ship;
    if (ship.cargo)
      add(
        `${ship.id}:cargo`,
        "cargo-transfer",
        defenseAccessSurface([ship.cargo.hook, ship.cargo.landDrop], 0.25),
        "#bea563",
        ship.cargo.kind === "cargo-quay" ? water.levelMeters + 3 : 3
      );
  }
  return surfaces;
}
