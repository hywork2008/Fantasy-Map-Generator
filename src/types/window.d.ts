import React from "react";

declare global {
  interface Window {
    editWorld?: () => void;
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
