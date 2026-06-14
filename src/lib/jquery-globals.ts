import jQuery from "jquery";

// Expose jQuery globally so that UMD bundles (jquery-ui, touch-punch) can find it
(window as unknown as { jQuery: typeof jQuery }).jQuery = jQuery;
(window as unknown as { $: typeof jQuery }).$ = jQuery;
