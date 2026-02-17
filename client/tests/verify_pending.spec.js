import { test, expect } from '@playwright/test';

// Use same credentials as smoke test
const SMOKE_EMAIL = process.env.SMOKE_EMAIL || 'admin@smoke.test';
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD || 'password123';
const PROJECT_ID = 'pedrorfmlopes-sys/InvoiceExpressPro';

test('Verify Recover Pending Documents', async ({ page }) => {
    // 1. Force Project Context via localStorage before load
    await page.goto('/');
    await page.evaluate((pid) => localStorage.setItem('project', pid), PROJECT_ID);

    // 2. Login flow
    const isLoginVisible = await page.isVisible('input[type="email"]');
    if (isLoginVisible) {
        console.log(`Logging in as ${SMOKE_EMAIL}...`);
        await page.fill('input[type="email"]', SMOKE_EMAIL);
        await page.fill('input[type="password"]', SMOKE_PASSWORD);
        await page.click('button[type="submit"]');
    }

    // 3. Wait for Dashboard/AppShell
    await expect(page.locator('text=Dashboard')).toBeVisible({ timeout: 15000 });

    // 4. Navigate to Process V2
    console.log('Navigating to Process V2...');
    // Try finding the sidebar link. Usually it has text "Processar" (pt) or "Process" (en)
    // We'll try a flexible selector based on common sidebar patterns
    const sidebarLink = page.locator('nav a, nav button').filter({ hasText: /Process|Processar/ }).first();
    await sidebarLink.click();

    // 5. Verify we are on Process V2
    // Check for "Recuperar Documentos Pendentes" button
    const recoverBtn = page.getByRole('button', { name: '🔁 Recuperar Documentos Pendentes' });
    await expect(recoverBtn).toBeVisible({ timeout: 5000 });

    // 6. Click Recover
    console.log('Clicking Recover...');
    await recoverBtn.click();

    // 7. Verify Results
    await expect(page.locator('table tbody tr')).not.toHaveCount(0, { timeout: 10000 });

    // 8. Test Finalization Feedback
    console.log('Testing Finalize Feedback...');
    const finalizeBtn = page.getByRole('button', { name: /(Finalizar e Guardar|Finalize & Save)/ });

    // Handle the confirm dialog
    page.once('dialog', async dialog => {
        console.log(`Accepting dialog: ${dialog.message()}`);
        await dialog.accept();
    });

    await finalizeBtn.click();

    // The banner text could be translated
    const banner = page.getByText(/(Saving document|Gravando documento|Guardando documento)/i);

    try {
        await expect(banner).toBeVisible({ timeout: 10000 });
        console.log('Banner is visible!');
    } catch (e) {
        await page.screenshot({ path: 'test-results/banner-failure.png' });
        throw e;
    }

    // Wait for it to disappear
    await expect(banner).toBeHidden({ timeout: 20000 });

    console.log('Finalize Feedback verified.');
});
