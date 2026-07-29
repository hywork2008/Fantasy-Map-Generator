/**
 * The positional `.map` format has no field names. Newer upstream releases
 * append fields after slot 44, while this fork uses those positions for its
 * own optional data. Keep only the common prefix when accepting a newer map
 * so an upstream field is never interpreted as a fork-specific one.
 */
const LAST_SHARED_LEGACY_MAP_SLOT = 44;

const NEWER_SLOT_LABELS: Readonly<Record<number, string>> = {
  45: "custom good icons",
  46: "map measurers"
};

export interface NewerLegacyMapCompatibilityResult {
  readonly mapData: string[];
  readonly skippedItems: string[];
}

/**
 * Removes non-empty fields that were added after the shared legacy format.
 *
 * A copied array is returned so parsing the staged file never changes the
 * decoded upload payload.
 */
export function prepareNewerLegacyMapForLoad(mapData: readonly string[]): NewerLegacyMapCompatibilityResult {
  const skippedItems: string[] = [];

  for (let index = LAST_SHARED_LEGACY_MAP_SLOT + 1; index < mapData.length; index += 1) {
    if (!mapData[index]?.trim()) continue;

    const label = NEWER_SLOT_LABELS[index];
    skippedItems.push(label ?? `additional newer-format data (field ${index})`);
  }

  return {
    mapData: mapData.slice(0, LAST_SHARED_LEGACY_MAP_SLOT + 1),
    skippedItems
  };
}
