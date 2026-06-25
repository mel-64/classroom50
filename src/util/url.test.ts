import { describe, expect, it } from "vitest"
import { isSafeHttpUrl, safeHttpUrl } from "./url"

describe("isSafeHttpUrl", () => {
  it("accepts http and https absolute URLs", () => {
    expect(isSafeHttpUrl("https://github.com/acme/repo/commit/abc")).toBe(true)
    expect(isSafeHttpUrl("http://example.com")).toBe(true)
  })

  it("rejects script-injection schemes", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false)
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(
      false,
    )
    expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false)
  })

  it("rejects empty, null, and malformed values", () => {
    expect(isSafeHttpUrl("")).toBe(false)
    expect(isSafeHttpUrl(null)).toBe(false)
    expect(isSafeHttpUrl(undefined)).toBe(false)
    expect(isSafeHttpUrl("not a url")).toBe(false)
    expect(isSafeHttpUrl("/relative/path")).toBe(false)
  })
})

describe("safeHttpUrl", () => {
  it("returns the URL when safe, undefined otherwise", () => {
    expect(safeHttpUrl("https://github.com")).toBe("https://github.com")
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined()
    expect(safeHttpUrl(undefined)).toBeUndefined()
  })
})
