"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_91_0({ pack, dom }: AutoUpdateMigrationContext): void {
  // from 1.91.00 custom coa is moved to coa object
  pack.states.forEach(state => {
    if ((state.coa as any) === "custom") state.coa = { custom: true };
  });
  pack.provinces.forEach(province => {
    if ((province.coa as any) === "custom") province.coa = { custom: true };
  });
  pack.burgs.forEach(burg => {
    if ((burg.coa as any) === "custom") burg.coa = { custom: true };
  });

  // from 1.91.00 emblems don't have transform attribute
  const emblems = dom?.emblems ?? d3.select("#emblems");
  emblems.selectAll("use").each(function () {
    const transform = this.getAttribute("transform");
    if (!transform) return;

    const [dx, dy] = parseTransform(transform);
    const x = Number(this.getAttribute("x")) + Number(dx);
    const y = Number(this.getAttribute("y")) + Number(dy);

    this.setAttribute("x", x);
    this.setAttribute("y", y);
    this.removeAttribute("transform");
  });

  // from 1.91.00 coaSize is moved to coa object
  pack.states.forEach(state => {
    if (state.coaSize && state.coa) {
      state.coa.size = state.coaSize;
      delete state.coaSize;
    }
  });

  pack.provinces.forEach(province => {
    if (province.coaSize && province.coa) {
      province.coa.size = province.coaSize;
      delete province.coaSize;
    }
  });

  pack.burgs.forEach(burg => {
    if (burg.coaSize && burg.coa) {
      burg.coa.size = burg.coaSize;
      delete burg.coaSize;
    }
  });
}
