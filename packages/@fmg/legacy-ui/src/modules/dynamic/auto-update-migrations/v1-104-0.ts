"use strict";

import type { AutoUpdateMigrationContext } from "./types";

export function migrateToV1_104_0({ api }: AutoUpdateMigrationContext): void {
  // v1.104.00 separated pole of inaccessibility detection from layer rendering
  api.States?.getPoles && api.States.getPoles();
  api.Provinces?.getPoles && api.Provinces.getPoles();
}
