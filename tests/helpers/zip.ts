import { expect } from "bun:test"
import { inflateRawSync } from "node:zlib"

import { crc32 } from "@/lib/documents/zip"

// Just enough of a ZIP reader to check what the writer produced: walks the
// central directory and inflates each entry.
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = bytes.length - 22
  expect(view.getUint32(eocd, true)).toBe(0x06054b50)
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)

  const files = new Map<string, Uint8Array>()
  const decoder = new TextDecoder()
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50)
    const method = view.getUint16(p + 10, true)
    const crc = view.getUint32(p + 16, true)
    const compressed = view.getUint32(p + 20, true)
    const nameLength = view.getUint16(p + 28, true)
    const offset = view.getUint32(p + 42, true)
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength))

    const localNameLength = view.getUint16(offset + 26, true)
    const start = offset + 30 + localNameLength
    const raw = bytes.subarray(start, start + compressed)
    const data = method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw
    expect(crc32(data)).toBe(crc)

    files.set(name, data)
    p += 46 + nameLength
  }
  return files
}

