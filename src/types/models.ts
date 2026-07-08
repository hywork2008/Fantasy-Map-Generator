import type { Point } from "lineclip";

export const CULTURE_TYPES = ["Generic", "Hunting", "Highland", "River", "Lake", "Naval", "Nomadic"] as const;
export const DEFAULT_CULTURE_TYPE: CultureType = "Generic";
export type CultureType = (typeof CULTURE_TYPES)[number];

import type { Emblem } from "./emblem";

export interface EmblemEl {
  i: number;
  name?: string;
  fullName?: string;
  center?: number;
  pole?: [number, number];
  x?: number;
  y?: number;
}

export type FeatureType = "ocean" | "lake" | "island";

export interface ReligionBase {
  type: "Folk" | "Organized" | "Cult" | "Heresy";
  form: string;
  culture: number;
  center: number;
}

export interface NamedReligion extends ReligionBase {
  name: string;
  deity: string | null | undefined;
  expansion: string;
  expansionism: number;
  color: string;
}

export interface BurgGroup {
  name: string;
  active: boolean;
  order: number;
  isDefault?: boolean;
  features?: {
    capital?: boolean;
    citadel?: boolean;
    walls?: boolean;
    plaza?: boolean;
    port?: boolean;
    temple?: boolean;
  };
  preview?: string;
  percentile?: number;
  min?: number;
  max?: number;
  biomes?: number[];
  states?: number[];
  cultures?: number[];
  religions?: number[];
}

export interface BurgDemographics {
  capacity: number;
  children: number;
  maleAdults: number;
  femaleAdults: number;
  elders: number;
}

export interface Burg {
  cell: number;
  x: number;
  y: number;
  i?: number;
  state?: number;
  culture?: number;
  name?: string;
  feature?: number;
  capital?: number;
  lock?: boolean;
  port?: number;
  removed?: boolean;
  population?: number;
  type?: CultureType;
  coa?: Emblem;
  citadel?: number;
  plaza?: number;
  walls?: number;
  shanty?: number;
  temple?: number;
  group?: string;
  link?: string;
  MFCG?: number | string;
  province?: number;
  product?: number;
  treasury?: number;
  market?: number;
  demographics?: BurgDemographics;
}

export interface Culture {
  name: string;
  i: number;
  base: number;
  shield: string;
  lock?: boolean;
  code?: string;
  center?: number;
  sort?: (i: number) => number;
  odd?: number;
  color?: string;
  type?: CultureType;
  expansionism?: number;
  origins?: (number | null)[];
  removed?: boolean;
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
}

export interface PackedGraphFeature {
  i: number;
  type: FeatureType;
  land: boolean;
  border: boolean;
  cells: number;
  firstCell: number;
  vertices: number[];
  area: number;
  shoreline: number[];
  height: number;
  group: string;
  temp: number;
  flux: number;
  evaporation: number;
  name: string;
  inlets?: number[];
  outlet?: number;
  river?: number;
  enteringFlux?: number;
  closed?: boolean;
  outCell?: number;
}

export interface GridFeature {
  i: number;
  land: boolean;
  border: boolean;
  type: FeatureType;
}

export type IceGlacier = { i: number; points: [number, number][]; type: "glacier"; offset?: [number, number] };
export type IceIceberg = {
  i: number;
  points: [number, number][];
  type: "iceberg";
  cellId: number;
  size: number;
  offset?: [number, number];
};
export type IceElement = IceGlacier | IceIceberg;

export interface Marker {
  i: number;
  type: string;
  icon: string;
  dx?: number;
  dy?: number;
  px?: number;
  cell: number;
  lock?: boolean;
  x?: number;
  y?: number;
  size?: number;
  pin?: string;
  fill?: string;
  stroke?: string;
  pinned?: boolean;
  hidden?: boolean;
}

export interface Monster {
  i: number;
  cell: number;
  name: string;
  rarity: number;
  power: number;
  type: string;
}

export interface Province {
  i: number;
  removed?: boolean;
  state: number;
  lock?: boolean;
  center: number;
  burg: number;
  name: string;
  formName: string;
  fullName: string;
  color: string;
  coa: Emblem | null;
  pole?: [number, number];
  area?: number;
  rural?: number;
  urban?: number;
  burgs?: number[];
}

export interface Religion extends NamedReligion {
  i: number;
  code?: string;
  origins?: number[] | null;
  lock?: boolean;
  removed?: boolean;
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
}

export interface River {
  i: number;
  source: number;
  mouth: number;
  parent: number;
  basin: number;
  length: number;
  discharge: number;
  width: number;
  widthFactor: number;
  sourceWidth: number;
  name: string;
  type: string;
  cells: number[];
  points?: Point[];
}

export interface Route {
  i: number;
  group: string;
  feature: number;
  points: [number, number, number][];
  cells?: number[];
  merged?: boolean;
  name?: string;
  /** Runtime: computed by editor */
  length?: number;
  /** Runtime: set by user in editor */
  lock?: boolean;
}

export interface Campaign {
  name: string;
  start: number;
  end?: number;
  attacker: number;
  defender: number;
}

export interface ChronicleEvent {
  id: string;
  yearsAgo: number;
  from: number;
  to: number;
  fromBurg?: number;
  toBurg?: number;
  action: string;
  rawText: string;
}

export interface State {
  i: number;
  name: string;
  expansionism: number;
  capital: number;
  type: string;
  center: number;
  culture: number;
  coa: Emblem | null;
  lock?: boolean;
  removed?: boolean;
  pole?: [number, number];
  neighbors?: number[];
  color?: string;
  cells?: number;
  area?: number;
  burgs?: number;
  rural?: number;
  urban?: number;
  campaigns?: Campaign[];
  diplomacy?: (string | string[] | ChronicleEvent[] | [string, ChronicleEvent])[];
  formName?: string;
  fullName?: string;
  form?: string;
  military?: MilitaryRegiment[];
  provinces?: number[];
  temp?: Record<string, number> & { platoons?: Platoon[] };
  alert?: number;
  salesTax?: number;
  pollTax?: number;
  treasury?: number;
  /** Fraction of population-equivalent grain paid to the suzerain each generation (Vassal states only). */
  tributeRate?: number;
  /** Computed grain-equivalent tribute amount paid to the suzerain (Vassal states only). */
  tributePaid?: number;
}

export interface Zone {
  i: number;
  name: string;
  type: string;
  cells: number[];
  color: string;
  hidden?: boolean;
}

export interface MilitaryUnit {
  icon: string;
  name: string;
  rural: number;
  urban: number;
  crew: number;
  power: number;
  type: string;
  separate: number;
  /** Whether the unit can be recruited. Omitted/undefined counts as enabled — only `false` disables it. */
  enabled?: boolean;
  biomes?: number[];
  states?: number[];
  cultures?: number[];
  religions?: number[];
}

export interface MilitaryRegiment {
  i: number;
  t: number;
  name: string;
  a: number;
  s: number;
  cell: number;
  x: number;
  y: number;
  bx: number;
  by: number;
  u: Record<string, number>;
  n: number;
  type: string;
  icon?: string;
  children?: MilitaryRegiment[];
  state: number;
  angle?: number;
  /** State id of the vassal territory this regiment is garrisoned in, if not stationed at home. */
  garrisonHost?: number;
  /** True for the state's dedicated capital guard regiment (never merged with field armies). */
  isCapitalGuard?: boolean;
  /** pack.characters id of the officer commanding this regiment, if one has been assigned. */
  commanderId?: number;
  /**
   * Movement (docs/plan/military-movement.md Phase 2), all set together by
   * regimentMovement.ts and cleared together once the destination is reached or abandoned.
   * `undefined` destinationCell/path means the regiment is holding its current position.
   */
  /** Cell this regiment is currently marching toward. */
  destinationCell?: number;
  /** Ordered land/sea-route (or off-road BFS) cell sequence from march start to `destinationCell`, inclusive. */
  path?: number[];
  /** Index into `path` of the last fully-reached node; `path[pathIndex]` === `cell`. */
  pathIndex?: number;
  /** Map-unit distance advanced past `path[pathIndex]` toward `path[pathIndex + 1]`, used to interpolate `x`/`y` between ticks. */
  edgeProgress?: number;
  /** True when `path` came from the off-road cells.c fallback (no charted road/trail) rather than a route graph — see regimentMovement.ts's OFF_ROAD_SPEED_MULTIPLIER. */
  offRoad?: boolean;
  /**
   * `i` of the field army this regiment was split off from as a detachment (docs/plan/military-movement.md
   * Phase 4, dynamic hierarchy mode only). Undefined for ordinary regiments. Only meaningful until the next
   * full `Military.generate()` rebuild — like `i` itself, it is not a stable cross-rebuild identity.
   */
  parentId?: number;
  /** Current tactical status for rendering action icons (e.g. 🎯 for battled, 🎪 for waiting) */
  actionStatus?: "battled" | "waiting";
  /**
   * `targetBurg` of the owning state's StrategicGoal (simulationContext.ts) this regiment is
   * currently counted toward, if any — set by strategic-planner.ts's advanceTension() when it
   * tallies a regiment within reinforcement range of a siege target. Lets evaluatePlans() clear
   * march orders only for regiments tied to a cancelled goal instead of the whole army (see
   * docs/plan/military-time-advance-review-findings.md §1.7). A regiment left without a goal
   * this way isn't immediately re-tasked — it falls back to its own local reaction-layer
   * decision (regimentMovement.ts's applyReactionMarchOrder) until the ruler issues a new one.
   */
  goalTargetBurg?: number;
}

export interface Platoon {
  cell: number;
  a: number;
  t: number;
  x: number;
  y: number;
  u: string;
  n: number;
  s: number;
  type: string;
  children?: Platoon[];
  /** Province id this platoon was recruited in (0 = no province). */
  province: number;
  /** Ocean/sea feature id for naval units. */
  waterBody?: number;
}

export interface NameBase {
  name: string;
  i: number;
  min: number;
  max: number;
  d: string;
  m: number;
  b: string;
}
