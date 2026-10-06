import { defineConfig, devices } from "@playwright/test"

const PORT = Number(process.env.E2E_PORT ?? 3100)
const baseURL = `http://localhost:${PORT}`

// The app refuses to start without Clerk keys. These tests cover the
// signed-out experience, so a well-formed placeholder key is enough when no
// real one is set. It is a production-style key on purpose: a development key
// makes Clerk redirect every browser visit through its handshake endpoint,
// which a placeholder domain cannot answer. With this one the server renders
// every page signed out without calling Clerk, and the browser's attempt to
// load Clerk's script fails fast on the .invalid domain.
const placeholderPublishableKey = `pk_live_${Buffer.from("clerk.e2e.invalid$")
  .toString("base64")
  .replace(/=+$/, "")}`

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Runs against a production build, as the Next.js testing guide recommends.
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
        placeholderPublishableKey,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? "sk_live_e2e",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
})
