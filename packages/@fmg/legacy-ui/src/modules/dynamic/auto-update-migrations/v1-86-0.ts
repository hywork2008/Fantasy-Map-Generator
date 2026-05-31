"use strict";

import type { AutoUpdateMigrationContext } from "./types";

export function migrateToV1_86_0({ pack }: AutoUpdateMigrationContext): void {
  // v1.86.0 added multi-origin culture and religion hierarchy trees
  for (const culture of pack.cultures) {
    culture.origins = [culture.origin];
    delete culture.origin;
  }

  for (const religion of pack.religions) {
    religion.origins = [religion.origin];
    delete religion.origin;
  }
}
