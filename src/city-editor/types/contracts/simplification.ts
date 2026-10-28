/** Local display choices; never change the generated city or its share data. */
export type SimplificationPreference = "auto" | "off";

export interface SimplificationPreferences {
  urban: SimplificationPreference;
  outskirts: SimplificationPreference;
}
