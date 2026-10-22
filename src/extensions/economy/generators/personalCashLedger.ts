/** Serializable cash records. Character.wealth is a compatibility projection, never another wallet. */
export interface PersonalCashAccount {
  id: string;
  ownerSlotId?: string;
  characterId?: number;
  stateId: number;
  burgId?: number;
  balance: number;
  status: "active" | "estate" | "cancelled";
  managed: boolean;
  initialized: true;
  fundingCorrected?: boolean;
}
export interface CashRange {
  start: number;
  end: number;
  numerator: number;
  denominator: number;
  offset: number;
  delta: number;
}
export interface PersonalCashPool {
  roleId: string;
  stateId: number;
  burgId?: number;
  count: number;
  ranges: CashRange[];
  /** g0 occupants already split out of the initial cohort. */
  owners: Record<string, string>;
}
export interface PersonalCashState {
  version: 1;
  accounts: Record<string, PersonalCashAccount>;
  pools: Record<string, PersonalCashPool>;
  preparedRoles: string[];
  initialized: boolean;
  lastCycle?: string;
  nextLegacyId: number;
  transactions: Record<string, { from: string; to: string; amount: number }>;
}
export const createPersonalCashState = (): PersonalCashState => ({
  version: 1,
  accounts: {},
  pools: {},
  preparedRoles: [],
  initialized: false,
  nextLegacyId: 1,
  transactions: {}
});
export function minor(value: number): number {
  const amount = Math.round(value * 100);
  if (!Number.isSafeInteger(amount) || amount < 0) throw Error("Cash must be a finite non-negative safe amount");
  return amount;
}
function prefix(range: CashRange, ordinal: number): number {
  // Use the original rounding origin after a split: rebasing changes later people's cents.
  return (
    Number((BigInt(range.numerator) * BigInt(ordinal - range.offset)) / BigInt(range.denominator)) +
    range.delta * (ordinal - range.offset)
  );
}
export function rangeBalance(range: CashRange): number {
  return prefix(range, range.end) - prefix(range, range.start);
}
export function poolBalance(pool: PersonalCashPool): number {
  return pool.ranges.reduce((sum, r) => sum + rangeBalance(r), 0);
}
export function previewCash(pool: PersonalCashPool, ordinal: number): number {
  const range = pool.ranges.find(r => ordinal >= r.start && ordinal < r.end);
  return range ? prefix(range, ordinal + 1) - prefix(range, ordinal) : 0;
}
export function extractCash(pool: PersonalCashPool, ordinal: number): number {
  const index = pool.ranges.findIndex(r => ordinal >= r.start && ordinal < r.end);
  if (index < 0) return 0;
  const range = pool.ranges[index],
    amount = prefix(range, ordinal + 1) - prefix(range, ordinal);
  const replacement: CashRange[] = [];
  if (range.start < ordinal) replacement.push({ ...range, end: ordinal });
  if (ordinal + 1 < range.end) replacement.push({ ...range, start: ordinal + 1 });
  pool.ranges.splice(index, 1, ...replacement);
  return amount;
}
export function transferPersonalCash(
  state: PersonalCashState,
  key: string,
  from: PersonalCashAccount,
  to: PersonalCashAccount,
  amount: number
): void {
  if (!Number.isSafeInteger(amount) || amount < 0 || from.id === to.id) throw Error("Invalid cash transfer");
  const prior = state.transactions[key];
  if (prior) {
    if (prior.from !== from.id || prior.to !== to.id || prior.amount !== amount)
      throw Error("Cash transaction conflict");
    return;
  }
  if (from.balance < amount) throw Error("Insufficient personal cash");
  if (!Number.isSafeInteger(to.balance + amount)) throw Error("Cash transfer exceeds safe precision");
  from.balance -= amount;
  to.balance += amount;
  state.transactions[key] = { from: from.id, to: to.id, amount };
}
export function validatePersonalCash(value: unknown): asserts value is PersonalCashState {
  const fail = (): never => {
    throw Error("Invalid personal cash ledger");
  };
  if (!value || typeof value !== "object") fail();
  const s = value as PersonalCashState;
  const record = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  if (
    s.version !== 1 ||
    !record(s.accounts) ||
    !record(s.pools) ||
    !record(s.transactions) ||
    !Array.isArray(s.preparedRoles) ||
    !s.preparedRoles.every(id => typeof id === "string") ||
    new Set(s.preparedRoles).size !== s.preparedRoles.length ||
    typeof s.initialized !== "boolean" ||
    !Number.isSafeInteger(s.nextLegacyId) ||
    s.nextLegacyId < 1 ||
    (s.lastCycle !== undefined && typeof s.lastCycle !== "string")
  )
    fail();
  for (const [id, a] of Object.entries(s.accounts))
    if (
      !a ||
      a.id !== id ||
      !Number.isInteger(a.stateId) ||
      a.stateId < 0 ||
      !Number.isSafeInteger(a.balance) ||
      a.balance < 0 ||
      !["active", "estate", "cancelled"].includes(a.status) ||
      typeof a.managed !== "boolean" ||
      a.initialized !== true ||
      (a.fundingCorrected !== undefined && typeof a.fundingCorrected !== "boolean") ||
      (a.ownerSlotId !== undefined && typeof a.ownerSlotId !== "string") ||
      (a.characterId !== undefined && (!Number.isInteger(a.characterId) || a.characterId < 1))
    )
      fail();
  for (const [id, p] of Object.entries(s.pools)) {
    if (
      !p ||
      p.roleId !== id ||
      !Number.isSafeInteger(p.count) ||
      p.count < 1 ||
      !Array.isArray(p.ranges) ||
      !record(p.owners) ||
      !Number.isInteger(p.stateId) ||
      p.stateId < 0
    )
      fail();
    let end = 0;
    for (const r of p.ranges) {
      if (
        !r ||
        ![r.start, r.end, r.numerator, r.denominator, r.offset, r.delta].every(Number.isSafeInteger) ||
        r.start < end ||
        r.end <= r.start ||
        r.end > p.count ||
        r.denominator <= 0 ||
        r.numerator < 0 ||
        r.offset < 0 ||
        r.offset > r.start ||
        r.end - r.offset > r.denominator ||
        Math.floor(r.numerator / r.denominator) + r.delta < 0 ||
        !Number.isSafeInteger(rangeBalance(r))
      )
        fail();
      end = r.end;
    }
    for (const [ordinal, owner] of Object.entries(p.owners))
      if (
        !/^\d+$/.test(ordinal) ||
        Number(ordinal) >= p.count ||
        !s.accounts[owner] ||
        p.ranges.some(r => Number(ordinal) >= r.start && Number(ordinal) < r.end)
      )
        fail();
  }
  for (const t of Object.values(s.transactions))
    if (!t || !s.accounts[t.from] || !s.accounts[t.to] || !Number.isSafeInteger(t.amount) || t.amount < 0) fail();
}

/** Split a cohort at an eligibility boundary without redistributing existing private cash. */
export function splitCashRange(pool: PersonalCashPool, ordinal: number): void {
  const index = pool.ranges.findIndex(r => ordinal > r.start && ordinal < r.end);
  if (index < 0) return;
  const range = pool.ranges[index];
  pool.ranges.splice(index, 1, { ...range, end: ordinal }, { ...range, start: ordinal });
}
