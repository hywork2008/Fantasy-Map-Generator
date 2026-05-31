"use strict";

import type { AutoUpdateMigrationContext } from "./types";

export function migrateToV1_96_0(context: AutoUpdateMigrationContext): void {
  // v1.96 moved markers into pack.markers
  const { pack } = context;
  if (!(pack as any).markers) (pack as any).markers = [];
}
