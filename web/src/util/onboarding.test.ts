import { describe, expect, it } from "vitest"
import {
  ONBOARDING_REPO_PREFIX,
  emailHash,
  generateInviteToken,
  isReconcilableRow,
  isValidEmail,
  isValidInviteToken,
  normalizeEmail,
  onboardingRepoName,
  rowMatchesEmailHash,
} from "./onboarding"

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Example.COM ")).toBe("foo@example.com")
  })

  it("does NOT strip +tags or dots (distinct addresses stay distinct)", () => {
    expect(normalizeEmail("a+tag@gmail.com")).toBe("a+tag@gmail.com")
    expect(normalizeEmail("a.b@gmail.com")).toBe("a.b@gmail.com")
  })
})

describe("emailHash", () => {
  it("is deterministic for the same normalized email", async () => {
    const a = await emailHash("rongxinliu.g@gmail.com")
    const b = await emailHash("  RongXinLiu.G@Gmail.com  ")
    expect(a).toBe(b)
  })

  it("returns 16 lowercase hex chars", async () => {
    const h = await emailHash("student@uni.edu")
    expect(h).toMatch(/^[0-9a-f]{16}$/)
  })

  it("does not collide on punctuation-distinct emails", async () => {
    const dot = await emailHash("rongxinliu.g@gmail.com")
    const dash = await emailHash("rongxinliu-g@gmail.com")
    expect(dot).not.toBe(dash)
  })
})

describe("onboardingRepoName", () => {
  it("composes prefix + github-id", () => {
    expect(onboardingRepoName("583231")).toBe(`${ONBOARDING_REPO_PREFIX}583231`)
  })

  it("accepts a numeric github id", () => {
    expect(onboardingRepoName(42)).toBe(`${ONBOARDING_REPO_PREFIX}42`)
  })

  it("is deterministic: one id always yields the same name", () => {
    expect(onboardingRepoName("42")).toBe(onboardingRepoName("42"))
    expect(onboardingRepoName("42")).toBe(`${ONBOARDING_REPO_PREFIX}42`)
  })

  it("distinguishes ids that share a digit prefix", () => {
    expect(onboardingRepoName("42")).not.toBe(onboardingRepoName("420"))
  })
})

describe("isValidEmail", () => {
  it("accepts a typical address", () => {
    expect(isValidEmail("student@university.edu")).toBe(true)
    expect(isValidEmail("  a+tag@gmail.com  ")).toBe(true)
  })

  it("rejects obvious non-emails", () => {
    expect(isValidEmail("")).toBe(false)
    expect(isValidEmail("nope")).toBe(false)
    expect(isValidEmail("a@b")).toBe(false)
    expect(isValidEmail("a @b.com")).toBe(false)
  })
})

describe("generateInviteToken / isValidInviteToken", () => {
  it("generates a 32-char lowercase-hex token that validates", () => {
    const token = generateInviteToken()
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(isValidInviteToken(token)).toBe(true)
  })

  it("generates distinct tokens", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken())
  })

  it("rejects malformed tokens", () => {
    expect(isValidInviteToken("")).toBe(false)
    expect(isValidInviteToken("xyz")).toBe(false)
    expect(isValidInviteToken("A".repeat(32))).toBe(false)
    expect(isValidInviteToken("a".repeat(31))).toBe(false)
  })
})

describe("isReconcilableRow", () => {
  it("is true for an unreconciled row with a key", () => {
    expect(isReconcilableRow({ email_hash: "abc" })).toBe(true)
    expect(isReconcilableRow({ github_id: "123" })).toBe(true)
  })

  it("is false once enrolled", () => {
    expect(
      isReconcilableRow({ enrollment_status: "enrolled", github_id: "123" }),
    ).toBe(false)
  })

  it("is false with no key to look up by", () => {
    expect(isReconcilableRow({ enrollment_status: "invited" })).toBe(false)
  })
})

describe("rowMatchesEmailHash (hijack guard / email fallback)", () => {
  it("accepts a payload email that hashes to the row's email_hash", async () => {
    const email = "victim@uni.edu"
    const hash = await emailHash(email)
    expect(rowMatchesEmailHash({ email_hash: hash }, email, hash)).toBe(true)
  })

  it("rejects a self-report for a DIFFERENT email than the invited row", async () => {
    const invitedHash = await emailHash("victim@uni.edu")
    const attackerHash = await emailHash("attacker@evil.com")
    expect(
      rowMatchesEmailHash(
        { email_hash: invitedHash },
        "attacker@evil.com",
        attackerHash,
      ),
    ).toBe(false)
  })

  it("matches case-insensitively against a row that only has email", async () => {
    const payload = "Victim@Uni.edu"
    expect(
      rowMatchesEmailHash(
        { email: "victim@uni.edu" },
        payload,
        await emailHash(payload),
      ),
    ).toBe(true)
  })

  it("falls through (true) for a github_id row with no email on file", async () => {
    expect(
      rowMatchesEmailHash(
        {},
        "anything@uni.edu",
        await emailHash("anything@uni.edu"),
      ),
    ).toBe(true)
  })
})
