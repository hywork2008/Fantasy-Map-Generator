/** One physical crop's aged Market stock, expressed in wheat-equivalent food units. */
export interface StapleCropInventory {
  age0: number;
  age1: number;
  age2: number;
  /** 9+ months old: carried past the next harvest, kept until eaten or spoiled. Missing on older saves = 0. */
  age3?: number;
  age0UnitCost: number;
  age1UnitCost: number;
  age2UnitCost: number;
  age3UnitCost?: number;
  overflow: number;
}
