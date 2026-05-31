"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import { rn } from "@fmg/shared";

export function migrateToV1_84_0(context: AutoUpdateMigrationContext): void {
  const { grid } = context;
  // v1.84.0 added grid.cellsDesired to stored data
  if (!grid.cellsDesired) grid.cellsDesired = rn((graphWidth * graphHeight) / grid.spacing ** 2, -3);
}
