"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";
import { rw } from "@fmg/shared";

export function migrateToV1_21_0(context: AutoUpdateMigrationContext): void {
  const { pack, api, dom, helpers } = context as any;
  const viewbox = dom?.viewbox ?? d3.select("#viewbox");
  const rivers = dom?.rivers ?? d3.select("#rivers");

  // v1.11 replaced "display" attribute by "display" style
  viewbox.selectAll("g").each(function () {
    if (this.hasAttribute("display")) {
      this.removeAttribute("display");
      this.style.display = "none";
    }
  });

  // v1.21 added rivers data to pack
  pack.rivers = []; // rivers data
  rivers.selectAll("path").each(function () {
    const i = +this.id.slice(5);
    const length = (this as SVGPathElement).getTotalLength() / 2;
    if (!length) return;

    const s = (this as SVGPathElement).getPointAtLength(length);
    const e = (this as SVGPathElement).getPointAtLength(0);
    const source = helpers?.findPackCell ? helpers.findPackCell(s.x, s.y) : -1;
    const mouth = helpers?.findPackCell ? helpers.findPackCell(e.x, e.y) : -1;
    const name = api.Rivers.getName(mouth);
    const type = length < 25 ? (rw ? rw({ Creek: 9, River: 3, Brook: 3, Stream: 1 }) : "Creek") : "River";
    pack.rivers.push({ i, parent: 0, length, source, mouth, basin: i, name, type } as any);
  });
}
