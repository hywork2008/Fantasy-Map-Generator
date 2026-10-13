import type { ShipType } from "../types/ships";

// Imported ship aliases are data tokens, independent of the display language.
export function normalizeShipType(key: string | undefined): ShipType {
  if (!key) return "small";
  const lower = key.toLowerCase();
  if (
    lower === "barge" ||
    lower === "river-barge" ||
    lower.includes("バージ") ||
    lower.includes("川") ||
    lower.includes("荷")
  ) {
    return "barge";
  }
  if (lower === "sloop" || lower === "small" || lower.includes("小")) return "small";
  if (lower === "caravel" || lower === "medium" || lower.includes("中")) return "medium";
  if (lower === "galleon" || lower === "large" || lower.includes("大")) return "large";
  return "small";
}
