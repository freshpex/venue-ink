import { test, expect } from '@playwright/test';
import { fixture } from '../helpers/platform.mjs';
let f: Awaited<ReturnType<typeof fixture>>;
test.beforeAll(async () => {
  f = await fixture();
});
test.afterAll(async () => {
  await f?.cleanup();
});

test('loads essential chat before acknowledgement and keeps it locked on', async ({ page }) => {
  let chatRequests = 0;
  await page.route('https://embed.tawk.to/**', (route) => {
    chatRequests++;
    return route.fulfill({ contentType: 'application/javascript', body: '' });
  });
  await page.goto('/login');
  await expect.poll(() => chatRequests).toBe(1);
  await page.getByRole('button', { name: 'Accept essential cookies', exact: true }).click();
  await page.getByRole('button', { name: 'Cookie settings', exact: true }).click();
  await expect(page.getByLabel('Essential cookies, always on')).toBeChecked();
  await expect(page.getByLabel('Essential cookies, always on')).toBeDisabled();
  await expect(page.getByLabel('Essential live chat cookies, always on')).toBeChecked();
  await expect(page.getByLabel('Essential live chat cookies, always on')).toBeDisabled();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  await expect.poll(() => chatRequests).toBe(2);
  await expect(page.getByRole('region', { name: 'Cookie choices' })).toHaveCount(0);
});

test('starts essential chat even when an old preference disabled it', async ({ page }) => {
  let chatRequests = 0;
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'venue-cookie-consent',
        JSON.stringify({ version: 1, chat: false, savedAt: Date.now() }),
      );
    } catch {
      /* Opaque frames cannot store preferences. */
    }
  });
  await page.route('https://embed.tawk.to/**', (route) => {
    chatRequests++;
    return route.fulfill({ contentType: 'application/javascript', body: '' });
  });
  await page.goto('/');
  await expect.poll(() => chatRequests).toBe(1);
  await page.getByRole('button', { name: 'Cookie details', exact: true }).click();
  await expect(page.getByLabel('Essential live chat cookies, always on')).toBeChecked();
  await expect(page.getByLabel('Essential live chat cookies, always on')).toBeDisabled();
});

test('does not reveal verification for an incorrect password', async ({ page }) => {
  await page.route('https://embed.tawk.to/**', (route) => route.abort());
  await page.goto('/login');
  await page.getByRole('button', { name: 'Accept essential cookies', exact: true }).click();
  await expect(page.getByLabel('Authenticator or recovery code', { exact: true })).toHaveCount(0);
  await page.getByLabel('Email address', { exact: true }).fill(f.artist.email);
  await page.getByLabel('Password', { exact: true }).fill('IncorrectPassword!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('email or password is incorrect');
  await expect(page.getByLabel('Authenticator or recovery code', { exact: true })).toHaveCount(0);
});
