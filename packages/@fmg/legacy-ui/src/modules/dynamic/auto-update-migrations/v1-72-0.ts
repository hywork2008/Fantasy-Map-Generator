"use strict";

import type { AutoUpdateMigrationContext } from "./types";

export function migrateToV1_72_0(_context: AutoUpdateMigrationContext): void {
  // v1.72 renamed custom style presets
  const storedStyles = Object.keys(localStorage).filter(key => key.startsWith("style"));
  storedStyles.forEach(styleName => {
    const style = localStorage.getItem(styleName);
    const newStyleName = styleName.replace(/^style/, customPresetPrefix);
    localStorage.setItem(newStyleName, style);
    localStorage.removeItem(styleName);
  });
}
