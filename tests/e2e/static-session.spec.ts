import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fixture } from '../helpers/platform.mjs';
import { forwardWithoutCookies } from '../helpers/cookieless-route';
let f: Awaited<ReturnType<typeof fixture>>;
test.beforeAll(async () => {
  f = await fixture();
  const asset = await f.mutation(f.client.agent.post('/api/assets')).send({
    filename: 'Private reference.webp',
    mimeType: 'image/webp',
    data: readFileSync('public/images/tools-workstation-640.webp').toString('base64'),
  });
  expect(asset.status).toBe(201);
});
test.afterAll(async () => {
  await f?.cleanup();
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});
test('stays on the static site and authenticates, reloads, and opens private images without any API cookie', async ({
  page,
  context,
  request,
}) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'venue-cookie-consent',
        JSON.stringify({ version: 2, chat: true, savedAt: Date.now() }),
      );
    } catch {
      /* Opaque frames cannot store preferences. */
    }
  });
  await page.route('https://embed.tawk.to/**', (route) => route.abort());
  await page.route('**/venue-config.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.__VENUE_CONFIG__={"apiBase":"http://localhost:4173"};',
    }),
  );
  await page.route('http://localhost:4173/api/**', async (route) => {
    await forwardWithoutCookies(route, request);
  });
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(f.client.email);
  await page.getByLabel('Password', { exact: true }).fill(f.client.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/dashboard');
  expect(
    (await context.cookies()).filter((cookie) => cookie.name === 'venue_session'),
  ).toHaveLength(0);
  expect(await page.evaluate(() => !!sessionStorage.getItem('venue-browser-session'))).toBe(true);
  await page.reload();
  await expect(page.locator('.workspace-shell')).toBeVisible();
  expect(
    (await context.cookies()).filter((cookie) => cookie.name === 'venue_session'),
  ).toHaveLength(0);
  await page.goto('/dashboard?tab=profile');
  const image = page.getByRole('img', { name: 'Private reference.webp', exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => sessionStorage.getItem('venue-browser-session'))).toBeNull();
});
