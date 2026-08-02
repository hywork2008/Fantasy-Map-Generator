import type { CharacterRegenerationEntropy } from "../hostUi";

/**
 * Resolves the RNG seed for a manual Characters regenerate, based on the confirm-dialog choice.
 * Avoids Math.random here — it is often rebound to Alea and must not pollute seed choice.
 */
export function resolveCharacterRegenerationSeed(entropy: CharacterRegenerationEntropy, mapSeed: string): string {
  if (entropy === "mapSeed") return mapSeed;
  if (entropy === "mixTime") return `${mapSeed}:${Date.now()}`;
  const noise =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${performance.now()}`;
  return `${mapSeed}:r:${noise}`;
}
