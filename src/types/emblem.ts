/**
 * Emblem/COA (Coat of Arms) type definitions.
 * Extracted here so that core types (models.ts, PackedGraph.ts) can reference
 * these without creating a circular dependency back to modules/emblem/generator.ts.
 */

export interface EmblemCharge {
  charge: string;
  t: string;
  p: string;
  t2?: string;
  t3?: string;
  size?: number;
  sinister?: number;
  reversed?: number;
  divided?: string;
}

export interface EmblemOrdinary {
  ordinary: string;
  t: string;
  line?: string;
  divided?: string;
  above?: boolean;
}

export interface EmblemDivision {
  division: string;
  t: string;
  line?: string;
}

export interface Emblem {
  t1: string;
  shield?: string;
  division?: EmblemDivision;
  ordinaries?: EmblemOrdinary[];
  charges?: EmblemCharge[];
  custom?: boolean;
  size?: number;
  x?: number;
  y?: number;
}
