// SPDX-License-Identifier: LGPL-3.0-only
// AGENTS.MD §T25 — E2E walkthrough + sandbox + attacker panel tests
import { test, expect, type Page } from '@playwright/test';

function hookConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('landing page renders about-demo section', async ({ page }) => {
  const errors = hookConsoleErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('about-demo')).toBeVisible();
  await expect(page.getByTestId('honest-framing-link')).toBeVisible();
  expect(errors).toHaveLength(0);
});

test('happy path navigates phases 1 through 8', async ({ page }) => {
  const errors = hookConsoleErrors(page);

  await page.goto('/walkthrough/1-meet');
  await expect(page.locator('.phase-number')).toContainText('Phase 1');

  const phases = [
    { url: '/walkthrough/2-dkg', label: 'Phase 2' },
    { url: '/walkthrough/3-shares', label: 'Phase 3' },
    { url: '/walkthrough/4-aggregate-pk', label: 'Phase 4' },
    { url: '/walkthrough/5-train-encrypt', label: 'Phase 5' },
    { url: '/walkthrough/6-aggregate', label: 'Phase 6' },
    { url: '/walkthrough/7-decrypt', label: 'Phase 7' },
    { url: '/walkthrough/8-update', label: 'Phase 8' },
  ];

  for (const phase of phases) {
    await page.locator('.btn-primary').click();
    await page.waitForURL(`**${phase.url}**`);
    await expect(page.locator('.phase-number')).toContainText(phase.label);
  }

  expect(errors).toHaveLength(0);
});

test('deep link to phase 5 renders correct phase header', async ({ page }) => {
  await page.goto('/walkthrough/5-train-encrypt');
  await expect(page.locator('.phase-number')).toContainText('Phase 5');
  await expect(page.locator('.phase-title')).toBeVisible();
});

test('deep link to phase 8 eventually shows averaged-gradient testid', async ({ page }) => {
  await page.goto('/walkthrough/8-update');
  await expect(page.getByTestId('averaged-gradient')).toBeVisible({ timeout: 15_000 });
});

test('progressive disclosure switches between Novice / Learn More / Show Math', async ({ page }) => {
  await page.goto('/walkthrough/1-meet');

  const learnMoreBtn = page.locator('.pill-segment', { hasText: 'Learn More' });
  const showMathBtn = page.locator('.pill-segment', { hasText: 'Show Math' });
  const noviceBtn = page.locator('.pill-segment', { hasText: 'Novice' });

  await expect(noviceBtn).toHaveAttribute('aria-selected', 'true');

  await learnMoreBtn.click();
  await expect(learnMoreBtn).toHaveAttribute('aria-selected', 'true');
  await expect(noviceBtn).toHaveAttribute('aria-selected', 'false');

  await showMathBtn.click();
  await expect(showMathBtn).toHaveAttribute('aria-selected', 'true');

  await noviceBtn.click();
  await expect(noviceBtn).toHaveAttribute('aria-selected', 'true');
});

test('attacker panel opens and shows no plaintext gradient values', async ({ page }) => {
  await page.goto('/walkthrough/5-train-encrypt');

  const panelHeader = page.locator('.panel-header').first();
  await panelHeader.click();

  await expect(page.locator('.attacker-panel.is-open')).toBeVisible();

  const hexPreviews = page.locator('.hex-preview');
  const count = await hexPreviews.count();

  if (count > 0) {
    for (let i = 0; i < count; i++) {
      const text = await hexPreviews.nth(i).textContent();
      expect(text).not.toMatch(/^-?\d+\.\d{3,}/);
    }
  }
});

test('sandbox runs a round and shows round summary', async ({ page }) => {
  await page.goto('/sandbox');

  await expect(page.getByTestId('run-round')).toBeEnabled();
  await page.getByTestId('run-round').click();

  await expect(page.getByTestId('round-summary')).toBeVisible({ timeout: 15_000 });
  const clientText = await page.getByTestId('summary-clients').textContent();
  expect(Number(clientText?.trim())).toBeGreaterThanOrEqual(2);
});

test('sandbox re-run after changing client count produces new summary', async ({ page }) => {
  await page.goto('/sandbox');

  await page.getByTestId('run-round').click();
  await expect(page.getByTestId('round-summary')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('client-count').fill('5');
  await page.getByTestId('run-round').click();

  await expect(page.getByTestId('round-summary')).toBeVisible({ timeout: 15_000 });
  const clientText = await page.getByTestId('summary-clients').textContent();
  expect(Number(clientText?.trim())).toBeGreaterThanOrEqual(2);
});

test('keyboard Enter on Next button advances to phase 2', async ({ page }) => {
  await page.goto('/walkthrough/1-meet');
  await expect(page.locator('.phase-number')).toContainText('Phase 1');

  const nextButton = page.locator('.btn-primary');
  await nextButton.focus();
  await page.keyboard.press('Enter');

  await page.waitForURL('**/walkthrough/2-dkg**');
  await expect(page.locator('.phase-number')).toContainText('Phase 2');
});

test('progressive disclosure keyboard ArrowRight cycles depth levels', async ({ page }) => {
  await page.goto('/walkthrough/1-meet');

  const pillToggle = page.locator('.pill-toggle');
  await pillToggle.focus();

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.pill-segment', { hasText: 'Learn More' })).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.pill-segment', { hasText: 'Show Math' })).toHaveAttribute('aria-selected', 'true');
});

test('reduced motion: page loads and renders phase 1 correctly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/walkthrough/1-meet');
  await expect(page.locator('.phase-shell')).toBeVisible();
  await expect(page.locator('.phase-number')).toContainText('Phase 1');
  await expect(page.locator('.pill-toggle')).toBeVisible();
});

test('reduced motion: sandbox runs successfully', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/sandbox');
  await page.getByTestId('run-round').click();
  await expect(page.getByTestId('round-summary')).toBeVisible({ timeout: 15_000 });
});

test('no uncaught JS errors during full happy path', async ({ page }) => {
  const errors = hookConsoleErrors(page);

  await page.goto('/');
  await page.goto('/walkthrough/1-meet');
  await page.locator('.btn-primary').click();
  await page.waitForURL('**/walkthrough/2-dkg**');
  await page.goto('/sandbox');
  await page.getByTestId('run-round').click();
  await expect(page.getByTestId('round-summary')).toBeVisible({ timeout: 15_000 });

  expect(errors).toHaveLength(0);
});
