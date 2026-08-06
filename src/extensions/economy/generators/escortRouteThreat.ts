/**
 * Pure escort route threat + fee math.
 * Uses existing danger field, bandit pressure, and frontier stage — no new map layers required.
 *
 * Fee rises with travel days and route threats; marketRate multiplies the quote
 * so postings can pay low / market / high relative to the fair rate.
 */
import type { EscortKind, EscortMarketRate, EscortRouteThreatSnapshot, EscortTransport } from "./escortHireTypes";

/** Pedestrian land pace relative to caravan landKmPerDay (≈ walking with pack). */
export const FOOT_SPEED_MULTIPLIER = 0.75;

/** Base wealth units per travel day at zero threat, market rate. */
export const ESCORT_BASE_PAY_PER_DAY = 0.18;

/** Trade cargo escort pays more than passenger escort (cargo value + merchant purse). */
export const ESCORT_TRADE_KIND_MULT = 1.35;

/** Foot contracts pay slightly less than caravan pace (cheaper client, harder slog). */
export const ESCORT_FOOT_TRANSPORT_MULT = 0.9;

export const ESCORT_MIN_FEE = 0.5;

/** How strongly threatScore inflates the daily rate. */
export const ESCORT_THREAT_PAY_WEIGHT = 2.4;

/**
 * Deterministic low / market / high rate from an integer seed
 * (posting origin×dest×day). Roughly: 40% market, 30% low, 30% high.
 */
export function marketRateFromSeed(seed: number): { rate: EscortMarketRate; mult: number } {
  const bucket = Math.abs(Math.trunc(seed)) % 10;
  if (bucket <= 1) return { rate: "low", mult: 0.75 };
  if (bucket <= 3) return { rate: "low", mult: 0.85 };
  if (bucket <= 6) return { rate: "market", mult: 1.0 };
  if (bucket <= 8) return { rate: "high", mult: 1.15 };
  return { rate: "high", mult: 1.3 };
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Build a threat snapshot from sampled route cell dangers and bandit pressure.
 *
 * @param dangerSamples — cells.danger values (0..255) along land portions of the route
 * @param banditPressure — 0..1 from UrbanLaborIntake for origin/dest states (max taken)
 * @param frontierWildernessShare — fraction of land cells with no owning state (0..1)
 */
export function computeRouteThreat(args: {
  dangerSamples: readonly number[];
  banditPressure: number;
  frontierWildernessShare?: number;
}): EscortRouteThreatSnapshot {
  const samples = args.dangerSamples.filter(d => Number.isFinite(d) && d >= 0);
  let avgDanger = 0;
  let maxDanger = 0;
  if (samples.length) {
    let sum = 0;
    for (const d of samples) {
      const n = Math.min(255, d) / 255;
      sum += n;
      if (n > maxDanger) maxDanger = n;
    }
    avgDanger = sum / samples.length;
  }

  const banditThreat = clamp01(args.banditPressure);
  const wildShare = clamp01(args.frontierWildernessShare ?? 0);
  // Beasts / residual wilderness: painted danger plus a small frontier term so
  // standard maps without monsters still produce some rural hazard on wild roads.
  const beastThreat = clamp01(0.75 * avgDanger + 0.25 * maxDanger + 0.2 * wildShare);
  // Security deficit: bandits erode civic order; high danger hinterlands compound it.
  const securityDeficit = clamp01(0.7 * banditThreat + 0.3 * avgDanger);

  const threatScore = Math.min(
    1.5,
    0.3 * avgDanger + 0.2 * maxDanger + 0.35 * banditThreat + 0.15 * beastThreat + 0.1 * securityDeficit
  );

  return {
    avgDanger: rn3(avgDanger),
    maxDanger: rn3(maxDanger),
    banditThreat: rn3(banditThreat),
    beastThreat: rn3(beastThreat),
    securityDeficit: rn3(securityDeficit),
    threatScore: rn3(threatScore)
  };
}

/**
 * Fair market fee before low/high variance. Pure.
 */
export function computeBaseEscortFee(args: {
  missionDays: number;
  threatScore: number;
  kind: EscortKind;
  transport: EscortTransport;
}): number {
  const days = Math.max(1, args.missionDays);
  const threatMult = 1 + Math.max(0, args.threatScore) * ESCORT_THREAT_PAY_WEIGHT;
  const kindMult = args.kind === "trade" ? ESCORT_TRADE_KIND_MULT : 1;
  const transportMult = args.transport === "foot" ? ESCORT_FOOT_TRANSPORT_MULT : 1;
  const raw = ESCORT_BASE_PAY_PER_DAY * days * threatMult * kindMult * transportMult;
  return Math.max(ESCORT_MIN_FEE, raw);
}

/** Apply market-rate variance and round. */
export function finalizeEscortFee(baseFee: number, rateMultiplier: number): { fee: number; feePartial: number } {
  const fee = rn2(Math.max(ESCORT_MIN_FEE, baseFee * rateMultiplier));
  const feePartial = rn2(fee * 0.4);
  return { fee, feePartial };
}

/**
 * Combat difficulty ~20–90 from frozen threatScore + kind.
 * Trade escorts face cargo raids (slightly harder); foot is a bit riskier on trail.
 */
export function escortCombatDifficulty(threatScore: number, kind: EscortKind, transport: EscortTransport): number {
  const base = 22 + threatScore * 42;
  const kindBump = kind === "trade" ? 4 : 0;
  const footBump = transport === "foot" ? 3 : 0;
  return Math.max(18, Math.min(90, base + kindBump + footBump));
}

/** UI difficulty tier 1–5 from threatScore. */
export function escortUiDifficulty(threatScore: number): number {
  if (threatScore < 0.15) return 1;
  if (threatScore < 0.3) return 2;
  if (threatScore < 0.5) return 3;
  if (threatScore < 0.75) return 4;
  return 5;
}

function rn2(value: number): number {
  return Math.round(value * 100) / 100;
}

function rn3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
