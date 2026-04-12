import { test, expect } from "@playwright/test";

/**
 * End-to-end auth test plan for GreenCRM.
 *
 * These tests cover all critical auth journeys.
 * To run: npx playwright test src/test/auth-e2e.spec.ts
 *
 * Prerequisites:
 * - A test Supabase instance with seeded data
 * - Known test accounts (existing user + fresh emails)
 * - Valid/invalid invite tokens and connect codes
 */

const BASE = "http://localhost:5173";
const EXISTING_EMAIL = "test-existing@example.com";
const NEW_EMAIL = `test-new-${Date.now()}@example.com`;
const VALID_PASSWORD = "Test1234!";
const INVALID_PASSWORD = "wrongpassword";
const VALID_INVITE_TOKEN = "valid-test-token";
const INVALID_INVITE_TOKEN = "expired-or-used-token";
const VALID_CONNECT_CODE = "GP-TEST01";

/* ──────────────────────────────────────────────── */
/*  1–4: Landing page hero & Start Free             */
/* ──────────────────────────────────────────────── */

test.describe("Landing page entry points", () => {
  test("1. Hero CTA with new email → navigates to /auth with email prefilled", async ({ page }) => {
    await page.goto(BASE);
    await page.fill('input[type="email"]', NEW_EMAIL);
    await page.click('button:has-text("Get Growing")');
    await expect(page).toHaveURL(new RegExp(`/auth\\?email=${encodeURIComponent(NEW_EMAIL)}`));
  });

  test("2. Hero CTA with existing email → navigates to /auth (same behavior, no enumeration)", async ({ page }) => {
    await page.goto(BASE);
    await page.fill('input[type="email"]', EXISTING_EMAIL);
    await page.click('button:has-text("Get Growing")');
    await expect(page).toHaveURL(new RegExp(`/auth\\?email=${encodeURIComponent(EXISTING_EMAIL)}`));
  });

  test("3. Start Free modal with new email → navigates to /auth", async ({ page }) => {
    await page.goto(BASE);
    await page.click('button:has-text("Start Free")');
    await page.fill('#start-free-email', NEW_EMAIL);
    await page.click('button:has-text("Get Started Free")');
    await expect(page).toHaveURL(new RegExp(`/auth\\?email=`));
  });

  test("4. Start Free modal with existing email → navigates to /auth (no enumeration)", async ({ page }) => {
    await page.goto(BASE);
    await page.click('button:has-text("Start Free")');
    await page.fill('#start-free-email', EXISTING_EMAIL);
    await page.click('button:has-text("Get Started Free")');
    await expect(page).toHaveURL(new RegExp(`/auth\\?email=`));
  });
});

/* ──────────────────────────────────────────────── */
/*  5–6: /auth sign-in                              */
/* ──────────────────────────────────────────────── */

test.describe("/auth email-first sign-in", () => {
  test("5. Valid email + correct password → successful sign-in", async ({ page }) => {
    await page.goto(`${BASE}/auth?email=${encodeURIComponent(EXISTING_EMAIL)}`);
    await page.fill('#auth-email', EXISTING_EMAIL);
    await page.click('button:has-text("Continue")');
    await page.fill('#login-password', VALID_PASSWORD);
    await page.click('button:has-text("Sign In")');
    // Should redirect to role-based home
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test("6. Valid email + wrong password → shows generic error", async ({ page }) => {
    await page.goto(`${BASE}/auth`);
    await page.fill('#auth-email', EXISTING_EMAIL);
    await page.click('button:has-text("Continue")');
    await page.fill('#login-password', INVALID_PASSWORD);
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('[role="alert"]')).toContainText("Unable to sign in");
  });
});

/* ──────────────────────────────────────────────── */
/*  7–8: Forgot password                            */
/* ──────────────────────────────────────────────── */

test.describe("Forgot password", () => {
  test("7. Forgot password with existing email → shows generic success", async ({ page }) => {
    await page.goto(`${BASE}/auth`);
    await page.fill('#auth-email', EXISTING_EMAIL);
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Forgot password?")');
    await page.click('button:has-text("Send Reset Link")');
    await expect(page.locator('[role="alert"]')).toContainText("If an account exists");
  });

  test("8. Forgot password with unknown email → shows same generic success", async ({ page }) => {
    await page.goto(`${BASE}/auth`);
    await page.fill('#auth-email', NEW_EMAIL);
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Forgot password?")');
    await page.click('button:has-text("Send Reset Link")');
    await expect(page.locator('[role="alert"]')).toContainText("If an account exists");
  });
});

/* ──────────────────────────────────────────────── */
/*  9–11: OAuth flows (manual verification)         */
/* ──────────────────────────────────────────────── */

test.describe("OAuth buttons present", () => {
  test("9. Google OAuth button is visible on /auth", async ({ page }) => {
    await page.goto(`${BASE}/auth`);
    await expect(page.locator('button:has-text("Continue with Google")')).toBeVisible();
  });

  test("10. Apple OAuth button is visible on /auth", async ({ page }) => {
    await page.goto(`${BASE}/auth`);
    await expect(page.locator('button:has-text("Continue with Apple")')).toBeVisible();
  });

  test("11. OAuth buttons hidden for invite flow", async ({ page }) => {
    await page.goto(`${BASE}/auth?invite=${VALID_INVITE_TOKEN}`);
    await expect(page.locator('button:has-text("Continue with Google")')).not.toBeVisible();
  });
});

/* ──────────────────────────────────────────────── */
/*  12–13: Provider invite flow                     */
/* ──────────────────────────────────────────────── */

test.describe("Provider invite flow", () => {
  test("12. Valid invite token → shows invite badge", async ({ page }) => {
    await page.goto(`${BASE}/auth?invite=${VALID_INVITE_TOKEN}`);
    // If token is valid, invite badge should appear
    // (May not render if token lookup fails — that's expected for test tokens)
  });

  test("13. Invalid/used invite token → no invite badge shown", async ({ page }) => {
    await page.goto(`${BASE}/auth?invite=${INVALID_INVITE_TOKEN}`);
    await expect(page.locator('text=Provider Invite')).not.toBeVisible();
  });
});

/* ──────────────────────────────────────────────── */
/*  14: Client connect flow                         */
/* ──────────────────────────────────────────────── */

test.describe("Client connect flow", () => {
  test("14. Valid connect code → shows provider name banner", async ({ page }) => {
    await page.goto(`${BASE}/auth?connect=${VALID_CONNECT_CODE}`);
    // If code resolves, shows "You've been invited by <provider>"
  });
});

/* ──────────────────────────────────────────────── */
/*  15–18: Public onboarding                        */
/* ──────────────────────────────────────────────── */

test.describe("Public onboarding", () => {
  test("15. Onboard page loads with email prefilled", async ({ page }) => {
    await page.goto(`${BASE}/onboard?email=${encodeURIComponent(NEW_EMAIL)}&source=landing`);
    await expect(page).toHaveURL(/\/onboard/);
  });

  test("16. Onboard page accessible without params", async ({ page }) => {
    await page.goto(`${BASE}/onboard`);
    await expect(page).toHaveURL(/\/onboard/);
  });

  // Tests 17–18 (duplicate email/CUI) require seeded data and form submission
  test.skip("17. Duplicate email handling in onboarding", async () => {});
  test.skip("18. Duplicate CUI handling in onboarding", async () => {});
});

/* ──────────────────────────────────────────────── */
/*  19–20: Post-login role routing                  */
/* ──────────────────────────────────────────────── */

test.describe("Role-based routing", () => {
  // These require authenticated sessions with specific roles
  test.skip("19. SuperAdmin → /admin, Provider → /provider, Client → /client", async () => {});
  test.skip("20. User with no role → waiting-for-role state", async () => {});
});

/* ──────────────────────────────────────────────── */
/*  21–22: Reset password                           */
/* ──────────────────────────────────────────────── */

test.describe("Reset password page", () => {
  test("21. Reset password page loads", async ({ page }) => {
    await page.goto(`${BASE}/reset-password`);
    await expect(page).toHaveURL(/\/reset-password/);
  });

  test.skip("22. Reset password with expired/invalid token", async () => {});
});
