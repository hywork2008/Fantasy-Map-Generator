import { terrainHeight } from "../../../core/gen/castlePlacement";
import { pointInPolygon } from "../../../core/gen/geom";
import type { BurgSiteDescriptor } from "../../../core/gen/site/burgSiteDescriptor";
import type { Cell, CityGeography } from "../../../core/gen/types";
import { cellInsideWater } from "../../../core/waterGeometry";
export function applyWideChannels(
  cells: Cell[],
  channels: NonNullable<CityGeography["channels"]>,
  sea: Set<number>
): NonNullable<CityGeography["channels"]> {
  if (!channels.length || !cells.length) return [];
  const applied: NonNullable<CityGeography["channels"]> = [];
  for (const channel of channels) {
    const wet = cells.filter(cell => pointInPolygon(cell.centroid, channel.polygon));
    for (const cell of wet) if (cellInsideWater(cell.polygon, channel.polygon)) sea.add(cell.id);
    applied.push(channel);
  }
  return applied;
}

export function fmgCellElevations(
  cells: Cell[],
  site: BurgSiteDescriptor | undefined
): Map<number, number> | undefined {
  if (!site) return undefined;
  return new Map(
    cells.flatMap(cell => {
      const height = terrainHeight(site.terrain, cell.centroid);
      return height === null ? [] : [[cell.id, height] as [number, number]];
    })
  );
}
