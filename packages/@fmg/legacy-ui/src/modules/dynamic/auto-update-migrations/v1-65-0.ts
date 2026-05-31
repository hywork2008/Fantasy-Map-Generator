"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";
import { rn } from "@fmg/shared";

export function migrateToV1_65_0({ pack, dom, helpers }: AutoUpdateMigrationContext): void {

  const { pack: _pack } = { pack } as any; // keep local 'pack' name stable for older code
  // v1.65 changed rivers data
  dom?.rivers?.attr("style", null); // remove style to unhide layer
  const { cells, rivers } = pack;
  const defaultWidthFactor = rn(1 / (Number(dom?.pointsInput?.dataset?.cells) / 10000) ** 0.25, 2);

  for (const river of rivers) {
    const riversNode = dom?.rivers ? (dom.rivers.node ? (dom.rivers.node() as Element) : null) : null;
    const node = riversNode ? (riversNode.querySelector("#river" + river.i) as SVGPathElement | null) : (d3.select("#river" + river.i).node() as SVGPathElement | null);
    if (node && !river.cells) {
      const riverCells = [];
      const riverPoints = [];

      const length = node.getTotalLength() / 2;
      if (!length) continue;
      const segments = Math.ceil(length / 6);
      const increment = length / segments;

      for (let i = 0; i <= segments; i++) {
        const shift = increment * i;
        const { x: x1, y: y1 } = node.getPointAtLength(length + shift);
        const { x: x2, y: y2 } = node.getPointAtLength(length - shift);
        const x = rn((x1 + x2) / 2, 1);
        const y = rn((y1 + y2) / 2, 1);

        const cell = helpers?.findPackCell ? helpers.findPackCell(x, y) : undefined;
        riverPoints.push([x, y]);
        riverCells.push(cell);
      }

      river.cells = riverCells;
      river.points = riverPoints;
    }

    river.widthFactor = defaultWidthFactor;

    cells.i.forEach(i => {
      const riverInWater = cells.r[i] && cells.h[i] < 20;
      if (riverInWater) cells.r[i] = 0;
    });
  }
}
