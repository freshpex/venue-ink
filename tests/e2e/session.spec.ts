import { test, expect } from '@playwright/test';
import { fixture } from '../helpers/platform.mjs';
import { forwardWithoutCookies } from '../helpers/cookieless-route';

let f: Awaited<ReturnType<typeof fixture>>;
test.beforeAll(async () => {
  f = await fixture();
});
test.afterAll(async () => {
  await f?.cleanup();
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'venue-cookie-consent',
        JSON.stringify({ version: 2, chat: true, savedAt: Date.now() }),
      );
    } catch {
      /* Some payment frames have opaque origins. */
    }
  });
  await page.route('https://embed.tawk.to/**', (route) => route.abort());
});

test('keeps the sign-in form visible when the browser cannot retain its session cookie', async ({
  page,
  request,
}) => {
  await page.route('**/api/auth/login', async (route) => {
    expect(await forwardWithoutCookies(route, request)).toBe(200);
  });
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(f.artist.email);
  await page.getByLabel('Password', { exact: true }).fill(f.artist.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('sign-in could not be completed');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});

test('returns to sign-in when a private request rejects a cached administrator session', async ({
  page,
}) => {
  const admin = (await f.admin.get('/api/auth/me')).body.user;
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(admin.email);
  await page.getByLabel('Password', { exact: true }).fill(f.client.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin/);
  await page.route('**/api/admin/users?*', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Sign in to continue.' }),
    }),
  );
  await page.getByRole('button', { name: 'Accounts & access', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByText('We couldn’t connect just yet.')).toHaveCount(0);
});
