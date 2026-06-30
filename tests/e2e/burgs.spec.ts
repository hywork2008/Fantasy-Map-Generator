import { test, expect } from "@playwright/test";
import {
  waitForMapLoad,
  findInlandBurgInfo,
  findInlandBurg,
  setupBurgView,
} from "./helpers/fmg-helpers";

test.describe("Burgs.add", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto("/?seed=test-burgs&width=1280&height=720");
    await waitForMapLoad(page);
  });

  test("should create burg with falsy port value when not on coast", async ({
    page,
  }) => {
    const result = await findInlandBurgInfo(page);

    expect((result as { error?: string }).error).toBeUndefined();
    const info = result as import("./helpers/fmg-helpers").InlandBurgInfo;
    // Non-port burgs have port deleted (undefined) or set to 0 — either is correctly falsy
    expect(info.portIsFalsy).toBe(true);
    // Explicitly verify it's not the buggy string "0"
    expect(info.port).not.toBe("0");
  });

  test("port toggle button should be inactive for non-coastal burg", async ({
    page,
  }) => {
    const burgId = await findInlandBurg(page, false);
    expect(burgId).not.toBeNull();

    await setupBurgView(page, burgId as number);

    // Open the burg editor via the public actions API (setup/teardown per AGENTS.md §5)
    await page.evaluate((id: number) => {
      window.fmg.actions.editBurg(id);
    }, burgId as number);

    await page.waitForSelector("#burgBody", { state: "visible" });

    const portButton = page.locator("#burgPort");
    await expect(portButton).toHaveClass(/inactive/);
  });

  test("should correctly create and handle river ports (inland ports)", async ({
    page,
  }) => {
    const burgId = await findInlandBurg(page, true);
    expect(burgId).not.toBeNull();

    await setupBurgView(page, burgId as number);

    // Open the burg editor via the public actions API (setup/teardown per AGENTS.md §5)
    await page.evaluate((id: number) => {
      window.fmg.actions.editBurg(id);
    }, burgId as number);

    await page.waitForSelector("#burgBody", { state: "visible" });

    const portButton = page.locator("#burgPort");
    await expect(portButton).not.toHaveClass(/inactive/);
  });
});
