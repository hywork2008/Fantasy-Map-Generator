"use strict";

import type { AutoUpdateMigrationContext } from "./types";

export function migrateToV1_88_0({ pack }: AutoUpdateMigrationContext): void {
  // v1.87 may have incorrect shield for some reason
  pack.states.forEach(({ coa }) => {
    if (coa?.shield === "state") delete coa.shield;
  });
}
