/**
 * EditorBus — lightweight event bus for editor ↔ controller communication.
 *
 * Problem: `editors/` modules need to call functions like `unselect()` and
 * `restoreDefaultEvents()` that live in `controllers/editors.ts`. But
 * `controllers/editors.ts` already imports `editors/` via dynamic imports,
 * so a static import in the reverse direction creates a circular dependency.
 *
 * Solution: `editors/` dispatch named events through `EditorBus` instead of
 * importing controller functions directly. `controllers/editors.ts` listens
 * for those events at module-load time and executes the real function.
 */

export const EditorBus = {
  /** Request the active editor to close and restore default SVG events. */
  restoreDefaultEvents(): void {
    document.dispatchEvent(new CustomEvent("fmg:restore-default-events"));
  },

  /** Deselect the currently selected SVG element. */
  unselect(): void {
    document.dispatchEvent(new CustomEvent("fmg:unselect"));
  },

  /** Move the brush circle to (x, y) with radius r. */
  moveCircle(x: number, y: number, r = 20): void {
    document.dispatchEvent(new CustomEvent("fmg:move-circle", { detail: { x, y, r } }));
  },

  /** Remove the brush circle. */
  removeCircle(): void {
    document.dispatchEvent(new CustomEvent("fmg:remove-circle"));
  },

  /** Highlight an element in the SVG viewport. */
  highlightElement(element: Element, zoom?: number): void {
    document.dispatchEvent(new CustomEvent("fmg:highlight-element", { detail: { element, zoom } }));
  },

  /** Open the icon selector dialog. */
  selectIcon(initial: string, callback: (value: string) => void): void {
    // Store the callback so the listener can invoke it.
    EditorBus._iconCallback = callback;
    document.dispatchEvent(new CustomEvent("fmg:select-icon", { detail: { initial } }));
  },

  /** Clear the map legend. */
  clearLegend(): void {
    document.dispatchEvent(new CustomEvent("fmg:clear-legend"));
  },

  /** Draw a named legend from data array. */
  drawLegend(name: string, data: Array<[string | number, string, string]>): void {
    document.dispatchEvent(new CustomEvent("fmg:draw-legend", { detail: { name, data } }));
  },

  /** Redraw the currently displayed legend. */
  redrawLegend(): void {
    document.dispatchEvent(new CustomEvent("fmg:redraw-legend"));
  },

  /** Apply fogging to a region. */
  fog(id: string, data: string): void {
    document.dispatchEvent(new CustomEvent("fmg:fog", { detail: { id, data } }));
  },

  /** Remove fogging from a region. */
  unfog(id?: string): void {
    document.dispatchEvent(new CustomEvent("fmg:unfog", { detail: { id } }));
  },

  /** Open the States editor. */
  editStates(): void {
    document.dispatchEvent(new CustomEvent("fmg:edit-states"));
  },

  /** Open the Rivers editor for a specific river. */
  editRiver(id: string): void {
    document.dispatchEvent(new CustomEvent("fmg:edit-river", { detail: { id } }));
  },

  /** @internal icon callback; set by selectIcon, consumed by the listener in controllers/editors.ts */
  _iconCallback: null as ((value: string) => void) | null,

  /** Open the Color Picker. */
  openPicker(fill: string, callback: (fill: string) => void): void {
    EditorBus._pickerCallback = callback;
    document.dispatchEvent(new CustomEvent("fmg:open-picker", { detail: { fill } }));
  },

  /** @internal picker callback; set by openPicker, consumed by the listener in controllers/editors.ts */
  _pickerCallback: null as ((value: string) => void) | null,

  /** Open the Biomes editor. */
  editBiomes(): void {
    document.dispatchEvent(new CustomEvent("fmg:edit-biomes"));
  },

  /** Open the Units editor. */
  editUnits(): void {
    document.dispatchEvent(new CustomEvent("fmg:edit-units"));
  },

  /** Open the World Configurator. */
  editWorld(): void {
    document.dispatchEvent(new CustomEvent("fmg:edit-world"));
  },

  /** Show Export pane in Options. */
  showExportPane(): void {
    document.dispatchEvent(new CustomEvent("fmg:show-export-pane"));
  }
};
