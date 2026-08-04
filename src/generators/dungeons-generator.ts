/**
 * High Fantasy dungeon site placement and clear.
 * Spec: docs/plan/high-fantasy-dungeons.md
 *
 * Places fixed boss+treasure sites on land. No interior simulation.
 * Clear removes the site and rebuilds danger (does not claim land).
 */
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { Burg, Dungeon, DungeonKind, Marker, Monster } from "../types/models";
import type { PackedGraph, PackedGraphCells } from "../types/PackedGraph";
import { rand } from "../utils";
import { biomePredatorScaleForMode, rebuildDangerField, type ThreatCalculationMode } from "./dangerField";
import { type DungeonSpawnProfile, getDungeonSpawnProfile, targetDungeonCount } from "./dungeonProfiles";
import { getThreatSpawnProfile, resolveThreatCultureMode } from "./threatProfiles";
import { assignWildLandTags } from "./wildLandTags";

const MIN_SEPARATION_HOPS = 3;
const PROBLEM_BURG_MAX_HOPS = 4;
const LOST_VAULT_MIN_BURG_HOPS = 6;

/** Optional mineral deposits mirrored onto pack when economy is enabled. */
interface MineralDepositLike {
  i: number;
  cell: number;
  richness: number;
}

export interface DungeonGenerateOptions {
  readonly year?: number;
  /** Injected RNG float in [0, 1) for counts/weights; tests can pass fixed rolls. */
  readonly random?: () => number;
  /** Override target count (tests / tools). Still clamped to profile.maxActive. */
  readonly forceCount?: number;
}

export const Dungeons = {
  /** Full initial placement (replaces pack.dungeons). */
  generate(worldContext: WorldContext, options: DungeonGenerateOptions = {}): Dungeon[] {
    const culturesSet = useOptionsState.getState().culturesSet;
    const profile = getDungeonSpawnProfile(culturesSet);
    const pack = worldContext.pack;
    // Drop prior dungeon markers/notes if regenerating.
    clearDungeonMarkers(worldContext);
    pack.dungeons = [];

    if (!profile) return [];

    const landCount = countLandCells(pack.cells);
    const roll01 = options.random ? options.random() : Math.random();
    const target =
      options.forceCount != null
        ? Math.max(0, Math.min(profile.maxActive, Math.floor(options.forceCount)))
        : targetDungeonCount(landCount, profile, roll01);
    if (target <= 0) {
      rebuildDungeonDanger(worldContext);
      return [];
    }

    const year = options.year ?? useOptionsState.getState().year ?? 0;
    const kinds = rollKindList(target, profile, options.random);
    const dungeons = placeMany(worldContext, profile, kinds, year, options.random);
    pack.dungeons = dungeons;
    rebuildDungeonDanger(worldContext);
    return dungeons;
  },

  /**
   * Spontaneous append of a single dungeon (Phase 3). No-op at max capacity.
   */
  spawnOne(worldContext: WorldContext, options: DungeonGenerateOptions = {}): Dungeon | null {
    const culturesSet = useOptionsState.getState().culturesSet;
    const profile = getDungeonSpawnProfile(culturesSet);
    if (!profile) return null;

    const pack = worldContext.pack;
    const existing = pack.dungeons ?? [];
    if (existing.length >= profile.maxActive) return null;

    const year = options.year ?? useOptionsState.getState().year ?? 0;
    const kinds = rollKindList(1, profile, options.random);
    const nextIndex = existing.reduce((max, d) => Math.max(max, d.i), -1) + 1;
    const placed = placeMany(worldContext, profile, kinds, year, options.random, nextIndex, existing);
    if (!placed.length) return null;

    const dungeon = placed[0]!;
    pack.dungeons = [...existing, dungeon];
    rebuildDungeonDanger(worldContext);
    return dungeon;
  },

  /**
   * Boss defeated: remove dungeon + marker/note, rebuild danger.
   * Does not mutate political ownership.
   */
  clear(worldContext: WorldContext, dungeonId: number): boolean {
    const pack = worldContext.pack;
    const list = pack.dungeons ?? [];
    const idx = list.findIndex(d => d.i === dungeonId);
    if (idx < 0) return false;

    const dungeon = list[idx]!;
    if (dungeon.markerId != null) {
      removeMarkerAndNote(worldContext, dungeon.markerId);
    }
    pack.dungeons = list.filter(d => d.i !== dungeonId);
    rebuildDungeonDanger(worldContext);
    if (pack.cells?.wildLand) assignWildLandTags(pack.cells);
    return true;
  }
};

function countLandCells(cells: PackedGraphCells | undefined): number {
  if (!cells?.i?.length) return 0;
  let n = 0;
  for (let i = 0; i < cells.i.length; i++) {
    if (cells.h[i] >= 20) n += 1;
  }
  return n;
}

function clearDungeonMarkers(worldContext: WorldContext): void {
  const pack = worldContext.pack;
  const dungeonMarkerIds = new Set((pack.markers ?? []).filter(m => m.type === "dungeon-site").map(m => m.i));
  if (!dungeonMarkerIds.size) return;
  pack.markers = (pack.markers ?? []).filter(m => m.type !== "dungeon-site");
  worldContext.notes = (worldContext.notes ?? []).filter(n => {
    const match = /^marker(\d+)$/.exec(n.id);
    if (!match) return true;
    return !dungeonMarkerIds.has(Number(match[1]));
  });
}

function placeMany(
  worldContext: WorldContext,
  profile: DungeonSpawnProfile,
  kinds: readonly DungeonKind[],
  year: number,
  random?: () => number,
  startIndex = 0,
  preexisting: readonly Dungeon[] = []
): Dungeon[] {
  const pack = worldContext.pack;
  const cells = pack.cells;
  if (!cells?.i?.length) return [];

  const landCells: number[] = [];
  for (let i = 0; i < cells.i.length; i++) {
    if (cells.h[i] >= 20) landCells.push(i);
  }
  if (!landCells.length) return [];

  const mineralByCell = buildMineralByCell(pack);
  const burgDist = computeBurgDistance(cells, pack.burgs ?? []);
  const occupied = new Set<number>();
  for (const m of pack.markers ?? []) {
    if (m.type === "dungeon-site" || m.type === "monster") occupied.add(m.cell);
  }
  for (const d of preexisting) {
    occupied.add(d.cell);
    markSeparation(cells, d.cell, occupied, MIN_SEPARATION_HOPS);
  }

  const dungeons: Dungeon[] = [];
  let nextIndex = startIndex;
  for (const kind of kinds) {
    const placed = placeOne({
      kind,
      profile,
      cells,
      landCells,
      burgDist,
      mineralByCell,
      occupied,
      year,
      nextIndex,
      worldContext,
      random
    });
    if (!placed) continue;
    dungeons.push(placed);
    occupied.add(placed.cell);
    markSeparation(cells, placed.cell, occupied, MIN_SEPARATION_HOPS);
    nextIndex = Math.max(nextIndex, placed.i) + 1;
  }
  return dungeons;
}

/** Map active dungeon bosses into Monster-shaped danger sources. */
export function dungeonsAsDangerSources(dungeons: readonly Dungeon[] | undefined | null): Monster[] {
  if (!dungeons?.length) return [];
  return dungeons
    .filter(d => d.bossPower > 0)
    .map((d, index) => ({
      i: -(index + 1),
      cell: d.cell,
      name: d.name,
      rarity: d.bossRarity,
      power: d.bossPower,
      basePower: d.bossBasePower ?? d.bossPower,
      type: d.bossType
    }));
}

export function rebuildDungeonDanger(worldContext: WorldContext): void {
  const pack = worldContext.pack;
  const cells = pack.cells;
  if (!cells?.i?.length) return;
  if (!cells.danger || cells.danger.length !== cells.i.length) {
    cells.danger = new Uint8Array(cells.i.length);
  }

  const culturesSet = useOptionsState.getState().culturesSet;
  const threatProfile = getThreatSpawnProfile(culturesSet);
  const threatCalculation: ThreatCalculationMode =
    threatProfile?.threatCalculation ?? useOptionsState.getState().threatCalculation ?? "max";
  const mode = resolveThreatCultureMode(culturesSet);
  const monsters = [...(pack.monsters ?? []), ...dungeonsAsDangerSources(pack.dungeons)];

  rebuildDangerField(cells, monsters, threatCalculation, {
    biomesData: worldContext.biomesData,
    biomePredatorScale: biomePredatorScaleForMode(mode),
    reducePredatorsOnGovernedLand: true
  });
}

// --- placement internals ----------------------------------------------------

interface PlaceArgs {
  kind: DungeonKind;
  profile: DungeonSpawnProfile;
  cells: PackedGraphCells;
  landCells: readonly number[];
  burgDist: Int16Array;
  mineralByCell: Map<number, MineralDepositLike>;
  occupied: Set<number>;
  year: number;
  nextIndex: number;
  worldContext: WorldContext;
  random?: () => number;
}

function placeOne(args: PlaceArgs): Dungeon | null {
  const { kind, profile, cells, landCells, burgDist, mineralByCell, occupied, year, nextIndex, worldContext } = args;
  const candidates: { cell: number; score: number }[] = [];

  for (const cell of landCells) {
    if (occupied.has(cell)) continue;
    // Prefer not sitting on large burg centers (problem lairs may be adjacent).
    const burgId = cells.burg?.[cell] ?? 0;
    if (burgId > 0 && kind !== "problem_lair") continue;
    if (burgId > 0 && kind === "problem_lair") continue; // adjacent/near only

    const dist = burgDist[cell] ?? 99;
    if (kind === "problem_lair" && dist > PROBLEM_BURG_MAX_HOPS) continue;
    // lost_vault wants remote sites; dist 99 means no burg graph (allow).
    if (kind === "lost_vault" && dist < LOST_VAULT_MIN_BURG_HOPS) continue;

    const score = scoreCell(kind, cell, cells, burgDist, mineralByCell);
    if (score <= 0) continue;
    candidates.push({ cell, score });
  }

  // Fallback: relax filters if archetype is too strict on small maps.
  if (candidates.length === 0) {
    for (const cell of landCells) {
      if (occupied.has(cell)) continue;
      if ((cells.burg?.[cell] ?? 0) > 0) continue;
      const score = Math.max(0.1, scoreCell(kind, cell, cells, burgDist, mineralByCell));
      candidates.push({ cell, score });
    }
  }
  if (candidates.length === 0) return null;

  const cell = weightedPick(candidates, args.random);
  if (cell == null) return null;

  const bossRarity = rollBossRarity(kind, profile, args.random);
  const band = profile.bands.find(b => b.rarity === bossRarity) ?? profile.bands[profile.bands.length - 1]!;
  const bossType = band.bossTypes[rand(band.bossTypes.length - 1)] ?? "Dungeon Boss";
  const bossPower = band.power;
  const mineral = mineralByCell.get(cell) ?? nearestMineral(cell, cells, mineralByCell, 2);
  let treasureTier = rollTreasureTier(bossRarity, kind, args.random);
  const mineralBump = args.random ? args.random() : Math.random();
  if (mineral && (kind === "wealth_lair" || kind === "lost_vault") && mineralBump < 0.5) {
    treasureTier = Math.min(4, treasureTier + 1);
  }
  if (kind === "problem_lair") treasureTier = Math.min(treasureTier, 1);

  const name = dungeonName(kind, bossType, nextIndex);
  const [x, y] = cells.p[cell] ?? [0, 0];
  const marker = attachMarker(worldContext, cell, x, y, bossRarity, name, treasureTier, kind, bossType);

  return {
    i: nextIndex,
    cell,
    x,
    y,
    name,
    bossRarity,
    bossPower,
    bossBasePower: bossPower,
    bossType,
    treasureTier,
    kind,
    mineralDepositId: mineral?.i ?? null,
    appearedYear: year,
    markerId: marker?.i ?? null
  };
}

function scoreCell(
  kind: DungeonKind,
  cell: number,
  cells: PackedGraphCells,
  burgDist: Int16Array,
  mineralByCell: Map<number, MineralDepositLike>
): number {
  const danger = cells.danger?.[cell] ?? 0;
  const h = cells.h[cell] ?? 20;
  const dist = burgDist[cell] ?? 99;
  const mineral = mineralByCell.get(cell);
  const mineralScore = mineral ? 10 + mineral.richness * 4 : 0;
  const heightFlavor = h >= 50 ? (h - 50) / 10 : 0;
  // Small non-seeded jitter so ties break; placement still driven by features.
  const noise = (cell % 17) * 0.35;

  switch (kind) {
    case "wealth_lair":
      return danger * 1.2 + mineralScore * 1.5 + heightFlavor * 2 + noise;
    case "problem_lair":
      // Prefer danger + proximity to civilization (low dist).
      return danger * 1.4 + Math.max(0, 12 - dist * 2) * 3 + noise * 0.5;
    case "lost_vault":
      return mineralScore * 1.8 + heightFlavor * 3 + Math.min(dist, 20) * 0.8 + danger * 0.4 + noise;
    case "empty_ruin":
      return 4 + danger * 0.3 + noise * 2;
    default:
      return noise;
  }
}

function rollBossRarity(kind: DungeonKind, profile: DungeonSpawnProfile, random?: () => number): number {
  const r = random ? random() : Math.random();
  const rarities = profile.bands.map(b => b.rarity).sort((a, b) => a - b);
  const maxR = rarities[rarities.length - 1] ?? 1;
  const minR = rarities[0] ?? 1;

  if (kind === "problem_lair") {
    // Often at least r2 when available.
    if (maxR >= 2 && r < 0.65) return Math.min(maxR, 2);
    if (maxR >= 3 && r < 0.8) return 3;
    return Math.min(maxR, 2);
  }
  if (kind === "empty_ruin") {
    return minR;
  }
  if (kind === "wealth_lair" || kind === "lost_vault") {
    if (maxR >= 3 && r < 0.12) return 3;
    if (maxR >= 2 && r < 0.45) return 2;
    return minR;
  }
  // Weighted toward lower rarity.
  if (maxR >= 3 && r < 0.08) return 3;
  if (maxR >= 2 && r < 0.35) return 2;
  return minR;
}

/**
 * Soft correlation with rarity; kind can force barren or rich outcomes.
 * treasureTier is never a pure function of rarity alone.
 */
export function rollTreasureTier(bossRarity: number, kind: DungeonKind, random?: () => number): number {
  const r = random ? random() : Math.random();
  // Base: higher rarity shifts mean up, but always allows barren.
  let tier: number;
  if (r < 0.18 - bossRarity * 0.02) tier = 0;
  else if (r < 0.45) tier = 1;
  else if (r < 0.7) tier = 2;
  else if (r < 0.9) tier = 3;
  else tier = 4;

  // Rarity soft boost / penalty without guaranteeing.
  if (bossRarity >= 3 && r > 0.3) tier = Math.min(4, tier + 1);
  if (bossRarity <= 1 && r < 0.5) tier = Math.max(0, tier - 1);

  if (kind === "problem_lair") return Math.min(tier, r < 0.7 ? 0 : 1);
  if (kind === "empty_ruin") return Math.min(tier, 1);
  if (kind === "lost_vault") return Math.max(tier, 2);
  if (kind === "wealth_lair") return Math.max(1, tier);
  return Math.max(0, Math.min(4, tier));
}

function rollKindList(n: number, profile: DungeonSpawnProfile, random?: () => number): DungeonKind[] {
  const kinds = Object.keys(profile.kindWeights) as DungeonKind[];
  const weights = kinds.map(k => profile.kindWeights[k]);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const out: DungeonKind[] = [];
  for (let i = 0; i < n; i++) {
    let roll = (random ? random() : Math.random()) * total;
    let picked: DungeonKind = kinds[0]!;
    for (let k = 0; k < kinds.length; k++) {
      roll -= weights[k]!;
      if (roll <= 0) {
        picked = kinds[k]!;
        break;
      }
    }
    out.push(picked);
  }
  return out;
}

function weightedPick(candidates: readonly { cell: number; score: number }[], random?: () => number): number | null {
  if (!candidates.length) return null;
  let sum = 0;
  for (const c of candidates) sum += Math.max(0.0001, c.score);
  let roll = (random ? random() : Math.random()) * sum;
  for (const c of candidates) {
    roll -= Math.max(0.0001, c.score);
    if (roll <= 0) return c.cell;
  }
  return candidates[candidates.length - 1]!.cell;
}

function computeBurgDistance(cells: PackedGraphCells, burgs: readonly Burg[]): Int16Array {
  const n = cells.i.length;
  const dist = new Int16Array(n);
  dist.fill(99);
  const queue: number[] = [];
  for (const burg of burgs) {
    if (!burg || burg.removed || burg.cell == null || burg.cell < 0) continue;
    if (burg.cell >= n) continue;
    if (dist[burg.cell] === 0) continue;
    dist[burg.cell] = 0;
    queue.push(burg.cell);
  }
  let head = 0;
  while (head < queue.length) {
    const cell = queue[head++]!;
    const d = dist[cell]!;
    if (d >= 30) continue;
    for (const neighbor of cells.c[cell] ?? []) {
      if (dist[neighbor]! <= d + 1) continue;
      if ((cells.h[neighbor] ?? 0) < 20) continue;
      dist[neighbor] = d + 1;
      queue.push(neighbor);
    }
  }
  return dist;
}

function markSeparation(cells: PackedGraphCells, start: number, occupied: Set<number>, hops: number): void {
  const queue = [{ cell: start, dist: 0 }];
  const visited = new Set<number>([start]);
  while (queue.length) {
    const { cell, dist } = queue.shift()!;
    occupied.add(cell);
    if (dist >= hops) continue;
    for (const n of cells.c[cell] ?? []) {
      if (visited.has(n)) continue;
      visited.add(n);
      queue.push({ cell: n, dist: dist + 1 });
    }
  }
}

function buildMineralByCell(pack: PackedGraph): Map<number, MineralDepositLike> {
  const map = new Map<number, MineralDepositLike>();
  const deposits = (pack as PackedGraph & { mineralDeposits?: MineralDepositLike[] }).mineralDeposits;
  if (!Array.isArray(deposits)) return map;
  for (const d of deposits) {
    if (d && typeof d.cell === "number") map.set(d.cell, d);
  }
  return map;
}

function nearestMineral(
  cell: number,
  cells: PackedGraphCells,
  mineralByCell: Map<number, MineralDepositLike>,
  maxHops: number
): MineralDepositLike | null {
  if (mineralByCell.has(cell)) return mineralByCell.get(cell)!;
  if (mineralByCell.size === 0) return null;
  const queue = [{ cell, dist: 0 }];
  const visited = new Set<number>([cell]);
  while (queue.length) {
    const cur = queue.shift()!;
    const hit = mineralByCell.get(cur.cell);
    if (hit) return hit;
    if (cur.dist >= maxHops) continue;
    for (const n of cells.c[cur.cell] ?? []) {
      if (visited.has(n)) continue;
      visited.add(n);
      queue.push({ cell: n, dist: cur.dist + 1 });
    }
  }
  return null;
}

function dungeonName(kind: DungeonKind, bossType: string, index: number): string {
  const place =
    kind === "wealth_lair" ? "Hoard" : kind === "problem_lair" ? "Lair" : kind === "lost_vault" ? "Vault" : "Ruin";
  return `${bossType}'s ${place} ${index + 1}`;
}

function iconForRarity(rarity: number): string {
  if (rarity >= 3) return "💀";
  if (rarity >= 2) return "🏰";
  return "🗝️";
}

function attachMarker(
  worldContext: WorldContext,
  cell: number,
  x: number,
  y: number,
  bossRarity: number,
  name: string,
  treasureTier: number,
  kind: DungeonKind,
  bossType: string
): Marker | null {
  const pack = worldContext.pack;
  if (!pack.markers) pack.markers = [];
  const markerId = pack.markers.length ? pack.markers[pack.markers.length - 1]!.i + 1 : 0;
  const marker: Marker = {
    i: markerId,
    cell,
    x,
    y,
    type: "dungeon-site",
    icon: iconForRarity(bossRarity)
  };
  pack.markers.push(marker);

  if (!worldContext.notes) worldContext.notes = [];
  const treasureLabel =
    treasureTier <= 0
      ? "barren"
      : treasureTier === 1
        ? "minor"
        : treasureTier === 2
          ? "notable"
          : treasureTier === 3
            ? "major"
            : "legendary";
  worldContext.notes.push({
    id: `marker${markerId}`,
    name,
    legend: `Dungeon (${kind.replace("_", " ")}). Boss: ${bossType} (rarity ${bossRarity}). Treasure: ${treasureLabel} (tier ${treasureTier}). Defeat the boss to clear this site.`
  });
  return marker;
}

function removeMarkerAndNote(worldContext: WorldContext, markerId: number): void {
  const pack = worldContext.pack;
  pack.markers = (pack.markers ?? []).filter(m => m.i !== markerId);
  worldContext.notes = (worldContext.notes ?? []).filter(n => n.id !== `marker${markerId}`);
}
