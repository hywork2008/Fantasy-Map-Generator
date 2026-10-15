/** Shared CE signpost classification. The saved group remains an independent attribute. */
export interface BurgDestinationInput {
  population?: number;
  group?: string;
  capital?: unknown;
  citadel?: unknown;
  walls?: unknown;
  port?: unknown;
  plaza?: unknown;
}

export function burgDestinationTraits(target: BurgDestinationInput | undefined): {
  scale: "hamlet" | "village" | "town" | "city";
  role: "generic" | "capital" | "fortress" | "granary" | "market";
} {
  const pop = target?.population ?? 0;
  let scale: "hamlet" | "village" | "town" | "city" = "town";
  if (target?.group === "hamlet" || pop < 1) scale = "hamlet";
  else if (target?.group === "village" || pop < 3) scale = "village";
  else if (pop > 10 || target?.capital) scale = "city";

  let role: "generic" | "capital" | "fortress" | "granary" | "market" = "generic";
  if (target?.capital) role = "capital";
  else if (target?.citadel || (target?.walls && pop < 4)) role = "fortress";
  else if (scale === "village" || target?.group === "farm") role = "granary";
  else if (target?.port || target?.group === "trading_post" || (scale === "city" && target?.plaza)) role = "market";
  return { scale, role };
}
