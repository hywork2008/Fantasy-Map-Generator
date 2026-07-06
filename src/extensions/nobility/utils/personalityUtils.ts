import type React from "react";
import type { CharacterPersonality } from "../generators/characterTypes";

export function calculateCharacterTraits(p: CharacterPersonality) {
  const good = ((p.compassion ?? 0) + (p.honor ?? 0) + (p.sociability ?? 0)) / 3;
  const bad = ((p.greed ?? 0) + (p.guile ?? 0) + (p.vengefulness ?? 0) + (p.zeal ?? 0)) / 4;
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
