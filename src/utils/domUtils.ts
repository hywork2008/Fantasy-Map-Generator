import { worldContext } from "../context/worldContext";
import { dialogStore } from "../store/dialogState";
import { useOptionsState } from "../store/optionsState";

export function isDialogVisible(id: string): boolean {
  return dialogStore.getState().openDialogs.has(id);
}
export function getVisibleDialogElement(id: string): HTMLElement | null {
  if (!isDialogVisible(id)) return null;
  const el = document.getElementById(id) as HTMLElement | null;
  return el;
}
export function lock(id: string): void {
  const input = document.querySelector<HTMLInputElement>(`[data-stored="${id}"]`);
  if (input) store(id, input.value);
  const el = document.getElementById(`lock_${id}`);
  if (el) {
    el.dataset.locked = "1";
    el.classList.remove("icon-lock-open");
    el.classList.add("icon-lock");
  }
  document.dispatchEvent(new CustomEvent("fmg:lock-changed", { detail: { id, locked: true } }));
}
export function unlock(id: string): void {
  localStorage.removeItem(id);
  const el = document.getElementById(`lock_${id}`);
  if (el) {
    el.dataset.locked = "0";
    el.classList.remove("icon-lock");
    el.classList.add("icon-lock-open");
  }
  document.dispatchEvent(new CustomEvent("fmg:lock-changed", { detail: { id, locked: false } }));
}
export function locked(id: string): boolean {
  const lockEl = document.getElementById(`lock_${id}`) as HTMLElement;
  return lockEl ? lockEl.dataset.locked === "1" : false;
}
export function stored(key: string): string | null {
  return localStorage.getItem(key) || null;
}
export function store(key: string, value: string): void {
  localStorage.setItem(key, value);
}
export function applyOption($select: HTMLSelectElement | HTMLInputElement, value: string, name = value): void {
  const select = $select as HTMLSelectElement;
  const isExisting = Array.from(select.options ?? []).some(o => o.value === value);
  if (!isExisting) select.options?.add(new Option(name, value));
  select.value = value;
}
export function applySortingByHeader(headerContainer: string): void {
  document
    .getElementById(headerContainer)!
    .querySelectorAll<HTMLElement>(".sortable")
    .forEach(el => {
      el.addEventListener("click", () => sortLines(el));
    });
}
export function sortLines(headerElement: HTMLElement): void {
  const type = headerElement.classList.contains("alphabetically") ? "name" : "number";
  let order = headerElement.className.includes("-down") ? "-up" : "-down";
  if (!headerElement.className.includes("icon-sort") && type === "name") order = "-up";

  const headers = headerElement.parentNode as Element;
  headers.querySelectorAll<HTMLElement>(".sortable").forEach(e => {
    e.classList.forEach(c => {
      if (c.includes("icon-sort")) e.classList.remove(c);
    });
  });
  headerElement.classList.add(`icon-sort-${type}${order}`);
  applySorting(headers as HTMLElement);
}
export function applySorting(headers: HTMLElement): void {
  const header = headers.querySelector<HTMLElement>("[class*='icon-sort']");
  if (!header) return;
  const sortby = header.dataset.sortby!;
  const name = header.classList.contains("alphabetically");
  const desc = header.className.includes("-down") ? -1 : 1;
  const list = headers.nextElementSibling as Element;
  const lines = Array.from(list.children) as HTMLElement[];

  lines
    .sort((a, b) => {
      const an = name ? a.dataset[sortby] : +a.dataset[sortby]!;
      const bn = name ? b.dataset[sortby] : +b.dataset[sortby]!;
      return (
        ((an as string | number) > (bn as string | number)
          ? 1
          : (an as string | number) < (bn as string | number)
            ? -1
            : 0) * desc
      );
    })
    .forEach(line => {
      list.appendChild(line);
    });
}
export function getArea(rawArea: number): number {
  return rawArea * worldContext.distanceScale ** 2;
}
export function fitContent(): string {
  return !("chrome" in window) ? "-moz-max-content" : "fit-content";
}
export function removeCircle(): void {
  document.getElementById("brushCircle")?.remove();
}
export function getAreaUnit(squareMark = "²"): string {
  const { areaUnit, distanceUnit } = useOptionsState.getState();
  if (areaUnit === "square") {
    return distanceUnit + squareMark;
  }
  return areaUnit;
}
