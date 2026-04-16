import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard Flow', () => {
  test('Admin can log in and view dashboard metrics', async ({ page }) => {
    // 1. Navigate to login
    await page.goto('/login');

    // 2. Fill login form
    await page.getByPlaceholder('Enter your credentials').fill('admin@effutu.gov.gh');
    await page.getByPlaceholder('Enter your password').fill('admin123');
    await page.getByRole('button', { name: /Sign In/i }).click();

    // 3. Verify Admin Dashboard loads
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    
    // We expect the "Constituency Overview" heading to show up from AdminHeader.
    await expect(page.getByRole('heading', { level: 1, name: 'Constituency Overview' })).toBeVisible();

    // The Dashboard page also has "Effutu Statistics" heading.
    await expect(page.getByRole('heading', { level: 2, name: 'Effutu Statistics' })).toBeVisible();

    // 4. Verify some widget stats load (Total Registered, Total Voted)
    await expect(page.locator('p').filter({ hasText: 'Registered Voters' })).toBeVisible();

    // 5. Navigate to Voters page via Sidebar
    // First expand the "People" group
    await page.getByRole('button', { name: 'People' }).click();
    // Now click the "Voters Register" link
    await page.getByRole('link', { name: 'Voters Register' }).click();
    
    await expect(page).toHaveURL(/\/admin\/voters/);

    // 6. Verify Voters page table renders
    // Use specific name since there are multiple h1s in the DOM (sidebar + header)
    await expect(page.getByRole('heading', { level: 1, name: 'Voters Register' })).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });
});
