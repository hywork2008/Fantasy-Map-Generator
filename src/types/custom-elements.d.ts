import React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "slider-input": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        [key: string]: unknown;
      };
    }
  }
}
