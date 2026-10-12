// Private Vite dev server for headless generation (fmg:small, map:server --lab).
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

/** Serves the working tree on a private port so a developer's own dev server is untouched. */
export async function startDevServer() {
  const port = await freePort();
  const child = spawn(
    join(root, "node_modules/.bin/vite"),
    ["--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    { cwd: root, stdio: ["ignore", "ignore", "pipe"] }
  );
  let stderr = "";
  child.stderr.on("data", chunk => {
    stderr = (stderr + chunk).slice(-4000);
  });
  const url = `http://127.0.0.1:${port}/Fantasy-Map-Generator/`;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`vite exited with code ${child.exitCode}\n${stderr}`);
    try {
      if ((await fetch(url)).ok) return { url, stop: () => child.kill("SIGTERM") };
    } catch {
      /* not listening yet */
    }
    await new Promise(r => setTimeout(r, 250));
  }
  child.kill("SIGKILL");
  throw new Error(`vite did not answer ${url}\n${stderr}`);
}
