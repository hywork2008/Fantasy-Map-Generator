/**
 * Host-readable core entity references carried by extension slices and opaque
 * archive chunks. Kept free of codec / registry imports so both can share it.
 */

export const CORE_ENTITY_KINDS = [
  "marker",
  "burg",
  "state",
  "province",
  "culture",
  "religion",
  "route",
  "river",
  "feature",
  "zone"
] as const;

export type CoreEntityKind = (typeof CORE_ENTITY_KINDS)[number];

export interface CoreReference {
  readonly kind: CoreEntityKind;
  readonly id: number;
  readonly onDelete: "restrict" | "orphan";
}

/**
 * An extension payload the current host cannot interpret as a validated runtime
 * slice. The codec owns path and checksum; the runtime retains bytes unchanged.
 */
export interface OpaqueExtensionChunk {
  readonly extensionId: string;
  readonly schemaVersion: number;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly checksum: string;
  readonly coreReferences: readonly CoreReference[] | "unknown";
}
