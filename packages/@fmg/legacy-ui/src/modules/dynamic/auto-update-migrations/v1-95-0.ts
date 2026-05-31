"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_95_0({ dom }: AutoUpdateMigrationContext): void {
  // v1.95 changed provinces svg id
  const provincesEl = dom?.provinces ?? (d3.select("#provinces").node() as HTMLElement | null);
  if (provincesEl && !provincesEl.id) provincesEl.id = "provinces";
}
