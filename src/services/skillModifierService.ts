/**
 * Generic cross-extension modifier chain for character skill values. Introduced so
 * Shipbuilding can read a state's ruler's Engineering skill (Nobility extension)
 * without importing Nobility directly — see AGENTS.md §7.3's context-holder pattern
 * and docs/plan/shipbuilding.md §3.2.
 *
 * Nobility registers itself as a modifier that supplies each character's base skill
 * value; getEffectiveSkill() runs the full chain and returns 0 if nothing has
 * registered (e.g. Nobility disabled/not installed) — callers should treat 0 as
 * "no data", not "unskilled".
 */
export type SkillModifierFn = (characterId: number, skill: string, currentValue: number) => number;

interface RegisteredModifier {
  source: string;
  fn: SkillModifierFn;
}

const _modifiers: RegisteredModifier[] = [];

/** Registers a modifier, run in registration order. Returns an unregister function — call it in cleanup(). */
export function registerSkillModifier(source: string, fn: SkillModifierFn): () => void {
  const entry: RegisteredModifier = { source, fn };
  _modifiers.push(entry);
  return () => {
    const index = _modifiers.indexOf(entry);
    if (index !== -1) _modifiers.splice(index, 1);
  };
}

/** Runs every registered modifier in order, starting from 0, and returns the final value. */
export function getEffectiveSkill(characterId: number, skill: string): number {
  let value = 0;
  for (const { fn } of _modifiers) {
    value = fn(characterId, skill, value);
  }
  return value;
}
