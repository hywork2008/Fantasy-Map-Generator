"use strict";

import type { AutoUpdateMigrationContext } from "./types";

export function migrateToV1_107_0({ helpers }: AutoUpdateMigrationContext): void {
  // v1.107.0 allowed custom images for markers and regiments
  if (helpers?.layerIsOn && helpers.layerIsOn("toggleMarkers")) helpers.markersRenderer?.();
  if (helpers?.layerIsOn && helpers.layerIsOn("toggleMilitary")) helpers.militaryRenderer?.();
}
