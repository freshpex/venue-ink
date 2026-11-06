import { test, expect } from '@playwright/test';
import { fixture } from '../helpers/platform.mjs';
let f: Awaited<ReturnType<typeof fixture>>;
let artist: { id: string; email: string }, managed: { id: string; email: string };
test.beforeAll(async () => {
  f = await fixture();
  async function create(name: string) {
    const result = await f.mutation(f.admin.post('/api/admin/users')).send({
      name,
      email: 'artist-browser-' + crypto.randomUUID() + '@venue.test',
      password: f.client.password,
      role: 'artist',
      studioId: f.studio.id,
    });
    expect(result.status).toBe(201);
    f.users.push(result.body.user.id);
    return result.body.user;
  }
  artist = await create('Dahlia Morgan');
  managed = await create('Avery Stone');
});
test.afterAll(async () => {
  await f?.cleanup();
});
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': '192.0.2.40' });
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
});
async function signIn(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(f.client.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|admin)/);
}
test('joined artist creates personal services, uploads a photo, publishes hours and receives a client booking', async ({
  page,
}) => {
  await signIn(page, artist.email);
  await expect(
    page.getByRole('heading', { name: 'Your work. Your clients. Your books.' }),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/qa/artist-workspace-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
  await page.screenshot({ path: 'artifacts/qa/artist-workspace-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Services', exact: true }).click();
  await expect(page.getByLabel('Studio', { exact: true })).toHaveValue(f.studio.id);
  await expect(page.getByLabel('Artist offering this service', { exact: true })).toHaveValue(
    artist.id,
  );
  await page.getByLabel('Service name', { exact: true }).fill('Dahlia fine-line consultation');
  await page.getByLabel('Duration in minutes', { exact: true }).fill('60');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: /Dahlia fine-line consultation/ })).toBeVisible();
  const offered = (
    await f.pool.query('SELECT id FROM venue_app.services WHERE artist_id=$1', [artist.id])
  ).rows;
  expect(offered).toHaveLength(1);
  await page.goto('/dashboard?tab=profile');
  await page
    .getByLabel('Profile photograph for Dahlia Morgan', { exact: true })
    .setInputFiles('public/images/tools-workstation-640.webp');
  await expect(page.locator('.profile-photo-editor img')).toHaveCount(1);
  const profileCard = page
    .locator('.workspace-card')
    .filter({ has: page.getByRole('heading', { name: 'Your artist page.', exact: true }) });
  await profileCard.getByLabel('Publish my artist page', { exact: true }).check();
  await profileCard.getByLabel('Open for booking requests', { exact: true }).check();
  await profileCard.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect
    .poll(async () => {
      const row = (
        await f.pool.query(
          'SELECT published,books_open FROM venue_app.artist_profiles WHERE user_id=$1',
          [artist.id],
        )
      ).rows[0];
      return row.published && row.books_open;
    })
    .toBe(true);
  await page.goto('/dashboard?tab=availability');
  const day = new Date(f.bookingInput.startsAt).getUTCDay();
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    day
  ];
  await page.getByLabel(dayName, { exact: true }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        (
          await f.pool.query(
            'SELECT count(*) FROM venue_app.availability WHERE artist_id=$1 AND weekday=$2',
            [artist.id, day],
          )
        ).rows[0].count,
      ),
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, f.client.email);
  await page.goto('/booking?artist=' + artist.id + '&service=' + offered[0].id);
  await page.getByRole('button', { name: 'Start my booking' }).click();
  const dialog = page.getByRole('dialog');
  const artistCard = dialog.getByRole('button', { name: /Dahlia Morgan/ });
  await expect(artistCard.getByRole('img', { name: 'Dahlia Morgan profile photo' })).toBeVisible();
  await artistCard.click();
  await expect(dialog.getByLabel('Service', { exact: true })).toHaveValue(offered[0].id);
  await expect(dialog.getByLabel('Service', { exact: true }).locator('option')).toHaveText([
    'Dahlia fine-line consultation · 60 min',
  ]);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByLabel('Artwork or request title').fill('Personal botanical consultation');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByLabel('Preferred date').fill(f.bookingInput.startsAt.slice(0, 10));
  await expect(dialog.locator('.appointment-slots button').first()).toBeVisible();
  await dialog.locator('.appointment-slots button').first().click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Send booking request', exact: true }).click();
  await expect(dialog.getByText('Request received.', { exact: true })).toBeVisible();
  await dialog.getByRole('link', { name: 'View my booking' }).click();
  await expect(page.locator('.booking-detail-page .workspace-title p')).toContainText(
    'Dahlia Morgan',
  );
  const bookingPath = new URL(page.url()).pathname;
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, artist.email);
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await expect(page.getByText(f.client.email, { exact: false })).toBeVisible();
  await page.goto(bookingPath);
  const review = page
    .locator('.workspace-card')
    .filter({ has: page.getByRole('heading', { name: 'Review the request.', exact: true }) });
  await expect(review).toBeVisible();
  await review
    .getByLabel('Agreed quote in USD (empty if not yet quoted)', { exact: true })
    .fill('200');
  await review.getByLabel('Deposit in USD', { exact: true }).fill('50');
  await review.getByLabel('Booking status', { exact: true }).selectOption('confirmed');
  await review.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect
    .poll(async () => {
      const row = (
        await f.pool.query(
          'SELECT status,quote_cents,deposit_cents FROM venue_app.bookings WHERE id=$1',
          [bookingPath.split('/').pop()],
        )
      ).rows[0];
      return row;
    })
    .toEqual({ status: 'confirmed', quote_cents: 20000, deposit_cents: 5000 });
  await page.screenshot({ path: 'artifacts/qa/artist-service-booking.png', fullPage: true });
});
test('administrator edits an artist, manages their services and hours, uploads artist and studio photos, and deletes an unused artist', async ({
  page,
}) => {
  const admin = (await f.admin.get('/api/auth/me')).body.user;
  await signIn(page, admin.email);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin?tab=artists');
  await page.getByLabel('Search artists').fill('Avery Stone');
  const card = page
    .locator('.artist-management-card')
    .filter({ has: page.locator('summary strong').filter({ hasText: 'Avery Stone' }) });
  await card.locator('summary').click();
  await card.getByLabel('Public artist name', { exact: true }).fill('Avery Stone Updated');
  await card
    .getByLabel('Artist biography', { exact: true })
    .fill('Custom fine-line and botanical artwork.');
  await card.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(card.locator('summary')).toContainText('Avery Stone Updated');
  await card
    .getByLabel('Profile photograph for Avery Stone Updated', { exact: true })
    .setInputFiles('public/images/tools-workstation-640.webp');
  await expect(card.locator('.profile-photo-editor img')).toHaveCount(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: 'artifacts/qa/admin-artist-editor-mobile.png', fullPage: true });
  await card.getByRole('button', { name: 'Services', exact: true }).click();
  await card.getByLabel('Service name', { exact: true }).fill('Avery design session');
  await card.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(card.getByRole('button', { name: /Avery design session/ })).toBeVisible();
  await card.getByRole('button', { name: 'Working hours', exact: true }).click();
  await card.getByLabel('Monday', { exact: true }).check();
  await card.getByLabel('Monday opening', { exact: true }).fill('11:00');
  await card.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        (
          await f.pool.query(
            'SELECT count(*) FROM venue_app.availability WHERE artist_id=$1 AND weekday=1',
            [managed.id],
          )
        ).rows[0].count,
      ),
    )
    .toBe(1);
  await page.goto('/admin?tab=studio');
  await page
    .getByLabel('Profile photograph for ' + f.studio.name, { exact: true })
    .setInputFiles('public/images/tools-workstation-640.webp');
  await expect
    .poll(
      async () =>
        !!(await f.pool.query('SELECT image_url FROM venue_app.studios WHERE id=$1', [f.studio.id]))
          .rows[0].image_url,
    )
    .toBe(true);
  await page.goto('/studio/' + f.studio.slug);
  await expect(page.getByRole('img', { name: f.studio.name + ' studio photograph' })).toBeVisible();
  await page.goto('/admin?tab=artists');
  await page.getByLabel('Search artists').fill('Avery Stone Updated');
  await card.locator('summary').click();
  await card.getByRole('button', { name: 'Delete artist', exact: true }).click();
  await card.getByRole('button', { name: 'Confirm delete artist', exact: true }).click();
  await expect(card).toHaveCount(0);
  expect(
    (await f.pool.query('SELECT active FROM venue_app.users WHERE id=$1', [managed.id])).rows[0]
      .active,
  ).toBe(false);
  await page.screenshot({ path: 'artifacts/qa/admin-artists-mobile.png', fullPage: true });
});
