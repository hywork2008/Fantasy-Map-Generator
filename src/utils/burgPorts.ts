import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { isTrueOceanHarborCell } from "./oceanPort";

/** Explicit flags take precedence; old maps use charted lanes, then physical access. */
export function getBurgPorts(burg: Burg, pack: PackedGraph): { seaPort: boolean; riverPort: boolean } {
  if (burg.seaPort !== undefined && burg.riverPort !== undefined) {
    return { seaPort: burg.seaPort, riverPort: burg.riverPort };
  }
  const lanes = (pack.routes ?? []).filter(
    route => route.group === "searoutes" && (route.cells ?? route.points.map(point => point[2])).includes(burg.cell)
  );
  return {
    seaPort:
      burg.seaPort ??
      Boolean(
        lanes.some(route => route.navigation !== "river") || (burg.port && isTrueOceanHarborCell(burg.cell, pack))
      ),
    riverPort:
      burg.riverPort ??
      Boolean(lanes.some(route => route.navigation === "river") || (burg.port && pack.cells.r?.[burg.cell]))
  };
}
