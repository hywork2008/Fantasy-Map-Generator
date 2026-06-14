declare global {
  interface Window {
    editWorld?: () => void;
    [key: string]: unknown;
  }

  interface DocumentEventMap {
    "react-tool-action": CustomEvent<{ action: string }>;
  }
}

export {};
