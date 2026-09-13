/**
 * State forms whose institutions are clerical.
 *
 * Shared by household generation (celibacy), court office personality, and
 * Great Library patronage so the formName list cannot drift per caller.
 */
export const RELIGIOUS_FORM_NAMES = ["Theocracy", "Holy State", "Bishopric"] as const;

export function isReligiousFormName(formName: string | undefined): boolean {
  return formName !== undefined && (RELIGIOUS_FORM_NAMES as readonly string[]).includes(formName);
}

export function isReligiousStateForm(state: { form?: string; formName?: string }): boolean {
  return state.form === "Theocracy" || isReligiousFormName(state.formName);
}
