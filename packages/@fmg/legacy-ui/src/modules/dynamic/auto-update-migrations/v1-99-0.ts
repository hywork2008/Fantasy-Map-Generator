"use strict";

import * as d3 from "d3";
import type { AutoUpdateMigrationContext } from "./types";
import { drawRoutes, layerIsOn } from "../../ui/layers";
import { rn } from "@fmg/shared";
import { findClosestCell } from "#utils/graphUtils";

export function migrateToV1_99_0(context: AutoUpdateMigrationContext): void {
  // v1.99 changed default projection flags
  const { pack, grid, dom, helpers } = context as any;
  if (!(pack as any).meta) (pack as any).meta = {};
  if ((pack as any).meta.projection === undefined) (pack as any).meta.projection = "mercator";

  // v1.99.00 changed routes generation algorithm and data format
  try {
    const routes = dom?.routes ?? d3.select("#routes");
    routes.attr("display", null).attr("style", null);

    if (pack.cells) {
      delete (pack.cells as any).road;
      delete (pack.cells as any).crossroad;
    }

    pack.routes = [];
    const POINT_DISTANCE = (grid && grid.spacing) ? grid.spacing * 0.75 : 0;

    const viewbox = dom?.viewbox ?? d3.select("#viewbox");
    const groups = viewbox.node()?.querySelectorAll("#routes > g") || [];
    for (const g of Array.from(groups)) {
      const group = (g as Element).id;
      if (!group) continue;

      for (const node of (g as Element).querySelectorAll("path")) {
        const totalLength = (node as SVGPathElement).getTotalLength();
        if (!totalLength) {
          ERROR && console.error("Route path has zero length", node);
          continue;
        }

        const increment = totalLength / Math.ceil(totalLength / POINT_DISTANCE || 1);
        const points: Array<[number, number, number]> = [];

        for (let i = 0; i <= totalLength + 0.1; i += increment) {
          const point = (node as SVGPathElement).getPointAtLength(i);
          const x = rn(point.x, 2);
          const y = rn(point.y, 2);
          const cellId = helpers?.findPackCell ? helpers.findPackCell(x, y) : findClosestCell(x, y, Infinity, pack);
          points.push([x, y, cellId]);
        }

        if (points.length < 2) {
          ERROR && console.error("Route path has less than 2 points", node);
          continue;
        }

        const secondCellId = points[1][2];
        const feature = pack.cells && pack.cells.f ? pack.cells.f[secondCellId] : undefined;

        pack.routes.push({ i: pack.routes.length, group: group as any, feature, points });
      }
    }

    routes.selectAll("path").remove();
    if (layerIsOn("toggleRoutes")) drawRoutes();

    const links = (pack.cells.routes = {} as any);
    for (const route of pack.routes) {
      for (let i = 0; i < route.points.length - 1; i++) {
        const cellId = route.points[i][2];
        const nextCellId = route.points[i + 1][2];

        if (cellId !== nextCellId) {
          if (!links[cellId]) links[cellId] = {};
          links[cellId][nextCellId] = route.i;

          if (!links[nextCellId]) links[nextCellId] = {};
          links[nextCellId][cellId] = route.i;
        }
      }
    }
  } catch (e) {
    // best-effort migration, ignore failures
  }
}
