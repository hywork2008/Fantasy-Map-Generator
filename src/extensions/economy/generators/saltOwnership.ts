import { getSimulationCharacters as getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import { getSaltworks, getWorldContext } from "../economyContext";
import type { Saltworks, SaltworksOwner } from "./saltLogisticsTypes";

/** Existing simulation people only, including reference-backed people; never materialize a new owner to fund works. */
function privateOwners() {
  return hasCharactersContext() ? getCharacters() : (getWorldContext().pack.characters ?? []);
}

/** Ownership and territorial state are distinct. Missing legacy rights remain state-owned. */
export function getSaltworksOwner(operation: Saltworks): SaltworksOwner {
  return operation.owner === undefined ? { kind: "state", id: operation.stateId } : operation.owner;
}

export function migrateSaltworksOwnership(): void {
  for (const operation of getSaltworks()) {
    if (operation.owner === undefined) operation.owner = { kind: "state", id: operation.stateId };
    if (!operation.settlementOwner && operation.monthlyOutputBags > 0)
      operation.settlementOwner = { ...getSaltworksOwner(operation) };
  }
}

/** Existing spendable accounts only; never seed a new owner or fall back from invalid rights. */
export function getSaltOwnerAccount(operation: Saltworks): { balance: number; change: (delta: number) => void } | null {
  const owner = getSaltworksOwner(operation);
  if (!owner || !Number.isSafeInteger(owner.id) || owner.id <= 0) return null;
  const { pack } = getWorldContext();
  const state = pack.states[operation.stateId];
  if (!state?.i || state.removed) return null;
  if (owner.kind === "state" && owner.id === operation.stateId)
    return {
      balance: state.treasury ?? 0,
      change: delta => {
        state.treasury = (state.treasury ?? 0) + delta;
      }
    };
  if (owner.kind === "church" && owner.id === operation.stateId && state.departmentBalances)
    return {
      balance: state.departmentBalances.ecclesiastica,
      change: delta => {
        state.departmentBalances!.ecclesiastica += delta;
      }
    };
  if (owner.kind === "burg") {
    const burg = pack.burgs.find(b => b?.i === owner.id && !b.removed && b.state === operation.stateId);
    if (burg)
      return {
        balance: burg.treasury ?? 0,
        change: delta => {
          burg.treasury = (burg.treasury ?? 0) + delta;
        }
      };
  }
  if (owner.kind === "private") {
    const person = privateOwners().find(c => c.i === owner.id && !c.dead && c.state === operation.stateId);
    if (person)
      return {
        balance: person.wealth ?? 0,
        change: delta => {
          person.wealth = (person.wealth ?? 0) + delta;
        }
      };
  }
  return null;
}

/** An editor assignment of rights, not a subsidized sale or a transfer of the former owner's cash. */
export function setSaltworksOwner(operationId: number, owner: SaltworksOwner): boolean {
  if (!owner || !["state", "burg", "church", "private"].includes(owner.kind)) return false;
  const operation = getSaltworks().find(o => o.i === operationId);
  if (!operation || !getSaltOwnerAccount({ ...operation, owner })) return false;
  if (!operation.settlementOwner && operation.monthlyOutputBags > 0)
    operation.settlementOwner = { ...getSaltworksOwner(operation) };
  operation.owner = { ...owner };
  return true;
}

export function getSaltworksOwnerOptions(operation: Saltworks): { owner: SaltworksOwner; name: string }[] {
  const { pack } = getWorldContext();
  const state = pack.states[operation.stateId];
  const options: { owner: SaltworksOwner; name: string }[] = [];
  if (!state?.i || state.removed) return options;
  options.push({ owner: { kind: "state", id: state.i }, name: state.name });
  if (state.departmentBalances) options.push({ owner: { kind: "church", id: state.i }, name: state.name });
  for (const burg of pack.burgs) {
    if (burg?.i && !burg.removed && burg.state === state.i)
      options.push({ owner: { kind: "burg", id: burg.i }, name: burg.name || `#${burg.i}` });
  }
  for (const person of privateOwners()) {
    if (!person.dead && person.state === state.i)
      options.push({ owner: { kind: "private", id: person.i }, name: person.name || `#${person.i}` });
  }
  return options;
}
