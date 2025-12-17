// client/tests/smoke.spec.js
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEBUG_DIR = path.resolve(__dirname, '../../debug/ui_smokes');

// Ensure debug dir exists
if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

// Fatal error patterns to fail the test
const FATAL_ERRORS = [
    'ReferenceError',
    'TypeError',
    'Uncaught',
    'invariant',
    'Failed to fetch', // Boot critical
    '401' // Unexpected 401
];

// Routes/Tabs to smoke test
// Selector: Text on the sidebar button
// Anchor: Selector that must appear on the destination
const ROUTES = [
    { label: 'Dashboard', anchor: 'text=Dashboard' }, // DashboardNew usually has a header
    { label: 'System Health', anchor: 'text=System Health' },
    { label: 'Reports V2', anchor: 'text=Reports' }, // Reports V2 usually has "Reports" or similar
    { label: 'Core V2', anchor: 'text=Core' },
    { label: 'Transactions', anchor: 'text=Transactions' },
    { label: 'Configuration', anchor: 'text=Configuration' },
];

test.describe('Frontend Smoke Test', () => {
    let consoleLogs = [];
    let pageErrors = [];

    test.beforeEach(async ({ page }) => {
        // Capture console logs
        page.on('console', msg => {
            const text = msg.text();
            const type = msg.type();
            consoleLogs.push(`[${type}] ${text}`);

            // Check for fatal errors in console
            if (type === 'error') {
                // Filter out known warnings if needed
                if (text.includes('chunk size')) return;

                const isFatal = FATAL_ERRORS.some(err => text.includes(err));
                if (isFatal) {
                    console.error(`FATAL CONSOLE ERROR: ${text}`);
                    // We don't fail immediately here to capture screenshot first, 
                    // but we will assert at the end of the step.
                    pageErrors.push(`Console Error: ${text}`);
                }
            }
        });

        // Capture page errors (exceptions)
        page.on('pageerror', err => {
            console.error(`PAGE ERROR: ${err.message}`);
            pageErrors.push(`Page Error: ${err.message}`);
        });
    });

    test('Smoke: Login -> Navigate All Tabs -> Check Errors', async ({ page }) => {
        console.log('Starting Smoke Test...');

        // Helper to check for 401 specifically
        const check401 = () => {
            // We capture console logs in 'consoleLogs'.
            // If we see [error] ... 401, we know it failed auth.
            const has401 = consoleLogs.some(l => l.includes('401') || l.includes('Unauthorized'));
            if (has401) throw new Error('Login Failed: 401 Unauthorized detected in logs');
        };

        const SMOKE_EMAIL = process.env.SMOKE_EMAIL || 'admin@smoke.test';
        const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD || 'password123';

        await page.goto('/'); // Use baseURL from config

        // Wait for Login screen
        await page.waitForTimeout(1000);

        const isLoginVisible = await page.isVisible('input[type="email"]');
        if (!isLoginVisible) {
            console.log('Login form not found immediately. Checking if already logged in...');
        } else {
            console.log(`Logging in as ${SMOKE_EMAIL}...`);
            await page.fill('input[type="email"]', SMOKE_EMAIL);
            await page.fill('input[type="password"]', SMOKE_PASSWORD);
            await page.click('button[type="submit"]');
        }

        // Wait for ANY robust anchor of the App Shell
        // "System Health" or "Dashboard" text usually appears in Sidebar.
        // Also check for the main layout container if possible.
        console.log('Waiting for AppShell anchor...');
        try {
            // Try waiting for multiple potential anchors
            await Promise.any([
                page.waitForSelector('text="System Health"', { timeout: 15000 }),
                page.waitForSelector('text="Dashboard"', { timeout: 15000 }),
                page.waitForSelector('[data-testid="app-shell"]', { timeout: 15000 }), // If exists
                page.waitForSelector('#root nav', { timeout: 15000 }), // Fallback
            ]);
            console.log('AppShell anchor found.');
        } catch (e) {
            check401(); // Throw specific error if 401 was seen
            console.error('Login failed: No AppShell anchor found');
            await saveFailure(page, 'login_failure');
            throw new Error('Login failed: AppShell not loaded (Timeout/Crash)');
        }

        // 2. Navigate Routes
        for (const route of ROUTES) {
            console.log(`Navigating to ${route.label}...`);

            // Reset per-page error tracking if desired, 
            // but for a smoke test, any error is bad.

            // Click Sidebar Link
            // We look for text in the sidebar (nav)
            try {
                // Basic text match click
                await page.click(`align-left:has-text("${route.label}")`, { timeout: 2000 }).catch(async () => {
                    // Fallback: try finding button with text
                    await page.click(`button:has-text("${route.label}")`);
                });

                // Wait for content anchor
                await page.waitForTimeout(1000); // Render gap
                if (route.anchor) {
                    await page.waitForSelector(route.anchor, { timeout: 5000 });
                }

            } catch (e) {
                console.error(`Failed navigation to ${route.label}: ${e.message}`);
                await saveFailure(page, `nav_${route.label.replace(' ', '_')}`);
                pageErrors.push(`Navigation Failed: ${route.label}`);
            }

            // Assert no errors for this page
            if (pageErrors.length > 0) {
                await saveFailure(page, `error_${route.label.replace(' ', '_')}`);
                // Fail the test
                throw new Error(`Errors found on ${route.label}: ${pageErrors.join(' | ')}`);
            }
        }

        console.log('Smoke Test Completed Successfully');
    });
});

async function saveFailure(page, name) {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const screenshotPath = path.join(DEBUG_DIR, `${name}_${timestamp}.png`);
    const htmlPath = path.join(DEBUG_DIR, `${name}_${timestamp}.html`);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    fs.writeFileSync(htmlPath, await page.content());
    console.log(`Saved failure evidence to ${screenshotPath}`);
}
