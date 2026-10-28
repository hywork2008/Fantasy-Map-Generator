import { STANDARD_BIOME_DEFINITIONS } from "../../data/biomeCatalog";
import { editorText } from "../../i18n/editorMessages";
import { withCityBiome } from "../generators/cityBiome";
import type { EditorLifetime } from "../services/editorLifetime";
import type { CityDocument } from "../types/document";

export function buildBiomeControls(ctx: {
  scope: EditorLifetime;
  getDocument: () => CityDocument;
  isImported: () => boolean;
  select: (values: string[], selected: string) => HTMLSelectElement;
  label: (caption: string, control: HTMLElement) => HTMLLabelElement;
  updateDocument: (next: CityDocument) => void;
}) {
  const definitions = STANDARD_BIOME_DEFINITIONS.map((definition, id) => ({ ...definition, id })).filter(
    definition => definition.key !== "marine"
  );
  const select = ctx.select(["", ...definitions.map(definition => definition.key)], "");
  select.className = "ce-biome";
  const caption = editorText("cityEditor.messages.biome");
  select.setAttribute("aria-label", caption);
  select.options[0].textContent = editorText("cityEditor.messages.biomeUnspecified");
  for (const option of Array.from(select.options).slice(1))
    option.textContent = definitions.find(definition => definition.key === option.value)!.label;
  ctx.scope.listen(select, "change", () => {
    if (ctx.isImported()) return;
    const definition = definitions.find(definition => definition.key === select.value);
    ctx.updateDocument(
      withCityBiome(
        ctx.getDocument(),
        definition
          ? {
              id: definition.id,
              key: definition.key,
              name: definition.label,
              color: definition.color,
              tags: [...definition.tags]
            }
          : undefined
      )
    );
  });
  const sync = () => {
    const biome = ctx.getDocument().biome;
    select.querySelector("option[data-custom-biome]")?.remove();
    if (biome && !definitions.some(definition => definition.key === biome.key)) {
      const option = document.createElement("option");
      option.value = biome.key ?? `custom:${biome.id}`;
      option.textContent = biome.name;
      option.dataset.customBiome = "true";
      select.append(option);
    }
    select.value = biome ? (biome.key ?? `custom:${biome.id}`) : "";
    select.disabled = ctx.isImported();
    select.title = select.disabled ? editorText("cityEditor.messages.biomeImported") : "";
  };
  sync();
  return { root: ctx.label(caption, select), sync };
}
