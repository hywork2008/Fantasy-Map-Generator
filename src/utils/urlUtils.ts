/**
 * URL utility functions for managing object URLs and cleanup.
 * Centralizes window.URL.* operations to reduce global dependencies.
 */

/**
 * Create an object URL from a Blob for downloading or previewing.
 */
export function createObjectURL(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/**
 * Revoke an object URL after use to free memory.
 * @param url The object URL created by createObjectURL()
 * @param delayMs Optional delay in milliseconds before revocation (to allow download completion)
 */
export function revokeObjectURL(url: string, delayMs?: number): void {
  if (delayMs) {
    setTimeout(() => URL.revokeObjectURL(url), delayMs);
  } else {
    URL.revokeObjectURL(url);
  }
}
