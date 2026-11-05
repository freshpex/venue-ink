import { test, expect } from '@playwright/test';
import { fixture } from '../helpers/platform.mjs';
import { totp } from '../../server/security.mjs';
let f: Awaited<ReturnType<typeof fixture>>;
test.beforeAll(async () => {
  f = await fixture();
});
test.afterAll(async () => {
  await f?.cleanup();
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'venue-cookie-consent',
        JSON.stringify({ version: 1, chat: false, savedAt: Date.now() }),
      );
    } catch {
      /* Some payment frames have opaque origins. */
    }
  });
  await page.route('https://embed.tawk.to/**', (route) => route.abort());
});
test('client enrolls an authenticator and signs in with a one-use recovery code', async ({
  page,
  browser,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(f.client.email);
  await page.getByLabel('Password', { exact: true }).fill(f.client.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/dashboard?tab=security');
  await page.getByLabel('Confirm your password', { exact: true }).fill(f.client.password);
  await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
  await expect(page.locator('.secret-key')).toBeVisible();
  const secret = await page.locator('.secret-key').innerText();
  await page.getByLabel('Authenticator code', { exact: true }).fill(totp(secret));
  await page.getByRole('button', { name: 'Enable two-factor authentication', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save your recovery codes now' })).toBeVisible();
  const codes = (await page.locator('.recovery-codes pre').innerText()).split('\n');
  expect(codes).toHaveLength(8);
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto('http://127.0.0.1:4173/login');
  await expect(other.getByLabel('Authenticator or recovery code', { exact: true })).toHaveCount(0);
  await other.getByRole('button', { name: 'Only essential', exact: true }).click();
  await other.getByLabel('Email address', { exact: true }).fill(f.client.email);
  await other.getByLabel('Password', { exact: true }).fill(f.client.password);
  await other.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(other.getByRole('heading', { name: 'Verify your sign-in.' })).toBeVisible();
  await expect(other.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(other.getByRole('alert')).toHaveCount(0);
  await other.getByLabel('Authenticator or recovery code', { exact: true }).fill(codes[0]);
  await other.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
  await expect(other).toHaveURL(/\/dashboard/);
  await context.close();
});
test('administrator creates a named artist and reviews reports, operations, permissions and privacy on mobile', async ({
  page,
}) => {
  const admin = (await f.admin.get('/api/auth/me')).body.user;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(admin.email);
  await page.getByLabel('Password', { exact: true }).fill(f.client.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin/);
  await page.goto('/admin?tab=users');
  await page.locator('.workspace-main summary').filter({ hasText: 'Create an account' }).click();
  await page.getByLabel('New account role', { exact: true }).selectOption('artist');
  await page.getByLabel('Full name', { exact: true }).fill('Maya Chen');
  await page
    .getByLabel('Email address', { exact: true })
    .fill('browser-maya-' + crypto.randomUUID() + '@venue.test');
  await page.getByLabel('Initial password', { exact: true }).fill('BrowserEnterprisePassword42!');
  await page.getByLabel('New studio name', { exact: true }).fill('Northside Ink');
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/admin/users') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  f.users.push((await response.json()).user.id);
  await expect(page.getByRole('status').filter({ hasText: 'Created Maya Chen' })).toBeVisible();
  for (const tab of ['artists', 'operations', 'reports', 'privacy', 'access', 'security']) {
    await page.goto('/admin?tab=' + tab);
    await expect(page.locator('.workspace-card').first()).toBeVisible();
    await expect(
      page.getByText('The server could not complete this request.', { exact: false }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      tab,
    ).toBe(true);
  }
  await page.screenshot({ path: 'artifacts/qa/enterprise-admin-mobile.png', fullPage: true });
});
test('account recovery page requests a reset without exposing whether the email exists', async ({
  page,
}) => {
  await page.goto('/account-access');
  await page.getByLabel('Email address', { exact: true }).fill('unknown-browser@venue.test');
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('If your account is eligible');
});
