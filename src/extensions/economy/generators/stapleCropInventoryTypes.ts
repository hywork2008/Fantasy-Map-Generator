/** One physical crop's aged Market stock, expressed in wheat-equivalent food units. */
export interface StapleCropInventory {
  age0: number;
  age1: number;
  age2: number;
  age0UnitCost: number;
  age1UnitCost: number;
  age2UnitCost: number;
  overflow: number;
}
