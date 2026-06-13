import jQuery from "jquery";

// Expose jQuery globally so that UMD bundles (jquery-ui, touch-punch) can find it
(window as any).jQuery = jQuery;
(window as any).$ = jQuery;
