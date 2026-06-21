declare global {
  interface Window {
    editWorld?: () => void;
    updateWorld?: () => void;
    applyProvinceNameChange?: () => void;
    [key: string]: unknown;
  }

  interface DocumentEventMap {
    "react-tool-action": CustomEvent<{ action: string }>;
  }
}
