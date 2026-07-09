declare module "../../types/models" {
  interface State {
    /** Denormalized pointer to the primary ruling Character.i, for O(1) lookup. */
    rulerId?: number;
  }
}
