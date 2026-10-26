import type { FaunaCohorts } from "./faunaPopulationTypes";

/** Atomic carcass transactions. Catalog conversion and live-market migration are separate. */
export interface OwnedLiveLot {
  id: string;
  shipmentId: string;
  species: string;
  ownerId: string | null;
  locationId: string;
  heads: number;
  /** Aggregate cohort allocation is not evidence of individual age or calf eligibility. */
  cohortProvenance: "aggregate" | "unknown";
  cohortHeads?: FaunaCohorts | null;
}

export interface CarcassProfile {
  id: string;
  version: number;
  species: string;
  calibration: "verified" | "experimental" | "unknown";
  /** Disjoint carcass compartments; hide and blood are outside this balance. */
  carcassKgPerHead: number;
  leanKgPerHead: number;
  edibleFatKgPerHead: number;
  otherCarcassKgPerHead: number;
}

export interface CarcassPortion {
  batchId: string;
  kind: "lean" | "edibleFat" | "otherCarcass";
  ownerId: string;
  locationId: string;
  remainingKg: number;
}

export interface SlaughterReceipt {
  id: string;
  lotId: string;
  shipmentId: string;
  ownerId: string;
  locationId: string;
  period: number;
  heads: number;
  profileId: string;
  profileVersion: number;
  /** Frozen at commit: later profile edits cannot change an applied yield. */
  portionsKg: { lean: number; edibleFat: number; otherCarcass: number };
  cohortHeads: FaunaCohorts | null;
}

export interface SlaughterTransactionState {
  lots: Record<string, OwnedLiveLot>;
  receipts: Record<string, SlaughterReceipt>;
  portions: Record<string, CarcassPortion>;
}

export interface SlaughterRequest {
  id: string;
  lotId: string;
  ownerId: string;
  locationId: string;
  period: number;
  heads: number;
}

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Validates the entire change before mutating. No cash or market goods are created here. */
export function commitSlaughter(
  state: SlaughterTransactionState,
  request: SlaughterRequest,
  profile: CarcassProfile,
  options: { allowExperimental?: boolean } = {}
): SlaughterReceipt {
  const prior = state.receipts[request.id];
  if (prior) {
    requireCondition(
      prior.lotId === request.lotId &&
        prior.ownerId === request.ownerId &&
        prior.locationId === request.locationId &&
        prior.period === request.period &&
        prior.heads === request.heads &&
        prior.profileId === profile.id &&
        prior.profileVersion === profile.version,
      "Conflicting slaughter receipt"
    );
    return structuredClone(prior);
  }
  const lot = state.lots[request.lotId];
  requireCondition(Boolean(request.id) && Boolean(lot?.shipmentId), "Missing slaughter provenance");
  requireCondition(Boolean(request.ownerId) && lot.ownerId === request.ownerId, "Unknown or different livestock owner");
  requireCondition(
    Boolean(request.locationId) && lot.locationId === request.locationId,
    "Livestock is not at processing location"
  );
  requireCondition(Number.isSafeInteger(request.period), "Invalid slaughter period");
  requireCondition(
    Number.isSafeInteger(request.heads) &&
      request.heads > 0 &&
      Number.isFinite(lot.heads) &&
      lot.heads >= request.heads,
    "Insufficient whole livestock heads"
  );
  requireCondition(
    (profile.calibration === "verified" ||
      (profile.calibration === "experimental" && options.allowExperimental === true)) &&
      Boolean(profile.id) &&
      Number.isSafeInteger(profile.version) &&
      profile.version > 0 &&
      lot.species === profile.species,
    "Missing calibrated carcass profile"
  );
  const weights = [
    profile.carcassKgPerHead,
    profile.leanKgPerHead,
    profile.edibleFatKgPerHead,
    profile.otherCarcassKgPerHead
  ];
  requireCondition(
    weights.every(value => Number.isFinite(value) && value >= 0) && profile.carcassKgPerHead > 0,
    "Invalid carcass weights"
  );
  requireCondition(
    Math.abs(
      profile.leanKgPerHead + profile.edibleFatKgPerHead + profile.otherCarcassKgPerHead - profile.carcassKgPerHead
    ) <=
      1e-8 * profile.carcassKgPerHead,
    "Carcass compartments do not balance"
  );
  if (lot.cohortHeads) {
    const ages = Object.values(lot.cohortHeads);
    requireCondition(
      ages.every(value => Number.isFinite(value) && value >= 0) &&
        Math.abs(ages.reduce((sum, value) => sum + value, 0) - lot.heads) <= 1e-8 * Math.max(1, lot.heads),
      "Invalid livestock cohort allocation"
    );
  }
  const portionsKg = {
    lean: request.heads * profile.leanKgPerHead,
    edibleFat: request.heads * profile.edibleFatKgPerHead,
    otherCarcass: request.heads * profile.otherCarcassKgPerHead
  };
  const portions = Object.entries(portionsKg).map(([kind, kg]) => {
    const key = `${request.id}:${kind}`;
    requireCondition(!state.portions[key] && Number.isFinite(kg), "Invalid or occupied carcass portion");
    return [
      key,
      { batchId: request.id, kind, ownerId: request.ownerId, locationId: request.locationId, remainingKg: kg }
    ] as const;
  });
  const receipt: SlaughterReceipt = {
    ...request,
    shipmentId: lot.shipmentId,
    profileId: profile.id,
    profileVersion: profile.version,
    portionsKg,
    cohortHeads: lot.cohortHeads
      ? {
          young: (lot.cohortHeads.young * request.heads) / lot.heads,
          breeding: (lot.cohortHeads.breeding * request.heads) / lot.heads,
          old: (lot.cohortHeads.old * request.heads) / lot.heads
        }
      : null
  };
  if (lot.cohortHeads) {
    const share = request.heads / lot.heads;
    for (const age of ["young", "breeding", "old"] as const) lot.cohortHeads[age] *= 1 - share;
  }
  lot.heads -= request.heads;
  for (const [key, portion] of portions) state.portions[key] = portion as CarcassPortion;
  state.receipts[request.id] = receipt;
  return structuredClone(receipt);
}
