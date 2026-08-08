import { expect, test } from "@playwright/test";
import { waitForMapLoad } from "./helpers/fmg-helpers";

test("keeps a dialog titlebar in place while minimizing and restoring", async ({ page }) => {
  await page.goto("/?seed=dialog-minimize-position&width=1280&height=720");
  await waitForMapLoad(page, "svg");

  await page.locator("#toolsTab").click();
  await page.getByRole("button", { name: "Namesbase", exact: true }).click();

  const dialog = page.locator(".fmg-dialog", {
    has: page.locator(".fmg-dialog-title", { hasText: "Namesbase Editor" })
  });
  const titlebar = dialog.locator(".titlebar");
  const minimize = dialog.getByRole("button", { name: "Minimize" });
  await expect(titlebar).toBeVisible();

  const titlebarBounds = await titlebar.boundingBox();
  expect(titlebarBounds).not.toBeNull();
  await page.mouse.move(titlebarBounds!.x + 12, titlebarBounds!.y + titlebarBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(titlebarBounds!.x + 12, 0, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await titlebar.boundingBox())?.y ?? Infinity).toBeLessThanOrEqual(1);

  const initialBounds = await titlebar.boundingBox();
  expect(initialBounds).not.toBeNull();

  for (let cycle = 0; cycle < 3; cycle++) {
    await minimize.click();
    await expect(dialog.getByRole("button", { name: "Restore" })).toBeVisible();
    const minimizedBounds = await titlebar.boundingBox();
    expect(minimizedBounds).not.toBeNull();
    expect(minimizedBounds!.y).toBeCloseTo(initialBounds!.y, 1);
    await dialog.getByRole("button", { name: "Restore" }).click();
    await expect(minimize).toBeVisible();

    const bounds = await titlebar.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeCloseTo(initialBounds!.y, 1);
  }
});

test("collapses a manually resized dialog when minimized, and restores its size", async ({ page }) => {
  await page.goto("/?seed=dialog-minimize-resize&width=1280&height=720");
  await waitForMapLoad(page, "svg");

  await page.locator("#toolsTab").click();
  await page.getByRole("button", { name: "Namesbase", exact: true }).click();

  const dialog = page.locator(".fmg-dialog", {
    has: page.locator(".fmg-dialog-title", { hasText: "Namesbase Editor" })
  });
  const titlebar = dialog.locator(".titlebar");
  const resizeHandle = dialog.locator(".fmg-dialog-resize");
  const minimize = dialog.getByRole("button", { name: "Minimize" });
  await expect(titlebar).toBeVisible();

  // Grow the dialog well past its default height via the bottom-right handle.
  const handleBounds = await resizeHandle.boundingBox();
  expect(handleBounds).not.toBeNull();
  const dialogBoundsBeforeResize = await dialog.boundingBox();
  expect(dialogBoundsBeforeResize).not.toBeNull();
  await page.mouse.move(handleBounds!.x + handleBounds!.width / 2, handleBounds!.y + handleBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBounds!.x + 150, handleBounds!.y + 200, { steps: 5 });
  await page.mouse.up();

  const resizedBounds = await dialog.boundingBox();
  expect(resizedBounds).not.toBeNull();
  expect(resizedBounds!.height).toBeGreaterThan(dialogBoundsBeforeResize!.height + 50);

  // Minimizing must collapse the frame down to just the titlebar, not leave
  // the resized height as an empty, content-less box.
  await minimize.click();
  await expect(dialog.getByRole("button", { name: "Restore" })).toBeVisible();
  const titlebarBounds = await titlebar.boundingBox();
  expect(titlebarBounds).not.toBeNull();
  await expect.poll(async () => (await dialog.boundingBox())?.height ?? Infinity).toBeLessThanOrEqual(
    titlebarBounds!.height + 4
  );

  // Restoring must bring the resized height back.
  await dialog.getByRole("button", { name: "Restore" }).click();
  await expect(minimize).toBeVisible();
  await expect
    .poll(async () => (await dialog.boundingBox())?.height ?? 0)
    .toBeGreaterThan(dialogBoundsBeforeResize!.height + 50);
});
