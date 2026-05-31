"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";
import { rn, unique } from "@fmg/shared";
import { Lakes } from "@fmg/core/modules/lakes";

export function migrateToV1_6_0(context: AutoUpdateMigrationContext): void {
  const { pack, grid, api, dom } = context as any;

  // v1.6 changed rivers data
  for (const river of pack.rivers) {
    const riversNode = dom?.rivers ? (dom.rivers.node ? (dom.rivers.node() as Element) : null) : null;
    const el = riversNode ? riversNode.querySelector("#river" + river.i) : (d3.select("#river" + river.i).node() as Element | null);
    if (el) {
      river.widthFactor = +el.getAttribute("data-width");
      el.removeAttribute("data-width");
      el.removeAttribute("data-increment");
      river.discharge = pack.cells.fl[river.mouth] || 1;
      river.width = rn(river.length / 100, 2);
      river.sourceWidth = 0.1;
    } else {
      api.Rivers.remove(river.i);
    }
  }

  // v1.6 changed lakes data
  for (const f of pack.features) {
    if (f.type !== "lake") continue;
    if (f.evaporation) continue;

    f.flux = f.flux || f.cells * 3;
    f.temp = grid.cells.temp[pack.cells.g[f.firstCell]];
    f.height = f.height || d3.min(pack.cells.c[f.firstCell].map(c => pack.cells.h[c]).filter(h => h >= 20));
    const exp = Number(dom?.heightExponentInput?.value ?? 1);
    const height = (f.height - 18) ** exp;
    const evaporation = ((700 * (f.temp + 0.006 * height)) / 50 + 75) / (80 - f.temp);
    f.evaporation = rn(evaporation * f.cells);
    if (!f.shoreline) {
      f.shoreline = unique(f.vertices.flatMap(v => pack.vertices.c[v].filter(c => pack.cells.h[c] >= 20)));
    }
    f.name = f.name || Lakes.getName(f);
    delete f.river;
  }
}
