/** Economy-owned crop planning. The host supplies climate, never crop biology. */
import type {
  CropCalendar,
  CropCalendarProfile,
  MonthlyFlags,
  MonthlyWeights,
  PlantingCohort
} from "../../../data/cropCalendars";
import { getDaysInMonth } from "../../../utils/seasonUtils";
import { createCellClimateNormalsReader, simulationContext, type WorldContext } from "../../hostCore";

export interface AgriculturalClimate {
  readonly year: number;
  readonly monthlyMeanTemperatureC: ArrayLike<number>;
}
export type AgriculturalClimateReader = (cellId: number) => AgriculturalClimate;
const readers = new WeakMap<
  WorldContext,
  { year: number; grid: WorldContext["grid"]; pack: WorldContext["pack"]; read: AgriculturalClimateReader }
>();

/** One host validation per agricultural pass, rather than one full-world hash per crop. */
export function createAgriculturalClimateReader(
  world: Readonly<WorldContext>,
  year = simulationContext.currentYear || 2001
): AgriculturalClimateReader {
  const hostRead =
    world.grid?.cells?.i?.length && world.grid.points?.length && world.graphHeight > 0
      ? createCellClimateNormalsReader(world as WorldContext, year)
      : undefined;
  const cells = new Map<number, AgriculturalClimate>();
  const read: AgriculturalClimateReader = id => {
    const existing = cells.get(id);
    if (existing) return existing;
    const grid = world.pack.cells.g?.[id] ?? id;
    const climate = hostRead?.(grid) ?? {
      year,
      // Minimal fixtures / pre-map contexts have no geographical seasonality. This is
      // a constant monthly climate, not the former regional representative calendar.
      monthlyMeanTemperatureC: new Float64Array(12).fill(world.grid?.cells?.temp?.[grid] ?? 12)
    };
    cells.set(id, climate);
    return climate;
  };
  readers.set(world as WorldContext, { year, grid: world.grid, pack: world.pack, read });
  return read;
}

/** Production consumes the profile prepared by the most recent agricultural pass. */
export function readAgriculturalClimate(world: Readonly<WorldContext>, cellId: number): AgriculturalClimate {
  const year = simulationContext.currentYear || 2001;
  if (!world.grid?.cells?.i?.length || !world.grid.points?.length || !(world.graphHeight > 0)) {
    const grid = world.pack.cells.g?.[cellId] ?? cellId;
    return { year, monthlyMeanTemperatureC: new Float64Array(12).fill(world.grid?.cells?.temp?.[grid] ?? 12) };
  }
  const current = readers.get(world as WorldContext);
  return (
    current?.year === year && current.grid === world.grid && current.pack === world.pack
      ? current.read
      : createAgriculturalClimateReader(world, year)
  )(cellId);
}

export interface SeasonalCropPlan {
  readonly calendar: CropCalendar;
  readonly growingMeanTemperatureC: number;
  readonly growingDegreeDays: number;
}
const caches = new WeakMap<CropCalendarProfile, Map<string, SeasonalCropPlan>>();
const profileCache = new WeakMap<AgriculturalClimate, Map<CropCalendarProfile, Map<string, SeasonalCropPlan>>>();
function weights(values: number[]): MonthlyWeights {
  const sum = values.reduce((s, v) => s + v, 0);
  return values.map(v => (sum > 0 ? v / sum : 0)) as unknown as MonthlyWeights;
}

/** Month means are piecewise constant; this is a normal-climate approximation, not daily weather. */
export function getSeasonalCropPlan(
  profile: CropCalendarProfile,
  climate: AgriculturalClimate,
  irrigated = false,
  cohort?: PlantingCohort
): SeasonalCropPlan {
  // Readers return immutable normal snapshots. A new agricultural pass creates new
  // snapshots, so this fast cache cannot retain the previous climate revision.
  const flag = `${irrigated}:${cohort ?? 0}`;
  let profiles = profileCache.get(climate);
  if (!profiles) {
    profiles = new Map();
    profileCache.set(climate, profiles);
  }
  let flags = profiles.get(profile);
  if (!flags) {
    flags = new Map();
    profiles.set(profile, flags);
  }
  const ready = flags.get(flag);
  if (ready) return ready;
  const remember = (plan: SeasonalCropPlan) => {
    flags!.set(flag, plan);
    return plan;
  };
  const temperatures = Array.from({ length: 12 }, (_, m) => climate.monthlyMeanTemperatureC[m]);
  if (temperatures.some(t => !Number.isFinite(t))) throw new Error("Expected 12 finite monthly temperatures");
  const key = `${climate.year}:${irrigated}:${cohort ?? 0}:${temperatures.join(",")}`;
  let cache = caches.get(profile);
  if (!cache) {
    cache = new Map();
    caches.set(profile, cache);
  }
  const cached = cache.get(key);
  if (cached) return remember(cached);
  if (cache.size >= 4096) cache.clear();
  const days = temperatures.map((_, m) => getDaysInMonth(climate.year, m + 1));
  const growable = temperatures.map(t => t >= profile.minimumGrowingTemperatureC);
  const empty: SeasonalCropPlan = {
    calendar: {
      harvestWeights: weights(new Array(12).fill(0)),
      labourWeights: weights(new Array(12).fill(0)),
      growableMonths: growable as unknown as MonthlyFlags,
      cropCycles: 0
    },
    growingMeanTemperatureC: 0,
    growingDegreeDays: 0
  };
  let runStart = 0,
    runLength = 0,
    runDays = 0;
  for (let start = 0; start < 12; start++) {
    if (!growable[start]) continue;
    let length = 0,
      total = 0;
    while (length < 12 && growable[(start + length) % 12]) {
      total += days[(start + length) % 12];
      length++;
    }
    if (total > runDays) {
      runStart = start;
      runLength = length;
      runDays = total;
    }
  }
  if (!runLength) {
    cache.set(key, empty);
    return remember(empty);
  }
  // Stagger only climates where every month is growable; shifting a temperate
  // calendar after selection would otherwise move crops into a freezing winter.
  if (runLength === 12 && profile.allowsPlantingCohorts && cohort !== undefined) runStart = cohort * 4;
  const minimumDays = profile.isPerennial
    ? (profile.minimumSeasonDays ??
      Math.min(365, Math.max(...profile.harvestWindows.map(w => w.startAfterPlantingDays + w.durationDays))))
    : (profile.minimumSeasonDays ?? profile.annualCycleDays);
  const requiredHeat = profile.minimumGrowingDegreeDays ?? 0;
  const harvest = new Array<number>(12).fill(0),
    labour = new Array<number>(12).fill(0);
  let cycles = 0,
    totalHeat = 0,
    temperatureSum = 0,
    growingDays = 0,
    offset = 0;
  const continuous = profile.canProduceContinuously && runLength === 12;
  const maxCycles =
    profile.isPerennial || continuous ? 1 : irrigated || runLength === 12 ? profile.maximumCropsPerYear : 1;
  while (offset < runDays && cycles < maxCycles) {
    let elapsed = 0,
      heat = 0,
      tempSum = 0;
    const segments: { month: number; days: number; start: number }[] = [];
    let consumed = 0;
    for (let i = 0; i < runLength; i++) {
      const month = (runStart + i) % 12;
      const available = Math.max(0, days[month] - Math.max(0, offset - consumed));
      consumed += days[month];
      if (available <= 0) continue;
      const dailyHeat = Math.max(0, temperatures[month] - profile.minimumGrowingTemperatureC);
      const heatDays = heat >= requiredHeat ? 0 : dailyHeat > 0 ? (requiredHeat - heat) / dailyHeat : Infinity;
      const needed = Math.max(minimumDays - elapsed, heatDays);
      const duration = Math.min(available, Math.max(0, needed));
      if (duration > 0) {
        segments.push({ month, days: duration, start: elapsed });
        elapsed += duration;
        heat += dailyHeat * duration;
        tempSum += temperatures[month] * duration;
      }
      if (elapsed >= minimumDays - 1e-7 && heat >= requiredHeat - 1e-7) break;
    }
    if (elapsed < minimumDays - 1e-7 || heat < requiredHeat - 1e-7) break;
    const harvestDays = Math.min(elapsed, Math.max(...profile.harvestWindows.map(w => w.durationDays), 1));
    labour[segments[0].month] += profile.labourByStage.establishment;
    for (const segment of segments) {
      labour[segment.month] += (profile.labourByStage.maintenance * segment.days) / elapsed;
      const harvestOverlap = Math.max(0, segment.start + segment.days - Math.max(segment.start, elapsed - harvestDays));
      harvest[segment.month] += harvestOverlap / harvestDays;
      labour[segment.month] += (profile.labourByStage.harvestAndProcessing * harvestOverlap) / harvestDays;
    }
    totalHeat += heat;
    temperatureSum += tempSum;
    growingDays += elapsed;
    cycles++;
    offset += elapsed + profile.turnaroundDays;
  }
  if (!cycles) {
    cache.set(key, empty);
    return remember(empty);
  }
  const plan: SeasonalCropPlan = {
    calendar: {
      harvestWeights: continuous ? weights(new Array(12).fill(1)) : weights(harvest),
      labourWeights: continuous ? weights(new Array(12).fill(1)) : weights(labour),
      growableMonths: growable as unknown as MonthlyFlags,
      cropCycles: cycles as 1 | 2
    },
    growingMeanTemperatureC: temperatureSum / growingDays,
    growingDegreeDays: totalHeat
  };
  cache.set(key, plan);
  return remember(plan);
}
