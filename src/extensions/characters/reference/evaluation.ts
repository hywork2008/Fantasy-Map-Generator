/** Worker-local capability; never read from an archive or user-controlled setting. */
let evaluating = false;
export function isReferenceEvaluation(): boolean {
  return evaluating;
}
export function setReferenceEvaluation(value: boolean): void {
  evaluating = value;
}
