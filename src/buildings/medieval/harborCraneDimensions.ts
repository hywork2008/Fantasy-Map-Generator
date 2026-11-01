export interface HarborCraneDimensions {
  /** Horizontal radius to the falling rope, not the sloping timber length. */
  reach: number;
  pulleyHeight: number;
  hookHeight: number;
  showCargo?: boolean;
}

/** Illustrative construction profiles, shared by BV previews and CE cargo planning. */
export const HARBOR_CRANE_PROFILES = {
  treadwheel: { reach: 9, pulleyHeight: 8, hookHeight: 6.5 },
  derrick: { reach: 7, pulleyHeight: 6.5, hookHeight: 5 }
} as const;

export const DEFAULT_HARBOR_CRANE_DIMENSIONS: HarborCraneDimensions = {
  reach: 4.35,
  pulleyHeight: 4.45,
  hookHeight: 1.1,
  showCargo: false
};

export function checkedHarborCraneDimensions(input = DEFAULT_HARBOR_CRANE_DIMENSIONS): HarborCraneDimensions {
  if (
    ![input.reach, input.pulleyHeight, input.hookHeight].every(Number.isFinite) ||
    input.reach <= 0 ||
    input.hookHeight < 0.4 ||
    input.pulleyHeight <= input.hookHeight + 0.3
  )
    throw new Error("Invalid harbor crane dimensions");
  return { ...input };
}
