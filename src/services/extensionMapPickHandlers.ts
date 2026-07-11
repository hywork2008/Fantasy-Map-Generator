import type { ExtensionMapPickHandler } from "../types/extension-api";

const handlers = new Map<string, ExtensionMapPickHandler>();

export function registerExtensionMapPickHandler(extensionId: string, handler: ExtensionMapPickHandler): void {
  handlers.set(extensionId, handler);
}

export function unregisterExtensionMapPickHandler(extensionId: string): void {
  handlers.delete(extensionId);
}

export function getExtensionMapPickHandler(extensionId: string | null): ExtensionMapPickHandler | null {
  return extensionId ? (handlers.get(extensionId) ?? null) : null;
}
