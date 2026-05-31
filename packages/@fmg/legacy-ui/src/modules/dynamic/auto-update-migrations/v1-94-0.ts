"use strict";

import type { AutoUpdateMigrationContext } from "./types";

export function migrateToV1_94_0({ pack }: AutoUpdateMigrationContext): void {
  // v1.94 changed shared palette layout; ensure palette exists
  if (!pack.palette) pack.palette = { colors: [] } as any;
}
