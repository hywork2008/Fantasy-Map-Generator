import type { ExtensionWebglLayer, ExtensionWebglLayerSpec } from "../../types/extension-api";

const extensionWebglLayerSpecs = new Map<string, ExtensionWebglLayerSpec>();

export function registerExtensionWebglLayers(extensionId: string, spec: ExtensionWebglLayerSpec): void {
  extensionWebglLayerSpecs.set(extensionId, spec);
}

export function unregisterExtensionWebglLayers(extensionId: string): void {
  extensionWebglLayerSpecs.delete(extensionId);
}

export function getExtensionWebglLayers(activeLayers: Readonly<Record<string, boolean>>): ExtensionWebglLayer[] {
  const layers: ExtensionWebglLayer[] = [];
  for (const spec of extensionWebglLayerSpecs.values()) {
    for (const layer of spec.build()) {
      if (activeLayers[layer.toggle]) layers.push(layer);
    }
  }
  return layers;
}
