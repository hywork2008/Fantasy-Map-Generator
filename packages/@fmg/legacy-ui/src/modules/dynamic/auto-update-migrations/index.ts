import { compareVersions } from "../../../versioning";
import type { AutoUpdateMigrationContext } from "./types";
import { migrateToV1_0_0 } from "./v1-0-0";
import { migrateToV1_1_0 } from "./v1-1-0";

export function runAutoUpdateMigrationPipeline(mapVersion: string, context: AutoUpdateMigrationContext): void {
  if (compareVersions(mapVersion, "1.0.0").isOlder) {
    migrateToV1_0_0(context);
  }

  if (compareVersions(mapVersion, "1.1.0").isOlder) {
    migrateToV1_1_0(context);
  }
}
