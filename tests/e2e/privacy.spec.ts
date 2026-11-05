import { test, expect } from '@playwright/test';
import { fixture } from '../helpers/platform.mjs';
let f: Awaited<ReturnType<typeof fixture>>;
test.beforeAll(async () => {
  f = await fixture();
});
test.afterAll(async () => {
  await f?.cleanup();
});

test('essential-only consent keeps optional chat off and permits first-party sign-in', async ({
  page,
}) => {
  const chatRequests: string[] = [];
  await page.route('https://embed.tawk.to/**', (route) => {
    chatRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto('/login');
  await expect(page.getByLabel('Authenticator or recovery code', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Only essential', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Cookie choices' })).toHaveCount(0);
  await page.getByLabel('Email address', { exact: true }).fill(f.artist.email);
  await page.getByLabel('Password', { exact: true }).fill(f.artist.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const cookie = (await page.context().cookies()).find((cookie) => cookie.name === 'venue_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(new URL('http://' + cookie?.domain).hostname).toBe('127.0.0.1');
  await page.reload();
  await expect(page.locator('.workspace-shell')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cookie choices' })).toHaveCount(0);
  expect(chatRequests).toEqual([]);
  await page.getByRole('button', { name: 'Cookie settings', exact: true }).click();
  await expect(page.getByLabel('Essential cookies, always on')).toBeChecked();
  await expect(page.getByLabel('Essential cookies, always on')).toBeDisabled();
  await expect(page.getByLabel('Optional live chat cookies')).not.toBeChecked();
});

test('starts chat only after consent and stops loading it after withdrawal', async ({ page }) => {
  let chatRequests = 0;
  await page.route('https://embed.tawk.to/**', (route) => {
    chatRequests++;
    return route.fulfill({ contentType: 'application/javascript', body: '' });
  });
  await page.goto('/');
  expect(chatRequests).toBe(0);
  await page.getByRole('button', { name: 'Manage preferences', exact: true }).click();
  await page.getByLabel('Optional live chat cookies').check();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect.poll(() => chatRequests).toBe(1);
  await page.getByRole('button', { name: 'Cookie settings', exact: true }).click();
  const reloaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Only essential', exact: true }).click();
  await reloaded;
  await expect(page.getByRole('button', { name: 'Cookie settings', exact: true })).toBeVisible();
  expect(chatRequests).toBe(1);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('venue-cookie-consent') || '{}').chat,
    ),
  ).toBe(false);
});

test('does not reveal verification for an incorrect password', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Only essential', exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill(f.artist.email);
  await page.getByLabel('Password', { exact: true }).fill('IncorrectPassword!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('email or password is incorrect');
  await expect(page.getByLabel('Authenticator or recovery code', { exact: true })).toHaveCount(0);
});
