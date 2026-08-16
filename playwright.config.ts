import { defineConfig, devices } from '@playwright/test';

/**
 * Chromium-only end-to-end configuration.
 *
 * The plan calls for Chromium, Firefox, and WebKit. Only Chromium runs here,
 * because only Chromium's build is present in the local Playwright cache and
 * the point of this suite is the one gap unit tests cannot reach: real canvas
 * rasterisation. `pdfToImages` and everything built on it — compression, crop
 * previews, thumbnails — are covered under jsdom only at the level of their
 * sizing rules, never their pixels. Chromium exercises the actual code path.
 * Firefox and WebKit remain outstanding and are tracked in TASKS.md.
 *
 * Tests run against the dev server so specs can reach engine modules directly
 * through the harness page. The production bundle is verified separately by
 * serving `dist/` from a Pages-style subpath.
 */

const PORT = 5173;
const HOST = `http://localhost:${PORT}/`;

/**
 * Point the suite at an already-running deployment instead of a local dev
 * server, which is how the published GitHub Pages site is accepted:
 *
 *   PLAYWRIGHT_BASE_URL=https://<user>.github.io/pdf-toolkit/ npm run test:e2e
 *
 * Only `workflows.spec.ts` can run that way. The rasterisation specs need the
 * dev-only harness page, which no production build contains.
 */
const DEPLOYED = process.env.PLAYWRIGHT_BASE_URL;
const BASE_URL = DEPLOYED ?? HOST;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A stray `test.only` must fail the pipeline rather than silently shrink it.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  // Rasterising every page of a document is slower than a typical DOM test.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // No `channel`, so this uses Playwright's own Chromium build rather than
      // requiring a Google Chrome installation.
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Testing a deployment means testing what is already serving; starting a
  // local server as well would only hide which one the assertions ran against.
  webServer: DEPLOYED
    ? undefined
    : {
        command: 'npm run dev',
        url: HOST,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
