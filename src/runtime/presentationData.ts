/**
 * Persisted rendering rules. SVG and WebGL are projections of this data; SVG
 * attributes are retained only as a compatibility output while the old map
 * format is still supported.
 */
export type PresentationStyleValue = string | number | null;
export type PresentationStyleRecord = Readonly<Record<string, PresentationStyleValue>>;

export interface PresentationData {
  /** CSS/SVG selector -> serializable attributes and inline style values. */
  styles: Record<string, Record<string, PresentationStyleValue>>;
  /** Layer-toggle id -> visibility. UI stores mirror this data, they do not own it. */
  activeLayers: Record<string, boolean>;
}

export interface PresentationPatch {
  readonly styles?: Readonly<Record<string, PresentationStyleRecord>>;
  readonly activeLayers?: Readonly<Record<string, boolean>>;
}

export function createPresentationData(): PresentationData {
  return { styles: {}, activeLayers: {} };
}

/** The presentation backing store for the in-memory world runtime. */
export const presentationData = createPresentationData();

export function getPresentationStyle(
  presentation: Readonly<PresentationData>,
  selector: string,
  attribute: string
): PresentationStyleValue | undefined {
  return presentation.styles[selector]?.[attribute];
}

export function getPresentationStyleRecord(
  presentation: Readonly<PresentationData>,
  selector: string
): PresentationStyleRecord | undefined {
  return presentation.styles[selector];
}

export function applyPresentationPatch(presentation: PresentationData, patch: PresentationPatch): boolean {
  let changed = false;

  for (const [selector, attributes] of Object.entries(patch.styles ?? {})) {
    let target = presentation.styles[selector];
    if (!target) {
      target = {};
      presentation.styles[selector] = target;
    }
    for (const [attribute, value] of Object.entries(attributes)) {
      if (target[attribute] === value) continue;
      target[attribute] = value;
      changed = true;
    }
  }

  for (const [id, visible] of Object.entries(patch.activeLayers ?? {})) {
    if (presentation.activeLayers[id] === visible) continue;
    presentation.activeLayers[id] = visible;
    changed = true;
  }

  return changed;
}
