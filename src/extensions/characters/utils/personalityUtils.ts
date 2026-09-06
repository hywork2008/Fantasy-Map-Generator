import type React from "react";
import type { CharacterPersonality } from "../characterTypes";

/** Coarse conduct display, not a moral verdict on sociability, faith, or indirect methods. */
export function calculateCharacterTraits(p: CharacterPersonality) {
  const good = ((p.compassion ?? 50) + (p.honor ?? 50)) / 2;
  const bad = ((p.greed ?? 50) + (p.vengefulness ?? 50)) / 2;
  return { good, bad };
}

export function getCharacterRowStyle(p: CharacterPersonality): React.CSSProperties {
  const { good, bad } = calculateCharacterTraits(p);
  if (Math.abs(good - bad) < 15) {
    return { backgroundColor: `rgba(255, 255, 0, 0.2)` };
  } else if (good > bad) {
    return { backgroundColor: `rgba(0, 255, 0, 0.2)` };
  } else {
    return { backgroundColor: `rgba(255, 0, 0, 0.2)` };
  }
}
