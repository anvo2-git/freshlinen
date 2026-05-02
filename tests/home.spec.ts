import { expect, test } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The Common Nose" })).toBeVisible();
  await expect(page.getByText("How it works")).toBeVisible();
});
