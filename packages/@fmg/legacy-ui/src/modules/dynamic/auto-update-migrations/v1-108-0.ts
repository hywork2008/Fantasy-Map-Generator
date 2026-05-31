"use strict";

import type { AutoUpdateMigrationContext } from "./types";

export function migrateToV1_108_0({ pack, dom, helpers }: AutoUpdateMigrationContext): void {
  // v1.108.0 changed features rendering method
  pack.features.forEach(f => {
    // fix lakes with missing group
    if (f?.type === "lake" && !f.group) f.group = "freshwater";
  });
  helpers?.featuresRenderer?.();

  // some old maps has incorrect "heights" groups
  if (dom?.viewbox) dom.viewbox.selectAll("#heights").remove();
}
