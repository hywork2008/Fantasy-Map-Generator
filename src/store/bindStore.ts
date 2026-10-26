import { type StoreApi, type UseBoundStore, useStore } from "zustand";

/**
 * React hook over a vanilla store, equivalent to zustand's `create()`: callable as a hook with a
 * selector and still carrying `getState` / `setState` / `subscribe`. The simulation core owns the
 * vanilla stores (src/state, src/extensions/*\/state) and never imports React; the UI binds them
 * here (docs/plan/simulation-core-separation.md S4).
 */
// biome-ignore lint/suspicious/noExplicitAny: mirrors zustand's own StoreApi<any> constraint.
export function bindStore<A extends StoreApi<any>>(api: A): UseBoundStore<A> {
  // biome-ignore lint/correctness/noComponentHookFactories: Store hooks are bound once at module initialization.
  const useBoundStore = ((selector?: (state: ReturnType<A["getState"]>) => unknown) =>
    useStore(api, selector as never)) as UseBoundStore<A>;
  return Object.assign(useBoundStore, api);
}
