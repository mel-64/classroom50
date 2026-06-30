import { describe, expect, it } from "vitest"

import { initialsFromParts, nameFromParts } from "@/util/students"

describe("nameFromParts — display name from self-reported names", () => {
  it("joins and capitalizes first + last", () => {
    expect(nameFromParts("rongxin", "liu")).toBe("Rongxin Liu")
  })

  it("falls back to whichever single name is present", () => {
    expect(nameFromParts("mona", "")).toBe("Mona")
    expect(nameFromParts("", "lisa")).toBe("Lisa")
  })

  it("trims surrounding whitespace before deciding", () => {
    expect(nameFromParts("  ada  ", "  lovelace ")).toBe("Ada Lovelace")
  })

  it("is empty when neither name is present", () => {
    expect(nameFromParts("", "")).toBe("")
    expect(nameFromParts(undefined, undefined)).toBe("")
    expect(nameFromParts("   ", "   ")).toBe("")
  })
})

describe("initialsFromParts — avatar initials from self-reported names", () => {
  it("takes the capitalized first letter of each name", () => {
    expect(initialsFromParts("rongxin", "liu")).toBe("RL")
  })

  it("uses whichever single initial is present", () => {
    expect(initialsFromParts("mona", "")).toBe("M")
    expect(initialsFromParts("", "lisa")).toBe("L")
  })

  it("is empty when neither name is present", () => {
    expect(initialsFromParts("", "")).toBe("")
    expect(initialsFromParts(undefined, undefined)).toBe("")
  })
})
