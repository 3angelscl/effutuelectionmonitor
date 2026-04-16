import { test, expect } from '@playwright/test';

test.describe('Agent Turnout Flow', () => {
  test('Agent can log in and view their dashboard', async ({ page }) => {
    // 1. Navigate to login
    await page.goto('/login');

    // 2. Fill login form
    await page.getByPlaceholder('Enter your credentials').fill('kwesi@effutu.gov.gh');
    await page.getByPlaceholder('Enter your password').fill('agent123');
    await page.getByRole('button', { name: /Sign In/i }).click();

    // 3. Verify Agent Dashboard loads
    await expect(page).toHaveURL(/\/agent/, { timeout: 15000 });
    await expect(page.locator('h2', { hasText: 'Agent Dashboard' })).toBeVisible();

    // 4. Navigate to Record Voter Turnout
    await page.click('a[href="/agent/turnout"]');
    await expect(page).toHaveURL(/\/agent\/turnout/);

    // 5. Assert the turnout page renders the table or voters list
    await expect(page.locator('h2').filter({ hasText: 'Record Voter Turnout' })).toBeVisible();

    // 6. Optionally test searching or clicking if there is a 'Mark Voted' button
    // (We wrap this in a soft assertion or simply check if the list exists, 
    // because total registered might be 0 in an unseeded state, but our dev DB is seeded)
    const markVotedButton = page.getByRole('button', { name: 'Mark Voted' }).first();
    if (await markVotedButton.isVisible()) {
      await markVotedButton.click();
      await expect(page.getByRole('button', { name: 'Undo' }).first()).toBeVisible({ timeout: 10000 });
    }
  });
});
