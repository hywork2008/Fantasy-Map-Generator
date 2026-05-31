"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_63_0({ dom }: AutoUpdateMigrationContext): void {
  // v1.63 changed ocean pattern opacity element
  const oceanPattern = dom?.oceanPattern ?? (d3.select("#oceanPattern").node() as HTMLElement | null);
  if (oceanPattern) oceanPattern.removeAttribute("opacity");
  const oceanicPattern = dom?.oceanicPattern ?? (d3.select("#oceanicPattern").node() as HTMLElement | null);
  if (oceanicPattern && !oceanicPattern.getAttribute("opacity")) oceanicPattern.setAttribute("opacity", "0.2");
}
