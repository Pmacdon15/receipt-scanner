import { expect, test } from "@playwright/test"

import { RECEIPT_TYPES } from "../lib/receipt-types"

test.describe("home page", () => {
  test("introduces the product", async ({ page }) => {
    await page.goto("/")

    await expect(page).toHaveTitle(/Receiptly/)
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Receipts in. Clean books out.",
      })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Clear the shoebox this month." })
    ).toBeVisible()
  })

  test("lists every receipt category", async ({ page }) => {
    await page.goto("/")

    const section = page.locator("section").filter({
      hasText: `${RECEIPT_TYPES.length} categories built in`,
    })
    // The rail renders the list twice for its loop; the copy is aria-hidden.
    const list = section.locator("ul:not([aria-hidden])")
    for (const type of RECEIPT_TYPES) {
      await expect(list.getByText(type.label, { exact: true })).toBeVisible()
    }
  })

  test("the search call to action leads to the search sign-in prompt", async ({
    page,
  }) => {
    await page.goto("/")

    // A Base UI Button rendered as a link, so it carries role="button".
    const cta = page.getByRole("button", { name: "Search receipts" })
    await expect(cta).toHaveAttribute("href", "/search")
    await cta.click()

    await expect(page).toHaveURL(/\/search$/)
    await expect(
      page.getByRole("heading", { name: "Sign in to search receipts" })
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

test.describe("documents page", () => {
  test("asks a signed-out visitor to sign in", async ({ page }) => {
    await page.goto("/documents")

    await expect(page).toHaveTitle(/Documents/)
    await expect(
      page.getByRole("heading", { name: "Sign in to see your documents" })
    ).toBeVisible()
  })

  test("the downloads refuse a signed-out request", async ({ request }) => {
    for (const kind of ["pdf", "xlsx", "zip"]) {
      const response = await request.get(`/api/documents/${kind}`)
      expect(response.status()).toBe(401)
    }
  })
})
