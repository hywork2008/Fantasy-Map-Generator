import { ROLE_PURPOSES, validatePresetQuery } from "./presetTypes";
import type { WorldRoster } from "./types";

/** Optional additions keep v1 archives compatible; validate them before using frozen plans. */
export function validatePresetData(r: WorldRoster): void {
  const fail = (): never => {
    throw Error("Invalid roster preset data");
  };
  const orgs = new Map(r.organizations.map(o => [o.id, o]));
  const roles = new Map(r.roles.map(role => [role.id, role]));
  for (const org of r.organizations) {
    if (
      org.adherentShare !== undefined &&
      (!Number.isFinite(org.adherentShare) || org.adherentShare <= 0 || org.adherentShare > 1)
    )
      fail();
    if (
      org.kind !== undefined &&
      ![
        "government",
        "household",
        "military",
        "religious",
        "company",
        "guild",
        "market",
        "settlement",
        "territory",
        "institution"
      ].includes(org.kind)
    )
      fail();
    if (
      org.activityStateIds !== undefined &&
      (!Array.isArray(org.activityStateIds) || !org.activityStateIds.every(id => Number.isInteger(id) && id >= 0))
    )
      fail();
    if (org.religionId !== undefined && (!Number.isInteger(org.religionId) || org.religionId < 1)) fail();
    if (
      org.religiousKind !== undefined &&
      !["church", "diocese", "urban", "monastery", "order"].includes(org.religiousKind)
    )
      fail();
    if (org.formation !== undefined && !["land", "sea", "corps"].includes(org.formation)) fail();
    if (org.polity !== undefined && typeof org.polity !== "string") fail();
  }
  for (const role of r.roles) {
    if (
      role.purposes !== undefined &&
      (!Array.isArray(role.purposes) || !role.purposes.every(p => ROLE_PURPOSES.includes(p)))
    )
      fail();
    if (role.majorLord !== undefined && typeof role.majorLord !== "boolean") fail();
    if (role.unresolved !== undefined && typeof role.unresolved !== "boolean") fail();
    if (role.occupation !== undefined && typeof role.occupation !== "string") fail();
  }
  for (const key of ["savedPresets", "presetPlans", "patronage"] as const) {
    const values = r[key];
    if (values === undefined) continue;
    if (!Array.isArray(values)) fail();
    const ids = new Set<string>();
    for (const item of values) {
      if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)) fail();
      ids.add(item.id);
    }
  }
  for (const preset of r.savedPresets ?? []) {
    if (typeof preset.name !== "string") fail();
    validatePresetQuery(preset.query);
  }
  for (const plan of r.presetPlans ?? []) {
    validatePresetQuery(plan.query);
    if (
      (plan.referenceHash !== undefined && typeof plan.referenceHash !== "string") ||
      !Number.isFinite(plan.year) ||
      !Array.isArray(plan.seats) ||
      !Number.isInteger(plan.cursor) ||
      plan.cursor < 0 ||
      (plan.discarded !== undefined && typeof plan.discarded !== "boolean") ||
      plan.cursor > plan.seats.length ||
      !["memo", "simulation"].includes(plan.mode)
    )
      fail();
    for (const seat of plan.seats) {
      if (
        !seat ||
        !roles.has(seat.roleId) ||
        !Number.isInteger(seat.ordinal) ||
        seat.ordinal < 0 ||
        typeof seat.signature !== "string" ||
        (seat.slotId !== undefined && !r.slots.some(s => s.id === seat.slotId)) ||
        !["new", "existing", "vacant", "unresolved"].includes(seat.status)
      )
        fail();
    }
  }
  for (const contract of r.patronage ?? []) {
    const role = roles.get(contract.roleId);
    if (
      !orgs.has(contract.patronId) ||
      !orgs.has(contract.supplierId) ||
      !role ||
      role.organizationId !== contract.supplierId ||
      !Number.isInteger(contract.ordinal) ||
      contract.ordinal < 0 ||
      typeof contract.domain !== "string" ||
      !Number.isFinite(contract.startYear) ||
      (contract.endYear !== undefined && (!Number.isFinite(contract.endYear) || contract.endYear < contract.startYear))
    )
      fail();
  }
}
