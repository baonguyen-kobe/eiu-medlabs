import { expect, test, type Page } from "@playwright/test";

const root = {
  identifier: process.env.PRODUCTION_ADMIN_IDENTIFIER,
  password: process.env.PRODUCTION_ADMIN_PASSWORD,
};
const personnelManager = {
  identifier: process.env.PRODUCTION_PERSONNEL_MANAGER_IDENTIFIER,
  password: process.env.PRODUCTION_PERSONNEL_MANAGER_PASSWORD,
};
const ordinaryAdmin = {
  identifier: process.env.PRODUCTION_ORDINARY_ADMIN_IDENTIFIER,
  password: process.env.PRODUCTION_ORDINARY_ADMIN_PASSWORD,
};

test.use({
  baseURL:
    process.env.PRODUCTION_BASE_URL ?? "https://medlabs-calendar.vercel.app",
});

function requireCredentials(
  identifier: string | undefined,
  password: string | undefined,
  label: string,
) {
  test.skip(
    !identifier || !password,
    `Missing production credentials for ${label}.`,
  );
}

async function signIn(page: Page, identifier: string, password: string) {
  const response = await page.goto("/login");
  expect(
    response?.status(),
    "login page must not return a server error",
  ).toBeLessThan(500);
  await page.getByLabel("ID hoặc email").fill(identifier);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
}

test("Root Administrator can access Personnel in production", async ({
  page,
}) => {
  requireCredentials(root.identifier, root.password, "Root Administrator");
  await signIn(page, root.identifier!, root.password!);
  await expect(page.getByRole("link", { name: "Nhân sự" })).toBeVisible();
  const response = await page.goto("/admin/personnel");
  expect(
    response?.status(),
    "Personnel page must not return a server error",
  ).toBeLessThan(500);
  await expect(page).toHaveURL(/\/admin\/personnel$/);
});

test("Personnel Manager can access Personnel in production", async ({
  page,
}) => {
  requireCredentials(
    personnelManager.identifier,
    personnelManager.password,
    "Personnel Manager",
  );
  await signIn(page, personnelManager.identifier!, personnelManager.password!);
  await expect(page.getByRole("link", { name: "Nhân sự" })).toBeVisible();
  const response = await page.goto("/admin/personnel");
  expect(
    response?.status(),
    "Personnel page must not return a server error",
  ).toBeLessThan(500);
  await expect(page).toHaveURL(/\/admin\/personnel$/);
});

test("ordinary Admin is denied Personnel access in production", async ({
  page,
}) => {
  requireCredentials(
    ordinaryAdmin.identifier,
    ordinaryAdmin.password,
    "ordinary Admin",
  );
  await signIn(page, ordinaryAdmin.identifier!, ordinaryAdmin.password!);
  await expect(page.getByRole("link", { name: "Nhân sự" })).toHaveCount(0);
  const response = await page.goto("/admin/personnel");
  expect(
    response?.status(),
    "Personnel denial must not return a server error",
  ).toBeLessThan(500);
  await expect(page).toHaveURL(/\/dashboard$/);
});
