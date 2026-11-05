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
test.beforeEach(async ({ page }) => {
  await page.route('https://embed.tawk.to/**', (route) => route.abort());
});
test('artist saves service, theme and availability through the workspace', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(f.artist.email);
  await page.getByLabel('Password', { exact: true }).fill(f.artist.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/dashboard?tab=services');
  await page.getByRole('button', { name: /QA Consultation/ }).click();
  await page.getByLabel('Service name', { exact: true }).fill('Consultation with the artist');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: /Consultation with the artist/ })).toBeVisible();
  expect(
    (await f.artist.agent.get('/api/workspace/services')).body.services.find(
      (s) => s.id === f.service.id,
    ).name,
  ).toBe('Consultation with the artist');
  await page.goto('/dashboard?tab=profile');
  const card = page
    .locator('.workspace-card')
    .filter({ has: page.getByRole('heading', { name: 'Your artist page.', exact: true }) });
  await card.getByLabel('Page theme', { exact: true }).selectOption('ink');
  await card.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const profile = (await f.artist.agent.get('/api/profile')).body.profile;
  expect(profile.theme).toBe('ink');
  await page.goto('/artists/' + profile.slug);
  await expect(page.locator('.artist-profile-page')).toHaveClass(/theme-ink/);
  await page.goto('/dashboard?tab=availability');
  await page.getByLabel('Monday opening', { exact: true }).fill('11:00');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  expect(
    (await f.artist.agent.get('/api/profile')).body.availability.find((h) => h.weekday === 1)
      .start_time,
  ).toBe('11:00:00');
});
test('touch controls produce visible feedback with full motion enabled', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'chromium', 'Touch device interaction runs once.');
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.locator('.scroll-story').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '02 / THE SPACE' }).tap();
  await expect(page.locator('.story-drag-card h3').last()).toHaveText('Find your moment.');
  await page.getByRole('button', { name: '03 / THE CONNECTION' }).tap();
  await expect(page.locator('.touch-ink-ring').first()).toBeAttached();
  await expect(page.locator('.story-drag-card h3').last()).toHaveText('Make it personal.');
  await context.close();
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
test('keyboard navigation opens menus and returns focus after booking', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  const menu = page.getByRole('button', { name: 'The good stuff', exact: true });
  await menu.focus();
  await page.keyboard.press('Space');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  const booking = page.getByRole('button', { name: 'Book your next piece', exact: true });
  await booking.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(booking).toBeFocused();
});
test('registration, password changes and support replies persist in the account', async ({
  page,
}, info) => {
  const email = 'qa-browser-' + crypto.randomUUID() + '@venue.test';
  const password = 'BrowserPassword42!';
  await page.goto('/register');
  await page.getByLabel('Your name', { exact: true }).fill('QA Browser client');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('I’m here as', { exact: true }).selectOption('client');
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/auth/register') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create my account', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  f.users.push((await response.json()).user.id);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/dashboard?tab=profile');
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByLabel('New password', { exact: true }).fill(password + 'New');
  const changed = page.waitForResponse(
    (r) => r.url().endsWith('/api/auth/password') && r.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  expect((await changed).status()).toBe(200);
  await page.goto('/contact');
  await page.getByLabel('What’s on your mind?', { exact: true }).selectOption('Account support');
  await page
    .getByLabel('Your message', { exact: true })
    .fill('Please help me organize my account settings for ' + info.project.name + '.');
  const support = page.waitForResponse(
    (r) => r.url().endsWith('/api/contact') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Send my message', exact: true }).click();
  const saved = await support;
  expect(saved.status()).toBe(201);
  const record = (await saved.json()).request;
  f.supportRefs.push(record.reference);
  await expect(page.getByText('We have your message.', { exact: true })).toBeVisible();
  expect(
    (
      await f
        .mutation(f.admin.patch('/api/admin/support/' + record.id))
        .send({ status: 'resolved', reply: 'Your account is ready to use.' })
    ).status,
  ).toBe(200);
  await page.goto('/dashboard?tab=support');
  await page.locator('summary').filter({ hasText: record.reference }).click();
  await expect(page.getByText('Your account is ready to use.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password + 'New');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
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
    await expect
      .poll(
        async () => {
          await page.evaluate(async () => {
            await Promise.all(
              [...document.images].map((img) => {
                img.loading = 'eager';
                return img.decode().catch(() => {});
              }),
            );
          });
          return await page
            .locator('img')
            .evaluateAll((images) =>
              images
                .filter(
                  (i) =>
                    !(i as HTMLImageElement).naturalWidth ||
                    (i as HTMLImageElement).currentSrc.endsWith('/image-fallback.svg'),
                )
                .map((i) => (i as HTMLImageElement).src),
            );
        },
        { message: route, timeout: 15000 },
      )
      .toEqual([]);
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
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
  await page.locator('.scroll-story').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '02 / THE SPACE' }).click();
  await expect(page.locator('.story-drag-card h3').last()).toHaveText('Find your moment.');
  await expect(page.locator('.story-drag-card')).toHaveCount(1);
  await page.locator('.story-drag-card').scrollIntoViewIfNeeded();
  const card = await page.locator('.story-drag-card').boundingBox();
  if (!card) throw new Error('Story card missing');
  await page.mouse.move(card.x + card.width * 0.7, card.y + card.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(card.x + card.width * 0.2, card.y + card.height * 0.5, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.story-drag-card h3').last()).toHaveText('Make it personal.');
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
  await page.goto('/booking?service=' + f.service.id);
  await page.getByRole('button', { name: 'Start my booking' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Service', { exact: true })).toHaveValue(f.service.id);
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
      const labels: Record<string, string> = {
        overview: 'Platform overview',
        bookings: 'All bookings & messages',
        calendar: 'Booking calendar',
        payments: 'Payment verification',
        profile: 'My account',
        services: 'Services',
        team: 'Teams & invitations',
        events: 'Events',
        users: 'Accounts & access',
        inbox: 'Support inbox',
        journal: 'Journal',
        settings: 'Site settings',
        audit: 'Activity log',
      };
      await page
        .getByRole('navigation', { name: 'Workspace navigation' })
        .getByRole('button', { name: labels[tab], exact: true })
        .click();
      await expect(page.locator('.workspace-main h1')).toBeVisible();
      await expect(page.locator('.workspace-card').first()).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        tab + ' at ' + width,
      ).toBe(true);
    }
    if (width !== 320) {
      await page
        .getByRole('navigation', { name: 'Workspace navigation' })
        .getByRole('button', { name: 'Platform overview', exact: true })
        .click();
      await page.screenshot({
        path: 'artifacts/qa/admin-' + width + '-' + info.project.name + '.png',
        fullPage: true,
      });
    }
  }
});
