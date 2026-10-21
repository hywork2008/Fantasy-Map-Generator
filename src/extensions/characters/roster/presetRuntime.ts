import { currentAppointment, latestRoleSlot } from "./model";
import { previewPreset, seatSignature, validatePresetQuery } from "./presets";
import type { PresetPlan, PresetQuery } from "./presetTypes";
import { clockYear, ensureSlot, materializeSlots } from "./runtime";
import type { WorldRoster } from "./types";

export function createPresetPlan(
  roster: WorldRoster,
  query: PresetQuery,
  mode: PresetPlan["mode"] = "memo"
): PresetPlan {
  validatePresetQuery(query);
  if (mode !== "memo" && mode !== "simulation") throw Error("Invalid generation mode");
  const preview = previewPreset(roster, query, clockYear());
  const plan: PresetPlan = {
    id: `plan:${(roster.presetPlans?.length ?? 0) + 1}`,
    query: structuredClone(query),
    year: clockYear(),
    seats: preview.seats.filter(s => s.status === "new"),
    cursor: 0,
    mode
  };
  roster.presetPlans ??= [];
  roster.presetPlans.push(plan);
  return plan;
}

/** Validate the entire remaining frozen plan before each interruptible batch. */
export function executePresetBatch(roster: WorldRoster, id: string): PresetPlan {
  const plan = roster.presetPlans?.find(p => p.id === id);
  if (!plan || plan.discarded) throw Error("Unknown generation plan");
  if (plan.year !== clockYear()) throw Error("Generation plan changed: world date. Create a new preview.");
  const roles = new Map(roster.roles.map(r => [r.id, r]));
  const eligible = new Set(
    previewPreset(roster, plan.query, clockYear())
      .seats.filter(s => s.status === "new" || s.status === "existing")
      .map(s => `${s.roleId}:${s.ordinal}`)
  );
  for (const seat of plan.seats.slice(plan.cursor)) {
    const role = roles.get(seat.roleId);
    const org = role && roster.organizations.find(o => o.id === role.organizationId);
    const appointment = currentAppointment(roster, seat.roleId, seat.ordinal);
    if (
      !eligible.has(`${seat.roleId}:${seat.ordinal}`) ||
      !role ||
      !org ||
      org.archived ||
      role.count <= seat.ordinal ||
      seatSignature(roster, role) !== seat.signature ||
      appointment?.slotId !== seat.slotId ||
      (!appointment && latestRoleSlot(roster, seat.roleId, seat.ordinal))
    )
      throw Error("Generation plan changed: institution or occupant. Create a new preview.");
  }
  const end = Math.min(plan.cursor + 25, plan.seats.length);
  while (plan.cursor < end) {
    const seat = plan.seats[plan.cursor];
    const slot = ensureSlot(roster, roles.get(seat.roleId)!, seat.ordinal, plan.year);
    // Persist the actual id before materialization, including when generation fails part-way.
    for (const pending of plan.seats) {
      if (pending.roleId === seat.roleId && pending.ordinal === seat.ordinal) pending.slotId = slot.id;
    }
    materializeSlots({ slotIds: [slot.id], mode: plan.mode });
    plan.cursor++;
  }
  return plan;
}
