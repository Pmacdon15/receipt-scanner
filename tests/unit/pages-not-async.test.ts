import { describe, expect, test } from "bun:test"
import { join, relative } from "node:path"

// Cache Components (#17, #21): every route component must be a plain, non-async
// function so its frame lands in the static shell and data streams in behind
// <Suspense>. This test finds every page/layout/template/default file under
// app/ by itself, so a new route is checked the moment it is added. There is
// no list to keep in sync, and no per-page test to remember to write.

const APP_DIR = join(import.meta.dir, "..", "..", "app")
const ROUTE_FILES = "**/{page,layout,template,default}.{tsx,ts,jsx,js}"

// Comments and string contents are blanked out so a word like "async" inside
// them never counts. Template literals are left alone: they can't sit between
// `export default` and the function it exports.
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
}

/**
 * Returns why the file's default export is async, or null when it is not.
 * Covers `export default async function`, `export default async () =>`, and
 * `export default Name` where Name was declared async elsewhere in the file.
 */
function asyncDefaultExportReason(source: string): string | null {
  const code = stripCommentsAndStrings(source)

  if (/export\s+default\s+async\b/.test(code)) {
    return "`export default async ...`"
  }

  const named = code.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m)
  const reExport = code.match(
    /export\s*\{[^}]*\b([A-Za-z_$][\w$]*)\s+as\s+default\b[^}]*\}/
  )
  const name = named?.[1] ?? reExport?.[1]
  if (!name || name === "function" || name === "class") return null

  const declaredAsync = new RegExp(
    String.raw`(?:async\s+function\s*\*?\s*${name}\b)|(?:\b(?:const|let|var)\s+${name}\b[^=]*=\s*async\b)`
  )
  return declaredAsync.test(code) ? `\`${name}\` is declared async` : null
}

const routeFiles = Array.from(
  new Bun.Glob(ROUTE_FILES).scanSync({ cwd: APP_DIR })
).sort()

describe("route components are not async", () => {
  test("route files are discovered under app/", () => {
    // Guards against the glob silently matching nothing (e.g. if app/ moves),
    // which would make every check below vacuously pass.
    expect(routeFiles).toContain("page.tsx")
    expect(routeFiles).toContain("layout.tsx")
  })

  test.each(routeFiles)("app/%s", async (file) => {
    const source = await Bun.file(join(APP_DIR, file)).text()
    const reason = asyncDefaultExportReason(source)
    if (reason) {
      throw new Error(
        `${relative(process.cwd(), join(APP_DIR, file))}: ${reason}. ` +
          "Pages and layouts must not be async under Cache Components. " +
          "Start the promise and resolve it inside <Suspense> instead " +
          "(see app/scan/page.tsx or app/search/page.tsx)."
      )
    }
    expect(reason).toBeNull()
  })
})

// The detector itself, so a gap in it can't hide an async page.
describe("asyncDefaultExportReason", () => {
  test.each([
    "export default async function Page() { return null }",
    "export default async () => null",
    "export default async function () { return null }",
    "async function Page() { return null }\nexport default Page",
    "const Page = async () => null\nexport default Page;",
    "const Page: FC = async (props) => null\nexport default Page",
    "async function Page() {}\nexport { Page as default }",
  ])("flags %p", (source) => {
    expect(asyncDefaultExportReason(source)).not.toBeNull()
  })

  test.each([
    "export default function Page() { return null }",
    "export default () => null",
    "function Page() { return null }\nexport default Page",
    "const Page = () => null\nexport default Page",
    // async helpers and "async" in comments/strings are fine
    "async function load() {}\nexport default function Page() { return null }",
    "// export default async function Old() {}\nexport default function Page() {}",
    'const s = "export default async"\nexport default function Page() {}',
    "export default function Page() { return auth().then((x) => x) }",
  ])("allows %p", (source) => {
    expect(asyncDefaultExportReason(source)).toBeNull()
  })
})
