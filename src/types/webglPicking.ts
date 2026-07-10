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
  | "route";

export interface WebglPickDetail {
  kind: WebglPickKind;
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
