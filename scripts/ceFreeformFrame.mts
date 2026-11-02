/** Metal/headed frame times for the freeform F0 scene. node --import tsx scripts/ceFreeformFrame.mts */
import { chromium } from "playwright";
import { createServer } from "vite";

const port = 5277;
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { host: "127.0.0.1", port, strictPort: true },
  logLevel: "error"
});

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({
    headless: process.env.CE_FREEFORM_HEADED !== "1",
    args: ["--use-angle=metal"]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.route("**/freeform-frame.html", route =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0}</style><canvas></canvas>"
    })
  );
  await page.goto(`http://127.0.0.1:${port}/freeform-frame.html`);
  const report = await page.evaluate(async () => {
    // @ts-expect-error Browser-only Vite module URL.
    const { measureFreeformFrame } = await import("/src/city-editor/renderers/freeform/frameBench.ts");
    const canvas = document.querySelector("canvas");
    if (!canvas) throw new Error("missing canvas");
    return measureFreeformFrame(canvas);
  });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(JSON.stringify({ headed: process.env.CE_FREEFORM_HEADED === "1", ...report }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
