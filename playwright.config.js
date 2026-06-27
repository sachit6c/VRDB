// playwright.config.js — e2e tests for VRDB.
// Network to TMDB/Supabase is intercepted in the specs, so the suite runs
// offline. A local static server serves the app (same as `npm start`).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
  },
  webServer: {
    command: 'npx serve . -l 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
