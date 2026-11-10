import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { type BleachingFieldPart, createBleachingFieldPart } from "./bleachingFieldDetails";
import { createLimeKilnPart, type LimeKilnPart } from "./limeKilnDetails";

export function limeKilnPartFactories(): ModelPartFactory[] {
  return (["kiln", "charging-bank", "materials"] as LimeKilnPart[]).map(role => ({
    id: `lime-kiln:${role}`,
    role,
    quality: "high",
    author: DEFAULT_AUTHOR,
    create: () => createLimeKilnPart(role)
  }));
}
export function bleachingFieldPartFactories(): ModelPartFactory[] {
  return (["ground-and-linen", "drying-racks", "washing-station"] as BleachingFieldPart[]).map(role => ({
    id: `bleaching:${role}`,
    role,
    quality: "high",
    author: DEFAULT_AUTHOR,
    create: () => createBleachingFieldPart(role)
  }));
}
export function assembleKilnOrBleachingParts(name: string, parts: readonly ModelPartFactory[]) {
  return compactModel(createModelAssembly(name, parts), { mergeEquivalentMaterials: true });
}
export const createHighLimeKiln = () => assembleKilnOrBleachingParts("masonry-lime-kiln-high", limeKilnPartFactories());
export const createHighBleachingField = () =>
  assembleKilnOrBleachingParts("linen-bleaching-field-high", bleachingFieldPartFactories());
