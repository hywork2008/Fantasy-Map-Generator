export type Point = [number, number];

export type Vertices = { p: Point[]; v: number[][]; c: number[][] };
export type Cells = {
  v: number[][];
  c: number[][];
  b: Uint8Array;
  i: Uint32Array;
};
