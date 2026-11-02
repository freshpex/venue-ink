import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
test('capture every major layout for desktop and mobile visual inspection', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'Visual assets are captured once; functional journeys run on every engine.',
  );
  mkdirSync('artifacts/qa', { recursive: true });
  await page.route('https://embed.tawk.to/**', (route) => route.abort());
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    for (const route of [
      '/',
      '/for-tattoo-artists',
      '/studios',
      '/flash',
      '/artist-websites',
      '/pricing',
      '/journal',
      '/contact',
      '/booking',
      '/info/mobile-app',
    ]) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images].map((image) => {
            image.loading = 'eager';
            return image.decode().catch(() => {});
          }),
        );
      });
      const name = route === '/' ? 'home' : route.replaceAll('/', '-').slice(1);
      await page.screenshot({ path: `artifacts/qa/${name}-${width}.png` });
      if (route === '/')
        await page.screenshot({
          path: `artifacts/qa/home-${width}-full.png`,
          fullPage: true,
        });
    }
  }
});
