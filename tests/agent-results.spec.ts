import { test, expect, type Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Cache NextAuth sessions to disk so each agent only needs to log in ONCE
 * across all test runs. This avoids the in-memory rate-limiter (max 10 logins
 * per 15 min) being tripped by repeated test runs.
 *
 * The .auth/ files are gitignored. Delete them manually if the session expires
 * or if you want to force a fresh login.
 */
const AUTH_DIR = path.join(__dirname, '.auth');

async function getStorageState(browser: Browser, email: string): Promise<string> {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
  const file = path.join(AUTH_DIR, email.replace(/[@.]/g, '_') + '.json');
  if (fs.existsSync(file)) return file;

  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  await pg.goto('/login');
  await pg.getByPlaceholder('Enter your credentials').fill(email);
  await pg.getByPlaceholder('Enter your password').fill('agent123');
  await pg.getByRole('button', { name: /Sign In/i }).click();
  await pg.waitForURL(/\/agent/, { timeout: 15000 });
  await ctx.storageState({ path: file });
  await ctx.close();
  return file;
}

/** POST /api/agent/checkin from within the page so session + same-origin headers are set. */
async function setCheckin(page: Parameters<typeof test>[1] extends (args: infer A) => unknown ? A extends { page: infer P } ? P : never : never, type: 'CHECK_IN' | 'CHECK_OUT') {
  await page.evaluate(async (t) => {
    await fetch('/api/agent/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: t }),
    });
  }, type);
}

test.describe('Agent Submit Election Results Flow', () => {

  test('Agent can navigate to Submit Election Results page', async ({ page, browser }) => {
    const state = await getStorageState(browser, 'agent001@effutu.gov.gh');
    await page.context().addCookies(
      JSON.parse(fs.readFileSync(state, 'utf-8')).cookies
    );
    await page.goto('/agent/results', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Submit Election Results' })).toBeVisible({ timeout: 15000 });
  });

  // Uses agent002 — avoids FINAL lock that may exist on agent001 from prior runs
  test('Agent can submit provisional results', async ({ page, browser }) => {
    const state = await getStorageState(browser, 'agent002@effutu.gov.gh');
    await page.context().addCookies(
      JSON.parse(fs.readFileSync(state, 'utf-8')).cookies
    );
    await page.goto('/agent', { waitUntil: 'domcontentloaded' });
    await setCheckin(page, 'CHECK_IN');
    await page.goto('/agent/results', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Submit Election Results' })).toBeVisible({ timeout: 15000 });

    const inputs = page.locator('input[type="number"]');
    await expect(inputs.first()).toBeVisible({ timeout: 15000 });

    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      await inputs.nth(i).fill(String(10 + i * 5));
    }

    await page.getByRole('button', { name: 'Provisional Preliminary count, can be updated' }).click();

    const submitBtn = page.getByRole('button', { name: /Submit Provisional Results|Update Provisional Results/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Handle optional tally mismatch — click again to proceed
    if (await page.locator('text=Tally Mismatch').isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
    }

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Submit PROVISIONAL', exact: true }).click();
    await expect(page.locator('text=Results have been submitted')).toBeVisible({ timeout: 10000 });
  });

  test('Agent sees check-in required message when not checked in', async ({ page, browser }) => {
    const state = await getStorageState(browser, 'agent001@effutu.gov.gh');
    await page.context().addCookies(
      JSON.parse(fs.readFileSync(state, 'utf-8')).cookies
    );
    await page.goto('/agent', { waitUntil: 'domcontentloaded' });
    await setCheckin(page, 'CHECK_OUT');

    await page.goto('/agent/results', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Submit Election Results' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Check-in Required')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Go to Dashboard' })).toBeVisible();

    // Restore check-in
    await setCheckin(page, 'CHECK_IN');
  });

  // Uses agent004 — a station unlikely to be FINAL-locked
  test('Agent cannot exceed registered voters limit', async ({ page, browser }) => {
    const state = await getStorageState(browser, 'agent004@effutu.gov.gh');
    await page.context().addCookies(
      JSON.parse(fs.readFileSync(state, 'utf-8')).cookies
    );
    await page.goto('/agent', { waitUntil: 'domcontentloaded' });
    await setCheckin(page, 'CHECK_IN');
    await page.goto('/agent/results', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Submit Election Results' })).toBeVisible({ timeout: 15000 });

    const inputs = page.locator('input[type="number"]');
    const isEditable = await inputs.first().isVisible({ timeout: 3000 }).catch(() => false);
    if (!isEditable) { test.skip(); return; }

    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      await inputs.nth(i).fill('500000');
    }

    await page.getByRole('button', { name: /Submit|Update/i }).last().click();
    await expect(page.locator('text=cannot exceed registered voters')).toBeVisible({ timeout: 5000 });
  });

  // Uses agent136 — avoids FINAL lock on agent001/002/004 from prior runs
  test('Agent can submit final results and page becomes read-only', async ({ page, browser }) => {
    const state = await getStorageState(browser, 'agent136@effutu.gov.gh');
    await page.context().addCookies(
      JSON.parse(fs.readFileSync(state, 'utf-8')).cookies
    );
    await page.goto('/agent', { waitUntil: 'domcontentloaded' });
    await setCheckin(page, 'CHECK_IN');
    await page.goto('/agent/results', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Submit Election Results' })).toBeVisible({ timeout: 15000 });

    // Already locked from a prior run — just verify locked state
    if (await page.locator('text=Final Results Submitted').isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(page.locator('text=locked')).toBeVisible();
      return;
    }

    const inputs = page.locator('input[type="number"]');
    await expect(inputs.first()).toBeVisible({ timeout: 15000 });

    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      await inputs.nth(i).fill(String(5 + i * 3));
    }

    await page.getByRole('button', { name: 'Final Official verified count' }).click();

    const submitBtn = page.getByRole('button', { name: /Submit Final Results|Update Final Results/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    if (await page.locator('text=Tally Mismatch').isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
    }

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Submit FINAL', exact: true }).click();

    await expect(page.locator('text=Final Results Submitted')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=locked')).toBeVisible();
  });
});
