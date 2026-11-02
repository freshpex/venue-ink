import { test, expect } from '@playwright/test';
import { fixture } from '../helpers/platform.mjs';
import { mkdirSync } from 'node:fs';
let f: Awaited<ReturnType<typeof fixture>>;
test.beforeAll(async () => {
  f = await fixture();
});
test.afterAll(async () => {
  await f?.cleanup();
});
const routes = [
  '/',
  '/for-tattoo-artists',
  '/studios',
  '/features',
  '/booking',
  '/artists',
  '/flash',
  '/artist-websites',
  '/payments',
  '/pricing',
  '/info/mobile-app',
  '/services',
  '/about',
  '/events',
  '/journal',
  '/help',
  '/contact',
  '/get-started',
  '/credits',
  '/login',
  '/register',
  '/journal/prepare-for-your-tattoo-consultation',
  '/terms',
  '/privacy',
  '/booking-terms',
  '/unknown-page',
];
test('all public routes load, images resolve and old destinations are absent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map((img) => {
          img.loading = 'eager';
          return img.decode().catch(() => {});
        }),
      );
    });
    expect(
      await page
        .locator('img')
        .evaluateAll((images) =>
          images
            .filter(
              (i) =>
                !(i as HTMLImageElement).naturalWidth ||
                (i as HTMLImageElement).currentSrc.endsWith('/image-fallback.svg'),
            )
            .map((i) => (i as HTMLImageElement).src),
        ),
      route,
    ).toEqual([]);
    expect(await page.locator('a[href*="venue.ink"]').count()).toBe(0);
    expect(await page.locator('main').innerText()).not.toMatch(
      /\b(dummy|mock|example|draft|demo|fake|preview)\b/i,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      route,
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
test('mobile layouts, navigation and touch/drag motion remain usable', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Viewport matrix runs once.');
  for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of [
      '/',
      '/pricing',
      '/booking',
      '/flash',
      '/contact',
      '/get-started',
      '/login',
    ]) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        route + ' at ' + width,
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.scroll-story').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '02 / THE SPACE' }).click();
  await expect(page.locator('.story-drag-card h3')).toHaveText('Find your moment.');
  const card = await page.locator('.story-drag-card').boundingBox();
  if (!card) throw new Error('Story card missing');
  await page.mouse.move(card.x + card.width * 0.7, card.y + card.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(card.x + card.width * 0.2, card.y + card.height * 0.5, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.story-drag-card h3')).toHaveText('Make it personal.');
});
test('client signs in, submits a real booking, messages the artist and prepares payment email', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(f.client.email);
  await page.getByLabel('Password', { exact: true }).fill(f.client.password);
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/booking');
  await page.getByRole('button', { name: 'Start my booking' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: new RegExp('QA Artist') }).click();
  await dialog.getByLabel('Service', { exact: true }).selectOption(f.service.id);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByLabel('Artwork or request title').fill('Linework for ' + info.project.name);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByLabel('Preferred date').fill(f.bookingInput.startsAt.slice(0, 10));
  await expect(dialog.locator('.appointment-slots button').first()).toBeVisible();
  await dialog.locator('.appointment-slots button').first().click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog.getByText(f.client.email, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Send booking request', exact: true }).click();
  await expect(dialog.getByText('Request received.', { exact: true })).toBeVisible();
  await dialog.getByRole('link', { name: 'View my booking' }).click();
  await expect(page).toHaveURL(/\/bookings\//);
  await page.getByLabel('Your message', { exact: true }).fill('Can we talk through the placement?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('.message-bubble').last()).toContainText('talk through the placement');
  await page.getByLabel('Payment method', { exact: true }).selectOption('PayPal');
  await page.getByRole('button', { name: 'Continue by email', exact: true }).click();
  const email = page.getByRole('link', { name: 'Open my email', exact: true });
  await expect(email).toHaveAttribute('href', /^mailto:payment@venue.com\?/);
  const href = await email.getAttribute('href');
  expect(decodeURIComponent(href || '')).toContain('Payment method: PayPal');
  expect(decodeURIComponent(href || '')).toContain('Linework for ' + info.project.name);
  await expect(page.getByText('Your payment enquiry is ready.', { exact: true })).toBeVisible();
  mkdirSync('artifacts/qa', { recursive: true });
  await page.screenshot({
    path: 'artifacts/qa/booking-' + info.project.name + '.png',
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator('.message-bubble').last()).toContainText('talk through the placement');
  expect(errors).toEqual([]);
});
test('administrator controls and mobile workspace render actual records', async ({
  page,
}, info) => {
  const admin = (await f.admin.get('/api/auth/me')).body.user;
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(admin.email);
  await page.getByLabel('Password', { exact: true }).fill(f.client.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin/);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of [
      'overview',
      'bookings',
      'calendar',
      'payments',
      'profile',
      'services',
      'team',
      'events',
      'users',
      'inbox',
      'journal',
      'settings',
      'audit',
    ]) {
      await page.goto('/admin?tab=' + tab);
      await expect(page.locator('.workspace-main h1')).toBeVisible();
      await expect(page.locator('.workspace-card').first()).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        tab + ' at ' + width,
      ).toBe(true);
    }
    if (width !== 320) {
      await page.goto('/admin');
      await page.screenshot({
        path: 'artifacts/qa/admin-' + width + '-' + info.project.name + '.png',
        fullPage: true,
      });
    }
  }
});
