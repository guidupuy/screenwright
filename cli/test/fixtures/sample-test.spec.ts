import { test, expect } from '@playwright/test';

test('checkout flow', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.click('[data-testid="product-laptop"]');
  await page.click('[data-testid="add-to-cart"]');
  await page.fill('[data-testid="email"]', 'test@example.com');
  await page.click('[data-testid="checkout"]');
  await expect(page.locator('.confirmation')).toBeVisible();
});
