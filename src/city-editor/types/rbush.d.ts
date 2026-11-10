/** rbush 4.0.1 ships no types. Items are their own boxes (`minX` … `maxY`). */
declare module "rbush" {
  interface RBushBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }

  export default class RBush<T extends RBushBox> {
    constructor(maxEntries?: number);
    all(): T[];
    search(bbox: RBushBox): T[];
    load(data: readonly T[]): this;
    insert(item: T): this;
    clear(): this;
    remove(item: T, equals?: (a: T, b: T) => boolean): this;
    collides(bbox: RBushBox): boolean;
  }
}
