/**
 * DOM utility functions for Fantasy Map Generator
 */

type WritableValueElement = HTMLElement & { value: string };

/**
 * Ensure element exists, get by ID
 */
export function ensureEl(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/**
 * Set input value safely (converts number to string)
 */
export function setInputValue(
  el: HTMLElement | HTMLInputElement | null | undefined,
  value: string | number | boolean | null | undefined
): void {
  if (!el) return;
  if (el instanceof HTMLInputElement) {
    el.value = String(value);
  } else if ("value" in el) {
    (el as WritableValueElement).value = String(value);
  } else {
    el.setAttribute("value", String(value));
  }
}

/**
 * Get input value as number
 */
export function getInputNumber(el: HTMLElement | HTMLInputElement | null | undefined): number {
  if (!el) return 0;
  const value = (el as HTMLInputElement).value;
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Create element with attributes
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes?: Record<string, string>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === "class") {
        el.className = value;
      } else if (key === "id") {
        el.id = value;
      } else {
        el.setAttribute(key, value);
      }
    });
  }
  return el;
}

/**
 * Remove element from DOM
 */
export function removeElement(el: HTMLElement | null | undefined): void {
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
  }
}

/**
 * Add class to element
 */
export function addClass(el: HTMLElement | null | undefined, className: string): void {
  if (el) {
    el.classList.add(className);
  }
}

/**
 * Remove class from element
 */
export function removeClass(el: HTMLElement | null | undefined, className: string): void {
  if (el) {
    el.classList.remove(className);
  }
}

/**
 * Toggle class on element
 */
export function toggleClass(el: HTMLElement | null | undefined, className: string, force?: boolean): void {
  if (el) {
    el.classList.toggle(className, force);
  }
}

/**
 * Check if element has class
 */
export function hasClass(el: HTMLElement | null | undefined, className: string): boolean {
  if (!el) return false;
  return el.classList.contains(className);
}
