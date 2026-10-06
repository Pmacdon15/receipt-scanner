import { expect, test } from "@playwright/test"

import { site } from "../lib/site"

// The nav items are <a> elements rendered through Base UI's Button, which
// gives them role="button", so they are found by that role.

test("the header navigates between pages", async ({ page, isMobile }) => {
  test.skip(isMobile, "the desktop nav is hidden on small screens")
  await page.goto("/")

  const nav = page.locator("header nav")
  for (const item of site.nav) {
    await expect(nav.getByRole("button", { name: item.label })).toBeVisible()
  }

  await nav.getByRole("button", { name: "Search" }).click()
  await expect(page).toHaveURL(/\/search$/)
  await expect(
    page.getByRole("heading", { name: "Sign in to search receipts" })
  ).toBeVisible()

  await page.getByRole("link", { name: site.name }).click()
  await expect(page).toHaveURL(/\/$/)
})

test("the mobile menu opens and navigates", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the menu button only shows on small screens")
  await page.goto("/")

  await page.getByRole("button", { name: "Open menu" }).click()
  const menu = page.getByRole("dialog")
  await expect(menu).toBeVisible()

  await menu.getByRole("button", { name: "Scan" }).click()
  await expect(page).toHaveURL(/\/scan$/)
  await expect(menu).toBeHidden()
})

test("the theme toggle switches between light and dark", async ({ page }) => {
  await page.goto("/")
  const html = page.locator("html")
  const toggle = page.getByRole("button", { name: "Toggle theme" })

  const startsDark = await html.evaluate((el) => el.classList.contains("dark"))
  await toggle.click()
  await expect(html).toHaveClass(startsDark ? /^(?!.*\bdark\b)/ : /\bdark\b/)
  await toggle.click()
  await expect(html).toHaveClass(startsDark ? /\bdark\b/ : /^(?!.*\bdark\b)/)
})
