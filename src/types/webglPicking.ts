export type WebglPickKind =
  | "background"
  | "land"
  | "height"
  | "biome"
  | "culture"
  | "religion"
  | "state"
  | "province"
  | "zone"
  | "temperature"
  | "population"
  | "precipitation"
  | "danger"
  | "combatDeaths"
  | "lake"
  | "coastline"
  | "ice"
  | "emblem"
  | "burgIcon"
  | "marker"
  | "military"
  | "label"
  | "cell"
  | "grid"
  | "border"
  | "river"
  | "route"
  /** Pickable data contributed by a registered extension WebGL layer. */
  | "extension";

export interface WebglPickDetail {
  kind: WebglPickKind;
  /** Owning extension for `kind: "extension"`; null for host-rendered data. */
  extensionId: string | null;
  id: string;
  cellId: number | null;
  layerId: string;
  index: number;
  x: number;
  y: number;
  coordinate: [number, number, number?] | null;
}

export interface WebglPickCandidatesDetail {
  primary: WebglPickDetail | null;
  candidates: WebglPickDetail[];
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

/**
 * Pick kinds that support a deck.gl-driven drag gesture. A kind is only added here once a
 * controller both registers it as drag-eligible (see `registerWebglDragTargetPredicate` in
 * `deckRenderer.ts`) and consumes the `fmg:webgl-map-drag-*` events to mutate its data.
 */
export type WebglDragKind = "marker" | "ice";

/**
 * Minimal payload for the deck.gl pick -> controller drag bridge. Dispatched on `document` as
 * `fmg:webgl-map-drag-start` / `fmg:webgl-map-drag` / `fmg:webgl-map-drag-end`. `coordinate` is
 * the map-space point under the pointer for this frame; `startCoordinate` is fixed for the whole
 * gesture so a controller can preserve the initial pointer-to-entity offset (mirrors the `_mdx`/
 * `_mdy` offset captured by the SVG d3-drag equivalents).
 */
export interface WebglDragDetail {
  kind: WebglDragKind;
  id: string;
  cellId: number | null;
  coordinate: [number, number];
  startCoordinate: [number, number];
  clientX: number;
  clientY: number;
}
