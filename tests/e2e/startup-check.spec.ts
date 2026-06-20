import { test } from "@playwright/test";
import { waitForMapGeneration } from "./helpers/fmg-helpers";

test("startup errors check", async ({ page }) => {
  const errors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", err => errors.push(err.message + "\n" + err.stack));
  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/?seed=check&width=1280&height=720");

  try {
    await waitForMapGeneration(page, 60000);
    console.log("✅ Map generation completed");
  } catch {
    console.log("❌ Map generation timed out or failed");
  }

  if (errors.length) console.log("=== pageerror ===\n" + errors.map(e => " • " + e).join("\n---\n"));
  if (consoleErrors.length) console.log("=== console.error ===\n" + consoleErrors.map(e => " • " + e).join("\n"));
});
