import type { CharacterPersonality } from "../../characters/characterTypes";
import { getRulerId, getWorldContext } from "../nobilityContext";

/** Below this boldness score, a ruler is considered cowardly. */
const BOLDNESS_THRESHOLD = 30;
/** Below this confidence score, a ruler is considered insecure/distrustful. */
const CONFIDENCE_THRESHOLD = 30;

/**
 * Proxy for "cowardly and paranoid" until a dedicated `personality.paranoia` trait
 * exists on `CharacterPersonality` — low boldness (cowardly) combined with low
 * confidence (insecure) is the closest existing approximation. Isolated here so the
 * check can be swapped for a real paranoia trait later without touching the caller.
 */
function isCowardlyAndParanoid(personality: CharacterPersonality): boolean {
  return personality.boldness < BOLDNESS_THRESHOLD && personality.confidence < CONFIDENCE_THRESHOLD;
}

/**
 * A cowardly, distrustful ruler hoards troops close to the throne regardless of actual
 * military logic: their capital guard is inflated to always exceed every other regiment
 * in their state's military, one troop more than the current largest. Runs after
 * `Characters.generate()` (core `Military.generate()` has already formed a normally-sized
 * guard by then — see docs/analytics/military-frontier-repositioning.md for the ordering
 * constraint) by directly mutating `state.military`, mirroring how `diplomacy-modifier.ts`
 * mutates `state.diplomacy` directly.
 */
export function applyPersonalityToCapitalGuard(): void {
  const { pack } = getWorldContext();
  if (!pack.characters || !pack.states) return;

  const states = pack.states.filter(s => s.i && !s.removed);

  for (const state of states) {
    const rulerId = getRulerId(state);
    if (rulerId === undefined) continue;
    const ruler = pack.characters.find(c => c.i === rulerId);
    if (!ruler?.personality || !isCowardlyAndParanoid(ruler.personality)) continue;

    const military = state.military;
    if (!military?.length) continue;

    const guard = military.find(r => r.isCapitalGuard);
    if (!guard) continue;

    const maxOther = Math.max(0, ...military.filter(r => r !== guard).map(r => r.a));
    if (guard.a > maxOther) continue; // already the largest regiment — nothing to do

    const delta = maxOther + 1 - guard.a;
    const unitNames = Object.keys(guard.u);
    const targetUnit = unitNames.length ? unitNames.reduce((a, b) => (guard.u[a] > guard.u[b] ? a : b)) : "infantry";
    guard.u[targetUnit] = (guard.u[targetUnit] ?? 0) + delta;
    guard.a += delta;
  }
}
