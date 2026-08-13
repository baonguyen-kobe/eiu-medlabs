import { expect, test } from "@playwright/test";

test("Basic Medical evidence PDF fails closed while the feature flag is off", async ({
  page,
}) => {
  const response = await page.goto(
    "/api/basic-medical/registrations/confirmations/10000000-0000-0000-0000-000000000001/pdf",
  );
  expect(response?.status()).toBe(404);
  await expect(page.locator("body")).not.toContainText(
    "get_basic_medical_confirmation_evidence",
  );
});
