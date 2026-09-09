import { test, expect } from "@playwright/test";
test("workspace screens, customer filtering, and evidence review", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your configuration, in context." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Contoso Manufacturing", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/enterprise-ui/overview.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Configuration history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Configuration snapshots" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Compare snapshots", exact: true })
    .click();
  await page
    .getByLabel("Later snapshot")
    .selectOption("40000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(
    page.getByText("1 changes · 0 sections excluded", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Close dialog").click();
  for (const name of [
    "Drift & findings",
    "Standards",
    "Audit workspace",
    "Report library",
    "Team & access",
    "API & webhooks",
    "Billing",
    "Activity log",
  ]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
});
test("publishes standards through a structured form", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Standards", exact: true })
    .click();
  await page.getByRole("button", { name: "Publish standard" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Name", { exact: true })
    .fill("Endpoint security standard");
  await dialog.getByLabel("Rule name").fill("Policy enabled");
  await dialog.getByLabel("Setting path (JSON Pointer)").fill("/enabled");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: /Endpoint security standard/ }),
  ).toBeVisible();
});
test("invitation dialog and responsive navigation", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Team & access", exact: true })
    .click();
  await page.getByRole("button", { name: "Invite member" }).click();
  await page.getByLabel("Business email").fill("teammate@example.test");
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Invitation sent" }),
  ).toContainText("Invitation sent");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "output/enterprise-ui/mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("Microsoft-only sign-in has a free Hobby entry", async ({ page }) => {
  await page.goto("/?signedOut=1");
  await expect(
    page.getByRole("button", { name: "Continue with Microsoft" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Continue with free Hobby/ }),
  ).toHaveAttribute("href", "/sign-in");
  await page.screenshot({
    path: "output/enterprise-ui/sign-in.png",
    fullPage: true,
  });
});

test("customer authorization identifies the requesting workspace before approval", async ({
  page,
}) => {
  await page.goto(
    `/?connection=${"a".repeat(43)}&tenant=30000000-0000-4000-8000-000000000001`,
  );
  await expect(
    page.getByRole("heading", { name: "Authorize customer monitoring" }),
  ).toBeVisible();
  await expect(
    page.getByText(/requests access to Contoso Manufacturing/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in to the customer tenant" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve customer connection" }),
  ).toBeEnabled();
});
