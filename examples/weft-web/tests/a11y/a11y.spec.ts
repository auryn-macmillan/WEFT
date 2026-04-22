import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';

const ROUTES = [
  '/',
  '/walkthrough/1-meet',
  '/walkthrough/2-dkg',
  '/walkthrough/3-shares',
  '/walkthrough/4-aggregate-pk',
  '/walkthrough/5-train-encrypt',
  '/walkthrough/6-aggregate',
  '/walkthrough/7-decrypt',
  '/walkthrough/8-update',
  '/sandbox'
];

const report: Record<string, any> = {};

test.describe('WCAG 2.2 AA Accessibility Checks', () => {
  for (const route of ROUTES) {
    test(`Route ${route} should have no critical or serious a11y violations`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      
      const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
      report[route] = accessibilityScanResults;
      
      const violations = accessibilityScanResults.violations.filter(
        (v) => v.impact && ['critical', 'serious'].includes(v.impact)
      );
      
      expect(violations).toEqual([]);
    });
  }

  test.afterAll(async () => {
    const evidenceDir = path.resolve(process.cwd(), '../../.sisyphus/evidence');
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }
    const reportPath = path.join(evidenceDir, 'task-29-axe-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  });
});