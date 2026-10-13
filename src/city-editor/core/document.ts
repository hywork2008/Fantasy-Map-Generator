/** Legacy document API for the retired CG integration tests. CE and host runtime
 * callers use generators/document and services/io/documentCodec directly.
 * Remove with the retired City Generator; no new imports of this path are allowed.
 */
export * from "../generators/document";
export { parseDocument } from "../services/io/documentCodec";
