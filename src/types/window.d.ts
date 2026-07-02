declare global {
  interface DocumentEventMap {
    "react-tool-action": CustomEvent<{ action: string }>;
  }
}
