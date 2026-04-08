import { test, expect } from '@playwright/test';

test.describe('Voter Management Flow', () => {
  test('Admin can manually add a new voter', async ({ page }) => {
    // 1. Navigate to login
    await page.goto('/login');

    // 2. Fill login form
    await page.getByPlaceholder('Enter your credentials').fill('admin@effutu.gov.gh');
    await page.getByPlaceholder('Enter your password').fill('admin123');
    await page.getByRole('button', { name: /Sign In/i }).click();

    // 3. Navigate to Voters Register
    const peopleButton = page.getByRole('button', { name: 'People' });
    const votersLink = page.getByRole('link', { name: 'Voters Register' });

    // If voters link not visible, expand the People group
    if (!await votersLink.isVisible()) {
      await peopleButton.click();
    }
    await votersLink.click();
    await expect(page).toHaveURL(/\/admin\/voters/);

    // 4. Click Add Voter
    await page.getByRole('button', { name: /Add Voter/i }).click();
    
    // Wait for the modal to be visible
    const modalHeading = page.getByRole('heading', { name: 'Register Individual Voter' });
    await expect(modalHeading).toBeVisible({ timeout: 10000 });

    // 5. Fill out the form
    const testVoterId = `AUTO-${Math.floor(Math.random() * 900000) + 100000}`;
    await page.getByLabel('Voter ID').fill(testVoterId);
    await page.getByLabel('First Name').fill('Automation');
    await page.getByLabel('Last Name').fill('Tester');
    await page.getByLabel('Age').fill('25');
    await page.getByLabel('Gender').selectOption('Male');
    
    // Wait for stations to load in the select
    const stationSelect = page.getByLabel('Polling Station');
    
    // Wait until there's more than one option (Select + real stations)
    await expect(stationSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    
    // Select the first real station
    await stationSelect.selectOption({ index: 1 });

    // 6. Submit
    await page.getByRole('button', { name: 'Create Voter' }).click();

    // 7. Verify Success
    // Wait for toast or for the modal to close
    await expect(page.getByText('Voter added successfully')).toBeVisible();
    await expect(modalHeading).not.toBeVisible();
    
    // Search for the new voter to confirm it's in the list
    await page.getByPlaceholder('Search by voter ID or name...').fill(testVoterId);
    await expect(page.getByText(testVoterId)).toBeVisible();
  });
});
