import React from "react";

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

  namespace JSX {
    interface IntrinsicElements {
      "slider-input": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        [key: string]: unknown;
      };
    }
  }
}
