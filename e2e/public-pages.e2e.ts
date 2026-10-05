import { expect, test } from "@playwright/test"

import { RECEIPT_TYPES } from "../lib/receipt-types"

test.describe("home page", () => {
  test("introduces the product", async ({ page }) => {
    await page.goto("/")

    await expect(page).toHaveTitle(/Receiptly/)
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Stop sorting receipts by hand.",
      })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Three steps, start to filed" })
    ).toBeVisible()
  })

  test("lists every receipt category", async ({ page }) => {
    await page.goto("/")

    const section = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Categories built in" }),
    })
    for (const type of RECEIPT_TYPES) {
      await expect(section.getByText(type.label, { exact: true })).toBeVisible()
    }
  })

  test("the scanner call to action leads to the sign-in prompt", async ({
    page,
  }) => {
    await page.goto("/")

    // A Base UI Button rendered as a link, so it carries role="button".
    const cta = page.getByRole("button", { name: "See the scanner" })
    await expect(cta).toHaveAttribute("href", "/scan")
    await cta.click()

    await expect(page).toHaveURL(/\/scan$/)
    await expect(
      page.getByRole("heading", { name: "Sign in to scan receipts" })
    ).toBeVisible()
  })
})

test.describe("signed out", () => {
  test("the scanner asks you to sign in", async ({ page }) => {
    await page.goto("/scan")

    await expect(
      page.getByRole("heading", { name: "Sign in to scan receipts" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Sign in" }).last()
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Create an account" })
    ).toBeVisible()
    await expect(page.getByLabel("Merchant")).toHaveCount(0)
  })

  test("search asks you to sign in, even with filters in the URL", async ({
    page,
  }) => {
    await page.goto("/search?q=coffee&type=restaurant&scope=org")

    await expect(
      page.getByRole("heading", { name: "Sign in to search receipts" })
    ).toBeVisible()
    await expect(page.getByText("coffee")).toHaveCount(0)
  })
})

test("an unknown page returns 404", async ({ page }) => {
  const response = await page.goto("/no-such-page")
  expect(response?.status()).toBe(404)
})
