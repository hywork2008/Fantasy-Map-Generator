import type { PackedGraph } from "./PackedGraph";

export type MarkerConfig = {
  type: string;
  icon: string;
  dx?: number;
  dy?: number;
  px?: number;
  min: number;
  each: number;
  multiplier: number;
  list: (pack: PackedGraph) => Iterable<number> | ArrayLike<number>;
  add: (id: string, cell: number) => void;
};
