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
