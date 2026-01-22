// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests', // Relative to client/playwright.config.js
    timeout: 60000,
    expect: {
        timeout: 10000
    },
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'npm run dev', // Running inside client
        port: 5173,
        timeout: 120 * 1000,
        reuseExistingServer: !process.env.CI,
    },
});
