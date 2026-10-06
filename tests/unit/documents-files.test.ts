import { describe, expect, test } from "bun:test"

import { makeSearchedReceipt } from "../helpers/fixtures"
import { readZip } from "../helpers/zip"

import {
  archivePhotoPaths,
  parseOrganize,
  receiptArchiveStream,
  safeName,
} from "@/lib/documents/receipt-archive"
import { buildReportPdf, toWinAnsi } from "@/lib/documents/report-pdf"
import { buildReportXlsx } from "@/lib/documents/report-xlsx"
import {
  buildXlsx,
  columnName,
  escapeXml,
  excelDate,
} from "@/lib/documents/xlsx"
import { crc32, zipSync } from "@/lib/documents/zip"

const text = (data: Uint8Array | undefined) => new TextDecoder().decode(data)

describe("zip", () => {
  test("crc32 matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926)
  })

  test("writes stored and deflated entries that read back intact", () => {
    const big = new TextEncoder().encode("receipt ".repeat(500))
    const zip = zipSync([
      { name: "a.txt", data: new TextEncoder().encode("hello") },
      { name: "dir/b.txt", data: big, compress: true },
      { name: "café/ü.txt", data: new Uint8Array([1, 2, 3]) },
    ])
    const files = readZip(zip)
    expect([...files.keys()]).toEqual(["a.txt", "dir/b.txt", "café/ü.txt"])
    expect(text(files.get("a.txt"))).toBe("hello")
    expect(files.get("dir/b.txt")).toEqual(big)
    // Deflate actually kicked in for the repetitive text.
    expect(zip.length).toBeLessThan(big.length)
  })
})

describe("xlsx", () => {
  test("column names", () => {
    expect(columnName(0)).toBe("A")
    expect(columnName(25)).toBe("Z")
    expect(columnName(26)).toBe("AA")
    expect(columnName(701)).toBe("ZZ")
    expect(columnName(702)).toBe("AAA")
  })

  test("dates become Excel serial days", () => {
    expect(excelDate("1900-03-01")).toBe(61)
    expect(excelDate("2026-01-01")).toBe(46023)
    expect(excelDate("not a date")).toBeNull()
  })

  test("escapes markup and drops characters XML cannot hold", () => {
    expect(escapeXml(`<b>"Tom" & Jerry</b>\u0007`)).toBe(
      "&lt;b&gt;&quot;Tom&quot; &amp; Jerry&lt;/b&gt;"
    )
  })

  test("a workbook has every part Excel needs", () => {
    const files = readZip(
      buildXlsx([
        { name: "One", rows: [["a", 1, { date: "2026-01-02" }]] },
        { name: "One", rows: [[{ formula: "SUM(A1:A2)", value: 3 }]] },
      ])
    )
    expect([...files.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "docProps/core.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ])
    // Duplicate sheet names are made unique, or Excel refuses the file.
    expect(text(files.get("xl/workbook.xml"))).toContain('name="One 2"')
    expect(text(files.get("xl/worksheets/sheet1.xml"))).toContain(
      '<c r="C1" s="3"><v>46024</v></c>'
    )
    expect(text(files.get("xl/worksheets/sheet2.xml"))).toContain(
      "<f>SUM(A1:A2)</f><v>3</v>"
    )
  })

  test("the receipt spreadsheet lists each receipt and totals one currency", () => {
    const receipts = [
      makeSearchedReceipt({ merchant: "Costco", totalCents: 4217, taxCents: 200 }),
      makeSearchedReceipt({ merchant: "Shell <Gas>", totalCents: 6000 }),
    ]
    const files = readZip(
      buildReportXlsx(receipts, {
        scopeLabel: "Personal receipts",
        from: "2025-01-01",
        to: "2025-12-31",
        generatedAt: new Date("2026-01-01T00:00:00Z"),
      })
    )
    const sheet = text(files.get("xl/worksheets/sheet2.xml"))
    expect(sheet).toContain("Costco")
    expect(sheet).toContain("Shell &lt;Gas&gt;")
    expect(sheet).toContain("<f>SUM(G2:G3)</f><v>102.17</v>")
    expect(sheet).toContain('<autoFilter ref="A1:L3"/>')
  })
})

describe("pdf", () => {
  test("toWinAnsi keeps Latin text and folds or drops the rest", () => {
    expect(toWinAnsi("Café Ñandú — €5")).toBe("Café Ñandú — €5")
    expect(toWinAnsi("Łódź")).toBe("Lódz")
    expect(toWinAnsi("Pizza 🍕")).toBe("Pizza ")
    expect(toWinAnsi("漢")).toBe("?")
    expect(toWinAnsi("a\nb")).toBe("a b")
  })

  test("builds a PDF, including for merchants outside Latin-1", async () => {
    const pdf = await buildReportPdf(
      [
        makeSearchedReceipt({ merchant: "Łódź Café 🍕 漢字" }),
        makeSearchedReceipt({
          splits: [
            { type: "grocery", amountCents: 3000 },
            { type: "hardware", amountCents: 1250 },
          ],
        }),
      ],
      {
        scopeLabel: "Personal receipts",
        generatedAt: new Date("2026-01-01T00:00:00Z"),
      }
    )
    expect(text(pdf.subarray(0, 5))).toBe("%PDF-")
  })

  test("builds a PDF with no receipts", async () => {
    const pdf = await buildReportPdf([], {
      scopeLabel: "Personal receipts",
      generatedAt: new Date(),
    })
    expect(pdf.length).toBeGreaterThan(500)
  })
})

describe("receipt archive", () => {
  test("safeName strips characters file systems reject", () => {
    expect(safeName('A/B\\C:D*E?"F<G>H|I')).toBe("A B C D E F G H I")
    expect(safeName("  ...  ")).toBe("Receipt")
    expect(safeName("Costco.")).toBe("Costco")
    expect(safeName("x".repeat(100)).length).toBe(60)
  })

  test("parseOrganize falls back to month", () => {
    expect(parseOrganize("category")).toBe("category")
    expect(parseOrganize("nonsense")).toBe("month")
    expect(parseOrganize(null)).toBe("month")
  })

  test("photo paths file by month or category and never collide", () => {
    const a = makeSearchedReceipt({ merchant: "Costco", purchasedOn: "2026-02-03", totalCents: 1000, hasImage: true })
    const b = makeSearchedReceipt({ merchant: "Costco", purchasedOn: "2026-02-03", totalCents: 1000, hasImage: true })
    const c = makeSearchedReceipt({ merchant: "Shell", purchasedOn: null, receiptType: "fuel", hasImage: true })
    const d = makeSearchedReceipt({ hasImage: false })

    const byMonth = archivePhotoPaths([a, b, c, d], "month")
    expect(byMonth.get(a.id)).toBe("2026-02 February/2026-02-03 Costco 10.00.jpg")
    expect(byMonth.get(b.id)).toBe("2026-02 February/2026-02-03 Costco 10.00 (2).jpg")
    expect(byMonth.get(c.id)).toBe("No date/No date Shell 42.50.jpg")
    expect(byMonth.has(d.id)).toBe(false)

    const byCategory = archivePhotoPaths([a, c], "category")
    expect(byCategory.get(a.id)).toBe("Grocery/2026-02-03 Costco 10.00.jpg")
    expect(byCategory.get(c.id)).toBe(
      "Fuel & Transport/No date Shell 42.50.jpg"
    )
  })

  test("streams photos, documents and a README listing what is missing", async () => {
    const ok = makeSearchedReceipt({ merchant: "Costco", hasImage: true })
    const broken = makeSearchedReceipt({ merchant: "Shell", hasImage: true })
    const typed = makeSearchedReceipt({ merchant: "Typed in", hasImage: false })
    const receipts = [ok, broken, typed]
    const photoPaths = archivePhotoPaths(receipts, "month")

    const stream = receiptArchiveStream({
      receipts,
      organize: "month",
      from: "2025-01-01",
      to: "2025-12-31",
      scopeLabel: "Personal receipts",
      generatedAt: new Date("2026-01-01T00:00:00Z"),
      photoPaths,
      documents: {
        pdf: new TextEncoder().encode("%PDF-fake"),
        xlsx: new Uint8Array([9, 9]),
      },
      readPhoto: async (id) => {
        if (id === broken.id) throw new Error("blob store down")
        return new Uint8Array([0xff, 0xd8, 0xff])
      },
    })

    const files = readZip(new Uint8Array(await new Response(stream).arrayBuffer()))
    const root = "receipts-2025-01-01-to-2025-12-31/"
    expect([...files.keys()]).toEqual([
      `${root}Receipt report.pdf`,
      `${root}Receipts.xlsx`,
      `${root}${photoPaths.get(ok.id)}`,
      `${root}README.txt`,
    ])

    const readme = text(files.get(`${root}README.txt`))
    expect(readme).toContain("3 receipts, 1 photo included.")
    expect(readme).toContain("could not be read")
    expect(readme).toContain("Shell")
    expect(readme).toContain("1 receipt was entered by hand")
  })
})
