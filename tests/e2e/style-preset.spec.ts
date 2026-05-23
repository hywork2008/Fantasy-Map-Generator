import { expect, test } from "@playwright/test";

async function openMap(page: import("@playwright/test").Page) {
  await page.goto("/Fantasy-Map-Generator/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as any).mapId !== undefined, { timeout: 60000 });
  await page.waitForFunction(() => typeof (window as any).requestStylePresetChange === "function", { timeout: 15000 });
  await page.waitForFunction(() => typeof (window as any).addStylePreset === "function", { timeout: 15000 });
  await page.waitForFunction(() => typeof (window as any).requestRemoveStylePreset === "function", { timeout: 15000 });
}

function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(
    e =>
      !e.includes("fonts.googleapis.com") &&
      !e.includes("google-analytics") &&
      !e.includes("googletagmanager") &&
      !e.includes("Failed to load resource") &&
      !e.includes("Name is too short! Random name will be selected")
  );
}

test.describe("Style preset", () => {
  test("requestStylePresetChange should apply ancient preset", async ({ context, page }) => {
    await context.clearCookies();
    await openMap(page);

    await page.evaluate(() => {
      sessionStorage.setItem("styleChangeConfirmed", "true");
      (window as any).requestStylePresetChange("ancient");
    });

    await page.waitForFunction(() => localStorage.getItem("presetStyle") === "ancient", { timeout: 15000 });

    const result = await page.evaluate(() => ({
      presetStyle: localStorage.getItem("presetStyle"),
      selected: (document.getElementById("stylePreset") as HTMLSelectElement | null)?.value || ""
    }));

    expect(result.presetStyle).toBe("ancient");
    expect(result.selected.length).toBeGreaterThan(0);
  });

  test("addStylePreset and requestRemoveStylePreset should update localStorage", async ({ context, page }) => {
    await context.clearCookies();

    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);

    const customPresetKey = "fmgStyle_e2e-style";

    const before = await page.evaluate(key => ({
      existing: !!localStorage.getItem(key),
      preset: localStorage.getItem("presetStyle")
    }), customPresetKey);
    expect(before.existing).toBe(false);

    await page.evaluate(() => {
      (window as any).addStylePreset();

      const nameInput = document.getElementById("styleSaverName") as HTMLInputElement;
      const jsonInput = document.getElementById("styleSaverJSON") as HTMLTextAreaElement;
      const saveButton = document.getElementById("styleSaverSave") as HTMLButtonElement;

      nameInput.value = "e2e-style";
      jsonInput.value = "{}";
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      saveButton.click();
    });

    await page.waitForFunction(key => !!localStorage.getItem(key), customPresetKey, { timeout: 10000 });

    await page.evaluate(() => {
      const presetSelect = document.getElementById("stylePreset") as HTMLSelectElement;
      const selectedValue = presetSelect.value;
      if (!selectedValue) throw new Error("No style preset is currently selected");

      const originalConfirmationDialog = (window as any).confirmationDialog;
      (window as any).confirmationDialog = ({ onConfirm }: { onConfirm: () => void }) => onConfirm();
      (window as any).requestRemoveStylePreset();
      (window as any).confirmationDialog = originalConfirmationDialog;
    });

    const after = await page.evaluate(key => ({
      existsAfterRemove: !!localStorage.getItem(key),
      presetAfterRemove: localStorage.getItem("presetStyle")
    }), customPresetKey);

    expect(after.existsAfterRemove).toBe(false);
    expect(after.presetAfterRemove).not.toBe(customPresetKey);

    const criticalErrors = filterCriticalErrors(errors);
    expect(criticalErrors, `Unexpected console/page errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});
