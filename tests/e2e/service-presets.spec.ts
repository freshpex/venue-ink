import { test, expect } from '@playwright/test';
import { fixture } from '../helpers/platform.mjs';

let f: Awaited<ReturnType<typeof fixture>>, artistName: string;
test.beforeAll(async () => {
  f = await fixture();
  artistName = (await f.artist.agent.get('/api/profile')).body.profile.display_name;
  const teammate = await f.mutation(f.admin.post('/api/admin/users')).send({
    name: 'Earlier Studio Artist',
    email: 'earlier-' + crypto.randomUUID() + '@venue.test',
    password: f.client.password,
    role: 'artist',
    studioId: f.studio.id,
  });
  expect(teammate.status).toBe(201);
  f.users.push(teammate.body.user.id);
  expect(
    (
      await f.mutation(f.admin.patch('/api/admin/artists/' + teammate.body.user.id)).send({
        displayName: 'Earlier Studio Artist',
        published: true,
        booksOpen: true,
      })
    ).status,
  ).toBe(200);
  await f.pool.query(
    "UPDATE venue_app.artist_profiles SET created_at=(SELECT created_at FROM venue_app.artist_profiles WHERE user_id=$2)-interval '1 minute' WHERE user_id=$1",
    [teammate.body.user.id, f.artist.user.id],
  );
});
test.afterAll(async () => {
  await f?.cleanup();
});

test('administrator bulk-fills an artist menu, saves studio defaults and client pays by email for a generated service', async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': '192.0.2.51' });
  await page.addInitScript(() =>
    localStorage.setItem(
      'venue-cookie-consent',
      JSON.stringify({ version: 2, chat: true, savedAt: Date.now() }),
    ),
  );
  await page.route('https://embed.tawk.to/**', (route) => route.abort());
  const admin = (await f.admin.get('/api/auth/me')).body.user;
  async function login(email: string) {
    await page.goto('/login');
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(f.client.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/(admin|dashboard)/);
  }
  await login(admin.email);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin?tab=artists');
  await page.getByLabel('Search artists').fill(f.artist.email);
  const card = page.locator('.artist-management-card').filter({ hasText: artistName });
  await card.locator('summary').first().click();
  await card.getByRole('button', { name: 'Services', exact: true }).click();
  await card.getByRole('button', { name: 'Auto-fill standard services', exact: true }).click();
  const preview = card.locator('.service-presets');
  await expect(preview.getByRole('status')).toHaveText('16 services selected');
  const line = preview.locator('.preset-row').filter({
    has: page.getByRole('checkbox', { name: 'Include Small fine-line tattoo', exact: true }),
  });
  await line.getByText('Edit details', { exact: true }).click();
  await line.getByLabel('Price for small-fine-line', { exact: true }).fill('175');
  await line
    .getByLabel('Description for small-fine-line', { exact: true })
    .fill('Our studio’s standard small fine-line appointment.');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  await page.screenshot({ path: 'artifacts/qa/standard-services-mobile.png', fullPage: true });
  await preview.getByRole('button', { name: 'Save as studio standard', exact: true }).click();
  await expect(preview.getByText(/Saved studio standard/)).toBeVisible();
  await preview
    .getByRole('checkbox', { name: 'Include Tattoo removal consultation', exact: true })
    .uncheck();
  await preview.getByRole('button', { name: 'Add 15 selected services', exact: true }).click();
  await expect(preview).toHaveCount(0);
  const rows = (
    await f.pool.query(
      'SELECT id,name,price_cents,deposit_cents FROM venue_app.services WHERE artist_id=$1 AND preset_key IS NOT NULL',
      [f.artist.user.id],
    )
  ).rows;
  expect(rows).toHaveLength(15);
  const service = rows.find((s: { name: string }) => s.name === 'Small fine-line tattoo');
  expect(service).toMatchObject({ price_cents: 17500, deposit_cents: 5000 });
  await card.getByRole('button', { name: 'Auto-fill standard services', exact: true }).click();
  await expect(preview.getByRole('status')).toHaveText('1 service selected');
  await expect(
    preview.getByRole('checkbox', { name: 'Include Small fine-line tattoo', exact: true }),
  ).toBeDisabled();
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login(f.client.email);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/booking?service=' + service.id);
  await page.getByRole('button', { name: 'Start my booking' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: new RegExp(artistName) })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.getByLabel('Service', { exact: true })).toHaveValue(service.id);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByLabel('Artwork or request title').fill('Small botanical tattoo');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByLabel('Preferred date').fill(f.bookingInput.startsAt.slice(0, 10));
  await dialog.locator('.appointment-slots button').first().click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Send booking request', exact: true }).click();
  await dialog.getByRole('link', { name: 'View my booking' }).click();
  await page.getByLabel('Payment method', { exact: true }).selectOption('Bank Transfer');
  await page.getByLabel('Payment purpose', { exact: true }).selectOption('deposit');
  await page.getByRole('button', { name: 'Proceed to payment', exact: true }).click();
  const email = page.getByRole('link', { name: 'Open my email', exact: true });
  await expect(email).toBeVisible();
  const url = new URL((await email.getAttribute('href'))!);
  expect(url.pathname).toBe('carlytatts@gmail.com');
  expect(url.searchParams.get('body')).toContain('Service: Small fine-line tattoo');
  expect(url.searchParams.get('body')).toContain('Amount: 50.00 USD');
  expect(url.searchParams.get('body')).toContain('Payment method: Bank Transfer');
  expect(url.searchParams.get('body')).toContain('Artist: ' + artistName);
});
