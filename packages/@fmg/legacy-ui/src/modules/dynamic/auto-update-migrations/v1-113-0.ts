"use strict";

import type { AutoUpdateMigrationContext } from "./types";

export function migrateToV1_113_0({ pack }: AutoUpdateMigrationContext): void {
  // v1.113.0 fixed issue with zone.cells getting rediculously long
  pack.zones.forEach(zone => {
    zone.cells = unique(zone.cells);
  });
}
