import { MODEL_KINDS, MODEL_REGIONS, type ModelFacets, type ModelKind } from "../buildings/modelFacets";
import { HISTORICAL_PERIODS, type HistoricalPeriod } from "../types/historicalPeriod";
import {
  type CatalogueFilter,
  entryFacets,
  entryMatches,
  facetFilterIsEmpty,
  parseFilter,
  serializeFilter
} from "./catalogueIndex";

const KIND_LABELS: Record<ModelKind, string> = {
  structure: "Structures",
  vehicle: "Vehicles",
  ship: "Ships",
  weapon: "Weapons",
  flora: "Flora",
  prop: "Props"
};
const words = (value: string) =>
  value
    .replace(/[A-Z]/g, c => ` ${c.toLowerCase()}`)
    .replaceAll("-", " ")
    .replace(/^./, c => c.toUpperCase());

interface Entry {
  button: HTMLButtonElement;
  facets: ModelFacets | undefined;
  name: string;
}

/**
 * Groups the list's categories under kind sections and adds a facet filter above them. Category
 * contents and their click handlers are left untouched; filtering only hides entries.
 */
export function installCatalogueFilter(list: HTMLElement): void {
  const categories = [...list.querySelectorAll<HTMLDetailsElement>(":scope > details.bv-category")];
  const entries = new Map<HTMLDetailsElement, Entry[]>();
  for (const category of categories)
    entries.set(
      category,
      [...category.querySelectorAll<HTMLButtonElement>("button")].map(button => ({
        button,
        facets: entryFacets(button.dataset.id),
        name: button.textContent ?? ""
      }))
    );
  const all = [...entries.values()].flat();

  // A category joins the section of its most common kind; one without classified entries is unclassified.
  const sectionOf = (category: HTMLDetailsElement): ModelKind | "unclassified" => {
    if (category.dataset.kind) return category.dataset.kind as ModelKind;
    const counts = new Map<ModelKind, number>();
    for (const { facets } of entries.get(category)!)
      if (facets) counts.set(facets.kind, (counts.get(facets.kind) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unclassified";
  };
  const sections = [...MODEL_KINDS, "unclassified" as const].map(kind => {
    const heading = document.createElement("h2");
    heading.className = "bv-kind";
    heading.textContent = kind === "unclassified" ? "Unclassified" : KIND_LABELS[kind];
    return { kind, heading, categories: categories.filter(category => sectionOf(category) === kind) };
  });
  for (const section of sections) list.append(section.heading, ...section.categories);

  const panel = document.createElement("form");
  panel.className = "bv-filter";
  panel.setAttribute("role", "search");
  panel.addEventListener("submit", event => event.preventDefault());
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search name or use";
  search.setAttribute("aria-label", "Search models");

  const checks = <T extends string>(legend: string, values: readonly T[], text: (value: T) => string) => {
    const fieldset = document.createElement("fieldset");
    const title = document.createElement("legend");
    title.textContent = legend;
    fieldset.append(title);
    const inputs = values.map(value => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = value;
      label.append(input, ` ${text(value)}`);
      fieldset.append(label);
      return input;
    });
    return { fieldset, inputs };
  };
  const kinds = checks("Kind", MODEL_KINDS, kind => KIND_LABELS[kind]);
  const regions = checks("Region", MODEL_REGIONS, words);

  const periodSelect = (label: string, empty: string) => {
    const select = document.createElement("select");
    select.setAttribute("aria-label", label);
    select.append(new Option(empty, ""), ...HISTORICAL_PERIODS.map(period => new Option(words(period), period)));
    return select;
  };
  const from = periodSelect("Period from", "Any start"),
    to = periodSelect("Period to", "Any end");
  const periods = document.createElement("fieldset");
  const periodTitle = document.createElement("legend");
  periodTitle.textContent = "Period";
  periods.append(periodTitle, from, " – ", to);

  const uses = document.createElement("select");
  uses.multiple = true;
  uses.size = 5;
  uses.setAttribute("aria-label", "Uses");
  const useValues = [...new Set(all.flatMap(entry => entry.facets?.uses ?? []))].sort();
  uses.append(...useValues.map(use => new Option(words(use), use)));
  const useField = document.createElement("fieldset");
  const useTitle = document.createElement("legend");
  useTitle.textContent = "Use";
  useField.append(useTitle, uses);

  const count = document.createElement("p");
  count.className = "bv-filter-count";
  const reset = document.createElement("input");
  reset.type = "reset";
  reset.value = "Clear filters";
  panel.append(search, kinds.fieldset, periods, regions.fieldset, useField, reset, count);
  list.querySelector(":scope > h1")!.after(panel);

  const read = (): CatalogueFilter => ({
    kinds: kinds.inputs.filter(input => input.checked).map(input => input.value as ModelKind),
    ...(from.value ? { from: from.value as HistoricalPeriod } : {}),
    ...(to.value ? { to: to.value as HistoricalPeriod } : {}),
    regions: regions.inputs.filter(input => input.checked).map(input => input.value as (typeof MODEL_REGIONS)[number]),
    uses: [...uses.selectedOptions].map(option => option.value),
    query: search.value
  });
  const write = (filter: CatalogueFilter) => {
    for (const input of kinds.inputs) input.checked = filter.kinds.includes(input.value as ModelKind);
    for (const input of regions.inputs) input.checked = (filter.regions as readonly string[]).includes(input.value);
    from.value = filter.from ?? "";
    to.value = filter.to ?? "";
    for (const option of uses.options) option.selected = filter.uses.includes(option.value);
    search.value = filter.query;
  };
  const apply = (filter: CatalogueFilter) => {
    const active = !facetFilterIsEmpty(filter) || filter.query.trim() !== "";
    let shown = 0;
    for (const section of sections) {
      for (const category of section.categories) {
        const items = entries.get(category)!;
        let visible = 0;
        for (const entry of items) {
          const match = entryMatches(entry.facets, entry.name, filter);
          entry.button.hidden = !match;
          if (match) visible++;
        }
        // A category without entries (e.g. a coverage table) is shown only when nothing is filtered.
        category.hidden = items.length ? !visible : active;
        if (active && visible) category.open = true;
        shown += visible;
      }
      section.heading.hidden = !section.categories.some(category => !category.hidden);
    }
    count.textContent = `${shown} / ${all.length} models`;
    const next = serializeFilter(filter, location.search);
    if (next !== location.search) history.replaceState(null, "", `${location.pathname}${next}${location.hash}`);
  };
  panel.addEventListener("input", () => apply(read()));
  panel.addEventListener("change", () => apply(read()));
  panel.addEventListener("reset", () => setTimeout(() => apply(read())));
  const initial = parseFilter(location.search);
  write(initial);
  apply(initial);
}
