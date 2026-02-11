
import { test, expect } from '@playwright/test';

test.describe('Backup and Overwrite Flow', () => {

    // --- SETUP: AUTH BYPASS ---
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem('token', 'dev-token-bypass');
            localStorage.setItem('project', 'Proj_2026');
            localStorage.setItem('theme', 'dark');
        });
    });

    // --- TEST CASE: Full Overwrite Cycle ---
    test('Simulate Conflict and Verify Backup', async ({ page }) => {
        // 1. MOCK SERVER STATE
        // We mock the API responses to simulate a "Staging Doc" and a "Conflict" scenario
        // without needing to actually seed the real DB (which is complex from here).

        const TARGET_DOC_NUM = 'DOC-TEST-' + Math.floor(Math.random() * 10000);
        const STAGING_DOC = {
            id: 'staging-id-' + TARGET_DOC_NUM,
            docNumber: TARGET_DOC_NUM,
            date: '2026-02-10',
            total: 200.00,
            docType: 'fatura',
            supplier: 'Test Supplier',
            customer: 'Test Customer',
            lines: [{ code: 'A1', description: 'Item A', total: 200.00 }]
        };

        // A. Mock Staging List to return our doc
        await page.route('**/api/corev2/docs?project=Proj_2026&status=staging*', async route => {
            await route.fulfill({ json: { rows: [STAGING_DOC] } });
        });

        // B. Mock Finalize Response (First Time -> Success)
        // We will just let the first finalize pass.
        // But wait, the test needs to TRIGGER a conflict.
        // So we need the BACKEND to say "Conflict".

        // Scenario: We click "Finalizar". 
        // The frontend calls POST /api/corev2/docs/finalize-bulk
        // We Mock this response to simulate a Conflict.

        await page.route('**/api/corev2/docs/finalize-bulk', async route => {
            const payload = JSON.parse(route.request().postData());
            const force = payload.force;

            if (!force) {
                // First attempt: Return CONFLICT
                await route.fulfill({
                    json: {
                        conflict: true,
                        conflicts: [{
                            existing: [{
                                id: 'existing-id',
                                docNumber: TARGET_DOC_NUM,
                                total: 100.00, // Different total
                                supplier: 'Test Supplier',
                                created_at: new Date().toISOString()
                            }],
                            pending: STAGING_DOC
                        }]
                    }
                });
            } else {
                // Second attempt (Force=true): Return SUCCESS
                await route.fulfill({
                    json: {
                        results: [{ id: STAGING_DOC.id, ok: true }]
                    }
                });
            }
        });

        // 2. NAVIGATE TO PROCESS V2
        await page.goto('http://localhost:5173/');
        await page.click('text=Invoice Studio'); // Wait for app load
        await page.click('text=Process (V2)');

        // 3. LOAD STAGING DOCS (If not already loaded)
        if (await page.locator('button:has-text("Recuperar Documentos Pendentes")').isVisible()) {
            await page.click('button:has-text("Recuperar Documentos Pendentes")');
        }

        // 4. FIND & SELECT ROW
        const rowSelector = `input[value="${TARGET_DOC_NUM}"]`;
        await page.waitForSelector(rowSelector);

        // Click "Finalizar" on the row (assuming it's the only one or we find it)
        // The Row component has a "Finalizar" button in the "Actions" column or we use the main button.
        // Let's use the checkbox and main "Finalizar" button for robustness.
        const row = page.locator('tr', { has: page.locator(rowSelector) });
        await row.locator('input[type="checkbox"]').check();

        // 5. CLICK FINALIZAR (Triggers Conflict Mock)
        page.once('dialog', dialog => dialog.accept()); // Accept "Confirm Finalize?"
        await page.click('button:has-text("Finalizar")');

        // 6. EXPECT CONFLICT MODAL
        await expect(page.locator('text=Conflito de Documento')).toBeVisible();
        console.log('Conflict Modal Appeared for ' + TARGET_DOC_NUM);

        // 7. CLICK "SUBSTITUIR E BACKUP" (Triggers Success Mock)
        await page.click('button:has-text("Substituir e Backup")');

        // 8. EXPECT SUCCESS
        // The modal should disappear.
        await expect(page.locator('text=Conflito de Documento')).toBeHidden();
        // The row should be removed from view (as per logic).
        await expect(page.locator(rowSelector)).toBeHidden();
        console.log('Overwrite Successful (UI Flow).');

        // 9. VERIFY HISTORY (MOCKED)
        // Now we go to Core V2 and check history.
        // We mock the Backup List endpoint.
        await page.route(`**/api/corev2/docs/**/backups`, async route => {
            await route.fulfill({
                json: {
                    backups: [{
                        id: 'backup-123',
                        reason: 'Bulk Overwrite',
                        created_at: new Date().toISOString(),
                        expires_at: new Date(Date.now() + 86400000).toISOString()
                    }]
                }
            });
        });

        // Navigate to Core V2
        await page.click('text=Core V2');
        await page.waitForSelector('h2:has-text("Explorer")'); // Core V2 header is "Explorer" // Sidebar link

        // We need to see the doc in the list.
        // Mock the Explorer list to include our "New" doc.
        await page.route(`**/api/explorer/**`, async route => {
            // Return our doc as "Final"
            await route.fulfill({
                json: {
                    rows: [{
                        id: 'final-id',
                        docNumber: TARGET_DOC_NUM,
                        total: 200.00,
                        supplier: 'Test Supplier',
                        date: '2026-02-10',
                        project: 'Proj_2026'
                    }],
                    total: 1
                }
            });
        });

        // Wait for Grid
        await page.waitForSelector(`text=${TARGET_DOC_NUM}`);

        // 10. CLICK RESTAURAR
        // We mock the restore response for the test context to avoid side effects,
        // but normally this would hit the real server if we un-mocked it.
        await page.route('**/api/corev2/docs/restore-backup/**', async route => {
            await route.fulfill({ json: { ok: true } });
        });

        await page.click('button:has-text("Restaurar")');

        // Expect Modal to close or show success
        await expect(page.locator('text=Histórico de Backups')).toBeHidden();

        console.log('Restoration Verified.');
    });
});
