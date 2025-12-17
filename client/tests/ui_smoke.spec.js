
import { test, expect } from '@playwright/test';

// Pre-flight Smoke Test
// Usage: npx playwright test tests/ui_smoke.spec.js --headed --project=chromium

// Hardcoded Config (for now)
const BASE_URL = 'http://localhost:5173'; // Dev Client
const LOGIN = { email: 'admin@gravity.com', pass: 'password123' }; // Adjust if needed

test.describe('Pre-flight UI Smokes', () => {

    test.beforeEach(async ({ page }) => {
        // Monitor Console Errors
        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.log(`[BROWSER ERROR]: ${msg.text()}`);
            }
        });
        // Monitor Page Crashes
        page.on('pageerror', err => {
            console.log(`[PAGE CRASH]: ${err.message}`);
        });
    });

    test('01. Login Flow Sanity', async ({ page }) => {
        await page.goto(BASE_URL);

        // Check if we are at login or dashboard
        const url = page.url();
        console.log('Initial URL:', url);

        // Fill Login if needed
        if (await page.getByText('Invoice Studio Login').isVisible()) {
            console.log('Attempting Login...');
            await page.getByLabel('Email').fill(LOGIN.email);
            await page.getByLabel('Password').fill(LOGIN.pass);
            await page.getByRole('button', { name: 'Login' }).click();

            // Wait for Dashboard
            await expect(page.getByText('Dashboard')).toBeVisible({ timeout: 10000 });
            console.log('Login Successful - Dashboard Visible');
        } else {
            console.log('Already Logged In?');
        }
    });

    test('02. Navigation Walk', async ({ page }) => {
        // Assuming session persists or we relogin (Playwright isolated context usually resets, but let's see)
        // If isolate, we need to login again.

        await page.goto(BASE_URL);
        if (await page.getByText('Invoice Studio Login').isVisible()) {
            await page.getByLabel('Email').fill(LOGIN.email);
            await page.getByLabel('Password').fill(LOGIN.pass);
            await page.getByRole('button', { name: 'Login' }).click();
            await expect(page.getByText('Dashboard')).toBeVisible();
        }

        // List of Tabs to Visit
        // Using IDs or text derived from App.jsx TABS
        const tabs = [
            'Dashboard',
            'Reports V2',
            'Core V2',
            'Transactions',
            'System Health',
            'Configuration'
        ];

        for (const tab of tabs) {
            console.log(`Navigating to: ${tab}`);
            try {
                // Click Tab in Sidebar
                await page.getByRole('button', { name: tab }).click();

                // Wait for stable state (no spinning loaders if possible, or just wait a bit)
                await page.waitForTimeout(1000);

                // Check for Empty Root (Crash)
                const rootHtml = await page.locator('#root').innerHTML();
                if (!rootHtml || rootHtml.trim() === '') {
                    throw new Error(`CRASH: Empty #root on tab ${tab}`);
                }

                console.log(`[OK] Visited ${tab}`);
            } catch (err) {
                console.error(`[FAIL] Tab ${tab}: ${err.message}`);
                // Screenshot on failure
                await page.screenshot({ path: `debug/screenshots/fail_${tab.replace(' ', '_')}.png` });
                throw err;
            }
        }
    });
});
