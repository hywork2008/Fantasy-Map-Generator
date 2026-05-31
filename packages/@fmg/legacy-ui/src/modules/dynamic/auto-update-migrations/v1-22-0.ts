"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import { States } from "@fmg/states";

export function migrateToV1_22_0(_context: AutoUpdateMigrationContext): void {
  // v1.22 changed state neighbors from Set object to array
  States.collectStatistics();
}
