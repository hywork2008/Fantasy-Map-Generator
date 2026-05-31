"use strict";

import type { AutoUpdateMigrationContext } from "./types";

export function migrateToV1_92_0(context: AutoUpdateMigrationContext): void {
  // v1.92 introduced province center caching
  const { pack } = context;
  pack.provinces.forEach(p => {
    if (!(p as any).center) (p as any).center = { x: (p as any).x || 0, y: (p as any).y || 0 };
  });
}
