/**
 * Persisted rendering rules. SVG and WebGL are projections of this data; SVG
 * attributes are retained only as a compatibility output while the old map
 * format is still supported.
 */
export type PresentationStyleValue = string | number | null;
export type PresentationStyleRecord = Readonly<Record<string, PresentationStyleValue>>;
/** Per-instance label override: manual position (dx/dy), start offset, size, letter-spacing. */
export type LabelLayout = Readonly<Record<string, PresentationStyleValue>>;
/** Named chrome overlay layout (scale bar, compass, legend, …). */
export type OverlayLayout = Readonly<Record<string, PresentationStyleValue>>;

/**
 * Style selectors that map to first-class overlay layout records. Paint
 * attributes stay in `styles`; this map keeps a semantic layout slice that
 * archive round-trips without depending on live SVG.
 */
export const OVERLAY_STYLE_SELECTORS: Readonly<Record<string, string>> = {
  "#scaleBar": "scaleBar",
  "#scaleBarBack": "scaleBarBack",
  "#compass": "compass",
  "#compass > use": "compassRose",
  "#legend": "legend",
  "#legendBox": "legendBox"
};

export const OVERLAY_SELECTOR_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(OVERLAY_STYLE_SELECTORS).map(([selector, id]) => [id, selector]))
);

export interface PresentationData {
  /** CSS/SVG selector -> serializable attributes and inline style values. */
  styles: Record<string, Record<string, PresentationStyleValue>>;
  /** Layer-toggle id -> visibility. UI stores mirror this data, they do not own it. */
  activeLayers: Record<string, boolean>;
  /**
   * Paint order of layer toggle ids from bottom to top. Empty means the live
   * panel order / defaults; a non-empty list is restored after archive load.
   */
  layerOrder: string[];
  /** Label element id (e.g. "stateLabel12") -> manual layout override, survives redraw/re-generation. */
  labels: Record<string, Record<string, PresentationStyleValue>>;
  /** Named overlay layouts (scaleBar, compass, legend, …). */
  overlays: Record<string, Record<string, PresentationStyleValue>>;
}

export interface PresentationPatch {
  readonly styles?: Readonly<Record<string, PresentationStyleRecord>>;
  readonly activeLayers?: Readonly<Record<string, boolean>>;
  readonly layerOrder?: readonly string[];
  readonly labels?: Readonly<Record<string, LabelLayout>>;
  readonly overlays?: Readonly<Record<string, OverlayLayout>>;
}

export function createPresentationData(): PresentationData {
  return { styles: {}, activeLayers: {}, layerOrder: [], labels: {}, overlays: {} };
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

export function getPresentationLabel(presentation: Readonly<PresentationData>, id: string): LabelLayout | undefined {
  return presentation.labels[id];
}

export function getPresentationOverlay(
  presentation: Readonly<PresentationData>,
  id: string
): OverlayLayout | undefined {
  return presentation.overlays[id];
}

function mergeStyleRecord(
  targetMap: Record<string, Record<string, PresentationStyleValue>>,
  key: string,
  attributes: Readonly<Record<string, PresentationStyleValue>>
): boolean {
  let target = targetMap[key];
  if (!target) {
    target = {};
    targetMap[key] = target;
  }
  let changed = false;
  for (const [attribute, value] of Object.entries(attributes)) {
    if (target[attribute] === value) continue;
    target[attribute] = value;
    changed = true;
  }
  return changed;
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Applies a presentation patch in place. Style patches that touch known overlay
 * selectors also update the semantic `overlays` slice so archive round-trips
 * keep chrome layout without reading live SVG.
 */
export function applyPresentationPatch(presentation: PresentationData, patch: PresentationPatch): boolean {
  let changed = false;

  for (const [selector, attributes] of Object.entries(patch.styles ?? {})) {
    if (mergeStyleRecord(presentation.styles, selector, attributes)) changed = true;
    const overlayId = OVERLAY_STYLE_SELECTORS[selector];
    if (overlayId && mergeStyleRecord(presentation.overlays, overlayId, attributes)) changed = true;
  }

  for (const [id, visible] of Object.entries(patch.activeLayers ?? {})) {
    if (presentation.activeLayers[id] === visible) continue;
    presentation.activeLayers[id] = visible;
    changed = true;
  }

  if (patch.layerOrder !== undefined && !sameStringList(presentation.layerOrder, patch.layerOrder)) {
    presentation.layerOrder.splice(0, presentation.layerOrder.length, ...patch.layerOrder);
    changed = true;
  }

  for (const [id, attributes] of Object.entries(patch.labels ?? {})) {
    if (mergeStyleRecord(presentation.labels, id, attributes)) changed = true;
  }

  for (const [id, attributes] of Object.entries(patch.overlays ?? {})) {
    if (mergeStyleRecord(presentation.overlays, id, attributes)) changed = true;
    const selector = OVERLAY_SELECTOR_BY_ID[id];
    if (selector && mergeStyleRecord(presentation.styles, selector, attributes)) changed = true;
  }

  return changed;
}
