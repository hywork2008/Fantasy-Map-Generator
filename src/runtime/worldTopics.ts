/**
 * Coarse ownership topics used while the legacy pack/grid representation remains
 * the canonical backing store. More granular ranges and entity ids can be added
 * without changing the commit subscription seam.
 */
export type DataTopic =
  | "map.identity"
  | "map.topology"
  | "map.physical"
  | "map.politics"
  | "map.settlements"
  | "map.networks"
  | "map.annotations"
  | "simulation.clock"
  | "simulation.rng"
  | "simulation.cells"
  | "simulation.states"
  | "simulation.burgs"
  | "simulation.military"
  | "presentation.styles"
  | "presentation.layers"
  | "presentation.labels"
  | "presentation.overlays"
  | `extension.${string}`;
