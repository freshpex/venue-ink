import { test, expect } from '@playwright/test';
test('normal motion leaves booking and product controls usable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Normal-motion smoke check runs once.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.locator('.hero-buttons .play-link').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close booking example' }).click();
  await page.locator('.studio-demo').scrollIntoViewIfNeeded();
  await page.getByLabel('Filter calendar by artist').selectOption('River');
  await expect(page.getByLabel('Filter calendar by artist')).toHaveValue('River');
});
const routes = [
  '/',
  '/for-tattoo-artists',
  '/studios',
  '/features',
  '/booking',
  '/flash',
  '/artist-websites',
  '/payments',
  '/pricing',
  '/info/mobile-app',
  '/services',
  '/about',
  '/journal',
  '/help',
  '/contact',
  '/get-started',
  '/demo',
  '/credits',
  '/workspace/login',
  '/workspace/register',
  '/journal/members-only-tattoo-supplies',
  '/unknown-page',
];
test('every public route renders without a runtime error or broken photograph', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map((image) => {
          image.loading = 'eager';
          return image.decode().catch(() => {});
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
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      route,
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
test('responsive home, pricing, gallery and booking fit all requested widths', async ({ page }) => {
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/pricing', '/flash', '/demo']) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        `${route} at ${width}`,
      ).toBe(true);
    }
  }
});
test('booking walkthrough creates a local request and artist can approve it', async ({ page }) => {
  await page.goto('/demo');
  await page.evaluate(() => localStorage.removeItem('venue-example-workspace-v1'));
  await page.reload();
  await page.getByRole('button', { name: 'Create an example booking' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByLabel('Creative notes').fill('A fictional botanical study');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('button', { name: '13', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByLabel('I understand this is a local example').check();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByText('One last look.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Create example request' }).click();
  await expect(dialog.getByText('Request saved in this browser.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Back to exploring' }).click();
  await page
    .getByRole('button', { name: 'Requests', exact: false })
    .filter({ has: page.locator('svg') })
    .first()
    .click();
  await page.getByRole('button', { name: 'Approve Custom artwork', exact: true }).click();
  await expect(
    page.locator('.request-row').filter({ hasText: 'Custom artwork' }).getByText('Approved'),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^Requests/ }).click();
  await expect(
    page.locator('.request-row').filter({ hasText: 'Custom artwork' }).getByText('Approved'),
  ).toBeVisible();
});
test('gallery filters, search, lightbox keyboard dismissal and theme selector work', async ({
  page,
}) => {
  await page.goto('/flash');
  await page.getByRole('button', { name: 'Botanical', exact: true }).click();
  await expect(page.locator('.gallery-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'View The botanical study' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Search gallery').fill('nothing-matches');
  await expect(page.getByText('No work in this corner yet.')).toBeVisible();
  await page.goto('/artist-websites');
  await page.getByRole('button', { name: 'Ink', exact: true }).click();
  await expect(page.locator('.artist-preview')).toHaveClass(/theme-ink/);
});
test('pricing calculator uses published rates and studio artist count', async ({ page }) => {
  await page.goto('/pricing');
  await page.getByLabel('Monthly card payment volume').fill('2000');
  await expect(page.locator('.cost-results')).toContainText('$200.00');
  await expect(page.locator('.cost-results')).toContainText('$150.00');
  await page.getByRole('button', { name: 'Studios', exact: true }).click();
  await page.getByLabel('Active artists').fill('7');
  await expect(page.locator('.cost-results')).toContainText('$320.00');
});
test('contact prepares a mail draft without claiming delivery', async ({ page }) => {
  await page.goto('/contact');
  await page.getByLabel('Your name', { exact: true }).fill('Example Artist');
  await page.getByLabel('Email address', { exact: true }).fill('artist@example.com');
  await page
    .getByLabel('A little about your question')
    .fill('I would like to learn about organizing my studio.');
  await page.getByRole('button', { name: 'Prepare my email' }).click();
  await expect(page.getByText('No message has been sent.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open in my email app' })).toHaveAttribute(
    'href',
    /^mailto:help@venue\.ink\?/,
  );
});
test('mobile menu traps focus, navigates, and returns to a closed state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('link', { name: 'Pricing', exact: true }).click();
  await expect(page.locator('main h1')).toHaveText('Good art. Clear pricing.');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
});
test('password control and Render cold start resume exactly one login', async ({ page }) => {
  let health = 0;
  let logins = 0;
  await page.route('**/api/health', async (route) => {
    health++;
    await route.fulfill({
      status: health === 1 ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify({ ready: health > 1 }),
    });
  });
  await page.route('**/api/auth/login', async (route) => {
    logins++;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'The email or password is incorrect.' }),
    });
  });
  await page.goto('/workspace/login');
  await page.getByLabel('Email address', { exact: true }).fill('artist@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-long-test-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await page.getByRole('button', { name: 'Sign in to preview workspace', exact: true }).click();
  await expect(page.getByText('Server is waking up. Connecting…', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('The email or password is incorrect.');
  expect(health).toBe(2);
  expect(logins).toBe(1);
});
